
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FilePlus2,
  FileText,
  ImagePlus,
  LocateFixed,
  LogOut,
  MapPin,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { citizenAPI } from "../services/portalService";
import api from "../services/api";
import "./CitizenDashboard.css";

const CATEGORIES = [
  { code: "WATER_LEAKAGE", name: "Water Leakage" },
  { code: "WATER_SHORTAGE", name: "Water Shortage" },
  { code: "CONTAMINATED_WATER", name: "Contaminated Water" },
  { code: "SEWAGE_OVERFLOW", name: "Sewage Overflow" },
  { code: "BLOCKED_DRAIN", name: "Blocked Drain" },
  { code: "GARBAGE_ACCUMULATION", name: "Garbage Accumulation" },
  { code: "ILLEGAL_DUMPING", name: "Illegal Dumping" },
  { code: "POTHOLE", name: "Pothole" },
  { code: "DAMAGED_FOOTPATH", name: "Damaged Footpath" },
  { code: "STREETLIGHT_FAILURE", name: "Streetlight Failure" },
  { code: "FALLEN_TREE", name: "Fallen Tree" },
  { code: "MOSQUITO_BREEDING", name: "Mosquito Breeding" },
];

const initialForm = {
  title: "",
  description: "",
  categoryCode: "",
  address: "",
  latitude: "",
  longitude: "",
};

const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function getStatusClass(status = "") {
  return status.toLowerCase().replaceAll("_", "-");
}

