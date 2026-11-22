
import Complaint from "../models/Complaint.js";
import fs from "node:fs/promises";
import path from "node:path";
import User from "../models/User.js";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import ComplaintCategory from "../models/ComplaintCategory.js";
import { assessSeverity } from "../services/severityAssessment.service.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";
import mongoose from "mongoose";
import { resolveDepartment } from "../services/departmentRouting.service.js";
import { detectPossibleDuplicate } from "../services/duplicateDetection.service.js";
import {
  findPMCGeographyByCoordinates,
} from "../services/geography.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEVERITY_RANK = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";

const AI_CLASSIFICATION_THRESHOLD = 0.75;
const GARBAGE_DETECTION_THRESHOLD = 0.50;

// Resolve the active PMC record from the database.
const getPMC = async () => {
  return MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");
};

// Recommend an eligible officer based on current workload.
const recommendEligibleOfficer = async ({
  corporationId,
  departmentId,
  officeId,
}) => {
  const officers = await User.find({
    role: "OFFICER",
    corporation: corporationId,
    department: departmentId,
    administrativeOffice: officeId,
    isActive: true,
  })
    .select("_id name createdAt")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  if (!officers.length) {
    return null;
  }

  const officerIds = officers.map((officer) => officer._id);

  const workloadRecords = await Complaint.aggregate([
    {
      $match: {
        corporation: corporationId,
        assignedOfficer: { $in: officerIds },
        status: {
          $in: ["ASSIGNED", "IN_PROGRESS", "REOPENED"],
        },
      },
    },
    {
      $group: {
        _id: "$assignedOfficer",
        activeComplaintCount: { $sum: 1 },
      },
    },
  ]);

  const workloadMap = new Map(
    workloadRecords.map((record) => [
      String(record._id),
      record.activeComplaintCount,
    ])
  );

  officers.sort((a, b) => {
    const workloadDifference =
      (workloadMap.get(String(a._id)) || 0) -
      (workloadMap.get(String(b._id)) || 0);

    if (workloadDifference !== 0) {
      return workloadDifference;
    }

    return String(a._id).localeCompare(String(b._id));
  });

  const selectedOfficer = officers[0];

  return {
    officer: selectedOfficer,
    activeComplaintCount:
      workloadMap.get(String(selectedOfficer._id)) || 0,
  };
};

// Return the default image assessment structure.
// This is also used when image analysis is not requested.
const createEmptyImageAssessment = ({
  status = "NOT_REQUESTED",
  reason = "",
  imageCount = 0,
} = {}) => ({
  attempted: false,
  available: false,
  status,
  model: "",
  imageCount,
  processedImageCount: 0,
  predictedSeverity: null,
  confidence: null,
  detectionCount: 0,
  garbageDetectionCount: 0,
  acceptedGarbageDetectionCount: 0,
  garbageCategoryCounts: {},
  confidenceThreshold: AI_CLASSIFICATION_THRESHOLD,
  garbageConfidenceThreshold: null,
  humanVerificationRequired: true,
  assessedAt: null,
  error: "",
  images: [],
  reason,
});

