import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("recotex-auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.token || null;
    }
  } catch {}
  return null;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("recotex-auth");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
