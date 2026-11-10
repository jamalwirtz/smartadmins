// New exam-setup endpoints. Kept in its own file so client.js needs no edit this
// batch — fold these into client.js whenever convenient.
import api from './client'

const upload = (url, file) => {
  const f = new FormData(); f.append('file', file)
  return api.post(url, f, { headers: { 'Content-Type': 'multipart/form-data' } })
}
// Template endpoints are public, so a plain link works (no auth header needed).
const link = (path) => `${(api.defaults.baseURL || '').replace(/\/$/, '')}${path}`

export const examExtrasAPI = {
  preflight:               (sessionId, data) => api.post(`/exams/sessions/${sessionId}/preflight`, data),
  supervisorsFromTeachers: ()                => api.post('/supervisors/from-teachers'),
  importSupervisors:       (file)            => upload('/supervisors/import', file),
  supervisorsTemplateUrl:  ()                => link('/supervisors/import/template'),
  importRooms:             (file)            => upload('/rooms/import', file),
  roomsTemplateUrl:        ()                => link('/rooms/import/template'),
}
