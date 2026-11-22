
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("civicai_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Let the browser/Axios generate the multipart boundary for FormData.
  if (
    typeof FormData !== "undefined" &&
    config.data instanceof FormData
  ) {
    config.headers.delete("Content-Type");
  }

  return config;
});

export default api;