// Analyze uploaded pothole images using the FastAPI service.
// AI failure must never prevent complaint registration.
const analyzePotholeImages = async (images = []) => {
  const result = createEmptyImageAssessment({
    status: images.length > 0 ? "FAILED" : "NOT_REQUESTED",
    imageCount: images.length,
    reason: images.length
      ? ""
      : "No uploaded images were available for analysis.",
  });

  if (!images.length) {
    return result;
  }

  result.attempted = true;
  result.assessedAt = new Date();
  result.model = "Pothole detector + severity classifier";

  let highestSeverity = null;
  let highestConfidence = 0;
  let successfulAnalyses = 0;
  let totalDetections = 0;

  const analysisErrors = [];

  for (const [index, image] of images.entries()) {
    const imageResult = {
      imageNumber: index + 1,
      status: "FAILED",
      detectionCount: 0,
      error: "",
      potholes: [],
    };

    try {
      if (!image?.buffer || !image?.extension) {
        throw new Error(
          "Verified image buffer or extension is missing."
        );
      }

      const extension = image.extension.toLowerCase();

      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };

      const mimeType = mimeTypes[extension];

      if (!mimeType) {
        throw new Error(
          "Unsupported image format for AI analysis."
        );
      }

      const formData = new FormData();

      const imageBlob = new Blob([image.buffer], {
        type: mimeType,
      });

      formData.append(
        "file",
        imageBlob,
        `complaint-image.${extension}`
      );

      const response = await fetch(
        `${AI_SERVICE_URL}/analyze-pothole-severity`,
        {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        throw new Error(
          `AI service returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (
        !data.success ||
        !Array.isArray(data.potholes)
      ) {
        throw new Error(
          "AI service returned an invalid analysis response."
        );
      }

      successfulAnalyses++;

      if (
        typeof data.model === "string" &&
        data.model.trim()
      ) {
        result.model = data.model;
      }

      imageResult.detectionCount = data.potholes.length;

      imageResult.status = data.potholes.length > 0
        ? "COMPLETED"
        : "NO_POTHOLE_DETECTED";

      for (const [potholeIndex, pothole] of data.potholes.entries()) {
        const label = String(
          pothole.image_severity_estimate || ""
        ).toLowerCase();

        const classificationConfidence = Number(
          pothole.classification_confidence
        );

        const detectionConfidence = Number(
          pothole.detection_confidence
        );

        let mappedSeverity = null;

        if (label.includes("major_pothole")) {
          mappedSeverity = "HIGH";
        } else if (label.includes("medium_pothole")) {
          mappedSeverity = "MEDIUM";
        }

        const confidenceAccepted =
          mappedSeverity !== null &&
          Number.isFinite(classificationConfidence) &&
          classificationConfidence >= AI_CLASSIFICATION_THRESHOLD;

        const classProbabilities =
          pothole.class_probabilities &&
          typeof pothole.class_probabilities === "object" &&
          !Array.isArray(pothole.class_probabilities)
            ? pothole.class_probabilities
            : {};

        const boundingBox =
          Array.isArray(pothole.bounding_box) &&
          pothole.bounding_box.length === 4 &&
          pothole.bounding_box.every(
            (value) => Number.isFinite(Number(value))
          )
            ? pothole.bounding_box.map(Number)
            : [];

        imageResult.potholes.push({
          potholeNumber:
            Number(pothole.pothole_number) || potholeIndex + 1,

          detectionConfidence:
            Number.isFinite(detectionConfidence)
              ? detectionConfidence
              : null,

          classificationConfidence:
            Number.isFinite(classificationConfidence)
              ? classificationConfidence
              : null,

          imageSeverityEstimate: label,

          mappedSeverity,

          confidenceAccepted,

          classProbabilities,

          boundingBox,
        });

        // Only accepted predictions can influence complaint severity.
        if (!confidenceAccepted) {
          continue;
        }

        // Keep the highest accepted severity across all images.
        if (
          !highestSeverity ||
          SEVERITY_RANK[mappedSeverity] >
            SEVERITY_RANK[highestSeverity]
        ) {
          highestSeverity = mappedSeverity;
        }

        highestConfidence = Math.max(
          highestConfidence,
          classificationConfidence
        );
      }
    } catch (error) {
      const isTimeout =
        error.name === "TimeoutError" ||
        error.name === "AbortError";

      imageResult.status = isTimeout
        ? "SKIPPED_TIMEOUT"
        : "FAILED";

      imageResult.error =
        error.message || "Image analysis failed.";

      analysisErrors.push(
        `Image ${index + 1}: ${imageResult.error}`
      );

      console.warn(
        `Pothole image analysis failed for image ${index + 1}:`,
        imageResult.error
      );
    }

    totalDetections += imageResult.detectionCount;

    result.images.push(imageResult);
  }

  result.available = successfulAnalyses > 0;

  result.processedImageCount = successfulAnalyses;

  result.detectionCount = totalDetections;

  result.predictedSeverity = highestSeverity;

  result.confidence =
    highestConfidence > 0
      ? highestConfidence
      : null;

  // Determine the overall assessment status.
  if (successfulAnalyses === 0) {
    result.status = "FAILED";
  } else if (successfulAnalyses < images.length) {
    result.status = "PARTIAL";
  } else if (totalDetections === 0) {
    result.status = "NO_POTHOLE_DETECTED";
  } else {
    result.status = "COMPLETED";
  }

  result.error = analysisErrors.join(" ").slice(0, 1000);

  if (highestSeverity) {
    result.reason =
      "Pothole severity estimated using the image detector and classifier.";
  } else if (
    successfulAnalyses > 0 &&
    totalDetections > 0
  ) {
    result.reason =
      "Potholes were detected, but no sufficiently confident severity prediction was available.";
  } else if (successfulAnalyses > 0) {
    result.reason =
      "Images were analyzed successfully, but no potholes were detected.";
  } else {
    result.reason =
      "Image analysis failed. Existing text and category assessment was retained.";
  }

  return result;
};


// Analyze uploaded garbage/litter images using the FastAPI service.
// Raw detections are retained; only provisional high-confidence detections
// are marked accepted. This analysis never changes complaint severity.
const analyzeGarbageImages = async (images = []) => {
  const result = createEmptyImageAssessment({
    status: images.length > 0 ? "FAILED" : "NOT_REQUESTED",
    imageCount: images.length,
    reason: images.length
      ? ""
      : "No uploaded images were available for analysis.",
  });

  result.confidenceThreshold = GARBAGE_DETECTION_THRESHOLD;
  result.garbageConfidenceThreshold = GARBAGE_DETECTION_THRESHOLD;

  if (!images.length) {
    return result;
  }

  result.attempted = true;
  result.assessedAt = new Date();
  result.model = "Dedicated garbage and litter detector";

  let successfulAnalyses = 0;
  let totalDetections = 0;
  let acceptedDetections = 0;

  const analysisErrors = [];
  const combinedCategoryCounts = {};

  for (const [index, image] of images.entries()) {
    const imageResult = {
      imageNumber: index + 1,
      status: "FAILED",
      detectionCount: 0,
      garbageDetectionCount: 0,
      acceptedGarbageDetectionCount: 0,
      error: "",
      potholes: [],
      garbageDetections: [],
    };

    try {
      if (!image?.buffer || !image?.extension) {
        throw new Error(
          "Verified image buffer or extension is missing."
        );
      }

      const extension = image.extension.toLowerCase();

      const mimeTypes = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      };

      const mimeType = mimeTypes[extension];

      if (!mimeType) {
        throw new Error(
          "Unsupported image format for AI analysis."
        );
      }

      const formData = new FormData();

      const imageBlob = new Blob([image.buffer], {
        type: mimeType,
      });

      formData.append(
        "file",
        imageBlob,
        `complaint-image.${extension}`
      );

      const response = await fetch(
        `${AI_SERVICE_URL}/analyze-garbage`,
        {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        throw new Error(
          `AI service returned HTTP ${response.status}.`
        );
      }

      const data = await response.json();

      if (
        !data.success ||
        !Array.isArray(data.detections)
      ) {
        throw new Error(
          "AI service returned an invalid garbage analysis response."
        );
      }

      successfulAnalyses++;

      if (
        typeof data.model === "string" &&
        data.model.trim()
      ) {
        result.model = data.model;
      }

      const categoryCounts =
        data.category_counts &&
        typeof data.category_counts === "object" &&
        !Array.isArray(data.category_counts)
          ? data.category_counts
          : {};

      for (const [label, count] of Object.entries(categoryCounts)) {
        const safeCount = Number(count);

        if (Number.isFinite(safeCount) && safeCount >= 0) {
          combinedCategoryCounts[label] =
            (combinedCategoryCounts[label] || 0) + safeCount;
        }
      }

      imageResult.detectionCount = data.detections.length;
      imageResult.garbageDetectionCount = data.detections.length;

      for (const [detectionIndex, detection] of data.detections.entries()) {
        const confidence = Number(detection.confidence);

        const validConfidence =
          Number.isFinite(confidence) &&
          confidence >= 0 &&
          confidence <= 1;

        const confidenceAccepted =
          validConfidence &&
          confidence >= GARBAGE_DETECTION_THRESHOLD;

        const boundingBox =
          Array.isArray(detection.box) &&
          detection.box.length === 4 &&
          detection.box.every(
            (value) => Number.isFinite(Number(value))
          )
            ? detection.box.map(Number)
            : [];

        const areaRatio = Number(detection.box_area_ratio_percent);

        imageResult.garbageDetections.push({
          detectionNumber: detectionIndex + 1,
          label:
            typeof detection.label === "string"
              ? detection.label.slice(0, 100)
              : "Unknown",
          classId:
            Number.isInteger(Number(detection.class_id))
              ? Number(detection.class_id)
              : null,
          confidence: validConfidence ? confidence : null,
          confidenceAccepted,
          boundingBox,
          areaRatioPercent:
            Number.isFinite(areaRatio) && areaRatio >= 0
              ? areaRatio
              : null,
        });

        if (confidenceAccepted) {
          imageResult.acceptedGarbageDetectionCount++;
        }
      }

      imageResult.status = data.detections.length > 0
        ? "COMPLETED"
        : "NO_GARBAGE_DETECTED";
    } catch (error) {
      const isTimeout =
        error.name === "TimeoutError" ||
        error.name === "AbortError";

      imageResult.status = isTimeout
        ? "SKIPPED_TIMEOUT"
        : "FAILED";

      imageResult.error =
        error.message || "Garbage image analysis failed.";

      analysisErrors.push(
        `Image ${index + 1}: ${imageResult.error}`
      );

      console.warn(
        `Garbage image analysis failed for image ${index + 1}:`,
        imageResult.error
      );
    }

    totalDetections += imageResult.garbageDetectionCount;
    acceptedDetections += imageResult.acceptedGarbageDetectionCount;

    result.images.push(imageResult);
  }

  result.available = successfulAnalyses > 0;
  result.processedImageCount = successfulAnalyses;
  result.detectionCount = totalDetections;
  result.garbageDetectionCount = totalDetections;
  result.acceptedGarbageDetectionCount = acceptedDetections;
  result.garbageCategoryCounts = combinedCategoryCounts;
  result.error = analysisErrors.join(" ").slice(0, 1000);

  if (successfulAnalyses === 0) {
    result.status = "FAILED";
  } else if (successfulAnalyses < images.length) {
    result.status = "PARTIAL";
  } else if (totalDetections === 0) {
    result.status = "NO_GARBAGE_DETECTED";
  } else {
    result.status = "COMPLETED";
  }

  if (successfulAnalyses > 0 && totalDetections > 0) {
    result.reason =
      `${totalDetections} raw litter-object detection(s) recorded; ` +
      `${acceptedDetections} met the provisional confidence threshold. ` +
      "Human verification is required. Object detections do not independently " +
      "establish illegal dumping or the overall severity of garbage accumulation.";
  } else if (successfulAnalyses > 0) {
    result.reason =
      "Images were analyzed successfully, but no garbage or litter objects were detected.";
  } else {
    result.reason =
      "Garbage image analysis failed. Existing text and category assessment was retained.";
  }

  return result;
};

// CREATE COMPLAINT
export const createComplaint = async (req, res, next) => {
  const savedImagePaths = [];
  let complaintCreated = false;

  try {
    const {
      title,
      description,
      categoryCode,
      coordinates,
      latitude,
      longitude,
      address,
      media,
    } = req.body;

    // 1. Validate text fields.
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof categoryCode !== "string" ||
      !categoryCode.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Title, description and categoryCode are required.",
      });
    }

    if (
      title.trim().length > 150 ||
      description.trim().length > 3000
    ) {
      return res.status(400).json({
        success: false,
        message: "Title or description exceeds the allowed length.",
      });
    }

    // 2. Accept either [longitude, latitude] or separate GPS fields.
    let complaintLongitude;
    let complaintLatitude;

    if (Array.isArray(coordinates)) {
      if (coordinates.length !== 2) {
        return res.status(400).json({
          success: false,
          message: "Coordinates must contain [longitude, latitude].",
        });
      }

      [complaintLongitude, complaintLatitude] = coordinates;
    } else {
      complaintLongitude = longitude;
      complaintLatitude = latitude;
    }

    // Multipart form fields arrive as strings.
    if (
      complaintLongitude !== undefined &&
      complaintLongitude !== null &&
      complaintLongitude !== ""
    ) {
      complaintLongitude = Number(complaintLongitude);
    }

    if (
      complaintLatitude !== undefined &&
      complaintLatitude !== null &&
      complaintLatitude !== ""
    ) {
      complaintLatitude = Number(complaintLatitude);
    }

    if (
      typeof complaintLongitude !== "number" ||
      typeof complaintLatitude !== "number" ||
      !Number.isFinite(complaintLongitude) ||
      !Number.isFinite(complaintLatitude) ||
      complaintLongitude < -180 ||
      complaintLongitude > 180 ||
      complaintLatitude < -90 ||
      complaintLatitude > 90
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid longitude and latitude are required.",
      });
    }

    // 3. Validate media.
    if (media !== undefined && !Array.isArray(media)) {
      return res.status(400).json({
        success: false,
        message: "Media must be an array.",
      });
    }

    if (media && media.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 5 media files are allowed.",
      });
    }

    const complaintMedia = [
      ...(media || []),
      ...(req.verifiedImages || []).map(() => ({
        url: "pending-upload",
        mediaType: "IMAGE",
      })),
    ];

    if (complaintMedia.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 5 media files are allowed.",
      });
    }

    for (const item of media || []) {
      if (
        !item ||
        typeof item.url !== "string" ||
        !item.url.trim() ||
        !["IMAGE", "VIDEO"].includes(item.mediaType)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Each media item must contain a valid URL and IMAGE or VIDEO mediaType.",
        });
      }
    }

    if (
      address !== undefined &&
      (typeof address !== "string" || address.length > 500)
    ) {
      return res.status(400).json({
        success: false,
        message: "Address must be a string of maximum 500 characters.",
      });
    }

    // 4. Resolve PMC automatically.
    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "Pune Municipal Corporation master record not found.",
      });
    }

    // 5. Determine provisional department from category routing.
    const routing = await resolveDepartment({
      corporationId: pmc._id,
      categoryCode: categoryCode.trim().toUpperCase(),
    });

    // 6. Get category default severity.
    const category = await ComplaintCategory.findById(
      routing.categoryId
    ).select("code defaultSeverity");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Complaint category not found.",
      });
    }

    // 7. Existing text and category severity assessment.
    const textSeverityAssessment = assessSeverity({
      categoryDefaultSeverity: category.defaultSeverity,
      title: title.trim(),
      description: description.trim(),
    });

    let finalSeverity = textSeverityAssessment.severity;
    let imageSeverityRaised = false;

    // 8. Run the relevant image analysis for supported categories.
    let imageAssessment = createEmptyImageAssessment({
      status: "NOT_REQUESTED",
      reason: "Image analysis was not required for this category.",
      imageCount: 0,
    });

    if (category.code === "POTHOLE") {
      imageAssessment = await analyzePotholeImages(
        req.verifiedImages || []
      );

      const aiSeverity = imageAssessment.predictedSeverity;

      // Pothole image estimates may increase severity, never downgrade it.
      if (
        aiSeverity &&
        SEVERITY_RANK[aiSeverity] > SEVERITY_RANK[finalSeverity]
      ) {
        finalSeverity = aiSeverity;
        imageSeverityRaised = true;
      }
    } else if (
      ["GARBAGE_ACCUMULATION", "ILLEGAL_DUMPING"].includes(category.code)
    ) {
      // Garbage detections are evidence only; they do not set severity.
      imageAssessment = await analyzeGarbageImages(
        req.verifiedImages || []
      );
    }

    // Keep the existing severity basis enum compatible with Complaint.js.
    const severityReason = [
      textSeverityAssessment.reason,
      imageAssessment.predictedSeverity
        ? `Image assessment estimated ${imageAssessment.predictedSeverity} severity.`
        : "",
      imageAssessment.reason,
    ]
      .filter(Boolean)
      .join(" ");

    // 9. Find provisional administrative geography using GPS.
    const geographicResult = await findPMCGeographyByCoordinates(
      complaintLongitude,
      complaintLatitude
    );

    const matchedOffice =
      geographicResult.administrativeOffice || null;

    const matchedPrabhag =
      geographicResult.prabhag || null;

    const matchedZone =
      geographicResult.zone?._id || null;

    const officerRecommendation = matchedOffice
      ? await recommendEligibleOfficer({
          corporationId: pmc._id,
          departmentId: routing.departmentId,
          officeId: matchedOffice._id,
        })
      : null;

    const recommendedOfficer =
      officerRecommendation?.officer || null;

    const hasGeographicSuggestion = Boolean(matchedOffice);

    const recommendationStatus = hasGeographicSuggestion
      ? "PENDING_REVIEW"
      : "NEEDS_MANUAL_REVIEW";

    // 10. Check for possible duplicate complaints.
    const duplicateResult = await detectPossibleDuplicate({
      corporationId: pmc._id,
      categoryId: routing.categoryId,
      title: title.trim(),
      description: description.trim(),
      longitude: complaintLongitude,
      latitude: complaintLatitude,
    });

    const duplicateCheck = duplicateResult
      ? {
          status: "POSSIBLE",
          matchedComplaint: duplicateResult.complaint._id,
          similarityScore: duplicateResult.similarityScore,
          textSimilarity: duplicateResult.textSimilarity,
          distanceMeters: duplicateResult.distanceMeters,
          checkedAt: new Date(),
        }
      : {
          status: "NONE",
          checkedAt: new Date(),
        };

    // 11. Save verified image files and prepare public URLs.
    const uploadsDirectory = path.resolve(
      __dirname,
      "../../uploads/complaints"
    );

    await fs.mkdir(uploadsDirectory, { recursive: true });

    const uploadedMedia = [];

    for (const image of req.verifiedImages || []) {
      const filename = `${randomUUID()}.${image.extension}`;
      const filePath = path.join(uploadsDirectory, filename);

      await fs.writeFile(filePath, image.buffer);
      savedImagePaths.push(filePath);

      uploadedMedia.push({
        url: `${req.protocol}://${req.get("host")}/uploads/complaints/${filename}`,
        mediaType: "IMAGE",
      });
    }

    const finalComplaintMedia = [
      ...(media || []),
      ...uploadedMedia,
    ];

    // 12. Create complaint.
    // Official assignment fields remain null until admin confirmation.
    const complaint = await Complaint.create({
      citizen: req.user._id,

      title: title.trim(),
      description: description.trim(),

      corporation: pmc._id,
      category: routing.categoryId,

      recommendedAssignment: {
        reviewStatus: recommendationStatus,

        department: routing.departmentId,
        administrativeOffice: matchedOffice?._id || null,
        prabhag: matchedPrabhag?._id || null,
        zone: matchedZone,

        officer: recommendedOfficer?._id || null,

        departmentReason:
          `Department suggested through the configured category routing rule (${category.code}).`,

        geographyReason: [
          geographicResult.officeMatchMethod === "OFFICE_BOUNDARY"
            ? "Administrative office matched directly against its geographic boundary."
            : geographicResult.officeMatchMethod === "PRABHAG_BOUNDARY_RELATIONSHIP"
              ? "Administrative office suggested through the matched Prabhag. This is an approximate office recommendation, not a direct office-boundary match."
              : "Administrative office could not be identified automatically.",

          geographicResult.prabhagFound
            ? `Prabhag matched: ${matchedPrabhag.name} (${matchedPrabhag.number}).`
            : "No unambiguous Prabhag boundary match is available.",

          geographicResult.zoneMatchMethod === "ZONE_BOUNDARY"
            ? `Zone matched directly against its geographic boundary: ${matchedZone ? geographicResult.zone.name : "Unknown"}.`
            : geographicResult.zoneMatchMethod === "ADMINISTRATIVE_OFFICE_RELATIONSHIP"
              ? "Zone suggested through the administrative-office relationship, not a direct Zone-boundary match."
              : "Zone could not be identified automatically.",

          geographicResult.reviewRequired
            ? `Administrator review required: ${geographicResult.reviewReasons.join(" ")}`
            : "Geographic suggestions matched successfully.",

          `Geographic source: ${geographicResult.boundarySource}.`,
        ].join(" "),

        officerReason: recommendedOfficer
          ? `Eligible officer suggested based on department and provisional administrative office. The officer currently has ${officerRecommendation.activeComplaintCount} active assigned complaints. Administrator confirmation is required.`
          : matchedOffice
            ? "No active eligible officer was found for the provisional administrative office. Administrator must review officer availability."
            : "Officer recommendation could not be generated because no administrative office suggestion was available.",
      },

      location: {
        type: "Point",
        coordinates: [complaintLongitude, complaintLatitude],
      },

      address: address?.trim() || "",
      media: finalComplaintMedia,

      // Official assignment remains empty until administrator confirmation.
      department: null,
      prabhag: null,
      administrativeOffice: null,
      zone: null,
      assignedOfficer: null,

      severity: finalSeverity,

      severityAssessment: {
        level: finalSeverity,
        basis: imageSeverityRaised
          ? "CONTEXTUAL_RULE"
          : textSeverityAssessment.basis,
        reason: severityReason,
        assessedAt: new Date(),
        manuallyVerified: false,
      },

      // Persist the complete image assessment.
      aiAnalysis: {
        predictedSeverity: imageAssessment.predictedSeverity,
        confidence: imageAssessment.confidence,
        manuallyVerified: false,

        imageAssessment: {
          status: imageAssessment.status,
          model: imageAssessment.model,
          imageCount: imageAssessment.imageCount,
          processedImageCount: imageAssessment.processedImageCount,
          potholeCount:
            category.code === "POTHOLE"
              ? imageAssessment.detectionCount
              : 0,
          garbageDetectionCount:
            imageAssessment.garbageDetectionCount,
          acceptedGarbageDetectionCount:
            imageAssessment.acceptedGarbageDetectionCount,
          garbageCategoryCounts:
            imageAssessment.garbageCategoryCounts,
          predictedSeverity: imageAssessment.predictedSeverity,
          confidenceThreshold: imageAssessment.confidenceThreshold,
          garbageConfidenceThreshold:
            imageAssessment.garbageConfidenceThreshold,
          humanVerificationRequired: true,
          assessedAt: imageAssessment.assessedAt,
          error: imageAssessment.error,
          images: imageAssessment.images,
        },
      },

      status: "SUBMITTED",

      duplicateCheck,

      statusHistory: [
        {
          status: "SUBMITTED",
          changedBy: req.user._id,
          note:
            "Complaint submitted by citizen. Provisional department and geographic suggestions are awaiting administrator review.",
        },
      ],
    });

    complaintCreated = true;

    // 13. Return populated complaint.
    const result = await Complaint.findById(complaint._id)
      .populate("citizen", "name email")
      .populate("corporation", "name code")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("prabhag", "name number")
      .populate("administrativeOffice", "name code officeType")
      .populate("zone", "name code")
      .populate("recommendedAssignment.department", "name code")
      .populate(
        "recommendedAssignment.administrativeOffice",
        "name code officeType"
      )
      .populate("recommendedAssignment.prabhag", "name number")
      .populate("recommendedAssignment.zone", "name code")
      .populate(
        "duplicateCheck.matchedComplaint",
        "complaintNumber title description status createdAt"
      )
      .populate(
        "recommendedAssignment.officer",
        "name email"
      );

    return res.status(201).json({
      success: true,
      message:
        "Complaint submitted successfully. Assignment suggestions are awaiting administrator review.",

      geographicAssignment: {
        found: hasGeographicSuggestion,

        administrativeOffice: matchedOffice
          ? {
              id: matchedOffice._id,
              name: matchedOffice.name,
              code: matchedOffice.code,
            }
          : null,

        prabhag: matchedPrabhag
          ? {
              id: matchedPrabhag._id,
              name: matchedPrabhag.name,
              number: matchedPrabhag.number,
            }
          : null,

        zone: matchedZone
          ? {
              id: matchedZone,
              name: geographicResult.zone.name,
              code: geographicResult.zone.code,
            }
          : null,

        reviewRequired: geographicResult.reviewRequired,
        message: geographicResult.message,
      },

      assignmentReview: {
        status: result.recommendedAssignment.reviewStatus,
        message:
          "The complaint has not been officially assigned. An administrator must review and confirm the department, office and officer.",
      },

      complaint: result,

      duplicateCheck: {
        status: result.duplicateCheck.status,
        possibleDuplicate: result.duplicateCheck.matchedComplaint,
        similarityScore: result.duplicateCheck.similarityScore,
        textSimilarity: result.duplicateCheck.textSimilarity,
        distanceMeters: result.duplicateCheck.distanceMeters,
      },
    });
  } catch (error) {
    // Remove uploaded files if complaint creation failed.
    if (!complaintCreated) {
      await Promise.all(
        savedImagePaths.map((filePath) =>
          fs.unlink(filePath).catch(() => {})
        )
      );
    }

    next(error);
  }
};

