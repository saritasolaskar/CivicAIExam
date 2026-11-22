
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  UserRound,
  Copy,
  LayoutDashboard,
  ClipboardList,
  UserCheck,
  Search,
  Filter,
  MapPin,
  X,
  UserPlus,
  Building2,
  RotateCcw,
  Eye,
} from "lucide-react";

import {
  adminAPI,
  geographyAPI,
} from "../services/portalService";

import "./AdminDashboard.css";

/* =========================================================
   CONSTANTS
========================================================= */

const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  PENDING_VERIFICATION: "Pending Verification",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  REOPENED: "Reopened",
};

const SEVERITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const PRIORITY_LABELS = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  DUPLICATE: "Duplicate",
  CLOSED: "Closed",
  UNASSESSED: "Unassessed",
};

const PRIORITY_ORDER = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "DUPLICATE",
  "CLOSED",
];

const NAV_ITEMS = [
  {
    id: "overview",
    label: "Dashboard Overview",
    icon: LayoutDashboard,
  },
  {
    id: "complaints",
    label: "All Complaints",
    icon: ClipboardList,
  },
  {
    id: "assignments",
    label: "Assignment Review",
    icon: UserCheck,
  },
  {
    id: "officers",
    label: "Officer Management",
    icon: Users,
  },
];

/* =========================================================
   GENERAL HELPERS
========================================================= */

