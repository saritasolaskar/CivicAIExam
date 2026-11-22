
import api from "./api";

// CITIZEN
export const citizenAPI = {
  submitComplaint: (data) =>
    api.post("/complaints", data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  getMyComplaints: () => api.get("/complaints/my"),

  getComplaint: (id) => api.get(`/complaints/${id}`),
};

// ADMIN
export const adminAPI = {
  getOverview: () => api.get("/admin/dashboard/overview"),

  getComplaints: (params = {}) =>
    api.get("/admin/complaints", { params }),

  getDepartments: () =>
    api.get("/admin/complaints/departments"),

  getOfficers: (params = {}) =>
    api.get("/admin/officers", { params }),

  createOfficer: (data) =>
    api.post("/admin/officers", data),

  updateOfficerAssignment: (id, data) =>
    api.patch(`/admin/officers/${id}`, data),

  updateOfficerStatus: (id, isActive) =>
    api.patch(`/admin/officers/${id}/status`, { isActive }),

  assignComplaint: (id, data) =>
    api.patch(`/admin/complaints/${id}/assign`, data),

  reviewResolution: (id, data) =>
    api.patch(`/admin/complaints/${id}/resolution-review`, data),
};

// OFFICER
export const officerAPI = {
  getAssignedComplaints: (params = {}) =>
    api.get("/officer/complaints", { params }),

  getComplaint: (id) =>
    api.get(`/officer/complaints/${id}`),


  updateComplaintStatus: (id, data) =>
  api.patch(`/officer/complaints/${id}/status`, data),

};

// GEOGRAPHY
export const geographyAPI = {
  getOffices: () => api.get("/geography/offices"),

  getZones: () => api.get("/geography/zones"),

  getPrabhags: () => api.get("/geography/prabhags"),

  locate: (latitude, longitude) =>
    api.get("/geography/locate", {
      params: { latitude, longitude },
    }),
};
