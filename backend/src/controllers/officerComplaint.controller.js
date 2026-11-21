
import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";

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
      .populate("statusHistory.changedBy", "name role");

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
  try {
    const { status, note, resolutionDescription, evidence } =
      req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    if (!["IN_PROGRESS", "RESOLVED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          "Officer can only move a complaint to IN_PROGRESS or RESOLVED.",
      });
    }

    if (note !== undefined && typeof note !== "string") {
      return res.status(400).json({
        success: false,
        message: "Note must be a string.",
      });
    }

    if (status === "RESOLVED") {
      if (
        typeof resolutionDescription !== "string" ||
        !resolutionDescription.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Resolution description is required.",
        });
      }

      if (
        !Array.isArray(evidence) ||
        evidence.length === 0 ||
        evidence.some(
          (item) =>
            !item ||
            typeof item.url !== "string" ||
            !item.url.trim() ||
            !["IMAGE", "VIDEO"].includes(item.mediaType)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Provide at least one valid resolution evidence item with url and mediaType.",
        });
      }

      if (evidence.length > 5) {
        return res.status(400).json({
          success: false,
          message: "Maximum 5 resolution evidence files are allowed.",
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

    // Only allow valid status transitions.
    if (
      status === "IN_PROGRESS" &&
      complaint.status !== "ASSIGNED"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only ASSIGNED complaints can be moved to IN_PROGRESS.",
      });
    }

    if (
      status === "RESOLVED" &&
      complaint.status !== "IN_PROGRESS"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only IN_PROGRESS complaints can be resolved.",
      });
    }

    complaint.status = status;

    complaint.statusHistory.push({
      status,
      changedBy: req.user._id,
      note:
        note?.trim() ||
        (status === "IN_PROGRESS"
          ? "Officer started working on the complaint."
          : "Officer resolved the complaint."),
    });

    if (status === "RESOLVED") {
      complaint.resolution = {
        description: resolutionDescription.trim(),
        evidence,
        resolvedAt: new Date(),
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
      .populate("zone", "name code");

    return res.status(200).json({
      success: true,
      message: `Complaint status updated to ${status}.`,
      complaint: updatedComplaint,
    });
  } catch (error) {
    next(error);
  }
};
