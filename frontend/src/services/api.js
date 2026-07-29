import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
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

export const authAPI = {
  // Combined "forgot username / forgot password" entry point -- replaces
  // the old email-only forgot-password endpoint. Response is always the
  // same generic message regardless of whether the account exists; the
  // emailed content (if any) carries the username reminder and/or reset link.
  forgotAccess: (email) => api.post('/api/v1/auth/forgot-access', { email }),
  resetPassword: (token, new_password) => api.post('/api/v1/auth/reset-password', { token, new_password }),
  // Deliberately a raw call, not routed through AuthContext -- registering
  // must not establish a session before the email is verified. Register.jsx
  // sends the user to /verify-email afterward instead of logging them in.
  register: (email, password, full_name, username, consent_given, preferred_language) =>
    api.post('/api/v1/auth/register', { email, password, full_name, username, consent_given, preferred_language }),
  verifyEmail: (email, code) => api.post('/api/v1/auth/verify-email', { email, code }),
  resendVerification: (email) => api.post('/api/v1/auth/resend-verification', { email }),
  checkUsernameAvailable: (username) =>
    api.get('/api/v1/auth/username-available', { params: { username } }),
  // Existing-user migration bridge (see ActivateAccount.jsx) -- email+password
  // ONLY for accounts with no username yet, never a standing login alternative.
  activateAccount: (email, password) => api.post('/api/v1/auth/activate-account', { email, password }),
  activateSetUsername: (activation_token, username) =>
    api.post('/api/v1/auth/activate-account/set-username', { activation_token, username }),
  webauthnRegisterOptions: () => api.post('/api/v1/auth/webauthn/register/options'),
  webauthnRegisterVerify: (challenge_token, credential) =>
    api.post('/api/v1/auth/webauthn/register/verify', { challenge_token, credential }),
  webauthnLoginOptions: (username) => api.post('/api/v1/auth/webauthn/login/options', { username }),
  webauthnLoginVerify: (username, challenge_token, credential) =>
    api.post('/api/v1/auth/webauthn/login/verify', { username, challenge_token, credential }),
  webauthnListCredentials: () => api.get('/api/v1/auth/webauthn/credentials'),
  webauthnRemoveCredential: (id) => api.delete(`/api/v1/auth/webauthn/credentials/${id}`),
}

export const nutritionAPI = {
  getPlan: () => api.get('/api/v1/nutrition/plan'),
  createManualPlan: (week) => api.post('/api/v1/nutrition/plan/manual', { week }),
  logFood: (entry) => api.post('/api/v1/nutrition/food-log', entry),
  getDayLog: (date) => api.get(`/api/v1/nutrition/food-log/${date}`),
  deleteLog: (id) => api.delete(`/api/v1/nutrition/food-log/entry/${id}`),
  calculateCalories: (payload) => api.post('/api/v1/nutrition/calculate-calories', payload),
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
  createManualPlan: (week) => api.post('/api/v1/workouts/plan/manual', { week }),
  startSession: (day) => api.post(`/api/v1/workouts/sessions/start?day_of_week=${day}`),
  getActiveSession: () => api.get('/api/v1/workouts/sessions/active'),
  completeSet: (sessionId, data) => api.patch(`/api/v1/workouts/sessions/${sessionId}/set-complete`, data),
  completeSession: (sessionId) => api.post(`/api/v1/workouts/sessions/${sessionId}/complete`),
  abandonSession: (sessionId) => api.delete(`/api/v1/workouts/sessions/${sessionId}`),
  getPersonalRecords: () => api.get('/api/v1/workouts/personal-records'),
  getExerciseMemory: (name) => api.get(`/api/v1/workouts/exercise-memory/${encodeURIComponent(name)}`),
  getVolumeHistory: () => api.get('/api/v1/workouts/volume-history'),
  getSessionsHistory: () => api.get('/api/v1/workouts/sessions/history'),
  getSessionDetail: (sessionId) => api.get(`/api/v1/workouts/sessions/${sessionId}/detail`),
}

export const usersAPI = {
  getWeightHistory: () => api.get('/api/v1/users/weight-history'),
  uploadAvatar: (payload) => api.post('/api/v1/users/avatar', payload),
  deleteAvatar: () => api.delete('/api/v1/users/avatar'),
  // Storage-only for now -- does not change the actual UI language, no i18n
  // is wired up yet.
  updatePreferredLanguage: (preferred_language) =>
    api.patch('/api/v1/users/preferred-language', { preferred_language }),
}

export const foodsAPI = {
  search: (q, category = '') => api.get('/api/v1/foods/search', { params: { q, category } }),
}

export const exercisesAPI = {
  search: (q, muscle_group = '') => api.get('/api/v1/exercises/search', { params: { q, muscle_group } }),
}

export const foodMasterAPI = {
  checkSimilar: (nameHe) => api.get('/api/v1/food-master/check-similar', { params: { name_he: nameHe } }),
  suggest: (payload) => api.post('/api/v1/food-master/suggest', payload),
}

export default api;
