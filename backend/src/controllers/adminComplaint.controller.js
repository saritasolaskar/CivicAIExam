
import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";
import Prabhag from "../models/Prabhag.js";
import { assessPriority } from "../services/priorityAssessment.service.js";
import Zone from "../models/Zone.js";
const getPMC = async () => {
  return MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  });
};

// GET /api/v1/admin/complaints/departments
export const getAdminDepartments = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found",
      });
    }

    const departments = await Department.find({
      corporation: pmc._id,
      isActive: true,
    })
      .select("_id name code")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/complaints
export const getAdminComplaints = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found",
      });
    }

    const filter = { corporation: pmc._id };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.unassigned === "true") {
      filter.assignedOfficer = null;
    } else if (req.query.unassigned === "false") {
      filter.assignedOfficer = { $ne: null };
    }

    if (req.query.departmentId) {
      if (!mongoose.isValidObjectId(req.query.departmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid departmentId",
        });
      }

      filter.department = req.query.departmentId;
    }

    if (req.query.officeId) {
      if (!mongoose.isValidObjectId(req.query.officeId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid officeId",
        });
      }

      filter.administrativeOffice = req.query.officeId;
    }

    const complaints = await Complaint.find(filter)
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("assignedOfficer", "name email")
      .populate("administrativeOffice", "name code officeType")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
      .populate("recommendedAssignment.department", "name code")
      .populate(
        "recommendedAssignment.administrativeOffice",
        "name code officeType"
      )
      .populate("recommendedAssignment.zone", "name code")
      .populate("recommendedAssignment.prabhag", "name number")
      .populate("recommendedAssignment.officer", "name email")
      .populate("recommendedAssignment.reviewedBy", "name email")
      .sort({ createdAt: -1 });

    const duplicateCounts = await Complaint.aggregate([
      {
        $match: {
          corporation: pmc._id,
          duplicateOf: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$duplicateOf",
          count: { $sum: 1 },
        },
      },
    ]);

    const duplicateCountMap = new Map(
      duplicateCounts.map((item) => [
        item._id.toString(),
        item.count,
      ])
    );

    const data = complaints.map((complaint) => {
      const complaintObject = complaint.toObject();

      const confirmedDuplicateCount =
        duplicateCountMap.get(complaint._id.toString()) || 0;

      complaintObject.priority = assessPriority({
        severity: complaint.severity,
        createdAt: complaint.createdAt,
        confirmedDuplicateCount,
        status: complaint.status,
        duplicateOf: complaint.duplicateOf,
      });

      return complaintObject;
    });

    data.sort(
      (a, b) =>
        (b.priority?.score || 0) - (a.priority?.score || 0)
    );

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/complaints/:id/assign
// This endpoint now represents ADMIN REVIEW + CONFIRMATION.
export const assignComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      officerId,
      departmentId,
      administrativeOfficeId,
      prabhagId,
      note,
      reassign,
      zoneId,
    } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    if (!mongoose.isValidObjectId(officerId)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid officer before confirming.",
      });
    }

    if (!mongoose.isValidObjectId(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid department before confirming.",
      });
    }

    if (!mongoose.isValidObjectId(administrativeOfficeId)) {
      return res.status(400).json({
        success: false,
        message: "Select a valid administrative office before confirming.",
      });
    }

    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      corporation: pmc._id,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "PMC complaint not found",
      });
    }

    if (complaint.duplicateOf) {
      return res.status(409).json({
        success: false,
        message:
          "Confirmed duplicate complaints cannot be assigned independently. Assign the original complaint instead.",
      });
    }

    if (["RESOLVED", "REJECTED"].includes(complaint.status)) {
      return res.status(409).json({
        success: false,
        message: "Resolved or rejected complaints cannot be assigned.",
      });
    }

    if (complaint.assignedOfficer && reassign !== true) {
      return res.status(409).json({
        success: false,
        message:
          "Complaint is already assigned. Confirm reassignment explicitly.",
      });
    }

    const [department, office] = await Promise.all([
      Department.findOne({
        _id: departmentId,
        corporation: pmc._id,
        isActive: true,
      }),

      AdministrativeOffice.findOne({
        _id: administrativeOfficeId,
        corporation: pmc._id,
        isActive: true,
      }),
    ]);

    if (!department) {
      return res.status(400).json({
        success: false,
        message: "Selected department is invalid or inactive.",
      });
    }

    if (!office) {
      return res.status(400).json({
        success: false,
        message: "Selected administrative office is invalid or inactive.",
      });
    }

        let selectedZone = null;

    // If zoneId is explicitly supplied, honor the administrator's
    // selection, including an intentional empty selection.
    const zoneWasSubmitted =
      Object.prototype.hasOwnProperty.call(req.body, "zoneId");

    const requestedZoneId = zoneWasSubmitted
      ? zoneId
      : (
          complaint.recommendedAssignment?.zone ||
          office.zone ||
          null
        );

    if (requestedZoneId) {
      if (!mongoose.isValidObjectId(requestedZoneId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Zone ID.",
        });
      }

      selectedZone = await Zone.findOne({
        _id: requestedZoneId,
        corporation: pmc._id,
        isActive: true,
      });

      if (!selectedZone) {
        return res.status(400).json({
          success: false,
          message: "Selected Zone is invalid or inactive.",
        });
      }
    }

    let selectedPrabhag = null;

    if (prabhagId) {
      if (!mongoose.isValidObjectId(prabhagId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid Prabhag ID.",
        });
      }

      selectedPrabhag = await Prabhag.findOne({
        _id: prabhagId,
        corporation: pmc._id,
        administrativeOffice: office._id,
        isActive: true,
      });

      if (!selectedPrabhag) {
        return res.status(400).json({
          success: false,
          message:
            "Selected Prabhag is not active or does not belong to the selected office.",
        });
      }
    }

    const officer = await User.findOne({
      _id: officerId,
      role: "OFFICER",
      corporation: pmc._id,
      department: department._id,
      administrativeOffice: office._id,
      isActive: true,
    }).select("-password");

    if (!officer) {
      return res.status(400).json({
        success: false,
        message:
          "The selected officer must be active and belong to the selected department and administrative office.",
      });
    }

    const previousOfficer = complaint.assignedOfficer;
    const previousDepartment = complaint.department;
    const previousOffice = complaint.administrativeOffice;
    const previousZone = complaint.zone;

    

    

    // Official assignment fields are written only after admin confirmation.
    complaint.department = department._id;
    complaint.administrativeOffice = office._id;
    complaint.zone = selectedZone?._id || null;
    complaint.prabhag = selectedPrabhag?._id || null;
    complaint.assignedOfficer = officer._id;
    complaint.status = "ASSIGNED";

    const reviewNote =
      typeof note === "string" ? note.trim() : "";

    complaint.recommendedAssignment = {
      ...(complaint.recommendedAssignment?.toObject?.() || {}),
      reviewStatus: "APPROVED",
      department: department._id,
      administrativeOffice: office._id,
      zone: selectedZone?._id || null,
      prabhag: selectedPrabhag?._id || null,
      officer: officer._id,
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      reviewNote,
    };

    const changes = [];

    if (
      !previousDepartment ||
      previousDepartment.toString() !== department._id.toString()
    ) {
      changes.push("Department confirmed/changed by administrator.");
    }

    if (
      !previousOffice ||
      previousOffice.toString() !== office._id.toString()
    ) {
      changes.push("Administrative office confirmed/changed by administrator.");
    }

    if (
      previousOfficer &&
      previousOfficer.toString() !== officer._id.toString()
    ) {
      changes.push("Officer reassigned by administrator.");
    }

    if (!selectedPrabhag) {
      changes.push(
        "Prabhag not selected. Jurisdiction remains unverified."
      );
    }

    const historyNote = [
      "Assignment reviewed and confirmed by administrator.",
      ...changes,
      reviewNote,
    ]
      .filter(Boolean)
      .join(" ");

    complaint.statusHistory.push({
      status: "ASSIGNED",
      changedBy: req.user._id,
      note: historyNote,
    });

    await complaint.save();

    const updatedComplaint = await Complaint.findById(complaint._id)
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate("assignedOfficer", "name email phone")
      .populate("administrativeOffice", "name code officeType")
      .populate("prabhag", "name number")
      .populate("zone", "name code")
      .populate("recommendedAssignment.department", "name code")
      .populate(
        "recommendedAssignment.administrativeOffice",
        "name code officeType"
      )
      .populate("recommendedAssignment.prabhag", "name number")
      .populate("recommendedAssignment.officer", "name email")
      .populate("recommendedAssignment.zone", "name code")
      .populate("recommendedAssignment.reviewedBy", "name email");

    return res.status(200).json({
      success: true,
      message: "Assignment reviewed and confirmed successfully.",
      data: updatedComplaint,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/admin/complaints/possible-duplicates
export const getPossibleDuplicates = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found",
      });
    }

    const complaints = await Complaint.find({
      corporation: pmc._id,
      "duplicateCheck.status": "POSSIBLE",
    })
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate({
        path: "duplicateCheck.matchedComplaint",
        select:
          "complaintNumber title description status createdAt location citizen",
        populate: {
          path: "citizen",
          select: "name email",
        },
      })
      .populate("duplicateCheck.reviewedBy", "name email")
      
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: complaints.length,
      data: complaints,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/complaints/:id/duplicate-review
