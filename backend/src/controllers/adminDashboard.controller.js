import Complaint from "../models/Complaint.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";
import { assessPriority } from "../services/priorityAssessment.service.js";

const getPMC = async () => {
  const pmc = await MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");

  if (!pmc) {
    throw new Error("Active PMC corporation was not found.");
  }

  return pmc;
};

const getIndiaDayStart = () => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }

  return new Date(
    Date.UTC(values.year, values.month - 1, values.day) -
      330 * 60 * 1000
  );
};

export const getAdminDashboardOverview = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    const todayStart = getIndiaDayStart();
    const tomorrowStart = new Date(
      todayStart.getTime() + 24 * 60 * 60 * 1000
    );

    const statuses = [
      "SUBMITTED",
      "UNDER_REVIEW",
      "ASSIGNED",
      "IN_PROGRESS",
      "RESOLVED",
      "REJECTED",
      "REOPENED",
    ];

    const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

    const unassignedFilter = {
      corporation: pmc._id,
      assignedOfficer: null,
      status: { $nin: ["RESOLVED", "REJECTED"] },
      duplicateOf: null,
    };

    const [
      totalComplaints,
      todayComplaints,
      unassignedComplaints,
      pendingAssignmentReviews,
      totalOfficers,
      activeOfficers,
      statusCounts,
      severityCounts,
      departmentCounts,
      departments,
      recentComplaints,
      priorityRecords,
    ] = await Promise.all([
      Complaint.countDocuments({
        corporation: pmc._id,
      }),

      Complaint.countDocuments({
        corporation: pmc._id,
        createdAt: {
          $gte: todayStart,
          $lt: tomorrowStart,
        },
      }),

      Complaint.countDocuments(unassignedFilter),

      Complaint.countDocuments(unassignedFilter),

      User.countDocuments({
        corporation: pmc._id,
        role: "OFFICER",
      }),

      User.countDocuments({
        corporation: pmc._id,
        role: "OFFICER",
        isActive: true,
      }),

      Complaint.aggregate([
        {
          $match: {
            corporation: pmc._id,
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      Complaint.aggregate([
        {
          $match: {
            corporation: pmc._id,
          },
        },
        {
          $group: {
            _id: "$severity",
            count: { $sum: 1 },
          },
        },
      ]),

      Complaint.aggregate([
        {
          $match: {
            corporation: pmc._id,
          },
        },
        {
          $group: {
            _id: "$department",
            count: { $sum: 1 },
          },
        },
      ]),

      Department.find({
        corporation: pmc._id,
        isActive: true,
      }).select("_id name code"),

      Complaint.find({
        corporation: pmc._id,
      })
        .select(
          "complaintNumber title status severity createdAt citizen category department assignedOfficer administrativeOffice duplicateOf"
        )
        .populate("citizen", "name")
        .populate("category", "name code")
        .populate("department", "name code")
        .populate("assignedOfficer", "name email")
        .populate("administrativeOffice", "name code")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),

      Complaint.find({
        corporation: pmc._id,
      })
        .select("_id severity createdAt status duplicateOf")
        .lean(),
    ]);

    const statusMap = Object.fromEntries(
      statusCounts.map((item) => [item._id, item.count])
    );

    const severityMap = Object.fromEntries(
      severityCounts.map((item) => [item._id, item.count])
    );

    const departmentMap = Object.fromEntries(
      departmentCounts.map((item) => [
        String(item._id),
        item.count,
      ])
    );

    const statusBreakdown = statuses.map((status) => ({
      status,
      count: statusMap[status] || 0,
    }));

    const severityBreakdown = severities.map((severity) => ({
      severity,
      count: severityMap[severity] || 0,
    }));

    const departmentBreakdown = departments.map((department) => ({
      departmentId: department._id,
      departmentName: department.name,
      departmentCode: department.code,
      count: departmentMap[String(department._id)] || 0,
    }));

    const duplicateCountMap = new Map();

    for (const complaint of priorityRecords) {
      if (complaint.duplicateOf) {
        const originalId = complaint.duplicateOf.toString();

        duplicateCountMap.set(
          originalId,
          (duplicateCountMap.get(originalId) || 0) + 1
        );
      }
    }

    const priorityMap = new Map();

    const priorityCounts = {
      URGENT: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      DUPLICATE: 0,
      CLOSED: 0,
    };

    for (const complaint of priorityRecords) {
      const confirmedDuplicateCount =
        duplicateCountMap.get(complaint._id.toString()) || 0;

      const priority = assessPriority({
        severity: complaint.severity,
        createdAt: complaint.createdAt,
        confirmedDuplicateCount,
        status: complaint.status,
        duplicateOf: complaint.duplicateOf,
      });

      priorityMap.set(complaint._id.toString(), priority);

      priorityCounts[priority.level] =
        (priorityCounts[priority.level] || 0) + 1;
    }

    const priorityBreakdown = [
      { priority: "URGENT", count: priorityCounts.URGENT },
      { priority: "HIGH", count: priorityCounts.HIGH },
      { priority: "MEDIUM", count: priorityCounts.MEDIUM },
      { priority: "LOW", count: priorityCounts.LOW },
      { priority: "DUPLICATE", count: priorityCounts.DUPLICATE },
      { priority: "CLOSED", count: priorityCounts.CLOSED },
    ];

    const confirmedDuplicates = priorityCounts.DUPLICATE;
    const closedComplaints = priorityCounts.CLOSED;

    const recentComplaintsWithPriority = recentComplaints.map(
      (complaint) => ({
        ...complaint,
        priority:
          priorityMap.get(complaint._id.toString()) || null,
      })
    );

    return res.status(200).json({
      success: true,
      message: "Admin dashboard overview retrieved successfully.",
      data: {
        corporation: {
          id: pmc._id,
          name: pmc.name,
          code: pmc.code,
        },
        summary: {
          totalComplaints,
          todayComplaints,
          unassignedComplaints,
          pendingAssignmentReviews,
          totalOfficers,
          activeOfficers,
          inactiveOfficers: totalOfficers - activeOfficers,
          confirmedDuplicates,
          closedComplaints,
        },
        statusBreakdown,
        severityBreakdown,
        priorityBreakdown,
        departmentBreakdown,
        recentComplaints: recentComplaintsWithPriority,
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
};