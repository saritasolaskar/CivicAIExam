import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";

const getPMC = async () => {
  return MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  });
};

// PATCH /api/v1/admin/complaints/:id/resolution-review
export const reviewComplaintResolution = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;
    const { decision, note = "" } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID.",
      });
    }

    if (!["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be APPROVE or REJECT.",
      });
    }

    if (typeof note !== "string") {
      return res.status(400).json({
        success: false,
        message: "Review note must be a string.",
      });
    }

    const reviewNote = note.trim();

    if (reviewNote.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Review note cannot exceed 1000 characters.",
      });
    }

    if (decision === "REJECT" && !reviewNote) {
      return res.status(400).json({
        success: false,
        message:
          "A review note is required when rejecting a resolution.",
      });
    }

    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found.",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      corporation: pmc._id,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "PMC complaint not found.",
      });
    }

    if (
      complaint.status !== "PENDING_VERIFICATION" ||
      complaint.resolution?.reviewStatus !== "PENDING_VERIFICATION"
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This complaint does not have a resolution awaiting verification.",
      });
    }

    if (
      !complaint.resolution?.description?.trim() ||
      !Array.isArray(complaint.resolution?.evidence) ||
      complaint.resolution.evidence.length === 0
    ) {
      return res.status(409).json({
        success: false,
        message:
          "The submitted resolution is incomplete and cannot be reviewed.",
      });
    }

    const reviewedAt = new Date();

    complaint.resolution.reviewedBy = req.user._id;
    complaint.resolution.reviewedAt = reviewedAt;
    complaint.resolution.reviewNote = reviewNote;

    if (decision === "APPROVE") {
      complaint.status = "RESOLVED";
      complaint.resolution.reviewStatus = "APPROVED";
      complaint.resolution.resolvedAt = reviewedAt;
    } else {
      complaint.status = "IN_PROGRESS";
      complaint.resolution.reviewStatus = "REJECTED";
      complaint.resolution.resolvedAt = null;
    }

    complaint.statusHistory.push({
      status: complaint.status,
      changedBy: req.user._id,
      note:
        decision === "APPROVE"
          ? reviewNote ||
            "Administrator verified and approved the officer's resolution."
          : `Administrator rejected the submitted resolution. ${reviewNote}`,
      changedAt: reviewedAt,
    });

    await complaint.save();

    const updatedComplaint = await Complaint.findById(
      complaint._id
    )
      .populate("citizen", "name email phone")
      .populate("assignedOfficer", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("administrativeOffice", "name code officeType")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
      .populate("resolution.submittedBy", "name email role")
      .populate("resolution.reviewedBy", "name email role")
      .populate("statusHistory.changedBy", "name role");

    return res.status(200).json({
      success: true,
      message:
        decision === "APPROVE"
          ? "Resolution approved. Complaint is now resolved."
          : "Resolution rejected. Complaint has been returned to the officer for further work.",
      complaint: updatedComplaint,
    });
  } catch (error) {
    next(error);
  }
};