function formatDate(date) {
  if (!date) return "Date unavailable";

  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function AuthenticatedComplaintImage({
  complaintId,
  media,
  alt,
  kind = "complaint",
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    const loadImage = async () => {
      try {
        const parsedUrl = new URL(media.url, window.location.origin);
        const filename = decodeURIComponent(
          parsedUrl.pathname.split("/").filter(Boolean).pop() || ""
        );

        if (!filename) {
          throw new Error("Image filename is unavailable.");
        }

        const response = await api.get(
          `/media/${complaintId}/${kind}/${encodeURIComponent(filename)}`,
          { responseType: "blob" }
        );

        objectUrl = URL.createObjectURL(response.data);

        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
        } else {
          setImageUrl(objectUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          console.error("Unable to load authenticated image:", error);
        }
      }
    };

    if (complaintId && media?.url) {
      loadImage();
    } else {
      setFailed(true);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [complaintId, media?.url, kind]);

  if (imageUrl) {
    return <img src={imageUrl} alt={alt} loading="lazy" />;
  }

  return (
    <span className="citizen-complaint-image-placeholder">
      {failed ? "Image unavailable" : "Loading image..."}
    </span>
  );
}

function CitizenDashboard({ user, onLogout }) {
  const [activeView, setActiveView] = useState("overview");
  const [complaints, setComplaints] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedImages, setSelectedImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [successComplaint, setSuccessComplaint] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [notice, setNotice] = useState("");

  const imageInputRef = useRef(null);
  const imageUrlsRef = useRef(new Set());

  useEffect(() => {
    return () => {
      imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      imageUrlsRef.current.clear();
    };
  }, []);

  const clearSelectedImages = () => {
    selectedImages.forEach((image) => {
      URL.revokeObjectURL(image.preview);
      imageUrlsRef.current.delete(image.preview);
    });

    setSelectedImages([]);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await citizenAPI.getMyComplaints();
      setComplaints(response.data.complaints || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load your complaints. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  const stats = useMemo(() => {
    const total = complaints.length;
    const resolved = complaints.filter(
      (item) => item.status === "RESOLVED"
    ).length;
    const rejected = complaints.filter(
      (item) => item.status === "REJECTED"
    ).length;
    const active = total - resolved - rejected;

    return { total, active, resolved };
  }, [complaints]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleImageSelection = (event) => {
    setError("");
    setNotice("");

    const incomingFiles = Array.from(event.target.files || []);
    if (!incomingFiles.length) return;

    const remainingSlots = MAX_IMAGES - selectedImages.length;

    if (remainingSlots <= 0) {
      setError(`You can attach a maximum of ${MAX_IMAGES} images.`);
      event.target.value = "";
      return;
    }

    const acceptedImages = [];
    const rejectedMessages = [];

    incomingFiles.forEach((file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        rejectedMessages.push(
          `${file.name}: only JPG, PNG and WEBP images are allowed.`
        );
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        rejectedMessages.push(
          `${file.name}: image size must be 5 MB or smaller.`
        );
        return;
      }

      if (selectedImages.length + acceptedImages.length >= MAX_IMAGES) {
        rejectedMessages.push(`Only ${MAX_IMAGES} images can be attached.`);
        return;
      }

      const preview = URL.createObjectURL(file);
      imageUrlsRef.current.add(preview);

      acceptedImages.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        preview,
      });
    });

    if (acceptedImages.length) {
      setSelectedImages((previous) => [...previous, ...acceptedImages]);
    }

    if (rejectedMessages.length) {
      setError(rejectedMessages.join(" "));
    }

    // Reset so the same file can be selected again after removal.
    event.target.value = "";
  };

  const removeSelectedImage = (imageId) => {
    const imageToRemove = selectedImages.find(
      (image) => image.id === imageId
    );

    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.preview);
      imageUrlsRef.current.delete(imageToRemove.preview);
    }

    setSelectedImages((previous) =>
      previous.filter((image) => image.id !== imageId)
    );

    setError("");
  };

  const captureLocation = () => {
    setError("");
    setNotice("");

    if (!navigator.geolocation) {
      setError("Your browser does not support GPS location. Enter coordinates manually.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((previous) => ({
          ...previous,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        setNotice("Your current location has been captured.");
      },
      (locationError) => {
        const messages = {
          1: "Location permission was denied. Allow location access or enter coordinates manually.",
          2: "Your location could not be determined. Try again or enter coordinates manually.",
          3: "Location request timed out. Please try again.",
        };

        setError(messages[locationError.code] || "Unable to get your location.");
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const openRegistration = () => {
    setSuccessComplaint(null);
    setSelectedComplaint(null);
    setError("");
    setNotice("");
    setActiveView("register");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);

    if (
      form.latitude.trim() === "" ||
      form.longitude.trim() === "" ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError("Please capture your GPS location or enter valid latitude and longitude.");
      return;
    }

    setSubmitting(true);

    try {
      const complaintData = new FormData();

      complaintData.append("title", form.title.trim());
      complaintData.append("description", form.description.trim());
      complaintData.append("categoryCode", form.categoryCode);
      complaintData.append("address", form.address.trim());
      complaintData.append("latitude", String(latitude));
      complaintData.append("longitude", String(longitude));

      selectedImages.forEach((image) => {
        complaintData.append("images", image.file);
      });

      const response = await citizenAPI.submitComplaint(complaintData);

      const complaint = response.data.complaint;
      setSuccessComplaint(complaint);
      setForm(initialForm);
      clearSelectedImages();
      setActiveView("success");
      await loadComplaints();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Your complaint could not be submitted. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openComplaint = async (complaint) => {
    setError("");
    setSelectedComplaint(complaint);
    setActiveView("details");

    try {
      const response = await citizenAPI.getComplaint(complaint._id);
      setSelectedComplaint(response.data.complaint);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        "Unable to load complaint details."
      );
    }
  };

  const goToOverview = () => {
    setActiveView("overview");
    setSelectedComplaint(null);
    setSuccessComplaint(null);
    setError("");
    setNotice("");
  };

  const renderComplaintList = () => {
    if (loading) {
      return (
        <div className="citizen-empty">
          <RefreshCw className="citizen-spin" size={24} />
          <p>Loading your complaints...</p>
        </div>
      );
    }

    if (complaints.length === 0) {
      return (
        <div className="citizen-empty">
          <FileText size={34} />
          <h3>No complaints registered yet</h3>
          <p>When you report a civic issue, it will appear here.</p>
          <button className="citizen-primary-btn" onClick={openRegistration}>
            Register your first complaint <ArrowRight size={17} />
          </button>
        </div>
      );
    }

    return (
      <div className="citizen-complaint-list">
        {complaints.map((complaint) => (
          <button
            className="citizen-complaint-card"
            key={complaint._id}
            onClick={() => openComplaint(complaint)}
          >
            <div className="citizen-complaint-main">
              <div>
                <span className="citizen-complaint-number">
                  {complaint.complaintNumber || "Complaint"}
                </span>
                <h3>{complaint.title}</h3>
                <p>
                  {complaint.category?.name || "Civic issue"} ·{" "}
                  {formatDate(complaint.createdAt)}
                </p>
              </div>
              <span className={`citizen-status ${getStatusClass(complaint.status)}`}>
                {(complaint.status || "SUBMITTED").replaceAll("_", " ")}
              </span>
            </div>
<div className="citizen-complaint-footer">
              <span>
                Severity: <strong>{complaint.severity || "Not assessed"}</strong>
              </span>
              <span className="citizen-view-link">
                View details <ArrowRight size={15} />
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="citizen-shell">
      <header className="citizen-header">
        <button className="citizen-brand" onClick={goToOverview}>
          <span className="citizen-brand-icon">
            <ShieldCheck size={24} />
          </span>
          <span>
            <strong>CivicAI</strong>
            <small>Citizen Portal · PMC</small>
          </span>
        </button>

        <div className="citizen-header-right">
          <div className="citizen-user">
            <span className="citizen-avatar">
              {(user?.name || "C").charAt(0).toUpperCase()}
            </span>
            <span>{user?.name || "Citizen"}</span>
          </div>
          <button className="citizen-logout" onClick={onLogout}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="citizen-layout">
        <aside className="citizen-sidebar">
          <span className="citizen-sidebar-label">MENU</span>

          <button
            className={activeView === "overview" ? "active" : ""}
            onClick={goToOverview}
          >
            <FileText size={18} /> Overview
          </button>

          <button
            className={activeView === "register" ? "active" : ""}
            onClick={openRegistration}
          >
            <FilePlus2 size={18} /> Register a Complaint
          </button>

          <button
            className={activeView === "history" ? "active" : ""}
            onClick={() => {
              setActiveView("history");
              setSelectedComplaint(null);
              setError("");
              loadComplaints();
            }}
          >
            <Clock3 size={18} /> My Complaints
          </button>

          <div className="citizen-sidebar-note">
            <ShieldCheck size={19} />
            <p>
              Your reports help improve public services and civic infrastructure.
            </p>
          </div>
        </aside>

        <main className="citizen-main">
          <div className="citizen-page-heading">
            <div>
              <span className="citizen-eyebrow">PUNE MUNICIPAL CORPORATION</span>
              <h1>
                {activeView === "register" && "Register a Complaint"}
                {activeView === "history" && "My Complaints"}
                {activeView === "details" && "Complaint Details"}
                {activeView === "success" && "Complaint Submitted"}
                {activeView === "overview" && `Welcome, ${user?.name?.split(" ")[0] || "Citizen"}`}
              </h1>
              <p>
                {activeView === "overview" &&
                  "Report civic issues and follow their progress."}
                {activeView === "register" &&
                  "Tell us about the civic issue you want to report."}
                {activeView === "history" &&
                  "View and track the complaints you have submitted."}
                {activeView === "details" &&
                  "Review your complaint information and status."}
                {activeView === "success" &&
                  "Your complaint has been recorded in CivicAI."}
              </p>
            </div>

            {activeView !== "register" && activeView !== "success" && (
              <button
                className="citizen-primary-btn"
                onClick={openRegistration}
              >
                <FilePlus2 size={18} /> Register Complaint
              </button>
            )}
          </div>

          {error && (
            <div className="citizen-alert citizen-alert-error">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {notice && (
            <div className="citizen-alert citizen-alert-success">
              <CheckCircle2 size={18} /> {notice}
            </div>
          )}

          {activeView === "overview" && (
            <>
              <section className="citizen-stat-grid">
                <div className="citizen-stat-card">
                  <span className="citizen-stat-icon blue">
                    <FileText size={21} />
                  </span>
                  <div>
                    <p>Total Complaints</p>
                    <strong>{loading ? "—" : stats.total}</strong>
                  </div>
                </div>

                <div className="citizen-stat-card">
                  <span className="citizen-stat-icon orange">
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <p>Active Complaints</p>
                    <strong>{loading ? "—" : stats.active}</strong>
                  </div>
                </div>

                <div className="citizen-stat-card">
                  <span className="citizen-stat-icon green">
                    <CheckCircle2 size={21} />
                  </span>
                  <div>
                    <p>Resolved Complaints</p>
                    <strong>{loading ? "—" : stats.resolved}</strong>
                  </div>
                </div>
              </section>

              <section className="citizen-quick-action">
                <div className="citizen-quick-icon">
                  <FilePlus2 size={25} />
                </div>
                <div>
                  <h2>Facing a civic issue?</h2>
                  <p>
                    Report potholes, garbage accumulation, water problems,
                    streetlight failures and other civic issues.
                  </p>
                </div>
                <button
                  className="citizen-primary-btn"
                  onClick={openRegistration}
                >
                  Register Now <ArrowRight size={17} />
                </button>
              </section>

              <section className="citizen-section">
                <div className="citizen-section-heading">
                  <div>
                    <h2>Recent Complaints</h2>
                    <p>Your latest submitted reports</p>
                  </div>
                  <button
                    className="citizen-text-btn"
                    onClick={() => {
                      setActiveView("history");
                      loadComplaints();
                    }}
                  >
                    View all <ArrowRight size={16} />
                  </button>
                </div>
                {renderComplaintList()}
              </section>
            </>
          )}

          {activeView === "register" && (
            <section className="citizen-form-card">
              <div className="citizen-form-intro">
                <h2>Complaint information</h2>
                <p>Fields marked with * are required.</p>
              </div>

              <form onSubmit={handleSubmit} className="citizen-form">
                <label htmlFor="categoryCode">Issue category *</label>
                <select
                  id="categoryCode"
                  name="categoryCode"
                  value={form.categoryCode}
                  onChange={updateField}
                  required
                >
                  <option value="">Select the type of civic issue</option>
                  {CATEGORIES.map((category) => (
                    <option key={category.code} value={category.code}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <label htmlFor="title">Complaint title *</label>
                <input
                  id="title"
                  name="title"
                  value={form.title}
                  onChange={updateField}
                  placeholder="Example: Large pothole near the main road"
                  maxLength={150}
                  required
                />
                <span className="citizen-field-hint">
                  Maximum 150 characters
                </span>

                <label htmlFor="description">Describe the issue *</label>
                <textarea
                  id="description"
                  name="description"
                  value={form.description}
                  onChange={updateField}
                  placeholder="Explain what happened, where it happened and how it affects people..."
                  maxLength={3000}
                  rows={5}
                  required
                />
                <span className="citizen-field-hint">
                  Maximum 3,000 characters
                </span>

                <label htmlFor="address">Address / Landmark</label>
                <input
                  id="address"
                  name="address"
                  value={form.address}
                  onChange={updateField}
                  placeholder="Street, area or nearby landmark"
                  maxLength={500}
                />

                <div className="citizen-image-section">
                  <div className="citizen-image-heading">
                    <div>
                      <label htmlFor="complaint-images">Attach photographs</label>
                      <p>Upload evidence of the civic issue (optional).</p>
                    </div>
                    <span>{selectedImages.length}/{MAX_IMAGES}</span>
                  </div>

                  <input
                    ref={imageInputRef}
                    id="complaint-images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageSelection}
                    disabled={selectedImages.length >= MAX_IMAGES || submitting}
                    className="citizen-image-input"
                  />

                  <button
                    type="button"
                    className="citizen-image-select-btn"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={selectedImages.length >= MAX_IMAGES || submitting}
                  >
                    <ImagePlus size={17} />
                    Add images
                  </button>

                  <p className="citizen-field-hint">
                    JPG, PNG or WEBP · Maximum 5 images · 5 MB per image
                  </p>

                  {selectedImages.length > 0 && (
                    <div className="citizen-image-preview-grid">
                      {selectedImages.map((image) => (
                        <div className="citizen-image-preview" key={image.id}>
                          <img src={image.preview} alt={image.file.name} />
                          <button
                            type="button"
                            className="citizen-image-remove"
                            onClick={() => removeSelectedImage(image.id)}
                            aria-label={`Remove ${image.file.name}`}
                            title="Remove image"
                            disabled={submitting}
                          >
                            <X size={15} />
                          </button>
                          <span title={image.file.name}>{image.file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="citizen-location-heading">
                  <div>
                    <label>Issue location *</label>
                    <p>Capture your current location or enter coordinates manually.</p>
                  </div>
                  <button
                    type="button"
                    className="citizen-location-btn"
                    onClick={captureLocation}
                    disabled={locating}
                  >
                    <LocateFixed size={17} />
                    {locating ? "Locating..." : "Use my location"}
                  </button>
                </div>

                <div className="citizen-coordinate-grid">
                  <div>
                    <label htmlFor="latitude">Latitude *</label>
                    <input
                      id="latitude"
                      name="latitude"
                      type="number"
                      step="any"
                      value={form.latitude}
                      onChange={updateField}
                      placeholder="18.5204"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="longitude">Longitude *</label>
                    <input
                      id="longitude"
                      name="longitude"
                      type="number"
                      step="any"
                      value={form.longitude}
                      onChange={updateField}
                      placeholder="73.8567"
                      required
                    />
                  </div>
                </div>

                <div className="citizen-location-note">
                  <MapPin size={17} />
                  <span>
                    GPS coordinates help identify the complaint location.
                    Automatic PMC ward assignment is not yet available.
                  </span>
                </div>

                <div className="citizen-form-actions">
                  <button
                    type="button"
                    className="citizen-secondary-btn"
                    onClick={goToOverview}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="citizen-primary-btn"
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit Complaint"}
                    {!submitting && <ArrowRight size={17} />}
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeView === "history" && (
            <section className="citizen-section citizen-history-section">
              <div className="citizen-section-heading">
                <div>
                  <h2>All your complaints</h2>
                  <p>{complaints.length} complaint(s) registered</p>
                </div>
                <button
                  className="citizen-refresh-btn"
                  onClick={loadComplaints}
                  disabled={loading}
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>
              {renderComplaintList()}
            </section>
          )}

          {activeView === "success" && successComplaint && (
            <section className="citizen-success-card">
              <span className="citizen-success-icon">
                <CheckCircle2 size={38} />
              </span>
              <h2>Your complaint has been registered!</h2>
              <p>
                Your report has been saved successfully. You can track its
                progress from My Complaints.
              </p>
              <div className="citizen-reference-box">
                <span>COMPLAINT REFERENCE NUMBER</span>
                <strong>{successComplaint.complaintNumber}</strong>
              </div>
              <div className="citizen-success-meta">
                <div>
                  <span>Category</span>
                  <strong>{successComplaint.category?.name || form.categoryCode || "Registered"}</strong>
                </div>
                <div>
                  <span>Severity</span>
                  <strong>{successComplaint.severity || "Pending"}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{successComplaint.status || "SUBMITTED"}</strong>
                </div>
              </div>
              {successComplaint.duplicateCheck?.status === "POSSIBLE" && (
                <div className="citizen-duplicate-note">
                  <AlertCircle size={18} />
                  A similar complaint may already exist. Municipal staff can
                  review this match.
                </div>
              )}
              <div className="citizen-form-actions">
                <button
                  className="citizen-secondary-btn"
                  onClick={goToOverview}
                >
                  Back to Dashboard
                </button>
                <button
                  className="citizen-primary-btn"
                  onClick={() => {
                    setActiveView("history");
                    loadComplaints();
                  }}
                >
                  View My Complaints <ArrowRight size={17} />
                </button>
              </div>
            </section>
          )}

          {activeView === "success" && !successComplaint && (
            <div className="citizen-empty">
              <XCircle size={30} />
              <h3>Submission confirmation unavailable</h3>
              <p>Check My Complaints to verify whether your report was saved.</p>
              <button
                className="citizen-primary-btn"
                onClick={() => {
                  setActiveView("history");
                  loadComplaints();
                }}
              >
                View My Complaints
              </button>
            </div>
          )}

          {activeView === "details" && selectedComplaint && (
            <section className="citizen-form-card citizen-detail-card">
              <div className="citizen-detail-top">
                <div>
                  <span className="citizen-complaint-number">
                    {selectedComplaint.complaintNumber}
                  </span>
                  <h2>{selectedComplaint.title}</h2>
                </div>
                <span className={`citizen-status ${getStatusClass(selectedComplaint.status)}`}>
                  {(selectedComplaint.status || "").replaceAll("_", " ")}
                </span>
              </div>

              
<div className="citizen-detail-grid">
  <div>
    <span>Category</span>
    <strong>{selectedComplaint.category?.name || "—"}</strong>
  </div>

  <div>
    <span>Suggested Department</span>
    <strong>
      {selectedComplaint.recommendedAssignment?.department?.name ||
        "Not available"}
    </strong>
  </div>

  <div>
    <span>Administrative Office</span>
    <strong>
      {selectedComplaint.recommendedAssignment?.administrativeOffice?.name ||
        "Awaiting verification"}
    </strong>
  </div>

  <div>
    <span>Prabhag</span>
    <strong>
      {selectedComplaint.recommendedAssignment?.prabhag?.name ||
        "Awaiting verification"}
    </strong>
  </div>

  <div>
    <span>Zone</span>
    <strong>
      {selectedComplaint.recommendedAssignment?.zone?.name ||
        "Awaiting verification"}
    </strong>
  </div>

  <div>
    <span>Official Department</span>
    <strong>
      {selectedComplaint.department?.name ||
        "Awaiting administrator confirmation"}
    </strong>
  </div>

  <div>
    <span>Severity</span>
    <strong>{selectedComplaint.severity || "—"}</strong>
  </div>

  <div>
    <span>Submitted</span>
    <strong>{formatDate(selectedComplaint.createdAt)}</strong>
  </div>

  <div>
    <span>Assigned Officer</span>
    <strong>
      {selectedComplaint.assignedOfficer?.name || "Not assigned"}
    </strong>
  </div>

  <div>
    <span>Address</span>
    <strong>{selectedComplaint.address || "Not provided"}</strong>
  </div>
</div>

<div className="citizen-duplicate-note">
  <Clock3 size={18} />
  <span>
    Assignment status:{" "}
    {selectedComplaint.recommendedAssignment?.reviewStatus === "APPROVED" ? (
      <strong>
        Administrator review completed. Official assignment confirmed.
      </strong>
    ) : selectedComplaint.recommendedAssignment?.reviewStatus ===
      "NEEDS_MANUAL_REVIEW" ? (
      <strong>
        Manual administrator review required. Suggested details are
        provisional and are not official assignments.
      </strong>
    ) : (
      <strong>
        Pending administrator review. Suggested details are provisional
        and are not official assignments.
      </strong>
    )}
  </span>
</div>


              <div className="citizen-detail-description">
                <span>Description</span>
                <p>{selectedComplaint.description}</p>
              </div>

              {selectedComplaint.resolution?.reviewStatus &&
                selectedComplaint.resolution.reviewStatus !== "NOT_SUBMITTED" && (
                  <div className="citizen-detail-description">
                    <h3>Resolution Update</h3>

                    <p>
                      <strong>Review Status: </strong>
                      {selectedComplaint.resolution.reviewStatus.replaceAll("_", " ")}
                    </p>

                    {selectedComplaint.resolution.description && (
                      <p>
                        <strong>Officer's Resolution: </strong>
                        {selectedComplaint.resolution.description}
                      </p>
                    )}

                    <p>
                      <strong>Submitted: </strong>
                      {formatDate(selectedComplaint.resolution.submittedAt)}
                    </p>

                    {selectedComplaint.resolution.reviewNote && (
                      <p>
                        <strong>Administrator's Review Note: </strong>
                        {selectedComplaint.resolution.reviewNote}
                      </p>
                    )}

                    {selectedComplaint.resolution.reviewedAt && (
                      <p>
                        <strong>Reviewed: </strong>
                        {formatDate(selectedComplaint.resolution.reviewedAt)}
                      </p>
                    )}
                    {selectedComplaint.resolution.evidence?.length > 0 && (
                      <div className="citizen-detail-images">
                        <h3>Resolution evidence</h3>
                        <div className="citizen-detail-image-grid">
                          {selectedComplaint.resolution.evidence.map((item, index) => (
                            <AuthenticatedComplaintImage
                              key={`resolution-${selectedComplaint._id}-${index}`}
                              complaintId={selectedComplaint._id}
                              media={item}
                              kind="resolution"
                              alt={`Resolution evidence ${index + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              {selectedComplaint.media?.some(
                (item) => item.url && item.mediaType === "IMAGE"
              ) && (
                <div className="citizen-detail-images">
                  <h3>Attached photographs</h3>
                  <div className="citizen-detail-image-grid">
                    {selectedComplaint.media
                      .filter((item) => item.url && item.mediaType === "IMAGE")
                      .map((item, index) => (
                        <AuthenticatedComplaintImage
                          key={`complaint-${selectedComplaint._id}-${index}`}
                          complaintId={selectedComplaint._id}
                          media={item}
                          alt={`Complaint evidence ${index + 1}`}
                        />
                      ))}
                  </div>
                </div>
              )}


              {selectedComplaint.duplicateCheck?.status === "POSSIBLE" && (
                <div className="citizen-duplicate-note">
                  <AlertCircle size={18} />
                  This complaint has a possible duplicate match awaiting review.
                </div>
              )}

              {selectedComplaint.statusHistory?.length > 0 && (
                <div className="citizen-timeline">
                  <h3>Status History</h3>
                  {selectedComplaint.statusHistory.map((entry, index) => (
                    <div className="citizen-timeline-item" key={`${entry.status}-${index}`}>
                      <span className="citizen-timeline-dot" />
                      <div>
                        <strong>{entry.status.replaceAll("_", " ")}</strong>
                        <p>{entry.note || "Status updated"}</p>
                        <small>{formatDate(entry.changedAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="citizen-secondary-btn"
                onClick={() => setActiveView("history")}
              >
                Back to My Complaints
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default CitizenDashboard;
