
from fastapi import FastAPI, UploadFile, File, HTTPException
from ultralytics import YOLO
from pathlib import Path
from collections import Counter
import shutil
import uuid
import cv2

app = FastAPI(
    title="CivicAI Vision Service",
    description="AI image analysis for civic complaints",
    version="1.5.0"
)

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "test_images"

GENERAL_MODEL_PATH = MODEL_DIR / "yolo11n.pt"
ROAD_MODEL_PATH = MODEL_DIR / "best.pt"
POTHOLE_MODEL_PATH = MODEL_DIR / "pothole-specific" / "best.pt"
GARBAGE_MODEL_PATH = MODEL_DIR / "garbage-specific" / "best_model.pt"

POTHOLE_SEVERITY_DETECTOR_PATH = (
    MODEL_DIR / "pothole-severity" / "detection_best.pt"
)

POTHOLE_CLASSIFIER_PATH = (
    MODEL_DIR / "pothole-severity" / "classifier_best.pt"
)

TEMP_DIR.mkdir(parents=True, exist_ok=True)

general_model = None
road_model = None
pothole_model = None
garbage_model = None

pothole_severity_detector = None
pothole_classifier = None


@app.on_event("startup")
def load_models():
    global general_model, road_model, pothole_model, garbage_model
    global pothole_severity_detector, pothole_classifier

    general_model = (
        YOLO(str(GENERAL_MODEL_PATH))
        if GENERAL_MODEL_PATH.exists()
        else YOLO("yolo11n.pt")
    )

    if ROAD_MODEL_PATH.exists():
        road_model = YOLO(str(ROAD_MODEL_PATH))

    if POTHOLE_MODEL_PATH.exists():
        pothole_model = YOLO(str(POTHOLE_MODEL_PATH))

    if GARBAGE_MODEL_PATH.exists():
        garbage_model = YOLO(str(GARBAGE_MODEL_PATH))

    if POTHOLE_SEVERITY_DETECTOR_PATH.exists():
        pothole_severity_detector = YOLO(
            str(POTHOLE_SEVERITY_DETECTOR_PATH)
        )

    if POTHOLE_CLASSIFIER_PATH.exists():
        pothole_classifier = YOLO(
            str(POTHOLE_CLASSIFIER_PATH)
        )


@app.get("/health")
def health():
    models = {
        "general_model_loaded": general_model is not None,
        "road_model_loaded": road_model is not None,
        "pothole_model_loaded": pothole_model is not None,
        "garbage_model_loaded": garbage_model is not None,
        "pothole_severity_detector_loaded":
            pothole_severity_detector is not None,
        "pothole_classifier_loaded":
            pothole_classifier is not None
    }

    return {
        "success": all(models.values()),
        "service": "CivicAI Vision Service",
        **models
    }


async def save_image(file: UploadFile):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Upload an image file"
        )

    suffix = Path(file.filename or "image.jpg").suffix.lower()

    if suffix not in [".jpg", ".jpeg", ".png", ".webp", ".bmp"]:
        suffix = ".jpg"

    path = TEMP_DIR / f"{uuid.uuid4()}{suffix}"

    with path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return path


def run_detection(model, path, confidence=0.25, image_size=640):
    results = model.predict(
        source=str(path),
        conf=confidence,
        imgsz=image_size,
        device="cpu",
        verbose=False
    )

    detections = []

    for result in results:
        image_height, image_width = result.orig_shape
        total_image_area = image_width * image_height

        for box in result.boxes:
            class_id = int(box.cls[0])

            x1, y1, x2, y2 = box.xyxy[0].tolist()

            box_width = max(0, x2 - x1)
            box_height = max(0, y2 - y1)
            box_area = box_width * box_height

            area_ratio = (
                (box_area / total_image_area) * 100
                if total_image_area > 0
                else 0
            )

            detections.append({
                "class_id": class_id,
                "label": model.names[class_id],
                "confidence": round(float(box.conf[0]), 4),
                "box": [
                    round(float(x1), 2),
                    round(float(y1), 2),
                    round(float(x2), 2),
                    round(float(y2), 2)
                ],
                "box_area_ratio_percent": round(area_ratio, 4)
            })

    return detections


@app.post("/analyze-image")
async def analyze_image(file: UploadFile = File(...)):
    if general_model is None:
        raise HTTPException(status_code=503, detail="General model is not loaded")

    path = await save_image(file)

    try:
        detections = run_detection(general_model, path)

        return {
            "success": True,
            "model": "YOLO11n COCO pretrained",
            "detections": detections,
            "detection_count": len(detections)
        }

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        path.unlink(missing_ok=True)
        await file.close()


@app.post("/analyze-road")
async def analyze_road(file: UploadFile = File(...)):
    if road_model is None:
        raise HTTPException(
            status_code=503,
            detail="Road damage model is not loaded"
        )

    path = await save_image(file)

    try:
        detections = run_detection(road_model, path)

        return {
            "success": True,
            "model": "RDD2022 YOLOv8n",
            "detections": detections,
            "detection_count": len(detections),
            "pothole_count": sum(
                1 for item in detections
                if item["label"].lower() == "pothole"
            )
        }

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        path.unlink(missing_ok=True)
        await file.close()