// GET LOGGED-IN CITIZEN COMPLAINTS
export const getMyComplaints = async (req, res, next) => {
  try {
    const complaints = await Complaint.find({
      citizen: req.user._id,
    })
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("corporation", "name code")
      .populate("prabhag", "name number")
      .populate("administrativeOffice", "name code officeType")
      .populate("zone", "name code")
      .populate("assignedOfficer", "name email")
      .populate("recommendedAssignment.department", "name code")
      .populate(
        "recommendedAssignment.administrativeOffice",
        "name code officeType"
      )
      .populate("recommendedAssignment.prabhag", "name number")
      .populate("recommendedAssignment.zone", "name code")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
    });
  } catch (error) {
    next(error);
  }
};

// GET SINGLE CITIZEN COMPLAINT
export const getComplaintById = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    const complaint = await Complaint.findOne({
      _id: req.params.id,
      citizen: req.user._id,
    })
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("corporation", "name code")
      .populate("prabhag", "name number")
      .populate("administrativeOffice", "name code officeType")
      .populate("zone", "name code")
      .populate("assignedOfficer", "name email")
      .populate("recommendedAssignment.department", "name code")
      .populate(
        "recommendedAssignment.administrativeOffice",
        "name code officeType"
      )
      .populate("recommendedAssignment.prabhag", "name number")
      .populate("recommendedAssignment.zone", "name code")
      .populate("statusHistory.changedBy", "name role");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found.",
      });
    }

    return res.status(200).json({
      success: true,
      complaint,
    });
  } catch (error) {
    next(error);
  }
};
