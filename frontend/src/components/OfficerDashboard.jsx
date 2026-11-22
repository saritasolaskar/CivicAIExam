
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
  Upload,
  Image as ImageIcon,
} from "lucide-react";

import { officerAPI } from "../services/portalService";
import "./OfficerDashboard.css";

const STATUS_LABELS = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  PENDING_VERIFICATION: "Awaiting Verification",
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

const formatPercent = (value) =>
  typeof value === "number"
    ? `${(value * 100).toFixed(2)}%`
    : "Unavailable";

function AIImageAssessment({ complaint }) {
  const assessment = complaint?.aiAnalysis?.imageAssessment;

  if (!assessment || assessment.status === "NOT_REQUESTED") {
    return (
      <section className="officer-ai-panel">
        <h3>AI Image Assessment</h3>
        <p>AI image assessment is not available for this complaint.</p>
      </section>
    );
  }

  const images = Array.isArray(assessment.images)
    ? assessment.images
    : [];

  const categories =
    assessment.garbageCategoryCounts &&
    typeof assessment.garbageCategoryCounts === "object"
      ? Object.entries(assessment.garbageCategoryCounts)
      : [];

  return (
    <section className="officer-ai-panel">
      <div className="officer-ai-heading">
        <div>
          <h3>AI Image Assessment</h3>
          <p>{assessment.model || "Image analysis service"}</p>
        </div>

        <span className={`officer-ai-status status-${(
          assessment.status || "unavailable"
        ).toLowerCase()}`}>
          {(assessment.status || "Unavailable").replaceAll("_", " ")}
        </span>
      </div>

      <div className="officer-ai-stats">
        <div>
          <span>Images processed</span>
          <strong>
            {assessment.processedImageCount || 0} / {assessment.imageCount || 0}
          </strong>
        </div>

        <div>
          <span>Garbage detections</span>
          <strong>{assessment.garbageDetectionCount || 0}</strong>
        </div>

        <div>
          <span>Accepted garbage detections</span>
          <strong>{assessment.acceptedGarbageDetectionCount || 0}</strong>
        </div>

        <div>
          <span>Potholes detected</span>
          <strong>{assessment.potholeCount || 0}</strong>
        </div>
      </div>

      {typeof assessment.garbageConfidenceThreshold === "number" && (
        <p className="officer-ai-note">
          Provisional garbage detection threshold:{" "}
          {(assessment.garbageConfidenceThreshold * 100).toFixed(0)}%
        </p>
      )}

      {categories.length > 0 && (
        <div className="officer-ai-categories">
          <strong>Detected object categories</strong>
          <div>
            {categories.map(([label, count]) => (
              <span key={label}>{label}: {count}</span>
            ))}
          </div>
        </div>
      )}

      {assessment.predictedSeverity && (
        <p className="officer-ai-note">
          AI pothole severity estimate: {assessment.predictedSeverity}
        </p>
      )}

      {assessment.error && (
        <p className="officer-ai-error">{assessment.error}</p>
      )}

      {images.length > 0 && (
        <div className="officer-ai-image-results">
          <strong>Image-level findings</strong>

          {images.map((image, index) => (
            <div
              className="officer-ai-image-result"
              key={image.imageNumber || index}
            >
              <strong>
                Image {image.imageNumber || index + 1}
              </strong>
              <span>
                Status: {(image.status || "Unknown").replaceAll("_", " ")}
              </span>

              {(image.garbageDetections || []).map((detection, detectionIndex) => (
                <div className="officer-ai-detection" key={`g-${detectionIndex}`}>
                  <strong>{detection.label || "Garbage object"}</strong>
                  <span>Confidence: {formatPercent(detection.confidence)}</span>
                  <span>
                    Threshold: {detection.confidenceAccepted ? "Passed" : "Not passed"}
                  </span>
                </div>
              ))}

              {(image.potholes || []).map((pothole, potholeIndex) => (
                <div className="officer-ai-detection" key={`p-${potholeIndex}`}>
                  <strong>
                    {pothole.imageSeverityEstimate || "Pothole detected"}
                  </strong>
                  <span>
                    Classification confidence: {formatPercent(pothole.confidence)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="officer-ai-warning">
        AI findings are decision-support information. Verify the actual site
        conditions before taking action. Detection counts and confidence scores
        do not independently establish complaint severity.
      </p>
    </section>
  );
}

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
  const [evidenceFiles, setEvidenceFiles] = useState([]);
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
    setEvidenceFiles([]);
    setResolutionDescription("");
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

  const handleEvidenceSelection = (event) => {
    const selected = Array.from(event.target.files || []);

    if (selected.length > 5) {
      setError("You can upload a maximum of five evidence images.");
      event.target.value = "";
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    const invalidFile = selected.find(
      (file) =>
        !allowedTypes.includes(file.type) ||
        file.size > 5 * 1024 * 1024
    );

    if (invalidFile) {
      setError(
        "Only JPG, PNG and WEBP images up to 5 MB each are accepted."
      );
      event.target.value = "";
      return;
    }

    setError("");
    setEvidenceFiles(selected);
  };

  const updateStatus = async (status) => {
    if (!selectedComplaint) return;

    if (status === "PENDING_VERIFICATION") {
      if (!resolutionDescription.trim()) {
        setError("Please enter a resolution description.");
        return;
      }

      if (evidenceFiles.length === 0) {
        setError("Upload at least one resolution evidence image.");
        return;
      }
    }

    try {
      setUpdating(true);
      setError("");
      setSuccess("");

      const payload = new FormData();

      payload.append("status", status);
      payload.append("note", note.trim());

      if (status === "PENDING_VERIFICATION") {
        payload.append(
          "resolutionDescription",
          resolutionDescription.trim()
        );

        evidenceFiles.forEach((file) => {
          payload.append("images", file);
        });
      }

      await officerAPI.updateComplaintStatus(
        selectedComplaint._id,
        payload
      );

      setSuccess(
        status === "PENDING_VERIFICATION"
          ? "Resolution submitted. It is now awaiting administrator verification."
          : "Complaint moved to In Progress."
      );

      setShowResolutionForm(false);
      setNote("");
      setResolutionDescription("");
      setEvidenceFiles([]);

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

  const pendingCount = complaints.filter(
    (item) => item.status === "PENDING_VERIFICATION"
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

          <button className="officer-logout" onClick={onLogout}>
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
              Manage assigned civic complaints and track resolution progress.
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
            <span>Awaiting Verification</span>
            <strong>{pendingCount}</strong>
          </div>

          <div className="officer-stat-card">
            <CheckCircle2 size={21} />
            <span>Verified Resolutions</span>
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
                <p>New complaints assigned to you will appear here.</p>
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
                      <strong>{complaint.complaintNumber}</strong>
                      <span
                        className={`officer-tag status-${(
                          complaint.status || ""
                        ).toLowerCase()}`}
                      >
                        {STATUS_LABELS[complaint.status] || complaint.status}
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
                <p>Submitted {formatDate(selectedComplaint.createdAt)}</p>
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
                <strong>{selectedComplaint.category?.name || "—"}</strong>
              </div>
              <div className="officer-detail-item">
                <span>Department</span>
                <strong>{selectedComplaint.department?.name || "—"}</strong>
              </div>
              <div className="officer-detail-item">
                <span>Severity</span>
                <strong>
                  {SEVERITY_LABELS[selectedComplaint.severity] ||
                    selectedComplaint.severity || "—"}
                </strong>
              </div>
              <div className="officer-detail-item">
                <span>Citizen</span>
                <strong>{selectedComplaint.citizen?.name || "—"}</strong>
              </div>
              <div className="officer-detail-item">
                <span>Administrative Office</span>
                <strong>
                  {selectedComplaint.administrativeOffice?.name || "Not assigned"}
                </strong>
              </div>
              <div className="officer-detail-item">
                <span>Prabhag</span>
                <strong>{selectedComplaint.prabhag?.name || "Not available"}</strong>
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

            <AIImageAssessment complaint={selectedComplaint} />

            {selectedComplaint.resolution?.reviewStatus &&
              selectedComplaint.resolution.reviewStatus !== "NOT_SUBMITTED" && (
                <div
                  className={`officer-resolution-review ${
                    selectedComplaint.resolution.reviewStatus === "REJECTED"
                      ? "officer-resolution-rejected"
                      : selectedComplaint.resolution.reviewStatus === "APPROVED"
                        ? "officer-resolution-approved"
                        : ""
                  }`}
                >
                  <h3>
                    {selectedComplaint.resolution.reviewStatus === "REJECTED"
                      ? "Resolution Rejected — Action Required"
                      : selectedComplaint.resolution.reviewStatus === "APPROVED"
                        ? "Resolution Approved"
                        : "Resolution Review"}
                  </h3>

                  <p>
                    Review status:{" "}
                    <strong>
                      {selectedComplaint.resolution.reviewStatus.replaceAll("_", " ")}
                    </strong>
                  </p>

                  {selectedComplaint.resolution.reviewStatus === "REJECTED" && (
                    <div className="officer-rejection-reason">
                      <strong>Administrator's feedback</strong>
                      <p>
                        {selectedComplaint.resolution.reviewNote ||
                          "The administrator rejected this submission. Please contact the administrator for clarification."}
                      </p>
                      <span>
                        Correct the issue described above and submit a new
                        resolution with updated evidence.
                      </span>
                    </div>
                  )}

                  {selectedComplaint.resolution.description && (
                    <div className="officer-previous-resolution">
                      <strong>Previous resolution submission</strong>
                      <p>{selectedComplaint.resolution.description}</p>
                    </div>
                  )}

                  {selectedComplaint.resolution.reviewStatus !== "REJECTED" &&
                    selectedComplaint.resolution.reviewNote && (
                      <p>
                        Administrator note:{" "}
                        {selectedComplaint.resolution.reviewNote}
                      </p>
                    )}

                  {selectedComplaint.resolution.evidence?.map((item, index) => (
                    <a
                      key={index}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open submitted resolution image {index + 1}
                    </a>
                  ))}
                </div>
              )}

            {selectedComplaint.statusHistory?.length > 0 && (
              <div className="officer-description">
                <h3>Status History</h3>
                <div className="officer-history">
                  {selectedComplaint.statusHistory.map((entry, index) => (
                    <div key={entry._id || index}>
                      <strong>
                        {STATUS_LABELS[entry.status] || entry.status}
                      </strong>
                      <span>{formatDate(entry.changedAt)}</span>
                      {entry.note && <p>{entry.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedComplaint.status === "ASSIGNED" && (
              <div className="officer-action-panel">
                <h3>Start Working on Complaint</h3>
                <p>Update the status when you begin handling this issue.</p>

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
                    <h3>Submit Completed Work</h3>
                    <p>
                      Describe the work completed and upload genuine
                      after-resolution images. An administrator must verify
                      the submission before the complaint becomes resolved.
                    </p>
                    <button
                      className="officer-primary-button"
                      onClick={() => setShowResolutionForm(true)}
                    >
                      Submit for Verification
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Resolution Submission</h3>

                    <label>Resolution Description</label>
                    <textarea
                      value={resolutionDescription}
                      onChange={(e) => setResolutionDescription(e.target.value)}
                      placeholder="Describe the action taken to resolve this complaint..."
                      rows={4}
                      maxLength={3000}
                    />

                    <label>Resolution Evidence Images</label>
                    <div className="officer-file-picker">
                      <Upload size={20} />
                      <span>Select up to 5 images (JPG, PNG or WEBP)</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={handleEvidenceSelection}
                      />
                    </div>

                    {evidenceFiles.length > 0 && (
                      <div className="officer-selected-files">
                        {evidenceFiles.map((file, index) => (
                          <div key={`${file.name}-${index}`}>
                            <ImageIcon size={15} />
                            <span>{file.name}</span>
                            <small>
                              {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </small>
                          </div>
                        ))}
                      </div>
                    )}

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
                        onClick={() => {
                          setShowResolutionForm(false);
                          setEvidenceFiles([]);
                        }}
                        disabled={updating}
                      >
                        Cancel
                      </button>

                      <button
                        className="officer-primary-button"
                        onClick={() => updateStatus("PENDING_VERIFICATION")}
                        disabled={updating}
                      >
                        {updating ? "Submitting..." : "Submit for Verification"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedComplaint.status === "PENDING_VERIFICATION" && (
              <div className="officer-pending-review">
                <Clock3 size={22} />
                <div>
                  <strong>Awaiting administrator verification</strong>
                  <p>
                    Your resolution has been submitted. The complaint will
                    only become resolved after administrator approval.
                  </p>
                </div>
              </div>
            )}

            {selectedComplaint.status === "RESOLVED" && (
              <div className="officer-resolved">
                <CheckCircle2 size={22} />
                <div>
                  <strong>Resolution verified and approved</strong>
                  <p>
                    {selectedComplaint.resolution?.description ||
                      "The administrator approved the resolution."}
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
