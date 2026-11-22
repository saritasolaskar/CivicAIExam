
import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import Complaint from "../models/Complaint.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_EVIDENCE_FILES = 5;

// GET /api/v1/officer/complaints
export const getAssignedComplaints = async (req, res, next) => {
  try {
    const filter = {
      assignedOfficer: req.user._id,
      corporation: req.user.corporation,
    };

    if (req.query.status) {
      const allowedStatuses = [
        "ASSIGNED",
        "IN_PROGRESS",
        "PENDING_VERIFICATION",
        "RESOLVED",
        "REOPENED",
      ];

      if (!allowedStatuses.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid complaint status filter.",
        });
      }

      filter.status = req.query.status;
    }

    const complaints = await Complaint.find(filter)
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("administrativeOffice", "name code")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
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

// GET /api/v1/officer/complaints/:id
export const getAssignedComplaintById = async (
  req,
  res,
  next
) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    const complaint = await Complaint.findOne({
      _id: req.params.id,
      assignedOfficer: req.user._id,
      corporation: req.user.corporation,
    })
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("administrativeOffice", "name code")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
      .populate("statusHistory.changedBy", "name role")
      .populate("resolution.submittedBy", "name role")
      .populate("resolution.reviewedBy", "name role");

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Assigned complaint not found.",
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

// PATCH /api/v1/officer/complaints/:id/status
export const updateAssignedComplaintStatus = async (
  req,
  res,
  next
) => {
  const savedFilePaths = [];

  try {
    const {
      status,
      note,
      resolutionDescription,
    } = req.body;

    const uploadedImages = req.verifiedImages || [];

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    if (!["IN_PROGRESS", "PENDING_VERIFICATION"].includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Officer can only move a complaint to IN_PROGRESS or submit it for PENDING_VERIFICATION.",
      });
    }

    if (note !== undefined && typeof note !== "string") {
      return res.status(400).json({
        success: false,
        message: "Note must be a string.",
      });
    }

    if (status === "IN_PROGRESS" && uploadedImages.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Evidence images can only be uploaded when submitting a resolution.",
      });
    }

    if (status === "PENDING_VERIFICATION") {
      if (
        typeof resolutionDescription !== "string" ||
        !resolutionDescription.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Resolution description is required.",
        });
      }

      if (resolutionDescription.trim().length > 3000) {
        return res.status(400).json({
          success: false,
          message:
            "Resolution description cannot exceed 3000 characters.",
        });
      }

      if (
        uploadedImages.length === 0 ||
        uploadedImages.length > MAX_EVIDENCE_FILES
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Upload between 1 and 5 genuine resolution evidence images.",
        });
      }
    }

    const complaint = await Complaint.findOne({
      _id: req.params.id,
      assignedOfficer: req.user._id,
      corporation: req.user.corporation,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Assigned complaint not found.",
      });
    }

    if (
      status === "IN_PROGRESS" &&
      complaint.status !== "ASSIGNED"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only ASSIGNED complaints can be moved to IN_PROGRESS.",
      });
    }

    if (
      status === "PENDING_VERIFICATION" &&
      complaint.status !== "IN_PROGRESS"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only IN_PROGRESS complaints can be submitted for verification.",
      });
    }

    let uploadedEvidence = [];

    if (status === "PENDING_VERIFICATION") {
      const uploadsDirectory = path.resolve(
        __dirname,
        "../../uploads/resolutions"
      );

      await fs.mkdir(uploadsDirectory, { recursive: true });

      for (const image of uploadedImages) {
        if (!image?.buffer || !image?.extension) {
          throw new Error(
            "A verified resolution image is missing its file data."
          );
        }

        const filename = `${randomUUID()}.${image.extension}`;
        const filePath = path.join(uploadsDirectory, filename);

        await fs.writeFile(filePath, image.buffer);
        savedFilePaths.push(filePath);

        uploadedEvidence.push({
          url: `${req.protocol}://${req.get("host")}/uploads/resolutions/${filename}`,
          mediaType: "IMAGE",
        });
      }
    }

    const changedAt = new Date();

    complaint.status = status;

    complaint.statusHistory.push({
      status,
      changedBy: req.user._id,
      note:
        note?.trim() ||
        (status === "IN_PROGRESS"
          ? "Officer started working on the complaint."
          : "Officer submitted resolution details and image evidence for administrator verification."),
      changedAt,
    });

    if (status === "PENDING_VERIFICATION") {
      complaint.resolution = {
        description: resolutionDescription.trim(),
        evidence: uploadedEvidence,
        reviewStatus: "PENDING_VERIFICATION",
        submittedBy: req.user._id,
        submittedAt: changedAt,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: "",
        resolvedAt: null,
      };
    }

    await complaint.save();

    const updatedComplaint = await Complaint.findById(
      complaint._id
    )
      .populate("citizen", "name email")
      .populate("assignedOfficer", "name email")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("administrativeOffice", "name code")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
      .populate("statusHistory.changedBy", "name role")
      .populate("resolution.submittedBy", "name role")
      .populate("resolution.reviewedBy", "name role");

    return res.status(200).json({
      success: true,
      message:
        status === "PENDING_VERIFICATION"
          ? "Resolution and evidence submitted for administrator verification."
          : "Complaint moved to In Progress.",
      complaint: updatedComplaint,
    });
  } catch (error) {
    // Remove newly written evidence if the database update fails.
    await Promise.all(
      savedFilePaths.map((filePath) =>
        fs.unlink(filePath).catch(() => {})
      )
    );

    next(error);
  }
};
