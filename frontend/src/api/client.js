import axios from 'axios'

// ── API base URL resolution ───────────────────────────────────────────────────
// Priority (first match wins):
//   1. VITE_API_URL  — build-time env var (set in Render → Environment)
//   2. window.SSTG_API_URL — runtime override (injectable without rebuild)
//   3. Same-origin  — local dev via Vite proxy (/api → localhost:8000)
//
// HOW TO SET ON RENDER:
//   In your *frontend* service → Environment → add:
//     VITE_API_URL = https://<your-backend-service-name>.onrender.com
//   e.g. VITE_API_URL = https://smartadmin-sxvh.onrender.com
//   Then trigger a redeploy of the frontend service.

function resolveBaseURL() {
  // 1. Build-time env var — explicit override (still supported if needed)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '')
  }

  // 2. Runtime window override — injectable without rebuild
  if (typeof window !== 'undefined' && window.SSTG_API_URL) {
    return window.SSTG_API_URL.replace(/\/$/, '')
  }

  // 3. Local dev via Vite proxy: /api → http://localhost:8000 (strips /api prefix)
  if (import.meta.env.DEV) {
    return '/api'
  }

  // 4. Production (served by FastAPI on same origin): use empty string
  //    API routes like /auth/login are served directly by FastAPI on the same host.
  //    No VITE_API_URL needed when frontend and backend share one Render service.
  return ''
}

const BASE = resolveBaseURL()

if (import.meta.env.DEV) {
  console.log('[SSTG] API base URL:', BASE)
  if (BASE === '/api') {
    console.warn(
      '[SSTG] Using /api proxy. On Render you MUST set the VITE_API_URL ' +
      'environment variable in your frontend service to your backend URL, ' +
      'e.g. https://smartadmin-sxvh.onrender.com'
    )
  }
}

const api = axios.create({ baseURL: BASE })

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sstg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 clear token — but only redirect if we are on a protected page
const PUBLIC_PATHS = ['/', '/login', '/signup']
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('sstg_token')
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', new URLSearchParams({ username, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  register: (data) => api.post('/auth/register', data),
  me:       ()     => api.get('/auth/me'),
}

// ── Teachers ──────────────────────────────────────────────────────────────────
export const teachersAPI = {
  list:           ()           => api.get('/teachers'),
  get:            (id)         => api.get(`/teachers/${id}`),
  create:         (data)       => api.post('/teachers', data),
  update:         (id, data)   => api.put(`/teachers/${id}`, data),
  delete:         (id)         => api.delete(`/teachers/${id}`),
  assignSubjects: (id, ids)    => api.post(`/teachers/${id}/subjects`, { subject_ids: ids }),
  schedule:       (id, draft)  => api.get(`/teachers/${id}/schedule?draft_id=${draft}`),
}

