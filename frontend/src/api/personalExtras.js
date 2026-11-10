// Home-schedule templates, import and export. Kept separate so client.js needs no edit —
// fold into client.js whenever convenient.
import api from './client'

export const personalExtrasAPI = {
  templates:    ()                  => api.get('/personal-templates'),
  fromTemplate: (data)              => api.post('/personal-timetables/from-template', data),
  importFile:   (timetableId, file) => {
    const f = new FormData(); f.append('file', file)
    return api.post(`/personal-timetables/${timetableId}/import`, f, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  exportBlob:   (timetableId)       => api.get(`/personal-timetables/${timetableId}/export`, { responseType: 'blob' }),
  // public static file, so a plain link works
  importTemplateUrl: () => `${(api.defaults.baseURL || '').replace(/\/$/, '')}/personal-import/template`,
}