const formatDate = (date) => {
  if (!date) return "—";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return parsedDate.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getMediaUrl = (url) => {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  return `http://localhost:5001${
    url.startsWith("/") ? "" : "/"
  }${url}`;
};

const getResponseArray = (response) => {
  const data = response?.data;

  if (Array.isArray(data)) return data;

  if (Array.isArray(data?.data)) return data.data;

  if (Array.isArray(data?.complaints)) {
    return data.complaints;
  }

  if (Array.isArray(data?.officers)) {
    return data.officers;
  }

  if (Array.isArray(data?.departments)) {
    return data.departments;
  }

  if (Array.isArray(data?.offices)) {
    return data.offices;
  }

  if (Array.isArray(data?.prabhags)) {
    return data.prabhags;
  }

  if (Array.isArray(data?.zones)) {
    return data.zones;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
};

const getId = (value) => {
  if (!value) return "";

  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }

  return String(value);
};

const isActiveRecord = (record) => {
  return record?.isActive !== false;
};

const isConfirmedAssignment = (complaint) => {
  return Boolean(getId(complaint?.assignedOfficer));
};

/*
  A department, office, Prabhag or Zone is considered
  officially confirmed only after an officer is assigned.

  For complaints awaiting review, display values from
  recommendedAssignment.

  Legacy complaints may have an old department field.
  That field is not treated as a confirmed assignment.
*/

const getComplaintDepartment = (complaint) => {
  if (isConfirmedAssignment(complaint)) {
    return complaint?.department || null;
  }

  return complaint?.recommendedAssignment?.department || null;
};

const getComplaintOffice = (complaint) => {
  if (isConfirmedAssignment(complaint)) {
    return complaint?.administrativeOffice || null;
  }

  return (
    complaint?.recommendedAssignment?.administrativeOffice ||
    null
  );
};

const getComplaintPrabhag = (complaint) => {
  if (isConfirmedAssignment(complaint)) {
    return complaint?.prabhag || null;
  }

  return complaint?.recommendedAssignment?.prabhag || null;
};

const getComplaintZone = (complaint) => {
  if (isConfirmedAssignment(complaint)) {
    return complaint?.zone || null;
  }

  return complaint?.recommendedAssignment?.zone || null;
};

const getLegacyDepartment = (complaint) => {
  if (
    !isConfirmedAssignment(complaint) &&
    !complaint?.recommendedAssignment?.department
  ) {
    return complaint?.department || null;
  }

  return null;
};

const normalizePriorityBreakdown = (data) => {
  const counts = {};

  if (Array.isArray(data)) {
    data.forEach((item) => {
      const level =
        item.level ||
        item.priority ||
        item.status ||
        item._id;

      const count = Number(
        item.count ?? item.total ?? item.value ?? 0
      );

      if (level) {
        counts[level] = count;
      }
    });
  } else if (data && typeof data === "object") {
    Object.entries(data).forEach(([level, value]) => {
      counts[level] =
        typeof value === "object"
          ? Number(value.count ?? value.total ?? 0)
          : Number(value ?? 0);
    });
  }

  return PRIORITY_ORDER.map((level) => ({
    level,
    count: counts[level] || 0,
  }));
};

const getComplaintPriority = (complaint) => {
  const priority = complaint?.priority;

  const level =
    typeof priority === "string"
      ? priority
      : priority?.level || "UNASSESSED";

  const score =
    typeof priority === "object"
      ? priority?.score
      : undefined;

  const isConfirmedDuplicate =
    level === "DUPLICATE" ||
    Boolean(complaint?.duplicateOf) ||
    complaint?.duplicateCheck?.status === "CONFIRMED";

  return {
    level: isConfirmedDuplicate ? "DUPLICATE" : level,
    score,
    isConfirmedDuplicate,
  };
};

/* =========================================================
   REUSABLE COMPONENTS
========================================================= */

function StatCard({
  title,
  value,
  icon: Icon,
  description,
}) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-top">
        <span>{title}</span>

        <div className="admin-stat-icon">
          <Icon size={20} />
        </div>
      </div>

      <h2>{value ?? 0}</h2>

      <p>{description}</p>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
  labelKey,
  valueKey,
  colorClass,
}) {
  const total = items.reduce(
    (sum, item) =>
      sum + (Number(item[valueKey]) || 0),
    0
  );

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h3>{title}</h3>
        <span>{total} total</span>
      </div>

      {items.length === 0 ? (
        <p className="admin-empty">
          No records available.
        </p>
      ) : (
        <div className="admin-breakdown-list">
          {items.map((item, index) => {
            const value =
              Number(item[valueKey]) || 0;

            const percentage = total
              ? (value / total) * 100
              : 0;

            return (
              <div
                className="admin-breakdown-item"
                key={index}
              >
                <div className="admin-breakdown-label">
                  <span>
                    {item[labelKey] || "Unknown"}
                  </span>

                  <strong>{value}</strong>
                </div>

                <div className="admin-progress-track">
                  <div
                    className={`admin-progress-fill ${colorClass}`}
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ComplaintTable({
  complaints,
  onView,
  onAssign,
  showAssignmentAction = false,
}) {
  if (!complaints.length) {
    return (
      <div className="admin-empty-state">
        <CheckCircle2 size={30} />
        <p>
          No complaints match the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Complaint ID</th>
            <th>Complaint</th>
            <th>Citizen</th>
            <th>Department</th>
            <th>Severity</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned Officer</th>
            <th>Office</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {complaints.map((complaint) => {
            const priority =
              getComplaintPriority(complaint);

            const department =
              getComplaintDepartment(complaint);

            const office =
              getComplaintOffice(complaint);

            const isConfirmed =
              isConfirmedAssignment(complaint);

            const hasSuggestion = Boolean(
              complaint?.recommendedAssignment?.department
            );

            return (
              <tr key={complaint._id}>
                <td className="admin-complaint-number">
                  {complaint.complaintNumber}
                </td>

                <td>
                  <div className="admin-complaint-title">
                    <span>{complaint.title}</span>

                    {priority.isConfirmedDuplicate && (
                      <span className="admin-duplicate-marker">
                        <Copy size={11} />
                        Duplicate
                      </span>
                    )}
                  </div>
                </td>

                <td>
                  {complaint.citizen?.name || "—"}
                </td>

                <td>
                  {department?.name ||
                    (getLegacyDepartment(complaint)?.name
                      ? `${getLegacyDepartment(complaint).name} — verify`
                      : "Awaiting review")}

                  {!isConfirmed && hasSuggestion && (
                    <small className="admin-recommendation-label">
                      Suggested
                    </small>
                  )}
                </td>

                <td>
                  <span
                    className={`admin-tag severity-${(
                      complaint.severity || "medium"
                    ).toLowerCase()}`}
                  >
                    {SEVERITY_LABELS[complaint.severity] ||
                      complaint.severity ||
                      "—"}
                  </span>
                </td>

                <td>
                  <div className="admin-priority-cell">
                    <span
                      className={`admin-tag priority-${priority.level.toLowerCase()}`}
                    >
                      {PRIORITY_LABELS[priority.level] ||
                        priority.level}
                    </span>

                    {priority.score !== undefined &&
                      priority.score !== null && (
                        <small>
                          Score: {priority.score}
                        </small>
                      )}
                  </div>
                </td>

                <td>
                  <span
                    className={`admin-tag status-${(
                      complaint.status || "submitted"
                    ).toLowerCase()}`}
                  >
                    {STATUS_LABELS[complaint.status] ||
                      complaint.status ||
                      "—"}
                  </span>
                </td>

                <td>
                  {complaint.assignedOfficer?.name ||
                    "Unassigned"}
                </td>

                <td>{office?.name || "—"}</td>

                <td>
                  {formatDate(complaint.createdAt)}
                </td>

                <td>
                  <div className="admin-table-actions">
                    <button
                      className="admin-view-button"
                      onClick={() =>
                        onView(complaint._id)
                      }
                    >
                      <Eye size={14} />
                      View
                    </button>

                    {showAssignmentAction &&
                      !priority.isConfirmedDuplicate &&
                      ![
                        "RESOLVED",
                        "REJECTED",
                      ].includes(complaint.status) && (
                        <button
                          className="admin-assign-button"
                          onClick={() =>
                            onAssign(complaint)
                          }
                        >
                          {isConfirmed
                            ? "Review / Reassign"
                            : "Review Assignment"}
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/* =========================================================
   OFFICER MANAGEMENT ROW
========================================================= */

function OfficerManagementRow({
  officer,
  departments,
  offices,
  busy,
  onSave,
  onToggle,
}) {
  const [departmentId, setDepartmentId] = useState(
    getId(officer.department)
  );
  const [officeId, setOfficeId] = useState(
    getId(officer.administrativeOffice)
  );

  useEffect(() => {
    setDepartmentId(getId(officer.department));
    setOfficeId(getId(officer.administrativeOffice));
  }, [officer.department, officer.administrativeOffice]);

  const changed =
    departmentId !== getId(officer.department) ||
    officeId !== getId(officer.administrativeOffice);

  return (
    <tr>
      <td>
        <strong>{officer.name || "—"}</strong>
        <div className="officer-management-muted">
          {officer.email || "—"}
        </div>
        <div className="officer-management-muted">
          {officer.phone || "No phone"}
        </div>
      </td>

      <td>
        <select
          value={departmentId}
          onChange={(event) =>
            setDepartmentId(event.target.value)
          }
          disabled={busy}
          aria-label={`Department for ${officer.name}`}
        >
          <option value="">Select department</option>
          {departments.map((department) => (
            <option
              key={department._id}
              value={department._id}
            >
              {department.name}
            </option>
          ))}
        </select>
      </td>

      <td>
        <select
          value={officeId}
          onChange={(event) =>
            setOfficeId(event.target.value)
          }
          disabled={busy}
          aria-label={`Office for ${officer.name}`}
        >
          <option value="">Select office</option>
          {offices.map((office) => (
            <option key={office._id} value={office._id}>
              {office.name}
            </option>
          ))}
        </select>
      </td>

      <td>
        <span
          className={`officer-management-status ${
            officer.isActive
              ? "is-active"
              : "is-inactive"
          }`}
        >
          {officer.isActive ? "Active" : "Inactive"}
        </span>
      </td>

      <td>
        <div className="officer-management-actions">
          <button
            type="button"
            className="admin-assign-button"
            disabled={
              busy ||
              !changed ||
              !departmentId ||
              !officeId
            }
            onClick={() =>
              onSave(officer._id, {
                departmentId,
                officeId,
              })
            }
          >
            Save
          </button>

          <button
            type="button"
            className="admin-cancel-button"
            disabled={busy}
            onClick={() =>
              onToggle(officer._id, !officer.isActive)
            }
          >
            {officer.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

export default function AdminDashboard({
  user,
  onLogout,
}) {
  /* -------------------------------------------------------
     DASHBOARD STATE
  ------------------------------------------------------- */

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [activePage, setActivePage] =
    useState("overview");

  /* -------------------------------------------------------
     COMPLAINT STATE
  ------------------------------------------------------- */

  const [complaints, setComplaints] = useState([]);
  const [complaintsLoading, setComplaintsLoading] =
    useState(false);

  const [complaintsError, setComplaintsError] =
    useState("");

  const [complaintsLoaded, setComplaintsLoaded] =
    useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [departmentFilter, setDepartmentFilter] =
    useState("ALL");

  const [assignmentFilter, setAssignmentFilter] =
    useState("ALL");

  /* -------------------------------------------------------
     COMPLAINT DETAIL STATE
  ------------------------------------------------------- */

  const [selectedComplaint, setSelectedComplaint] =
    useState(null);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState("");

  const [resolutionReviewNote, setResolutionReviewNote] =
    useState("");

  const [resolutionReviewLoading, setResolutionReviewLoading] =
    useState(false);

  const [resolutionReviewError, setResolutionReviewError] =
    useState("");

  const [resolutionReviewSuccess, setResolutionReviewSuccess] =
    useState("");

  const [previewImage, setPreviewImage] =
    useState("");

  /* -------------------------------------------------------
     ASSIGNMENT STATE
  ------------------------------------------------------- */

  const [assignmentComplaint, setAssignmentComplaint] =
    useState(null);

  const [departments, setDepartments] = useState([]);
  const [offices, setOffices] = useState([]);
  const [prabhags, setPrabhags] = useState([]);
  const [zones, setZones] = useState([]);
  const [officers, setOfficers] = useState([]);

  const [
    assignmentDepartmentId,
    setAssignmentDepartmentId,
  ] = useState("");

  const [
    assignmentOfficeId,
    setAssignmentOfficeId,
  ] = useState("");

  const [
    assignmentZoneId,
    setAssignmentZoneId,
  ] = useState("");

  const [
    assignmentPrabhagId,
    setAssignmentPrabhagId,
  ] = useState("");

  const [
    assignmentOfficerId,
    setAssignmentOfficerId,
  ] = useState("");

  const [assignmentNote, setAssignmentNote] =
    useState("");

  const [assignmentLoading, setAssignmentLoading] =
    useState(false);

  const [officersLoading, setOfficersLoading] =
    useState(false);

  const [
    assignmentDataLoading,
    setAssignmentDataLoading,
  ] = useState(false);

  const [assignmentError, setAssignmentError] =
    useState("");

  const [assignmentSuccess, setAssignmentSuccess] =
    useState("");

  /* -------------------------------------------------------
     OFFICER MANAGEMENT STATE
  ------------------------------------------------------- */

  const [managedOfficers, setManagedOfficers] = useState([]);
  const [officerManagementLoading, setOfficerManagementLoading] =
    useState(false);
  const [officerManagementError, setOfficerManagementError] =
    useState("");
  const [officerManagementSuccess, setOfficerManagementSuccess] =
    useState("");
  const [officerManagementBusyId, setOfficerManagementBusyId] =
    useState("");
  const [officerStatusFilter, setOfficerStatusFilter] =
    useState("ALL");

  const [newOfficer, setNewOfficer] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    departmentId: "",
    officeId: "",
  });
  const [createOfficerLoading, setCreateOfficerLoading] =
    useState(false);

  /* =======================================================
     FETCH DASHBOARD
  ======================================================= */

  const fetchDashboard = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await adminAPI.getOverview();

      setDashboard(response.data?.data || null);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load the admin dashboard."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /* =======================================================
     FETCH COMPLAINTS
  ======================================================= */

  const fetchComplaints = async (force = false) => {
    if (complaintsLoaded && !force) {
      return;
    }

    try {
      setComplaintsLoading(true);
      setComplaintsError("");

      const response = await adminAPI.getComplaints();

      const records = getResponseArray(response);

      setComplaints(records);
      setComplaintsLoaded(true);
    } catch (err) {
      setComplaintsError(
        err.response?.data?.message ||
          "Unable to load complaints."
      );
    } finally {
      setComplaintsLoading(false);
    }
  };

  /* =======================================================
     ADMIN RESOLUTION REVIEW
  ======================================================= */

  const handleResolutionReview = async (decision) => {
    if (!selectedComplaint?._id) {
      setResolutionReviewError("No complaint is selected.");
      return;
    }

    const resolution = selectedComplaint.resolution;

    if (
      selectedComplaint.status !== "PENDING_VERIFICATION" ||
      resolution?.reviewStatus !== "PENDING_VERIFICATION"
    ) {
      setResolutionReviewError(
        "This resolution is no longer awaiting verification. Refresh the complaint before reviewing it."
      );
      return;
    }

    const note = resolutionReviewNote.trim();

    if (decision === "REJECT" && !note) {
      setResolutionReviewError(
        "A rejection reason is required."
      );
      return;
    }

    if (!["APPROVE", "REJECT"].includes(decision)) {
      setResolutionReviewError("Invalid review decision.");
      return;
    }

    try {
      setResolutionReviewLoading(true);
      setResolutionReviewError("");
      setResolutionReviewSuccess("");

      await adminAPI.reviewResolution(
        selectedComplaint._id,
        {
          decision,
          note,
        }
      );

      // Fetch the persisted record rather than relying on the
      // response or keeping stale modal data.
      const response = await adminAPI.getComplaints();
      const records = getResponseArray(response);

      setComplaints(records);
      setComplaintsLoaded(true);

      const updatedComplaint = records.find(
        (item) => item._id === selectedComplaint._id
      );

      if (updatedComplaint) {
        setSelectedComplaint(updatedComplaint);
      } else {
        setSelectedComplaint(null);
      }

      setResolutionReviewNote("");
      setResolutionReviewSuccess(
        decision === "APPROVE"
          ? "Resolution approved. Complaint marked as resolved."
          : "Resolution rejected. Complaint returned to the officer."
      );
    } catch (err) {
      setResolutionReviewError(
        err.response?.data?.message ||
          "Unable to submit the resolution review."
      );
    } finally {
      setResolutionReviewLoading(false);
    }
  };

  /* =======================================================
     OPEN COMPLAINT DETAILS
  ======================================================= */

  const openComplaintDetails = async (complaintId) => {
    try {
      setDetailLoading(true);
      setDetailError("");
      setSelectedComplaint(null);
      setPreviewImage("");
      setResolutionReviewNote("");
      setResolutionReviewError("");
      setResolutionReviewSuccess("");

      let complaint = complaints.find(
        (item) => item._id === complaintId
      );

      if (
        !complaint ||
        !Array.isArray(complaint.media)
      ) {
        const response =
          await adminAPI.getComplaints();

        const allComplaints =
          getResponseArray(response);

        setComplaints(allComplaints);
        setComplaintsLoaded(true);

        complaint = allComplaints.find(
          (item) => item._id === complaintId
        );
      }

      if (!complaint) {
        setDetailError(
          "Complaint details could not be found."
        );
        return;
      }

      setSelectedComplaint(complaint);
    } catch (err) {
      setDetailError(
        err.response?.data?.message ||
          "Unable to load complaint details."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  /* =======================================================
     LOAD ELIGIBLE OFFICERS
  ======================================================= */

  const loadOfficers = async (
    departmentId,
    officeId,
    recommendedOfficerId = ""
  ) => {
    if (!departmentId || !officeId) {
      setOfficers([]);
      setAssignmentOfficerId("");
      setOfficersLoading(false);
      return;
    }

    try {
      setOfficersLoading(true);
      setAssignmentError("");
      setOfficers([]);
      setAssignmentOfficerId("");

      const response = await adminAPI.getOfficers({
        departmentId,
        officeId,
        isActive: true,
      });

      const records = getResponseArray(response);

      const eligible = records.filter((officer) => {
        const officerDepartment =
          getId(officer.department);

        const officerOffice =
          getId(officer.administrativeOffice);

        return (
          officer.isActive !== false &&
          officer.role === "OFFICER" &&
          officerDepartment === String(departmentId) &&
          officerOffice === String(officeId)
        );
      });

      setOfficers(eligible);

      const validRecommendedOfficer = eligible.find(
        (officer) =>
          getId(officer) === String(recommendedOfficerId)
      );

      setAssignmentOfficerId(
        validRecommendedOfficer
          ? getId(validRecommendedOfficer)
          : ""
      );
    } catch (err) {
      setOfficers([]);
      setAssignmentOfficerId("");

      setAssignmentError(
        err.response?.data?.message ||
          "Unable to load eligible officers."
      );
    } finally {
      setOfficersLoading(false);
    }
  };

  /* =======================================================
     OPEN ASSIGNMENT MODAL
  ======================================================= */

  const openAssignment = async (complaint) => {
    if (!complaint?._id) {
      return;
    }

    setAssignmentComplaint(complaint);

    setAssignmentDepartmentId("");
    setAssignmentOfficeId("");
    setAssignmentZoneId("");
    setAssignmentPrabhagId("");
    setAssignmentOfficerId("");

    setDepartments([]);
    setOffices([]);
    setPrabhags([]);
    setZones([]);
    setOfficers([]);

    setAssignmentNote("");
    setAssignmentError("");
    setAssignmentSuccess("");

    setAssignmentDataLoading(true);
    setOfficersLoading(false);

    try {
      const [
        departmentsResponse,
        officesResponse,
        prabhagsResponse,
        zonesResponse,
      ] = await Promise.all([
        adminAPI.getDepartments(),
        geographyAPI.getOffices(),
        geographyAPI.getPrabhags(),
        geographyAPI.getZones(),
      ]);

      const departmentRecords =
        getResponseArray(departmentsResponse)
          .filter(isActiveRecord);

      const officeRecords =
        getResponseArray(officesResponse)
          .filter(isActiveRecord);

      const prabhagRecords =
        getResponseArray(prabhagsResponse)
          .filter(isActiveRecord);

      const zoneRecords =
        getResponseArray(zonesResponse)
          .filter(isActiveRecord);

      setDepartments(departmentRecords);
      setOffices(officeRecords);
      setPrabhags(prabhagRecords);
      setZones(zoneRecords);

      const suggested =
        complaint.recommendedAssignment || {};

      const initialDepartmentId =
        getId(suggested.department) ||
        getId(complaint.department);

      const initialOfficeId =
        getId(suggested.administrativeOffice) ||
        getId(complaint.administrativeOffice);

      const suggestedZoneId =
        getId(suggested.zone) ||
        getId(complaint.zone);

      const validZone = zoneRecords.find(
        (zone) => getId(zone) === suggestedZoneId
      );

      const departmentExists =
        departmentRecords.some(
          (department) =>
            getId(department) === initialDepartmentId
        );

      const officeExists =
        officeRecords.some(
          (office) =>
            getId(office) === initialOfficeId
        );

      const validDepartmentId =
        departmentExists ? initialDepartmentId : "";

      const validOfficeId =
        officeExists ? initialOfficeId : "";

      const suggestedPrabhagId =
        getId(suggested.prabhag) ||
        getId(complaint.prabhag);

      const validPrabhag = prabhagRecords.find(
        (prabhag) =>
          getId(prabhag) === suggestedPrabhagId &&
          getId(prabhag.administrativeOffice) ===
            validOfficeId
      );

      setAssignmentDepartmentId(validDepartmentId);
      setAssignmentOfficeId(validOfficeId);

      setAssignmentZoneId(
        validZone ? getId(validZone) : ""
      );

      setAssignmentPrabhagId(
        validPrabhag ? getId(validPrabhag) : ""
      );

      if (validDepartmentId && validOfficeId) {
        await loadOfficers(
          validDepartmentId,
          validOfficeId,
          getId(suggested.officer)
        );
      }
    } catch (err) {
      setAssignmentError(
        err.response?.data?.message ||
          err.message ||
          "Unable to load departments, offices, Prabhags or Zones."
      );
    } finally {
      setAssignmentDataLoading(false);
    }
  };

  /* =======================================================
     DEPARTMENT CHANGE
  ======================================================= */

  const handleDepartmentChange = async (
    departmentId
  ) => {
    setAssignmentDepartmentId(departmentId);

    setAssignmentOfficerId("");
    setOfficers([]);

    if (departmentId && assignmentOfficeId) {
      await loadOfficers(
        departmentId,
        assignmentOfficeId
      );
    } else {
      setOfficers([]);
    }
  };

  /* =======================================================
     OFFICE CHANGE
  ======================================================= */

  const handleOfficeChange = async (officeId) => {
    setAssignmentOfficeId(officeId);

    setAssignmentPrabhagId("");
    setAssignmentOfficerId("");
    setOfficers([]);

    /*
      Do not clear assignmentZoneId here.

      Zone is independently identified using the GPS
      Zone boundary. It is not necessarily derived from
      the selected administrative office.
    */

    if (assignmentDepartmentId && officeId) {
      await loadOfficers(
        assignmentDepartmentId,
        officeId
      );
    } else {
      setOfficers([]);
    }
  };

  /* =======================================================
     CLOSE ASSIGNMENT MODAL
  ======================================================= */

  const closeAssignment = () => {
    if (assignmentLoading) {
      return;
    }

    setAssignmentComplaint(null);

    setAssignmentDepartmentId("");
    setAssignmentOfficeId("");
    setAssignmentZoneId("");
    setAssignmentPrabhagId("");
    setAssignmentOfficerId("");

    setAssignmentNote("");
    setAssignmentError("");

    setDepartments([]);
    setOffices([]);
    setPrabhags([]);
    setZones([]);
    setOfficers([]);
  };

  /* =======================================================
     SUBMIT ASSIGNMENT
  ======================================================= */

  const submitAssignment = async (event) => {
    event.preventDefault();

    if (!assignmentComplaint) {
      return;
    }

    if (
      !assignmentDepartmentId ||
      !assignmentOfficeId ||
      !assignmentOfficerId
    ) {
      setAssignmentError(
        "Select a department, administrative office and eligible officer before confirming."
      );
      return;
    }

    const selectedDepartment = departments.find(
      (department) =>
        getId(department) === assignmentDepartmentId
    );

    const selectedOffice = offices.find(
      (office) =>
        getId(office) === assignmentOfficeId
    );

    const selectedOfficer = officers.find(
      (officer) =>
        getId(officer) === assignmentOfficerId
    );

    if (!selectedDepartment || !selectedOffice) {
      setAssignmentError(
        "The selected department or office is no longer available. Reload the assignment form."
      );
      return;
    }

    if (!selectedOfficer) {
      setAssignmentError(
        "The selected officer is not in the current eligible officer list. Select an eligible officer again."
      );
      return;
    }

    if (
      selectedOfficer.isActive === false ||
      selectedOfficer.role !== "OFFICER" ||
      getId(selectedOfficer.department) !==
        assignmentDepartmentId ||
      getId(selectedOfficer.administrativeOffice) !==
        assignmentOfficeId
    ) {
      setAssignmentError(
        "The selected officer does not match the selected department and administrative office."
      );
      return;
    }

    if (assignmentZoneId) {
      const selectedZone = zones.find(
        (zone) =>
          getId(zone) === assignmentZoneId
      );

      if (!selectedZone) {
        setAssignmentError(
          "The selected Zone is no longer available. Reload the assignment form."
        );
        return;
      }
    }

    if (assignmentPrabhagId) {
      const selectedPrabhag = prabhags.find(
        (prabhag) =>
          getId(prabhag) === assignmentPrabhagId
      );

      if (
        !selectedPrabhag ||
        getId(selectedPrabhag.administrativeOffice) !==
          assignmentOfficeId
      ) {
        setAssignmentError(
          "The selected Prabhag does not belong to the selected administrative office."
        );
        return;
      }
    }

    try {
      setAssignmentLoading(true);
      setAssignmentError("");
      setAssignmentSuccess("");

      const isReassignment =
        isConfirmedAssignment(assignmentComplaint);

      const response = await adminAPI.assignComplaint(
        assignmentComplaint._id,
        {
          departmentId: assignmentDepartmentId,
          administrativeOfficeId: assignmentOfficeId,
          zoneId: assignmentZoneId || null,
          prabhagId: assignmentPrabhagId || null,
          officerId: assignmentOfficerId,
          note: assignmentNote.trim(),
          reassign: isReassignment,
        }
      );

      const updatedComplaint =
        response.data?.data ||
        response.data?.complaint;

      if (updatedComplaint) {
        setComplaints((previous) =>
          previous.map((item) =>
            item._id === updatedComplaint._id
              ? {
                  ...item,
                  ...updatedComplaint,
                }
              : item
          )
        );
      }

      setAssignmentSuccess(
        response.data?.message ||
          "Assignment reviewed and confirmed successfully."
      );

      setAssignmentComplaint(null);

      setAssignmentDepartmentId("");
      setAssignmentOfficeId("");
      setAssignmentZoneId("");
      setAssignmentPrabhagId("");
      setAssignmentOfficerId("");
      setAssignmentNote("");

      setDepartments([]);
      setOffices([]);
      setPrabhags([]);
      setZones([]);
      setOfficers([]);

      await Promise.all([
        fetchDashboard(true),
        fetchComplaints(true),
      ]);
    } catch (err) {
      setAssignmentError(
        err.response?.data?.message ||
          "Unable to confirm this assignment."
      );
    } finally {
      setAssignmentLoading(false);
    }
  };


  /* =======================================================
     OFFICER MANAGEMENT ACTIONS
  ======================================================= */

  const fetchManagedOfficers = async () => {
    try {
      setOfficerManagementLoading(true);
      setOfficerManagementError("");

      const response = await adminAPI.getOfficers();
      setManagedOfficers(getResponseArray(response));
    } catch (err) {
      setOfficerManagementError(
        err.response?.data?.message ||
          "Unable to load PMC officers."
      );
    } finally {
      setOfficerManagementLoading(false);
    }
  };

  const loadOfficerManagementData = async () => {
    try {
      setOfficerManagementError("");

      const [departmentResponse, officeResponse] =
        await Promise.all([
          adminAPI.getDepartments(),
          geographyAPI.getOffices(),
        ]);

      const departmentRecords =
        getResponseArray(departmentResponse);
      const officeRecords =
        getResponseArray(officeResponse);

      setDepartments(departmentRecords);
      setOffices(officeRecords);

      await fetchManagedOfficers();
    } catch (err) {
      setOfficerManagementError(
        err.response?.data?.message ||
          "Unable to load departments and administrative offices."
      );
    }
  };

  const handleCreateOfficer = async (event) => {
    event.preventDefault();

    try {
      setCreateOfficerLoading(true);
      setOfficerManagementError("");
      setOfficerManagementSuccess("");

      await adminAPI.createOfficer(newOfficer);

      setNewOfficer({
        name: "",
        email: "",
        phone: "",
        password: "",
        departmentId: "",
        officeId: "",
      });

      setOfficerManagementSuccess(
        "Officer account created successfully."
      );

      await fetchManagedOfficers();
    } catch (err) {
      setOfficerManagementError(
        err.response?.data?.message ||
          "Unable to create officer account."
      );
    } finally {
      setCreateOfficerLoading(false);
    }
  };

  const handleUpdateOfficerAssignment = async (
    officerId,
    assignment
  ) => {
    try {
      setOfficerManagementBusyId(officerId);
      setOfficerManagementError("");
      setOfficerManagementSuccess("");

      await adminAPI.updateOfficerAssignment(
        officerId,
        assignment
      );

      setOfficerManagementSuccess(
        "Officer department and office updated."
      );

      await fetchManagedOfficers();
    } catch (err) {
      setOfficerManagementError(
        err.response?.data?.message ||
          "Unable to update officer assignment."
      );
    } finally {
      setOfficerManagementBusyId("");
    }
  };

  const handleToggleOfficerStatus = async (
    officerId,
    isActive
  ) => {
    const action = isActive ? "activate" : "deactivate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} this officer?`
      )
    ) {
      return;
    }

    try {
      setOfficerManagementBusyId(officerId);
      setOfficerManagementError("");
      setOfficerManagementSuccess("");

      await adminAPI.updateOfficerStatus(
        officerId,
        isActive
      );

      setOfficerManagementSuccess(
        `Officer ${isActive ? "activated" : "deactivated"} successfully.`
      );

      await fetchManagedOfficers();
    } catch (err) {
      setOfficerManagementError(
        err.response?.data?.message ||
          "Unable to update officer status."
      );
    } finally {
      setOfficerManagementBusyId("");
    }
  };

  const filteredManagedOfficers = managedOfficers.filter(
    (officer) => {
      if (officerStatusFilter === "ACTIVE") {
        return officer.isActive === true;
      }

      if (officerStatusFilter === "INACTIVE") {
        return officer.isActive === false;
      }

      return true;
    }
  );

  /* =======================================================
     INITIAL DATA
  ======================================================= */

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (
      activePage === "complaints" ||
      activePage === "assignments"
    ) {
      fetchComplaints();
    }

    if (activePage === "officers") {
      loadOfficerManagementData();
    }
  }, [activePage]);

  /* =======================================================
     FILTERED COMPLAINTS
  ======================================================= */

  const filteredComplaints = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return complaints.filter((complaint) => {
      const department =
        getComplaintDepartment(complaint);

      const legacyDepartment =
        getLegacyDepartment(complaint);

      const matchesSearch =
        !search ||
        [
          complaint.complaintNumber,
          complaint.title,
          complaint.description,
          complaint.citizen?.name,
          department?.name,
          legacyDepartment?.name,
          complaint.assignedOfficer?.name,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(search)
          );

      const matchesStatus =
        statusFilter === "ALL" ||
        complaint.status === statusFilter;

      const matchesDepartment =
        departmentFilter === "ALL" ||
        getId(department) === departmentFilter ||
        getId(legacyDepartment) === departmentFilter;

      const matchesAssignment =
        assignmentFilter === "ALL" ||
        (assignmentFilter === "UNASSIGNED" &&
          !isConfirmedAssignment(complaint)) ||
        (assignmentFilter === "ASSIGNED" &&
          isConfirmedAssignment(complaint));

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment &&
        matchesAssignment
      );
    });
  }, [
    complaints,
    searchTerm,
    statusFilter,
    departmentFilter,
    assignmentFilter,
  ]);

  /* =======================================================
     ASSIGNMENT LISTS
  ======================================================= */

  const assignableComplaints = useMemo(
    () =>
      complaints.filter(
        (complaint) =>
          !complaint.duplicateOf &&
          complaint.duplicateCheck?.status !==
            "CONFIRMED" &&
          !["RESOLVED", "REJECTED"].includes(
            complaint.status
          )
      ),
    [complaints]
  );

  const unassignedComplaints =
    assignableComplaints.filter(
      (complaint) =>
        !isConfirmedAssignment(complaint)
    );

  const confirmedAssignedComplaints =
    assignableComplaints.filter(
      (complaint) =>
        isConfirmedAssignment(complaint)
    );

  /* =======================================================
     DEPARTMENT FILTER OPTIONS
  ======================================================= */

  const complaintDepartments = useMemo(() => {
    const map = new Map();

    complaints.forEach((complaint) => {
      const department =
        getComplaintDepartment(complaint) ||
        getLegacyDepartment(complaint);

      if (department?._id) {
        map.set(String(department._id), department);
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }, [complaints]);

  /* =======================================================
     PRABHAGS FOR SELECTED OFFICE
  ======================================================= */

  const availablePrabhags = useMemo(() => {
    if (!assignmentOfficeId) {
      return [];
    }

    return prabhags.filter(
      (prabhag) =>
        getId(prabhag.administrativeOffice) ===
        String(assignmentOfficeId)
    );
  }, [prabhags, assignmentOfficeId]);

  /* =======================================================
     LOADING AND ERROR SCREENS
  ======================================================= */

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="loader" />
        <p>Loading Admin Dashboard...</p>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="admin-error-page">
        <AlertTriangle size={35} />

        <h2>Dashboard unavailable</h2>

        <p>{error}</p>

        <button onClick={() => fetchDashboard()}>
          Try again
        </button>
      </div>
    );
  }

  /* =======================================================
     DASHBOARD DATA
  ======================================================= */

  const summary = dashboard?.summary || {};

  const recentComplaints =
    dashboard?.recentComplaints || [];

  const statusBreakdown =
    dashboard?.statusBreakdown || [];

  const severityBreakdown =
    dashboard?.severityBreakdown || [];

  const departmentBreakdown =
    dashboard?.departmentBreakdown || [];

  const priorityBreakdown =
    normalizePriorityBreakdown(
      dashboard?.priorityBreakdown
    );

  const imageMedia =
    selectedComplaint?.media?.filter(
      (media) => media.mediaType === "IMAGE"
    ) || [];

  const otherMedia =
    selectedComplaint?.media?.filter(
      (media) => media.mediaType !== "IMAGE"
    ) || [];

  const imageAssessment =
    selectedComplaint?.aiAnalysis?.imageAssessment;

  const assessmentImages =
    Array.isArray(imageAssessment?.images)
      ? imageAssessment.images
      : [];

  const garbageCategoryCounts =
    imageAssessment?.garbageCategoryCounts &&
    typeof imageAssessment.garbageCategoryCounts === "object" &&
    !Array.isArray(imageAssessment.garbageCategoryCounts)
      ? Object.entries(imageAssessment.garbageCategoryCounts)
      : [];

  const suggestedAssignment =
    assignmentComplaint?.recommendedAssignment || {};

  const suggestionNeedsReview =
    suggestedAssignment.reviewStatus !== "APPROVED";

  const legacyAssignmentDepartment =
    getLegacyDepartment(assignmentComplaint);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="admin-dashboard">
      {/* HEADER */}

      <header className="admin-header">
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <ShieldCheck size={23} />
          </div>

          <div>
            <h2>CivicAI</h2>
            <span>Municipal Administration</span>
          </div>
        </div>

        <div className="admin-header-right">
          <div className="admin-user-info">
            <strong>{user?.name}</strong>
            <span>Administrator</span>
          </div>

          <button
            className="admin-logout-button"
            onClick={onLogout}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="admin-app-layout">
        {/* SIDEBAR */}

        <aside className="admin-sidebar">
          <div className="admin-sidebar-heading">
            <span>ADMINISTRATION</span>
          </div>

          <nav className="admin-sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  className={`admin-nav-item ${
                    activePage === item.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setActivePage(item.id);
                    setAssignmentSuccess("");
                  }}
                >
                  <Icon size={18} />

                  <span>{item.label}</span>

                  {item.id === "assignments" &&
                    unassignedComplaints.length > 0 && (
                      <span className="admin-nav-count">
                        {unassignedComplaints.length}
                      </span>
                    )}
                </button>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <Building2 size={17} />
            <span>Pune Municipal Corporation</span>
          </div>
        </aside>

        {/* MAIN CONTENT */}

        <main className="admin-main admin-page-content">
          {error && (
            <div className="admin-inline-error">
              {error}
            </div>
          )}

          {assignmentSuccess && (
            <div className="admin-success-message">
              <CheckCircle2 size={17} />

              {assignmentSuccess}

              <button
                onClick={() =>
                  setAssignmentSuccess("")
                }
                aria-label="Dismiss message"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* OVERVIEW PAGE */}

          {activePage === "overview" && (
            <>
              <div className="admin-welcome">
                <div>
                  <span className="admin-eyebrow">
                    PUNE MUNICIPAL CORPORATION
                  </span>

                  <h1>Dashboard Overview</h1>

                  <p>
                    Monitor civic complaints, departments
                    and municipal operations from one place.
                  </p>
                </div>

                <button
                  className="admin-refresh-button"
                  onClick={() => fetchDashboard(true)}
                  disabled={refreshing}
                >
                  <RefreshCw
                    size={17}
                    className={
                      refreshing
                        ? "admin-spinning"
                        : ""
                    }
                  />

                  {refreshing
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>

              <section className="admin-stats-grid">
                <StatCard
                  title="Total Complaints"
                  value={summary.totalComplaints}
                  icon={FileText}
                  description="All recorded complaints"
                />

                <StatCard
                  title="Received Today"
                  value={summary.todayComplaints}
                  icon={Activity}
                  description="Complaints registered today"
                />

                <StatCard
                  title="Pending Assignment Review"
                  value={
                    summary.pendingAssignmentReviews ??
                    summary.unassignedComplaints
                  }
                  icon={Clock3}
                  description="Awaiting administrator confirmation"
                />

                <StatCard
                  title="Total Officers"
                  value={summary.totalOfficers}
                  icon={Users}
                  description={`${
                    summary.activeOfficers || 0
                  } active officers`}
                />

                <StatCard
                  title="Inactive Officers"
                  value={summary.inactiveOfficers}
                  icon={AlertTriangle}
                  description="Officers currently inactive"
                />

                <StatCard
                  title="Confirmed Duplicates"
                  value={summary.confirmedDuplicates}
                  icon={Copy}
                  description="Verified duplicate complaints"
                />

                <StatCard
                  title="Closed Complaints"
                  value={summary.closedComplaints}
                  icon={CheckCircle2}
                  description="Resolved or rejected complaints"
                />
              </section>

              <section className="admin-breakdowns-grid">
                <BreakdownCard
                  title="Complaints by Status"
                  items={statusBreakdown.map((item) => ({
                    ...item,
                    displayName:
                      STATUS_LABELS[item.status] ||
                      item.status,
                  }))}
                  labelKey="displayName"
                  valueKey="count"
                  colorClass="status-fill"
                />

                <BreakdownCard
                  title="Complaints by Severity"
                  items={severityBreakdown.map((item) => ({
                    ...item,
                    displayName:
                      SEVERITY_LABELS[item.severity] ||
                      item.severity,
                  }))}
                  labelKey="displayName"
                  valueKey="count"
                  colorClass="severity-fill"
                />

                <BreakdownCard
                  title="Complaints by Department"
                  items={departmentBreakdown.map((item) => ({
                    ...item,
                    displayName: item.departmentName,
                  }))}
                  labelKey="displayName"
                  valueKey="count"
                  colorClass="department-fill"
                />

                <BreakdownCard
                  title="Complaints by Priority"
                  items={priorityBreakdown.map((item) => ({
                    ...item,
                    displayName:
                      PRIORITY_LABELS[item.level] ||
                      item.level,
                  }))}
                  labelKey="displayName"
                  valueKey="count"
                  colorClass="priority-fill"
                />
              </section>

              <section className="admin-panel admin-recent-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h3>Recent Complaints</h3>

                    <p>
                      Latest 10 complaints registered
                      in the system
                    </p>
                  </div>

                  <button
                    className="admin-text-button"
                    onClick={() =>
                      setActivePage("complaints")
                    }
                  >
                    View all complaints
                  </button>
                </div>

                <ComplaintTable
                  complaints={recentComplaints}
                  onView={openComplaintDetails}
                />
              </section>
            </>
          )}

          {/* ALL COMPLAINTS PAGE */}

          {activePage === "complaints" && (
            <>
              <div className="admin-welcome">
                <div>
                  <span className="admin-eyebrow">
                    PUNE MUNICIPAL CORPORATION
                  </span>

                  <h1>All Complaints</h1>

                  <p>
                    Search, inspect and monitor all
                    complaints registered in CivicAI.
                  </p>
                </div>

                <button
                  className="admin-refresh-button"
                  onClick={() => fetchComplaints(true)}
                  disabled={complaintsLoading}
                >
                  <RefreshCw
                    size={17}
                    className={
                      complaintsLoading
                        ? "admin-spinning"
                        : ""
                    }
                  />

                  {complaintsLoading
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>

              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h3>Complaint Records</h3>

                    <p>
                      {filteredComplaints.length} of{" "}
                      {complaints.length} complaints
                    </p>
                  </div>

                  <ClipboardList size={21} />
                </div>

                <div className="admin-filter-toolbar">
                  <div className="admin-search-box">
                    <Search size={17} />

                    <input
                      type="search"
                      placeholder="Search complaint ID, title, citizen..."
                      value={searchTerm}
                      onChange={(event) =>
                        setSearchTerm(event.target.value)
                      }
                    />
                  </div>

                  <div className="admin-filter-control">
                    <Filter size={16} />

                    <select
                      value={statusFilter}
                      onChange={(event) =>
                        setStatusFilter(event.target.value)
                      }
                    >
                      <option value="ALL">
                        All statuses
                      </option>

                      {Object.entries(
                        STATUS_LABELS
                      ).map(([value, label]) => (
                        <option
                          key={value}
                          value={value}
                        >
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-filter-control">
                    <Building2 size={16} />

                    <select
                      value={departmentFilter}
                      onChange={(event) =>
                        setDepartmentFilter(
                          event.target.value
                        )
                      }
                    >
                      <option value="ALL">
                        All departments
                      </option>

                      {complaintDepartments.map(
                        (department) => (
                          <option
                            key={department._id}
                            value={department._id}
                          >
                            {department.name}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="admin-filter-control">
                    <UserCheck size={16} />

                    <select
                      value={assignmentFilter}
                      onChange={(event) =>
                        setAssignmentFilter(
                          event.target.value
                        )
                      }
                    >
                      <option value="ALL">
                        All assignments
                      </option>

                      <option value="UNASSIGNED">
                        Unassigned
                      </option>

                      <option value="ASSIGNED">
                        Assigned
                      </option>
                    </select>
                  </div>

                  <button
                    className="admin-reset-filters"
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("ALL");
                      setDepartmentFilter("ALL");
                      setAssignmentFilter("ALL");
                    }}
                  >
                    Reset
                  </button>
                </div>

                {complaintsError && (
                  <div className="admin-inline-error">
                    {complaintsError}
                  </div>
                )}

                {complaintsLoading ? (
                  <div className="admin-loading-inline">
                    <RefreshCw
                      className="admin-spinning"
                      size={20}
                    />

                    Loading complaints...
                  </div>
                ) : (
                  <ComplaintTable
                    complaints={filteredComplaints}
                    onView={openComplaintDetails}
                    onAssign={openAssignment}
                    showAssignmentAction
                  />
                )}
              </section>
            </>
          )}


          {/* OFFICER MANAGEMENT PAGE */}

          {activePage === "officers" && (
            <>
              <div className="admin-welcome">
                <div>
                  <span className="admin-eyebrow">
                    PUNE MUNICIPAL CORPORATION
                  </span>

                  <h1>Officer Management</h1>

                  <p>
                    Create PMC officer accounts and maintain
                    their department, administrative office
                    and account status.
                  </p>
                </div>

                <button
                  className="admin-refresh-button"
                  onClick={loadOfficerManagementData}
                  disabled={
                    officerManagementLoading ||
                    createOfficerLoading
                  }
                >
                  <RefreshCw
                    size={17}
                    className={
                      officerManagementLoading
                        ? "admin-spinning"
                        : ""
                    }
                  />
                  {officerManagementLoading
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>

              {officerManagementError && (
                <div className="admin-inline-error">
                  {officerManagementError}
                </div>
              )}

              {officerManagementSuccess && (
                <div className="admin-success-message">
                  <CheckCircle2 size={17} />
                  {officerManagementSuccess}
                  <button
                    onClick={() =>
                      setOfficerManagementSuccess("")
                    }
                    aria-label="Dismiss message"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              <section className="admin-panel officer-management-create">
                <div className="admin-panel-heading">
                  <div>
                    <h3>Create Officer Account</h3>
                    <p>
                      New accounts are created as active PMC
                      officers under the selected department
                      and administrative office.
                    </p>
                  </div>
                  <UserPlus size={21} />
                </div>

                <form onSubmit={handleCreateOfficer}>
                  <div className="officer-management-form-grid">
                    <div className="admin-form-field">
                      <label htmlFor="new-officer-name">
                        Full Name
                      </label>
                      <input
                        id="new-officer-name"
                        value={newOfficer.name}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        minLength={2}
                        required
                        autoComplete="name"
                        disabled={createOfficerLoading}
                        placeholder="Officer full name"
                      />
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="new-officer-email">
                        Email Address
                      </label>
                      <input
                        id="new-officer-email"
                        type="email"
                        value={newOfficer.email}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        required
                        autoComplete="off"
                        disabled={createOfficerLoading}
                        placeholder="officer@pmc.gov.in"
                      />
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="new-officer-phone">
                        Phone Number
                      </label>
                      <input
                        id="new-officer-phone"
                        type="tel"
                        value={newOfficer.phone}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            phone: event.target.value,
                          }))
                        }
                        autoComplete="tel"
                        disabled={createOfficerLoading}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="new-officer-password">
                        Initial Password
                      </label>
                      <input
                        id="new-officer-password"
                        type="password"
                        value={newOfficer.password}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            password: event.target.value,
                          }))
                        }
                        minLength={8}
                        required
                        autoComplete="new-password"
                        disabled={createOfficerLoading}
                        placeholder="Minimum 8 characters"
                      />
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="new-officer-department">
                        Department
                      </label>
                      <select
                        id="new-officer-department"
                        value={newOfficer.departmentId}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            departmentId: event.target.value,
                          }))
                        }
                        required
                        disabled={
                          createOfficerLoading ||
                          departments.length === 0
                        }
                      >
                        <option value="">
                          Select department
                        </option>
                        {departments.map((department) => (
                          <option
                            key={department._id}
                            value={department._id}
                          >
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="admin-form-field">
                      <label htmlFor="new-officer-office">
                        Administrative Office
                      </label>
                      <select
                        id="new-officer-office"
                        value={newOfficer.officeId}
                        onChange={(event) =>
                          setNewOfficer((current) => ({
                            ...current,
                            officeId: event.target.value,
                          }))
                        }
                        required
                        disabled={
                          createOfficerLoading ||
                          offices.length === 0
                        }
                      >
                        <option value="">
                          Select administrative office
                        </option>
                        {offices.map((office) => (
                          <option
                            key={office._id}
                            value={office._id}
                          >
                            {office.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="officer-management-form-footer">
                    <p>
                      The password is used only to create the
                      account and is not displayed in the officer
                      list.
                    </p>
                    <button
                      type="submit"
                      className="admin-assign-button"
                      disabled={
                        createOfficerLoading ||
                        !newOfficer.name.trim() ||
                        !newOfficer.email.trim() ||
                        newOfficer.password.length < 8 ||
                        !newOfficer.departmentId ||
                        !newOfficer.officeId
                      }
                    >
                      {createOfficerLoading
                        ? "Creating..."
                        : "Create Officer"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="admin-panel officer-management-list">
                <div className="admin-panel-heading">
                  <div>
                    <h3>PMC Officer Accounts</h3>
                    <p>
                      Update officer assignments or account
                      status. Assignment eligibility requires
                      an active officer in the exact department
                      and office.
                    </p>
                  </div>

                  <span>
                    {filteredManagedOfficers.length} officers
                  </span>
                </div>

                <div className="officer-management-toolbar">
                  <label htmlFor="officer-status-filter">
                    Account status
                  </label>
                  <select
                    id="officer-status-filter"
                    value={officerStatusFilter}
                    onChange={(event) =>
                      setOfficerStatusFilter(event.target.value)
                    }
                  >
                    <option value="ALL">All officers</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>

                {officerManagementLoading ? (
                  <div className="admin-loading-inline">
                    <RefreshCw
                      className="admin-spinning"
                      size={20}
                    />
                    Loading PMC officers...
                  </div>
                ) : filteredManagedOfficers.length === 0 ? (
                  <div className="admin-empty">
                    No officers found for this filter.
                  </div>
                ) : (
                  <div className="admin-table-wrapper">
                    <table className="admin-table officer-management-table">
                      <thead>
                        <tr>
                          <th>Officer</th>
                          <th>Department</th>
                          <th>Administrative Office</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredManagedOfficers.map((officer) => (
                          <OfficerManagementRow
                            key={officer._id}
                            officer={officer}
                            departments={departments}
                            offices={offices}
                            busy={
                              officerManagementBusyId === officer._id
                            }
                            onSave={handleUpdateOfficerAssignment}
                            onToggle={handleToggleOfficerStatus}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {/* ASSIGNMENT REVIEW PAGE */}

          {activePage === "assignments" && (
            <>
              <div className="admin-welcome">
                <div>
                  <span className="admin-eyebrow">
                    PUNE MUNICIPAL CORPORATION
                  </span>

                  <h1>Assignment Review</h1>

                  <p>
                    Review the suggested routing, correct
                    the details and confirm the official
                    officer assignment.
                  </p>
                </div>

                <button
                  className="admin-refresh-button"
                  onClick={() => {
                    fetchComplaints(true);
                    fetchDashboard(true);
                  }}
                  disabled={
                    complaintsLoading || refreshing
                  }
                >
                  <RefreshCw
                    size={17}
                    className={
                      complaintsLoading || refreshing
                        ? "admin-spinning"
                        : ""
                    }
                  />

                  {complaintsLoading || refreshing
                    ? "Refreshing..."
                    : "Refresh"}
                </button>
              </div>

              <section className="admin-assignment-summary">
                <div className="admin-assignment-summary-card">
                  <Clock3 size={22} />

                  <div>
                    <span>Awaiting Confirmation</span>
                    <strong>
                      {unassignedComplaints.length}
                    </strong>
                  </div>
                </div>

                <div className="admin-assignment-summary-card">
                  <UserCheck size={22} />

                  <div>
                    <span>Confirmed Assignments</span>
                    <strong>
                      {confirmedAssignedComplaints.length}
                    </strong>
                  </div>
                </div>

                <div className="admin-assignment-summary-card">
                  <FileText size={22} />

                  <div>
                    <span>Eligible Complaints</span>
                    <strong>
                      {assignableComplaints.length}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <h3>Complaints Requiring Review</h3>

                    <p>
                      Confirmed assignments can also be
                      reviewed and reassigned by an
                      administrator.
                    </p>
                  </div>
                </div>

                {complaintsError && (
                  <div className="admin-inline-error">
                    {complaintsError}
                  </div>
                )}

                {complaintsLoading ? (
                  <div className="admin-loading-inline">
                    <RefreshCw
                      className="admin-spinning"
                      size={20}
                    />

                    Loading complaints...
                  </div>
                ) : assignableComplaints.length === 0 ? (
                  <div className="admin-empty-state">
                    <CheckCircle2 size={30} />

                    <p>
                      No complaints currently require
                      assignment.
                    </p>
                  </div>
                ) : (
                  <div className="admin-assignment-list">
                    {assignableComplaints.map(
                      (complaint) => {
                        const department =
                          getComplaintDepartment(complaint);

                        const office =
                          getComplaintOffice(complaint);

                        const prabhag =
                          getComplaintPrabhag(complaint);

                        const zone =
                          getComplaintZone(complaint);

                        const isConfirmed =
                          isConfirmedAssignment(complaint);

                        const legacyDepartment =
                          getLegacyDepartment(complaint);

                        return (
                          <article
                            className="admin-assignment-card"
                            key={complaint._id}
                          >
                            <div className="admin-assignment-card-main">
                              <div className="admin-assignment-card-title">
                                <strong>
                                  {complaint.complaintNumber}
                                </strong>

                                <span
                                  className={`admin-tag status-${(
                                    complaint.status ||
                                    "submitted"
                                  ).toLowerCase()}`}
                                >
                                  {STATUS_LABELS[
                                    complaint.status
                                  ] || complaint.status}
                                </span>

                                <span className="admin-tag">
                                  {isConfirmed
                                    ? "Confirmed"
                                    : "Awaiting confirmation"}
                                </span>
                              </div>

                              <h3>{complaint.title}</h3>

                              <div className="admin-assignment-meta">
                                <span>
                                  <Building2 size={14} />

                                  {department?.name ||
                                    (legacyDepartment?.name
                                      ? `${legacyDepartment.name} — verify`
                                      : "Department not selected")}
                                </span>

                                <span>
                                  <MapPin size={14} />

                                  {office?.name ||
                                    "Office not selected"}
                                </span>

                                <span>
                                  <MapPin size={14} />

                                  {zone?.name ||
                                    "Zone not selected"}
                                </span>

                                <span>
                                  <MapPin size={14} />

                                  {prabhag?.name ||
                                    "Prabhag not selected"}
                                </span>

                                <span>
                                  <UserRound size={14} />

                                  {complaint.assignedOfficer
                                    ?.name ||
                                    "No officer confirmed"}
                                </span>
                              </div>

                              {!isConfirmed &&
                                legacyDepartment &&
                                !department && (
                                  <small>
                                    Legacy department value:
                                    {" "}
                                    {legacyDepartment.name}.
                                    Verify before assignment.
                                  </small>
                                )}

                              <small>
                                Registered{" "}
                                {formatDate(
                                  complaint.createdAt
                                )}
                              </small>
                            </div>

                            <div className="admin-assignment-card-actions">
                              <button
                                className="admin-view-button"
                                onClick={() =>
                                  openComplaintDetails(
                                    complaint._id
                                  )
                                }
                              >
                                <Eye size={14} />
                                Details
                              </button>

                              <button
                                className="admin-assign-button"
                                onClick={() =>
                                  openAssignment(complaint)
                                }
                              >
                                {isConfirmed ? (
                                  <>
                                    <RotateCcw size={14} />
                                    Review / Reassign
                                  </>
                                ) : (
                                  <>
                                    <UserPlus size={14} />
                                    Review Assignment
                                  </>
                                )}
                              </button>
                            </div>
                          </article>
                        );
                      }
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {/* FOOTER */}

          <footer className="admin-footer">
            <span>
              CivicAI · Pune Municipal Corporation
            </span>

            <span>
              Last updated:{" "}
              {formatDate(dashboard?.generatedAt)}
            </span>
          </footer>
        </main>
      </div>

      {/* COMPLAINT DETAIL LOADING */}

      {detailLoading && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <p>Loading complaint details...</p>
          </div>
        </div>
      )}

      {/* COMPLAINT DETAIL ERROR */}

      {detailError && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Unable to open complaint</h3>

              <button
                className="admin-modal-close"
                onClick={() => setDetailError("")}
              >
                ×
              </button>
            </div>

            <p>{detailError}</p>
          </div>
        </div>
      )}

      {/* COMPLAINT DETAILS MODAL */}

      {selectedComplaint && (
        <div
          className="admin-modal-overlay"
          onClick={() =>
            setSelectedComplaint(null)
          }
        >
          <div
            className="admin-modal admin-complaint-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="admin-modal-header">
              <div>
                <h2>Complaint Details</h2>

                <p>
                  {selectedComplaint.complaintNumber}
                </p>
              </div>

              <button
                className="admin-modal-close"
                onClick={() =>
                  setSelectedComplaint(null)
                }
                aria-label="Close complaint details"
              >
                ×
              </button>
            </div>

            <div className="admin-detail-grid">
              <div>
                <strong>Title</strong>
                <p>
                  {selectedComplaint.title || "—"}
                </p>
              </div>

              <div>
                <strong>Citizen</strong>
                <p>
                  {selectedComplaint.citizen?.name || "—"}
                </p>
              </div>

              <div>
                <strong>Citizen Email</strong>
                <p>
                  {selectedComplaint.citizen?.email || "—"}
                </p>
              </div>

              <div>
                <strong>Confirmed Department</strong>
                <p>
                  {isConfirmedAssignment(
                    selectedComplaint
                  )
                    ? selectedComplaint.department?.name ||
                      "Not available"
                    : "Not confirmed"}
                </p>
              </div>

              <div>
                <strong>Suggested Department</strong>
                <p>
                  {selectedComplaint.recommendedAssignment
                    ?.department?.name ||
                    (getLegacyDepartment(
                      selectedComplaint
                    )?.name
                      ? `${
                          getLegacyDepartment(
                            selectedComplaint
                          ).name
                        } (legacy value — verify)`
                      : "No suggestion available")}
                </p>
              </div>

              <div>
                <strong>Assigned Officer</strong>
                <p>
                  {selectedComplaint.assignedOfficer
                    ?.name || "Not confirmed"}
                </p>
              </div>

              <div>
                <strong>Administrative Office</strong>
                <p>
                  {isConfirmedAssignment(
                    selectedComplaint
                  )
                    ? selectedComplaint
                        .administrativeOffice?.name ||
                      "Not available"
                    : "Not confirmed"}
                </p>
              </div>

              <div>
                <strong>Suggested Office</strong>
                <p>
                  {selectedComplaint.recommendedAssignment
                    ?.administrativeOffice?.name ||
                    "No suggestion available"}
                </p>
              </div>

              <div>
                <strong>Confirmed Zone</strong>
                <p>
                  {isConfirmedAssignment(
                    selectedComplaint
                  )
                    ? selectedComplaint.zone?.name ||
                      "Not available"
                    : "Not confirmed"}
                </p>
              </div>

              <div>
                <strong>Suggested Zone</strong>
                <p>
                  {selectedComplaint.recommendedAssignment
                    ?.zone?.name ||
                    "No Zone suggestion available"}
                </p>
              </div>

              <div>
                <strong>Prabhag</strong>
                <p>
                  {isConfirmedAssignment(
                    selectedComplaint
                  )
                    ? selectedComplaint.prabhag?.name ||
                      "Not available"
                    : "Not confirmed"}
                </p>
              </div>

              <div>
                <strong>Status</strong>
                <p>
                  {STATUS_LABELS[
                    selectedComplaint.status
                  ] ||
                    selectedComplaint.status ||
                    "—"}
                </p>
              </div>

              <div>
                <strong>Severity</strong>
                <p>
                  {SEVERITY_LABELS[
                    selectedComplaint.severity
                  ] ||
                    selectedComplaint.severity ||
                    "—"}
                </p>
              </div>

              <div>
                <strong>Registered</strong>
                <p>
                  {formatDate(
                    selectedComplaint.createdAt
                  )}
                </p>
              </div>

              <div>
                <strong>GPS Coordinates</strong>
                {Array.isArray(
                  selectedComplaint.location?.coordinates
                ) &&
                selectedComplaint.location.coordinates.length === 2 ? (
                  <>
                    <p>
                      Latitude:{" "}
                      {selectedComplaint.location.coordinates[1]}
                    </p>
                    <p>
                      Longitude:{" "}
                      {selectedComplaint.location.coordinates[0]}
                    </p>
                  </>
                ) : (
                  <p>Not available</p>
                )}
              </div>
            </div>

            {/* ASSIGNMENT REVIEW INFORMATION */}

            {selectedComplaint.recommendedAssignment && (
              <div className="admin-detail-description">
                <h3>Assignment Review Information</h3>

                <p>
                  Review status:{" "}
                  <strong>
                    {selectedComplaint
                      .recommendedAssignment.reviewStatus ||
                      "Not reviewed"}
                  </strong>
                </p>

                <p>
                  Department reason:{" "}
                  {selectedComplaint
                    .recommendedAssignment.departmentReason ||
                    "No reason recorded"}
                </p>

                <p>
                  Geographic reason:{" "}
                  {selectedComplaint
                    .recommendedAssignment.geographyReason ||
                    "No geographic match information"}
                </p>

                <p>
                  Officer reason:{" "}
                  {selectedComplaint
                    .recommendedAssignment.officerReason ||
                    "Officer selection requires administrator review"}
                </p>

                {selectedComplaint.recommendedAssignment
                  .reviewNote && (
                  <p>
                    Administrator remarks:{" "}
                    {
                      selectedComplaint
                        .recommendedAssignment.reviewNote
                    }
                  </p>
                )}
              </div>
            )}

            {/* GEOGRAPHIC VERIFICATION */}

            <div className="admin-detail-description admin-geographic-verification">
              <h3>Geographic Verification</h3>

              {(() => {
                const geo =
                  selectedComplaint.recommendedAssignment
                    ?.geographicVerification;

                if (!geo) {
                  return (
                    <p className="admin-geo-unavailable">
                      Structured geographic verification data is not
                      available for this complaint. This may be an older
                      complaint created before geographic verification
                      details were persisted.
                    </p>
                  );
                }

                const officeStatus = geo.officeAmbiguous
                  ? "Ambiguous boundary"
                  : geo.officeFound
                    ? "Direct boundary match"
                    : geo.officeMatchMethod ===
                        "PRABHAG_BOUNDARY_RELATIONSHIP"
                      ? "Suggested through Prabhag"
                      : "No direct office match";

                const prabhagStatus = geo.prabhagOfficeConflict
                  ? "Office conflict"
                  : geo.prabhagAmbiguous
                    ? "Ambiguous boundary"
                    : geo.prabhagFound
                      ? "Boundary matched"
                      : "No unambiguous match";

                const zoneStatus = geo.zoneAmbiguous
                  ? "Ambiguous boundary"
                  : geo.zoneOfficeConflict
                    ? "Zone-office conflict"
                    : geo.zoneBoundaryFound
                      ? "Direct boundary match"
                      : geo.zoneMatchMethod ===
                          "ADMINISTRATIVE_OFFICE_RELATIONSHIP"
                        ? "Office relationship fallback"
                        : "No Zone match";

                const statusClass = (needsReview, matched) =>
                  needsReview
                    ? "admin-geo-status admin-geo-status--warning"
                    : matched
                      ? "admin-geo-status admin-geo-status--success"
                      : "admin-geo-status admin-geo-status--neutral";

                return (
                  <>
                    <div className="admin-geo-grid">
                      <div className="admin-geo-card">
                        <strong>Administrative Office</strong>
                        <span className={statusClass(
                          geo.officeAmbiguous ||
                            geo.officeApproximate ||
                            !geo.officeFound,
                          geo.officeFound
                        )}>
                          {officeStatus}
                        </span>
                        <p>
                          {geo.officeAmbiguous
                            ? "Multiple office boundaries matched."
                            : geo.officeFound
                              ? "Complaint coordinates matched an office boundary."
                              : geo.officeApproximate
                                ? "Office suggestion comes from the matched Prabhag."
                                : "No direct office boundary match was established."}
                        </p>
                      </div>

                      <div className="admin-geo-card">
                        <strong>Prabhag</strong>
                        <span className={statusClass(
                          geo.prabhagOfficeConflict ||
                            geo.prabhagAmbiguous ||
                            !geo.prabhagFound,
                          geo.prabhagFound
                        )}>
                          {prabhagStatus}
                        </span>
                        <p>
                          {geo.prabhagOfficeConflict
                            ? "The matched Prabhag belongs to a different administrative office."
                            : geo.prabhagAmbiguous
                              ? "Multiple Prabhag boundaries matched."
                              : geo.prabhagFound
                                ? "An unambiguous Prabhag match was established."
                                : "No usable Prabhag boundary match was established."}
                        </p>
                      </div>

                      <div className="admin-geo-card">
                        <strong>Zone</strong>
                        <span className={statusClass(
                          geo.zoneAmbiguous ||
                            geo.zoneOfficeConflict ||
                            (!geo.zoneFound && !geo.zoneMatchMethod),
                          geo.zoneFound && !geo.zoneOfficeConflict
                        )}>
                          {zoneStatus}
                        </span>
                        <p>
                          {geo.zoneAmbiguous
                            ? "Multiple Zone boundaries matched."
                            : geo.zoneOfficeConflict
                              ? "GPS-matched Zone differs from the office-linked Zone."
                              : geo.zoneBoundaryFound
                                ? "Zone matched using its geographic boundary."
                                : geo.zoneMatchMethod ===
                                    "ADMINISTRATIVE_OFFICE_RELATIONSHIP"
                                  ? "Zone was suggested through the office relationship."
                                  : "No usable Zone match was established."}
                        </p>
                      </div>
                    </div>

                    <div className={
                      geo.reviewRequired
                        ? "admin-geo-review admin-geo-review--warning"
                        : "admin-geo-review admin-geo-review--success"
                    }>
                      <strong>
                        {geo.reviewRequired
                          ? "Administrator verification required"
                          : "No geographic review flags detected"}
                      </strong>

                      {geo.reviewRequired && (
                        <p>
                          Geographic suggestions are provisional.
                          Verify the jurisdiction before confirming assignment.
                        </p>
                      )}
                    </div>

                    {Array.isArray(geo.reviewReasons) &&
                      geo.reviewReasons.length > 0 && (
                        <div className="admin-geo-reasons">
                          <strong>Verification findings</strong>
                          <ul>
                            {geo.reviewReasons.map((reason, index) => (
                              <li key={index}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {geo.boundarySource && (
                      <p className="admin-geo-source">
                        Geographic data source: {geo.boundarySource}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* DESCRIPTION */}

            <div className="admin-detail-description">
              <h3>Description</h3>

              <p>
                {selectedComplaint.description ||
                  "No description provided."}
              </p>
            </div>

            {/* EVIDENCE */}

            <div className="admin-detail-evidence">
              <h3>Complaint Evidence</h3>

              {imageMedia.length > 0 ? (
                <div className="admin-image-grid">
                  {imageMedia.map(
                    (media, index) => (
                      <button
                        className="admin-image-thumbnail"
                        key={media._id || index}
                        onClick={() =>
                          setPreviewImage(
                            getMediaUrl(media.url)
                          )
                        }
                      >
                        <img
                          src={getMediaUrl(media.url)}
                          alt={`Complaint evidence ${
                            index + 1
                          }`}
                        />

                        <span>View image</span>
                      </button>
                    )
                  )}
                </div>
              ) : (
                <p>
                  No images attached to this complaint.
                </p>
              )}

              {otherMedia.map((media, index) => (
                <a
                  key={media._id || index}
                  href={getMediaUrl(media.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="admin-evidence-link"
                >
                  Open {media.mediaType || "evidence"}{" "}
                  {index + 1}
                </a>
              ))}
            </div>

            {/* AI IMAGE ASSESSMENT */}

            {imageAssessment?.status &&
              imageAssessment.status !== "NOT_REQUESTED" && (
              <section className="admin-ai-assessment">
                <div className="admin-ai-heading">
                  <div>
                    <h3>AI Image Assessment</h3>
                    <p>
                      {imageAssessment.model || "Image analysis service"}
                    </p>
                  </div>

                  <span className={`admin-ai-status status-${imageAssessment.status.toLowerCase()}`}>
                    {imageAssessment.status.replaceAll("_", " ")}
                  </span>
                </div>

                <div className="admin-ai-stats">
                  <div>
                    <span>Images processed</span>
                    <strong>
                      {imageAssessment.processedImageCount || 0}
                      {" / "}
                      {imageAssessment.imageCount || 0}
                    </strong>
                  </div>

                  <div>
                    <span>Raw garbage detections</span>
                    <strong>
                      {imageAssessment.garbageDetectionCount || 0}
                    </strong>
                  </div>

                  <div>
                    <span>Passed provisional threshold</span>
                    <strong>
                      {imageAssessment.acceptedGarbageDetectionCount || 0}
                    </strong>
                  </div>

                  {imageAssessment.predictedSeverity && (
                    <div>
                      <span>AI pothole severity estimate</span>
                      <strong>
                        {imageAssessment.predictedSeverity}
                      </strong>
                    </div>
                  )}
                </div>

                {typeof imageAssessment.garbageConfidenceThreshold === "number" && (
                  <p className="admin-ai-threshold">
                    Garbage detection threshold: at least{" "}
                    {(imageAssessment.garbageConfidenceThreshold * 100).toFixed(0)}%
                  </p>
                )}

                {garbageCategoryCounts.length > 0 && (
                  <div className="admin-ai-categories">
                    <strong>Detected object categories</strong>
                    <div>
                      {garbageCategoryCounts.map(([label, count]) => (
                        <span key={label}>
                          {label}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {imageAssessment.reason && (
                  <p className="admin-ai-reason">
                    {imageAssessment.reason}
                  </p>
                )}

                {imageAssessment.error && (
                  <p className="admin-ai-error">
                    {imageAssessment.error}
                  </p>
                )}

                {assessmentImages.length > 0 && (
                  <div className="admin-ai-image-results">
                    <strong>Per-image detection results</strong>

                    {assessmentImages.map((imageResult, index) => (
                      <div
                        className="admin-ai-image-result"
                        key={imageResult.imageNumber || index}
                      >
                        <div className="admin-ai-image-title">
                          <strong>
                            Image {imageResult.imageNumber || index + 1}
                          </strong>
                          <span>{imageResult.status?.replaceAll("_", " ")}</span>
                        </div>

                        {Array.isArray(imageResult.garbageDetections) &&
                          imageResult.garbageDetections.map((detection, detectionIndex) => (
                            <div
                              className="admin-ai-detection"
                              key={`garbage-${detection.detectionNumber || detectionIndex}`}
                            >
                              <strong>{detection.label || "Unknown object"}</strong>

                              <span>
                                Confidence:{" "}
                                {typeof detection.confidence === "number"
                                  ? `${(detection.confidence * 100).toFixed(2)}%`
                                  : "Unavailable"}
                              </span>

                              <span>
                                Threshold result:{" "}
                                {detection.confidenceAccepted
                                  ? "Passed"
                                  : "Below threshold"}
                              </span>

                              {typeof detection.areaRatioPercent === "number" && (
                                <span>
                                  Image area covered: {detection.areaRatioPercent.toFixed(2)}%
                                </span>
                              )}

                              {Array.isArray(detection.boundingBox) &&
                                detection.boundingBox.length === 4 && (
                                <small>
                                  Bounding box: {detection.boundingBox.join(", ")}
                                </small>
                              )}
                            </div>
                          ))}

                        {Array.isArray(imageResult.potholes) &&
                          imageResult.potholes.map((pothole, potholeIndex) => (
                            <div
                              className="admin-ai-detection"
                              key={`pothole-${pothole.potholeNumber || potholeIndex}`}
                            >
                              <strong>
                                {pothole.imageSeverityEstimate || "Pothole detected"}
                              </strong>

                              <span>
                                Classification confidence:{" "}
                                {typeof pothole.classificationConfidence === "number"
                                  ? `${(pothole.classificationConfidence * 100).toFixed(2)}%`
                                  : "Unavailable"}
                              </span>

                              <span>
                                Threshold result:{" "}
                                {pothole.confidenceAccepted
                                  ? "Passed"
                                  : "Below threshold"}
                              </span>
                            </div>
                          ))}

                        {imageResult.error && (
                          <p className="admin-ai-error">
                            {imageResult.error}
                          </p>
                        )}

                        {["COMPLETED", "NO_GARBAGE_DETECTED", "NO_POTHOLE_DETECTED"].includes(
                          imageResult.status
                        ) &&
                          imageResult.garbageDetectionCount === 0 &&
                          (!imageResult.potholes || imageResult.potholes.length === 0) && (
                            <p>No objects detected in this image.</p>
                          )}
                      </div>
                    ))}
                  </div>
                )}

                {imageAssessment.humanVerificationRequired && (
                  <div className="admin-ai-warning">
                    Human verification required. Passing the confidence
                    threshold does not establish that a detection is correct.
                    Review the original uploaded image before taking action.
                  </div>
                )}
              </section>
            )}

            {/* OFFICER RESOLUTION AND ADMIN VERIFICATION */}

            <section className="admin-resolution-review">
              <div className="admin-resolution-review-heading">
                <div>
                  <h3>Officer Resolution Submission</h3>
                  <p>
                    Review the officer's submitted work and evidence
                    before confirming resolution.
                  </p>
                </div>

                <span className={`admin-resolution-review-status ${
                  selectedComplaint.resolution?.reviewStatus === "APPROVED"
                    ? "is-approved"
                    : selectedComplaint.resolution?.reviewStatus === "REJECTED"
                      ? "is-rejected"
                      : selectedComplaint.resolution?.reviewStatus === "PENDING_VERIFICATION"
                        ? "is-pending"
                        : ""
                }`}>
                  {(selectedComplaint.resolution?.reviewStatus || "NOT_SUBMITTED")
                    .replaceAll("_", " ")}
                </span>
              </div>

              {selectedComplaint.resolution?.description ? (
                <>
                  <div className="admin-resolution-meta">
                    <div>
                      <strong>Submitted by</strong>
                      <p>
                        {selectedComplaint.resolution.submittedBy?.name ||
                          "Officer information unavailable"}
                      </p>
                      {selectedComplaint.resolution.submittedBy?.email && (
                        <small>
                          {selectedComplaint.resolution.submittedBy.email}
                        </small>
                      )}
                    </div>

                    <div>
                      <strong>Submitted at</strong>
                      <p>
                        {formatDate(
                          selectedComplaint.resolution.submittedAt
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="admin-resolution-description">
                    <strong>Officer's resolution description</strong>
                    <p>{selectedComplaint.resolution.description}</p>
                  </div>

                  <div className="admin-resolution-evidence">
                    <strong>
                      Resolution evidence (
                      {selectedComplaint.resolution.evidence?.length || 0}
                      /5)
                    </strong>

                    {Array.isArray(selectedComplaint.resolution.evidence) &&
                    selectedComplaint.resolution.evidence.length > 0 ? (
                      <div className="admin-resolution-evidence-grid">
                        {selectedComplaint.resolution.evidence.map(
                          (item, index) => (
                            <a
                              className="admin-resolution-evidence-item"
                              key={item._id || item.url || index}
                              href={getMediaUrl(item.url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.mediaType === "IMAGE" ? (
                                <img
                                  src={getMediaUrl(item.url)}
                                  alt={`Officer resolution evidence ${index + 1}`}
                                />
                              ) : (
                                <span className="admin-resolution-file">
                                  Open evidence {index + 1}
                                </span>
                              )}
                              <small>
                                {item.mediaType || "Evidence"} {index + 1}
                              </small>
                            </a>
                          )
                        )}
                      </div>
                    ) : (
                      <p>No resolution evidence was submitted.</p>
                    )}
                  </div>

                  {selectedComplaint.resolution?.reviewStatus === "PENDING_VERIFICATION" &&
                   selectedComplaint.status === "PENDING_VERIFICATION" && (
                    <div className="admin-resolution-actions">
                      <label htmlFor="admin-resolution-review-note">
                        Administrator review note
                      </label>

                      <textarea
                        id="admin-resolution-review-note"
                        value={resolutionReviewNote}
                        onChange={(event) =>
                          setResolutionReviewNote(event.target.value)
                        }
                        maxLength={1000}
                        rows={4}
                        placeholder="Enter a reason if rejecting. You may also add an approval note."
                        disabled={resolutionReviewLoading}
                      />

                      <small>
                        Required for rejection. Maximum 1000 characters.
                      </small>

                      {resolutionReviewError && (
                        <p className="admin-resolution-message is-error">
                          {resolutionReviewError}
                        </p>
                      )}

                      {resolutionReviewSuccess && (
                        <p className="admin-resolution-message is-success">
                          {resolutionReviewSuccess}
                        </p>
                      )}

                      <div className="admin-resolution-buttons">
                        <button
                          type="button"
                          className="admin-resolution-reject"
                          disabled={resolutionReviewLoading}
                          onClick={() =>
                            handleResolutionReview("REJECT")
                          }
                        >
                          {resolutionReviewLoading
                            ? "Submitting..."
                            : "Reject and Return to Officer"}
                        </button>

                        <button
                          type="button"
                          className="admin-resolution-approve"
                          disabled={resolutionReviewLoading}
                          onClick={() =>
                            handleResolutionReview("APPROVE")
                          }
                        >
                          {resolutionReviewLoading
                            ? "Submitting..."
                            : "Approve Resolution"}
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedComplaint.resolution?.reviewStatus === "APPROVED" && (
                    <div className="admin-resolution-final-status is-approved">
                      <strong>Resolution approved</strong>
                      <p>
                        Reviewed by{" "}
                        {selectedComplaint.resolution.reviewedBy?.name ||
                          "Administrator"}
                        {" · "}
                        {formatDate(selectedComplaint.resolution.reviewedAt)}
                      </p>
                      {selectedComplaint.resolution.reviewNote && (
                        <p>
                          Administrator note:{" "}
                          {selectedComplaint.resolution.reviewNote}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedComplaint.resolution?.reviewStatus === "REJECTED" && (
                    <div className="admin-resolution-final-status is-rejected">
                      <strong>Resolution rejected</strong>
                      <p>
                        Reviewed by{" "}
                        {selectedComplaint.resolution.reviewedBy?.name ||
                          "Administrator"}
                        {" · "}
                        {formatDate(selectedComplaint.resolution.reviewedAt)}
                      </p>
                      <p>
                        Reason:{" "}
                        {selectedComplaint.resolution.reviewNote ||
                          "No review note recorded."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="admin-resolution-empty">
                  The officer has not submitted a resolution description yet.
                </p>
              )}

              {resolutionReviewError &&
                selectedComplaint.resolution?.reviewStatus !== "PENDING_VERIFICATION" && (
                  <p className="admin-resolution-message is-error">
                    {resolutionReviewError}
                  </p>
                )}

              {resolutionReviewSuccess &&
                selectedComplaint.resolution?.reviewStatus !== "PENDING_VERIFICATION" && (
                  <p className="admin-resolution-message is-success">
                    {resolutionReviewSuccess}
                  </p>
                )}
            </section>

            {/* STATUS HISTORY */}

            {selectedComplaint.statusHistory?.length >
              0 && (
              <div className="admin-detail-description">
                <h3>Status History</h3>

                <div className="admin-history-list">
                  {selectedComplaint.statusHistory.map(
                    (history, index) => (
                      <div
                        className="admin-history-item"
                        key={history._id || index}
                      >
                        <strong>
                          {STATUS_LABELS[history.status] ||
                            history.status}
                        </strong>

                        <span>
                          {formatDate(history.changedAt)}
                        </span>

                        <p>
                          {history.note ||
                            "No remarks added."}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASSIGNMENT REVIEW MODAL */}

      {assignmentComplaint && (
        <div
          className="admin-modal-overlay"
          onClick={closeAssignment}
        >
          <form
            className="admin-modal admin-assignment-modal"
            onSubmit={submitAssignment}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* MODAL HEADER */}

            <div className="admin-modal-header">
              <div>
                <h2>
                  {isConfirmedAssignment(
                    assignmentComplaint
                  )
                    ? "Review / Reassign Complaint"
                    : "Review and Confirm Assignment"}
                </h2>

                <p>
                  {assignmentComplaint.complaintNumber}
                </p>
              </div>

              <button
                type="button"
                className="admin-modal-close"
                disabled={assignmentLoading}
                onClick={closeAssignment}
              >
                ×
              </button>
            </div>

            {/* COMPLAINT INFORMATION */}

            <div className="admin-assignment-complaint-info">
              <strong>
                {assignmentComplaint.title}
              </strong>

              <p>
                Current status:{" "}
                {STATUS_LABELS[
                  assignmentComplaint.status
                ] || assignmentComplaint.status}
              </p>

              <p>
                Current officer:{" "}
                {assignmentComplaint.assignedOfficer
                  ?.name || "No officer confirmed"}
              </p>
            </div>

            {/* ADMINISTRATOR NOTICE */}

            {suggestionNeedsReview && (
              <div className="admin-inline-notice">
                <AlertTriangle size={17} />

                <div>
                  <strong>
                    Administrator review required
                  </strong>

                  <p>
                    The suggested routing is provisional.
                    Verify the department, office, Zone,
                    Prabhag and officer before confirming
                    the assignment.
                  </p>
                </div>
              </div>
            )}

            {suggestedAssignment.reviewStatus ===
              "NEEDS_MANUAL_REVIEW" && (
              <div className="admin-inline-error">
                The system could not establish a complete
                geographic match. Select the correct
                office, Zone and Prabhag manually after
                checking the complaint location.
              </div>
            )}

            {/* DEPARTMENT */}

            <div className="admin-form-field">
              <label htmlFor="assignment-department">
                Department
              </label>

              <select
                id="assignment-department"
                value={assignmentDepartmentId}
                onChange={(event) =>
                  handleDepartmentChange(
                    event.target.value
                  )
                }
                disabled={
                  assignmentDataLoading ||
                  assignmentLoading
                }
                required
              >
                <option value="">
                  Select department
                </option>

                {departments.map((department) => (
                  <option
                    key={department._id}
                    value={department._id}
                  >
                    {department.name}
                    {department.code
                      ? ` (${department.code})`
                      : ""}
                  </option>
                ))}
              </select>

              <small>
                Suggested department:{" "}
                {suggestedAssignment.department?.name ||
                  (legacyAssignmentDepartment?.name
                    ? `${legacyAssignmentDepartment.name} (legacy value — verify)`
                    : "No department suggestion")}
              </small>
            </div>

            {/* ADMINISTRATIVE OFFICE */}

            <div className="admin-form-field">
              <label htmlFor="assignment-office">
                Administrative Office
              </label>

              <select
                id="assignment-office"
                value={assignmentOfficeId}
                onChange={(event) =>
                  handleOfficeChange(
                    event.target.value
                  )
                }
                disabled={
                  assignmentDataLoading ||
                  assignmentLoading
                }
                required
              >
                <option value="">
                  Select administrative office
                </option>

                {offices.map((office) => (
                  <option
                    key={office._id}
                    value={office._id}
                  >
                    {office.name}
                    {office.code
                      ? ` (${office.code})`
                      : ""}
                  </option>
                ))}
              </select>

              <small>
                Suggested office:{" "}
                {suggestedAssignment
                  .administrativeOffice?.name ||
                  "No office suggestion"}
              </small>
            </div>

            {/* ZONE */}

            <div className="admin-form-field">
              <label htmlFor="assignment-zone">
                Zone
              </label>

              <select
                id="assignment-zone"
                value={assignmentZoneId}
                onChange={(event) =>
                  setAssignmentZoneId(
                    event.target.value
                  )
                }
                disabled={
                  assignmentDataLoading ||
                  assignmentLoading
                }
              >
                <option value="">
                  {assignmentDataLoading
                    ? "Loading Zones..."
                    : "Select Zone"}
                </option>

                {zones.map((zone) => (
                  <option
                    key={getId(zone)}
                    value={getId(zone)}
                  >
                    {zone.name}
                    {zone.code
                      ? ` (${zone.code})`
                      : ""}
                  </option>
                ))}
              </select>

              <small>
                Suggested Zone:{" "}
                {suggestedAssignment.zone?.name ||
                  "No Zone suggestion"}
                . This suggestion is based on the
                geographic Zone boundary and can be
                reviewed independently of the office.
              </small>
            </div>

            {/* PRABHAG */}

            <div className="admin-form-field">
              <label htmlFor="assignment-prabhag">
                Prabhag
              </label>

              <select
                id="assignment-prabhag"
                value={assignmentPrabhagId}
                onChange={(event) =>
                  setAssignmentPrabhagId(
                    event.target.value
                  )
                }
                disabled={
                  !assignmentOfficeId ||
                  assignmentDataLoading ||
                  assignmentLoading
                }
              >
                <option value="">
                  {assignmentDataLoading
                    ? "Loading Prabhags..."
                    : availablePrabhags.length
                      ? "Select Prabhag"
                      : "No Prabhags available for this office"}
                </option>

                {availablePrabhags.map(
                  (prabhag) => (
                    <option
                      key={prabhag._id}
                      value={prabhag._id}
                    >
                      {prabhag.name}
                      {prabhag.number
                        ? ` (${prabhag.number})`
                        : ""}
                    </option>
                  )
                )}
              </select>

              <small>
                Suggested Prabhag:{" "}
                {suggestedAssignment.prabhag?.name ||
                  "No Prabhag suggestion"}
                . If no verified Prabhag is available,
                leave this unselected and verify
                jurisdiction separately.
              </small>
            </div>

            {/* OFFICER */}

            <div className="admin-form-field">
              <label htmlFor="assignment-officer">
                Eligible Officer
              </label>

              <select
                id="assignment-officer"
                value={assignmentOfficerId}
                onChange={(event) =>
                  setAssignmentOfficerId(
                    event.target.value
                  )
                }
                disabled={
                  !assignmentDepartmentId ||
                  !assignmentOfficeId ||
                  officersLoading ||
                  officers.length === 0 ||
                  assignmentLoading ||
                  assignmentDataLoading
                }
                required
              >
                <option value="">
                  {assignmentDataLoading
                    ? "Loading assignment data..."
                    : officersLoading
                      ? "Loading officers..."
                      : !assignmentDepartmentId ||
                          !assignmentOfficeId
                        ? "Select department and office first"
                        : officers.length
                          ? "Select officer"
                          : "No eligible active officers found"}
                </option>

                {officers.map((officer) => (
                  <option
                    key={officer._id}
                    value={officer._id}
                  >
                    {officer.name} ({officer.email})
                  </option>
                ))}
              </select>

              <small>
                Only active officers belonging to the
                selected department and administrative
                office are listed.
              </small>
            </div>

            {/* ASSIGNMENT REMARKS */}

            <div className="admin-form-field">
              <label htmlFor="assignment-note">
                Assignment Remarks
              </label>

              <textarea
                id="assignment-note"
                rows={3}
                placeholder="Add instructions or remarks for this assignment..."
                value={assignmentNote}
                onChange={(event) =>
                  setAssignmentNote(event.target.value)
                }
                disabled={assignmentLoading}
              />
            </div>

            {/* ASSIGNMENT ERRORS */}

            {assignmentError && (
              <div className="admin-inline-error">
                {assignmentError}
              </div>
            )}

            {/* MODAL ACTIONS */}

            <div className="admin-assignment-modal-actions">
              <button
                type="button"
                className="admin-cancel-button"
                disabled={assignmentLoading}
                onClick={closeAssignment}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="admin-assign-button"
                disabled={
                  assignmentLoading ||
                  assignmentDataLoading ||
                  officersLoading ||
                  !assignmentDepartmentId ||
                  !assignmentOfficeId ||
                  !assignmentOfficerId
                }
              >
                {assignmentLoading
                  ? "Confirming..."
                  : isConfirmedAssignment(
                      assignmentComplaint
                    )
                    ? "Confirm Reassignment"
                    : "Confirm Assignment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ENLARGED IMAGE PREVIEW */}

      {previewImage && (
        <div
          className="admin-image-preview-overlay"
          onClick={() => setPreviewImage("")}
        >
          <button
            className="admin-preview-close"
            onClick={() => setPreviewImage("")}
            aria-label="Close image preview"
          >
            ×
          </button>

          <img
            src={previewImage}
            alt="Enlarged complaint evidence"
            onClick={(event) =>
              event.stopPropagation()
            }
          />
        </div>
      )}
    </div>
  );
}
