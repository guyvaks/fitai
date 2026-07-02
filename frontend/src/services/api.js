import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fitai_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("fitai_token");
      localStorage.removeItem("fitai_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const nutritionAPI = {
  getPlan: () => api.get('/api/v1/nutrition/plan'),
  createManualPlan: (week) => api.post('/api/v1/nutrition/plan/manual', { week }),
  logFood: (entry) => api.post('/api/v1/nutrition/food-log', entry),
  getDayLog: (date) => api.get(`/api/v1/nutrition/food-log/${date}`),
  deleteLog: (id) => api.delete(`/api/v1/nutrition/food-log/entry/${id}`),
}

export const agentsAPI = {
  generateNutrition: () => api.post('/api/v1/agents/nutrition'),
  generateWorkout:   () => api.post('/api/v1/agents/workout'),
  generateFullPlan:  () => api.post('/api/v1/agents/full-plan'),
  getStatus: (taskId) => api.get(`/api/v1/agents/status/${taskId}`),
  approve: (id) => api.post(`/api/v1/agents/approve/${id}`),
  reject:  (id) => api.post(`/api/v1/agents/reject/${id}`),
  getPending: () => api.get('/api/v1/agents/pending'),
}

export const workoutsAPI = {
  getPlan: () => api.get('/api/v1/workouts/plan'),
  startSession: (day) => api.post(`/api/v1/workouts/sessions/start?day_of_week=${day}`),
  getActiveSession: () => api.get('/api/v1/workouts/sessions/active'),
  completeSet: (sessionId, data) => api.patch(`/api/v1/workouts/sessions/${sessionId}/set-complete`, data),
  completeSession: (sessionId) => api.post(`/api/v1/workouts/sessions/${sessionId}/complete`),
  abandonSession: (sessionId) => api.delete(`/api/v1/workouts/sessions/${sessionId}`),
  getPersonalRecords: () => api.get('/api/v1/workouts/personal-records'),
}

export const foodsAPI = {
  search: (q, category = '') => api.get('/api/v1/foods/search', { params: { q, category } }),
}

export default api;
