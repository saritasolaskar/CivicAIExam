
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

// Resolve the active PMC record from the database.
const getPMC = async () => {
  return MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");
};

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

  // Count complaints currently assigned to each eligible officer.
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

  // Lowest active workload first.
  // Stable ordering breaks ties consistently.
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

    if (title.trim().length > 150 || description.trim().length > 3000) {
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

    // Multipart form fields arrive as strings. Convert them safely.
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

    // 5. Determine a provisional department from category routing.
    // This is a database routing rule, not an AI-generated decision.
    const routing = await resolveDepartment({
      corporationId: pmc._id,
      categoryCode: categoryCode.trim().toUpperCase(),
    });

    // 6. Assess severity using category defaults and contextual rules.
    const category = await ComplaintCategory.findById(routing.categoryId)
      .select("code defaultSeverity");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Complaint category not found.",
      });
    }

    const severityAssessment = assessSeverity({
      categoryDefaultSeverity: category.defaultSeverity,
      title: title.trim(),
      description: description.trim(),
    });

// 7. Find provisional administrative geography using GPS.
// Administrative office, Prabhag and Zone are independently verified.
const geographicResult = await findPMCGeographyByCoordinates(
  complaintLongitude,
  complaintLatitude
);

const matchedOffice = geographicResult.administrativeOffice || null;
const matchedPrabhag = geographicResult.prabhag || null;
const matchedZone = geographicResult.zone?._id || null;


const officerRecommendation = matchedOffice
  ? await recommendEligibleOfficer({
      corporationId: pmc._id,
      departmentId: routing.departmentId,
      officeId: matchedOffice._id,
    })
  : null;

const recommendedOfficer =
  officerRecommendation?.officer || null;

// A verified administrative-office match is sufficient for a
// provisional office recommendation. Prabhag is not mandatory.
const hasGeographicSuggestion = Boolean(matchedOffice);

const recommendationStatus = hasGeographicSuggestion
  ? "PENDING_REVIEW"
  : "NEEDS_MANUAL_REVIEW";


    // 8. Check for possible duplicate complaints.
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

    // 9. Save verified image files and prepare their public URLs.
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

    // 10. Create complaint.
    // IMPORTANT:
    // Official assignment fields remain null until admin confirmation.
    const complaint = await Complaint.create({
      citizen: req.user._id,

      title: title.trim(),
      description: description.trim(),

      corporation: pmc._id,
      category: routing.categoryId,

      // These are provisional recommendations, not official assignments.
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

      // No official jurisdiction or officer assignment before approval.
      department: null,
      prabhag: null,
      administrativeOffice: null,
      zone: null,
      assignedOfficer: null,

      severity: severityAssessment.severity,
      severityAssessment: {
        level: severityAssessment.severity,
        basis: severityAssessment.basis,
        reason: severityAssessment.reason,
        assessedAt: new Date(),
        manuallyVerified: false,
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

    // Return populated complaint, including provisional recommendations.
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
    // If complaint creation failed, remove any files already written.
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
