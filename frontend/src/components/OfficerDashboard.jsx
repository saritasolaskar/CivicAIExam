
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { officerAPI } from "../services/portalService";
import "./OfficerDashboard.css";

const STATUS_LABELS = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
};

const SEVERITY_LABELS = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const formatDate = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function OfficerDashboard({ user, onLogout }) {
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [note, setNote] = useState("");
  const [resolutionDescription, setResolutionDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceType, setEvidenceType] = useState("IMAGE");
  const [showResolutionForm, setShowResolutionForm] = useState(false);

  const fetchComplaints = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError("");

      const response = await officerAPI.getAssignedComplaints();

      const list =
        response.data?.complaints ||
        response.data?.data?.complaints ||
        [];

      setComplaints(Array.isArray(list) ? list : []);

      if (selectedComplaint?._id) {
        const updated = list.find(
          (item) => item._id === selectedComplaint._id
        );

        if (updated) setSelectedComplaint(updated);
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load assigned complaints."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const openComplaint = async (complaint) => {
    setSelectedComplaint(complaint);
    setError("");
    setSuccess("");
    setNote("");
    setShowResolutionForm(false);

    try {
      const response = await officerAPI.getComplaint(complaint._id);
      const details =
        response.data?.complaint ||
        response.data?.data?.complaint;

      if (details) setSelectedComplaint(details);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to load complaint details."
      );
    }
  };

  const updateStatus = async (status, resolution = false) => {
    if (!selectedComplaint) return;

    if (status === "RESOLVED") {
      if (!resolutionDescription.trim()) {
        setError("Please enter a resolution description.");
        return;
      }

      if (!evidenceUrl.trim()) {
        setError("Please provide an evidence URL.");
        return;
      }

      try {
        new URL(evidenceUrl);
      } catch {
        setError("Please enter a valid evidence URL.");
        return;
      }
    }

    try {
      setUpdating(true);
      setError("");
      setSuccess("");

      const payload = {
        status,
        note: note.trim(),
      };

      if (resolution) {
        payload.resolutionDescription =
          resolutionDescription.trim();

        payload.evidence = [
          {
            url: evidenceUrl.trim(),
            mediaType: evidenceType,
          },
        ];
      }

      await officerAPI.updateComplaintStatus(
        selectedComplaint._id,
        payload
      );

      setSuccess(
        status === "RESOLVED"
          ? "Complaint marked as resolved successfully."
          : "Complaint moved to In Progress."
      );

      setShowResolutionForm(false);
      setNote("");
      setResolutionDescription("");
      setEvidenceUrl("");
      await fetchComplaints(true);

      const refreshed = await officerAPI.getComplaint(
        selectedComplaint._id
      );

      const details =
        refreshed.data?.complaint ||
        refreshed.data?.data?.complaint;

      if (details) setSelectedComplaint(details);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to update complaint status."
      );
    } finally {
      setUpdating(false);
    }
  };

  const assignedCount = complaints.filter(
    (item) => item.status === "ASSIGNED"
  ).length;

  const inProgressCount = complaints.filter(
    (item) => item.status === "IN_PROGRESS"
  ).length;

  const resolvedCount = complaints.filter(
    (item) => item.status === "RESOLVED"
  ).length;

  if (loading) {
    return (
      <div className="officer-loading">
        <div className="loader" />
        <p>Loading Officer Portal...</p>
      </div>
    );
  }

  return (
    <div className="officer-dashboard">
      <header className="officer-header">
        <div className="officer-brand">
          <div className="officer-brand-icon">
            <ShieldCheck size={23} />
          </div>
          <div>
            <h2>CivicAI</h2>
            <span>Officer Workspace</span>
          </div>
        </div>

        <div className="officer-header-actions">
          <div className="officer-user">
            <strong>{user?.name}</strong>
            <span>{user?.department || "Municipal Officer"}</span>
          </div>

          <button
            className="officer-logout"
            onClick={onLogout}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </header>

      <main className="officer-main">
        <div className="officer-welcome">
          <div>
            <span className="officer-eyebrow">
              PUNE MUNICIPAL CORPORATION
            </span>
            <h1>Officer Workspace</h1>
            <p>
              Manage your assigned civic complaints and track
              resolution progress.
            </p>
          </div>

          <button
            className="officer-refresh"
            onClick={() => fetchComplaints(true)}
            disabled={refreshing}
          >
            <RefreshCw size={17} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <section className="officer-stats">
          <div className="officer-stat-card">
            <FileText size={21} />
            <span>Total Assigned</span>
            <strong>{complaints.length}</strong>
          </div>

          <div className="officer-stat-card">
            <Clock3 size={21} />
            <span>Awaiting Action</span>
            <strong>{assignedCount}</strong>
          </div>

          <div className="officer-stat-card">
            <Building2 size={21} />
            <span>In Progress</span>
            <strong>{inProgressCount}</strong>
          </div>

          <div className="officer-stat-card">
            <CheckCircle2 size={21} />
            <span>Resolved</span>
            <strong>{resolvedCount}</strong>
          </div>
        </section>

        {error && (
          <div className="officer-message officer-error">
            <AlertCircle size={17} />
            {error}
          </div>
        )}

        {success && (
          <div className="officer-message officer-success">
            <CheckCircle2 size={17} />
            {success}
          </div>
        )}

        {!selectedComplaint ? (
          <section className="officer-panel">
            <div className="officer-panel-heading">
              <div>
                <h2>My Assigned Complaints</h2>
                <p>Complaints assigned to your officer account.</p>
              </div>
              <span>{complaints.length} records</span>
            </div>

            {complaints.length === 0 ? (
              <div className="officer-empty">
                <CheckCircle2 size={35} />
                <h3>No assigned complaints</h3>
                <p>
                  New complaints assigned to you will appear here.
                </p>
              </div>
            ) : (
              <div className="officer-complaint-list">
                {complaints.map((complaint) => (
                  <button
                    type="button"
                    className="officer-complaint-card"
                    key={complaint._id}
                    onClick={() => openComplaint(complaint)}
                  >
                    <div className="officer-card-top">
                      <strong>
                        {complaint.complaintNumber}
                      </strong>

                      <span
                        className={`officer-tag status-${(
                          complaint.status || ""
                        ).toLowerCase()}`}
                      >
                        {STATUS_LABELS[complaint.status] ||
                          complaint.status}
                      </span>
                    </div>

                    <h3>{complaint.title}</h3>

                    <p className="officer-card-description">
                      {complaint.description || "No description"}
                    </p>

                    <div className="officer-card-meta">
                      <span>
                        <Building2 size={14} />
                        {complaint.department?.name || "—"}
                      </span>

                      <span>
                        <MapPin size={14} />
                        {complaint.administrativeOffice?.name || "Office not assigned"}
                      </span>

                      <span>
                        <UserRound size={14} />
                        {complaint.citizen?.name || "Citizen"}
                      </span>
                    </div>

                    <div className="officer-card-bottom">
                      <span
                        className={`officer-tag severity-${(
                          complaint.severity || "medium"
                        ).toLowerCase()}`}
                      >
                        {SEVERITY_LABELS[complaint.severity] ||
                          complaint.severity ||
                          "Severity unavailable"}
                      </span>

                      <span className="officer-view-link">
                        View details →
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="officer-panel officer-detail-panel">
            <button
              className="officer-back-button"
              onClick={() => {
                setSelectedComplaint(null);
                setError("");
                setSuccess("");
              }}
            >
              <ArrowLeft size={17} />
              Back to complaints
            </button>

            <div className="officer-detail-heading">
              <div>
                <span className="officer-eyebrow">
                  {selectedComplaint.complaintNumber}
                </span>
                <h2>{selectedComplaint.title}</h2>
                <p>
                  Submitted {formatDate(selectedComplaint.createdAt)}
                </p>
              </div>

              <span
                className={`officer-tag status-${(
                  selectedComplaint.status || ""
                ).toLowerCase()}`}
              >
                {STATUS_LABELS[selectedComplaint.status] ||
                  selectedComplaint.status}
              </span>
            </div>

            <div className="officer-detail-grid">
              <div className="officer-detail-item">
                <span>Category</span>
                <strong>
                  {selectedComplaint.category?.name || "—"}
                </strong>
              </div>

              <div className="officer-detail-item">
                <span>Department</span>
                <strong>
                  {selectedComplaint.department?.name || "—"}
                </strong>
              </div>

              <div className="officer-detail-item">
                <span>Severity</span>
                <strong>
                  {SEVERITY_LABELS[selectedComplaint.severity] ||
                    selectedComplaint.severity ||
                    "—"}
                </strong>
              </div>

              <div className="officer-detail-item">
                <span>Citizen</span>
                <strong>
                  {selectedComplaint.citizen?.name || "—"}
                </strong>
              </div>

              <div className="officer-detail-item">
                <span>Administrative Office</span>
                <strong>
                  {selectedComplaint.administrativeOffice?.name || "Not assigned"}
                </strong>
              </div>

              <div className="officer-detail-item">
                <span>Prabhag</span>
                <strong>
                  {selectedComplaint.prabhag?.name || "Not available"}
                </strong>
              </div>
            </div>

            <div className="officer-description">
              <h3>Complaint Description</h3>
              <p>{selectedComplaint.description}</p>
            </div>

            {selectedComplaint.address && (
              <div className="officer-description">
                <h3>Reported Address</h3>
                <p>{selectedComplaint.address}</p>
              </div>
            )}

            {selectedComplaint.location?.coordinates?.length === 2 && (
              <div className="officer-description">
                <h3>Reported GPS Coordinates</h3>
                <p>
                  Longitude: {selectedComplaint.location.coordinates[0]},
                  Latitude: {selectedComplaint.location.coordinates[1]}
                </p>
              </div>
            )}

            {selectedComplaint.media?.length > 0 && (
              <div className="officer-description">
                <h3>Complaint Evidence</h3>
                <div className="officer-evidence-list">
                  {selectedComplaint.media.map((media, index) => (
                    <a
                      key={index}
                      href={media.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {media.mediaType} {index + 1} — Open evidence
                    </a>
                  ))}
                </div>
              </div>
            )}

            {selectedComplaint.statusHistory?.length > 0 && (
              <div className="officer-description">
                <h3>Status History</h3>
                <div className="officer-history">
                  {selectedComplaint.statusHistory.map(
                    (entry, index) => (
                      <div key={entry._id || index}>
                        <strong>
                          {STATUS_LABELS[entry.status] ||
                            entry.status}
                        </strong>
                        <span>{formatDate(entry.changedAt)}</span>
                        {entry.note && <p>{entry.note}</p>}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {selectedComplaint.status === "ASSIGNED" && (
              <div className="officer-action-panel">
                <h3>Start Working on Complaint</h3>
                <p>
                  Update the status when you begin handling this issue.
                </p>

                <label>Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a progress note..."
                  rows={3}
                />

                <button
                  className="officer-primary-button"
                  disabled={updating}
                  onClick={() => updateStatus("IN_PROGRESS")}
                >
                  {updating ? "Updating..." : "Mark In Progress"}
                </button>
              </div>
            )}

            {selectedComplaint.status === "IN_PROGRESS" && (
              <div className="officer-action-panel">
                {!showResolutionForm ? (
                  <>
                    <h3>Resolve Complaint</h3>
                    <p>
                      Submit the resolution details and evidence after
                      completing the work.
                    </p>

                    <button
                      className="officer-primary-button"
                      onClick={() => setShowResolutionForm(true)}
                    >
                      Mark as Resolved
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Resolution Details</h3>

                    <label>Resolution Description</label>
                    <textarea
                      value={resolutionDescription}
                      onChange={(e) =>
                        setResolutionDescription(e.target.value)
                      }
                      placeholder="Describe the action taken to resolve this complaint..."
                      rows={4}
                    />

                    <label>Evidence URL</label>
                    <input
                      type="url"
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      placeholder="https://example.com/resolution-image.jpg"
                    />

                    <label>Evidence Type</label>
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value)}
                    >
                      <option value="IMAGE">Image</option>
                      <option value="VIDEO">Video</option>
                    </select>

                    <label>Additional Note (optional)</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a final note..."
                      rows={2}
                    />

                    <div className="officer-form-actions">
                      <button
                        className="officer-secondary-button"
                        onClick={() => setShowResolutionForm(false)}
                        disabled={updating}
                      >
                        Cancel
                      </button>

                      <button
                        className="officer-primary-button"
                        onClick={() => updateStatus("RESOLVED", true)}
                        disabled={updating}
                      >
                        {updating ? "Submitting..." : "Submit Resolution"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedComplaint.status === "RESOLVED" && (
              <div className="officer-resolved">
                <CheckCircle2 size={22} />
                <div>
                  <strong>Complaint resolved</strong>
                  <p>
                    {selectedComplaint.resolution?.description ||
                      selectedComplaint.resolutionDescription ||
                      "Resolution has been submitted."}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="officer-footer">
          CivicAI · Pune Municipal Corporation
        </footer>
      </main>
    </div>
  );
}