@app.post("/analyze-pothole")
async def analyze_pothole(file: UploadFile = File(...)):
    if pothole_model is None:
        raise HTTPException(
            status_code=503,
            detail="Dedicated pothole model is not loaded"
        )

    path = await save_image(file)

    try:
        detections = run_detection(
            pothole_model,
            path,
            confidence=0.25,
            image_size=640
        )

        potholes = [
            item for item in detections
            if item["label"].lower() == "pothole"
        ]

        return {
            "success": True,
            "model": "Dedicated YOLOv8 Pothole Detector",
            "detections": detections,
            "detection_count": len(detections),
            "pothole_count": len(potholes),
            "potholes": potholes,
            "note": "Predictions are AI-generated and require verification."
        }

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        path.unlink(missing_ok=True)
        await file.close()


@app.post("/analyze-pothole-severity")
async def analyze_pothole_severity(file: UploadFile = File(...)):
    if pothole_severity_detector is None or pothole_classifier is None:
        raise HTTPException(
            status_code=503,
            detail="Pothole severity models are not loaded"
        )

    path = await save_image(file)

    try:
        image = cv2.imread(str(path))

        if image is None:
            raise HTTPException(
                status_code=400,
                detail="The uploaded image could not be decoded"
            )

        image_height, image_width = image.shape[:2]

        detection_results = pothole_severity_detector.predict(
            source=image,
            conf=0.25,
            imgsz=640,
            device="cpu",
            verbose=False
        )

        boxes = detection_results[0].boxes
        pothole_results = []

        if boxes is not None:
            for index, box in enumerate(boxes):
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detection_confidence = float(box.conf[0])

                box_width = max(0, x2 - x1)
                box_height = max(0, y2 - y1)

                # Add 20% surrounding context to the crop.
                padding_x = box_width * 0.20
                padding_y = box_height * 0.20

                crop_x1 = max(0, int(x1 - padding_x))
                crop_y1 = max(0, int(y1 - padding_y))
                crop_x2 = min(image_width, int(x2 + padding_x))
                crop_y2 = min(image_height, int(y2 + padding_y))

                crop = image[
                    crop_y1:crop_y2,
                    crop_x1:crop_x2
                ]

                if crop.size == 0:
                    continue

                classification_results = pothole_classifier.predict(
                    source=crop,
                    device="cpu",
                    verbose=False
                )

                probabilities = classification_results[0].probs

                if probabilities is None:
                    continue

                predicted_class = int(probabilities.top1)
                predicted_label = pothole_classifier.names[predicted_class]

                classification_confidence = float(
                    probabilities.top1conf
                )

                all_probabilities = {
                    pothole_classifier.names[class_id]:
                    round(float(probability), 4)
                    for class_id, probability
                    in enumerate(probabilities.data.tolist())
                }

                pothole_results.append({
                    "pothole_number": index + 1,
                    "detection_confidence": round(
                        detection_confidence, 4
                    ),
                    "image_severity_estimate": predicted_label.upper(),
                    "classification_confidence": round(
                        classification_confidence, 4
                    ),
                    "class_probabilities": all_probabilities,
                    "bounding_box": [
                        round(float(x1), 2),
                        round(float(y1), 2),
                        round(float(x2), 2),
                        round(float(y2), 2)
                    ],
                    "crop_dimensions": {
                        "width": int(crop.shape[1]),
                        "height": int(crop.shape[0])
                    }
                })

        return {
            "success": True,
            "model": "Pothole detector + severity classifier",
            "detection_count": len(pothole_results),
            "assessment_status": (
                "COMPLETED"
                if pothole_results
                else "NO_POTHOLE_DETECTED"
            ),
            "potholes": pothole_results,
            "human_verification_required": True,
            "limitations": [
                "The classifier supports major_pothole and medium_pothole only.",
                "Image classification is an estimate, not a physical depth measurement.",
                "Model confidence does not establish actual severity accuracy.",
                "Final municipal severity must consider complaint text and human review."
            ]
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        path.unlink(missing_ok=True)
        await file.close()


@app.post("/analyze-garbage")
async def analyze_garbage(file: UploadFile = File(...)):
    if garbage_model is None:
        raise HTTPException(
            status_code=503,
            detail="Garbage detection model is not loaded"
        )

    path = await save_image(file)

    try:
        detections = run_detection(
            garbage_model,
            path,
            confidence=0.25,
            image_size=640
        )

        category_counts = dict(
            Counter(item["label"] for item in detections)
        )

        return {
            "success": True,
            "model": "Dedicated garbage and litter detector",
            "detections": detections,
            "detection_count": len(detections),
            "category_counts": category_counts,
            "note": (
                "Detects individual litter objects. "
                "Garbage accumulation and illegal dumping "
                "require additional assessment and verification."
            )
        }

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))

    finally:
        path.unlink(missing_ok=True)
        await file.close()