// ── Subjects ──────────────────────────────────────────────────────────────────
export const subjectsAPI = {
  list:   ()         => api.get('/subjects'),
  create: (data)     => api.post('/subjects', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
  delete: (id)       => api.delete(`/subjects/${id}`),
}

// ── Classes ───────────────────────────────────────────────────────────────────
export const classesAPI = {
  list:   ()         => api.get('/classes'),
  create: (data)     => api.post('/classes', data),
  update: (id, data) => api.put(`/classes/${id}`, data),
  delete: (id)       => api.delete(`/classes/${id}`),
}

// ── Schedules ─────────────────────────────────────────────────────────────────
export const schedulesAPI = {
  generate:    (draft_count = 3, seeds = null) =>
                 api.post('/schedule/generate', { draft_count, seeds }),
  reshuffle:   (draft_id, class_ids = null, keep_locked = true) =>
                 api.post('/schedule/reshuffle', { draft_id, class_ids, keep_locked }),
  drafts:      ()                          => api.get('/schedule/drafts'),
  getDraft:    (id)                        => api.get(`/schedule/drafts/${id}`),
  lockSlot:    (slot_id, locked)           => api.post('/schedule/lock', { slot_id, locked }),
  activate:    (id)                        => api.put(`/schedule/drafts/${id}/activate`),
  deleteDraft: (id)                        => api.delete(`/schedule/drafts/${id}`),
  validate:    (id)                        => api.get(`/schedule/drafts/${id}/validate`),
  moveSlot:    (slot_id, new_day, new_period) =>
                 api.post('/schedule/move', { slot_id, new_day, new_period }),
  swapSlots:   (slot_a_id, slot_b_id)     =>
                 api.post('/schedule/swap', { slot_a_id, slot_b_id }),
}


// ── Exams ─────────────────────────────────────────────────────────────────────
export const examsAPI = {
  // Sessions
  listSessions:    ()           => api.get('/exams/sessions'),
  getSession:      (id)         => api.get(`/exams/sessions/${id}`),
  createSession:   (data)       => api.post('/exams/sessions', data),
  updateSession:   (id, data)   => api.put(`/exams/sessions/${id}`, data),
  deleteSession:   (id)         => api.delete(`/exams/sessions/${id}`),
  validateSession: (id)         => api.get(`/exams/sessions/${id}/validate`),
  generateSlots:   (id, data)   => api.post(`/exams/sessions/${id}/generate`, data),

  // Papers
  allPapers:       ()                    => api.get('/exams/papers'),
  subjectPapers:   (subjectId)           => api.get(`/exams/subjects/${subjectId}/papers`),
  addPaper:        (subjectId, data)     => api.post(`/exams/subjects/${subjectId}/papers`, data),
  updatePaper:     (paperId, data)       => api.put(`/exams/papers/${paperId}`, data),
  deletePaper:     (paperId)             => api.delete(`/exams/papers/${paperId}`),

  // Slots
  createSlot:      (sessionId, data)     => api.post(`/exams/sessions/${sessionId}/slots`, data),
  updateSlot:      (slotId, data)        => api.put(`/exams/slots/${slotId}`, data),
  deleteSlot:      (slotId)              => api.delete(`/exams/slots/${slotId}`),
}



// ── AI Assistant ──────────────────────────────────────────────────────────────
export const aiAPI = {
  status:            ()           => api.get('/ai/status'),
  chat:              (data)       => api.post('/ai/chat', data),
  generateTimetable: (data)       => api.post('/ai/generate-timetable-prompt', data),
  optimizeExam:      (data)       => api.post('/ai/optimize-exam', data),
}

// ── Holidays ──────────────────────────────────────────────────────────────────
export const holidaysAPI = {
  get:       (countryCode, year) => api.get(`/holidays/${countryCode}/${year}`),
  countries: ()                  => api.get('/holidays/supported-countries'),
  checkDate: (countryCode, date) => api.get(`/holidays/check-date/${countryCode}/${date}`),
}

// ── Templates ─────────────────────────────────────────────────────────────────
export const templatesAPI = {
  timetableTemplates: ()           => api.get('/templates/timetable'),
  examTemplates:      ()           => api.get('/templates/exam'),
  applyExamTemplate:  (data)       => api.post('/templates/exam/apply', data),
}

// ── Export ────────────────────────────────────────────────────────────────────
export const exportAPI = {
  draftPdf:    (draft_id) =>
                 api.get(`/export/draft/${draft_id}/pdf`,  { responseType: 'blob' }),
  draftXlsx:   (draft_id) =>
                 api.get(`/export/draft/${draft_id}/xlsx`, { responseType: 'blob' }),
  teacherPdf:  (teacher_id, draft_id) =>
                 api.get(`/export/teacher/${teacher_id}/pdf?draft_id=${draft_id}`, { responseType: 'blob' }),
  emailTeacher:(teacher_id, draft_id, custom_message = '') =>
                 api.post('/export/email/teacher', { teacher_id, draft_id, custom_message }),
  examPdf:     (session_id) =>
                 api.get(`/export/exam/${session_id}/pdf`,  { responseType: 'blob' }),
  examXlsx:    (session_id) =>
                 api.get(`/export/exam/${session_id}/xlsx`, { responseType: 'blob' }),
}