export const reviewDuplicateComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint ID",
      });
    }

    if (!["CONFIRM_DUPLICATE", "NOT_DUPLICATE"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message:
          "Decision must be CONFIRM_DUPLICATE or NOT_DUPLICATE",
      });
    }

    const pmc = await getPMC();

    if (!pmc) {
      return res.status(404).json({
        success: false,
        message: "PMC master record not found",
      });
    }

    const complaint = await Complaint.findOne({
      _id: id,
      corporation: pmc._id,
    });

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "PMC complaint not found",
      });
    }

    if (complaint.duplicateCheck?.status !== "POSSIBLE") {
      return res.status(409).json({
        success: false,
        message:
          "Only complaints marked as POSSIBLE duplicates can be reviewed",
      });
    }

    const matchedComplaintId =
      complaint.duplicateCheck.matchedComplaint;

    if (!matchedComplaintId) {
      return res.status(409).json({
        success: false,
        message: "No matched complaint is available for review",
      });
    }

    if (decision === "CONFIRM_DUPLICATE") {
      const originalComplaint = await Complaint.findOne({
        _id: matchedComplaintId,
        corporation: pmc._id,
        category: complaint.category,
        duplicateOf: null,
      });

      if (!originalComplaint) {
        return res.status(409).json({
          success: false,
          message:
            "The matched complaint is unavailable or is already linked as a duplicate",
        });
      }

      complaint.duplicateOf = originalComplaint._id;
      complaint.duplicateCheck.status = "CONFIRMED";
    } else {
      complaint.duplicateCheck.status = "NOT_DUPLICATE";
      complaint.duplicateOf = null;
    }

    complaint.duplicateCheck.reviewedBy = req.user._id;
    complaint.duplicateCheck.reviewedAt = new Date();

    await complaint.save();

    const updatedComplaint = await Complaint.findById(complaint._id)
      .populate("citizen", "name email phone")
      .populate("category", "name code")
      .populate("department", "name code")
      .populate(
        "duplicateOf",
        "complaintNumber title description status"
      )
      .populate(
        "duplicateCheck.matchedComplaint",
        "complaintNumber title description status"
      )
      .populate("duplicateCheck.reviewedBy", "name email");

    return res.status(200).json({
      success: true,
      message:
        decision === "CONFIRM_DUPLICATE"
          ? "Complaint confirmed as a duplicate"
          : "Complaint marked as not a duplicate",
      data: updatedComplaint,
    });
  } catch (error) {
    next(error);
  }
};
