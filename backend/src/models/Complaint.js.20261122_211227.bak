
import mongoose from "mongoose";

const COMPLAINT_STATUSES = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
  "REOPENED",
];

const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    mediaType: {
      type: String,
      enum: ["IMAGE", "VIDEO"],
      required: true,
    },
  },
  { _id: false }
);

const duplicateCheckSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["NONE", "POSSIBLE", "CONFIRMED", "NOT_DUPLICATE"],
      default: "NONE",
    },
    matchedComplaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
    },
    similarityScore: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    textSimilarity: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    distanceMeters: {
      type: Number,
      default: null,
    },
    checkedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

// Provisional suggestions. These are NOT official assignments.
const recommendedAssignmentSchema = new mongoose.Schema(
  {
    reviewStatus: {
      type: String,
      enum: [
        "PENDING_REVIEW",
        "NEEDS_MANUAL_REVIEW",
        "APPROVED",
      ],
      default: "NEEDS_MANUAL_REVIEW",
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    administrativeOffice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdministrativeOffice",
      default: null,
    },

    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
    },

    prabhag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prabhag",
      default: null,
    },

    officer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    departmentReason: {
      type: String,
      default: "",
      trim: true,
    },

    geographyReason: {
      type: String,
      default: "",
      trim: true,
    },

    officerReason: {
      type: String,
      default: "",
      trim: true,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { _id: false }
);

const imagePotholeSchema = new mongoose.Schema(
  {
    potholeNumber: {
      type: Number,
      min: 1,
    },

    detectionConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    classificationConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    imageSeverityEstimate: {
      type: String,
      default: "",
    },

    mappedSeverity: {
      type: String,
      enum: [...SEVERITY_LEVELS, null],
      default: null,
    },

    confidenceAccepted: {
      type: Boolean,
      default: false,
    },

    classProbabilities: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    boundingBox: {
      type: [Number],
      default: [],
    },
  },
  { _id: false }
);


const imageGarbageDetectionSchema = new mongoose.Schema(
  {
    detectionNumber: {
      type: Number,
      min: 1,
    },

    label: {
      type: String,
      default: "Unknown",
      maxlength: 100,
    },

    classId: {
      type: Number,
      default: null,
    },

    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    confidenceAccepted: {
      type: Boolean,
      default: false,
    },

    boundingBox: {
      type: [Number],
      default: [],
    },

    areaRatioPercent: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { _id: false }
);

const imageResultSchema = new mongoose.Schema(
  {
    imageNumber: {
      type: Number,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "COMPLETED",
        "NO_POTHOLE_DETECTED",
        "NO_GARBAGE_DETECTED",
        "FAILED",
        "SKIPPED_TIMEOUT",
      ],
    },

    detectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    garbageDetectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    acceptedGarbageDetectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    error: {
      type: String,
      default: "",
    },

    potholes: {
      type: [imagePotholeSchema],
      default: [],
    },

    garbageDetections: {
      type: [imageGarbageDetectionSchema],
      default: [],
    },
  },
  { _id: false }
);

const imageAssessmentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "NOT_REQUESTED",
        "UNAVAILABLE",
        "FAILED",
        "PARTIAL",
        "COMPLETED",
        "NO_POTHOLE_DETECTED",
        "NO_GARBAGE_DETECTED",
      ],
      default: "NOT_REQUESTED",
    },

    model: {
      type: String,
      default: "",
    },

    imageCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    processedImageCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    potholeCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    garbageDetectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    acceptedGarbageDetectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    garbageCategoryCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    garbageConfidenceThreshold: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    predictedSeverity: {
      type: String,
      enum: [...SEVERITY_LEVELS, null],
      default: null,
    },

    confidenceThreshold: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.75,
    },

    humanVerificationRequired: {
      type: Boolean,
      default: true,
    },

    assessedAt: {
      type: Date,
      default: null,
    },

    error: {
      type: String,
      default: "",
    },

    images: {
      type: [imageResultSchema],
      default: [],
    },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    complaintNumber: {
      type: String,
      unique: true,
      index: true,
    },

    citizen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },

    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ComplaintCategory",
      required: true,
    },

    // Retained for compatibility.
    // Official department remains null until administrator confirmation.
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    recommendedAssignment: {
      type: recommendedAssignmentSchema,
      default: () => ({}),
    },

    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
    },

    administrativeOffice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdministrativeOffice",
      default: null,
    },

    prabhag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Prabhag",
      default: null,
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },

      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates) =>
            Array.isArray(coordinates) &&
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite) &&
            coordinates[0] >= -180 &&
            coordinates[0] <= 180 &&
            coordinates[1] >= -90 &&
            coordinates[1] <= 90,

          message:
            "Location must contain valid [longitude, latitude] coordinates.",
        },
      },
    },

    address: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    media: {
      type: [mediaSchema],
      default: [],
      validate: {
        validator: (media) => media.length <= 5,
        message: "Maximum 5 media files are allowed.",
      },
    },

    severity: {
      type: String,
      enum: SEVERITY_LEVELS,
      default: "MEDIUM",
    },

    severityAssessment: {
      level: {
        type: String,
        enum: SEVERITY_LEVELS,
        default: "MEDIUM",
      },

      basis: {
        type: String,
        enum: ["CATEGORY_DEFAULT", "CONTEXTUAL_RULE", "MANUAL"],
        default: "CATEGORY_DEFAULT",
      },

      reason: {
        type: String,
        default: "",
      },

      assessedAt: {
        type: Date,
        default: Date.now,
      },

      manuallyVerified: {
        type: Boolean,
        default: false,
      },
    },

    status: {
      type: String,
      enum: COMPLAINT_STATUSES,
      default: "SUBMITTED",
    },

    // Remains null until administrator confirmation.
    assignedOfficer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    aiAnalysis: {
      predictedCategory: {
        type: String,
        default: "",
      },

      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: null,
      },

      predictedSeverity: {
        type: String,
        enum: [...SEVERITY_LEVELS, null],
        default: null,
      },

      manuallyVerified: {
        type: Boolean,
        default: false,
      },

      imageAssessment: {
        type: imageAssessmentSchema,
        default: () => ({}),
      },
    },

    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Complaint",
      default: null,
    },

    duplicateCheck: {
      type: duplicateCheckSchema,
      default: () => ({}),
    },

    resolution: {
      description: {
        type: String,
        default: "",
        trim: true,
      },

      evidence: {
        type: [mediaSchema],
        default: [],
      },

      resolvedAt: {
        type: Date,
        default: null,
      },
    },

    statusHistory: [
      {
        status: {
          type: String,
          enum: COMPLAINT_STATUSES,
          required: true,
        },

        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        note: {
          type: String,
          default: "",
          trim: true,
        },

        changedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

complaintSchema.index({ location: "2dsphere" });
complaintSchema.index({ citizen: 1, createdAt: -1 });
complaintSchema.index({ department: 1, status: 1 });
complaintSchema.index({ assignedOfficer: 1, status: 1 });

complaintSchema.index({
  corporation: 1,
  administrativeOffice: 1,
  status: 1,
});

complaintSchema.index({
  corporation: 1,
  "recommendedAssignment.reviewStatus": 1,
});

complaintSchema.pre("validate", function () {
  if (this.isNew && !this.complaintNumber) {
    const timestamp = Date.now();

    const randomPart = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    this.complaintNumber = `CIV-${timestamp}-${randomPart}`;
  }
});

export default mongoose.model("Complaint", complaintSchema);
