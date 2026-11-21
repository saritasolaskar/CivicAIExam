from fastapi import FastAPI, UploadFile, File, HTTPException
from ultralytics import YOLO
from pathlib import Path
from collections import Counter
import shutil
import uuid

app = FastAPI(
    title="CivicAI Vision Service",
    description="AI image analysis for civic complaints",
    version="1.3.0"
)

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "test_images"

GENERAL_MODEL_PATH = MODEL_DIR / "yolo11n.pt"
ROAD_MODEL_PATH = MODEL_DIR / "best.pt"
POTHOLE_MODEL_PATH = MODEL_DIR / "pothole-specific" / "best.pt"
GARBAGE_MODEL_PATH = MODEL_DIR / "garbage-specific" / "best_model.pt"

TEMP_DIR.mkdir(parents=True, exist_ok=True)

general_model = None
road_model = None
pothole_model = None
garbage_model = None


@app.on_event("startup")
def load_models():
    global general_model, road_model, pothole_model, garbage_model

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


@app.get("/health")
def health():
    models = {
        "general_model_loaded": general_model is not None,
        "road_model_loaded": road_model is not None,
        "pothole_model_loaded": pothole_model is not None,
        "garbage_model_loaded": garbage_model is not None
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
        for box in result.boxes:
            class_id = int(box.cls[0])

            detections.append({
                "class_id": class_id,
                "label": model.names[class_id],
                "confidence": round(float(box.conf[0]), 4),
                "box": [
                    round(float(x), 2)
                    for x in box.xyxy[0].tolist()
                ]
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
            "model": "TACO YOLO11s Garbage and Litter Detector",
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
