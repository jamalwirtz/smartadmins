import { useEffect, useState } from 'react'
import { teachersAPI, schedulesAPI, exportAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Download, Send } from 'lucide-react'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const PERIODS = [1,2,3,4,5,6,7,8]

export default function TeacherView() {
  const [teachers, setTeachers] = useState([])
  const [drafts, setDrafts] = useState([])
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedDraft, setSelectedDraft] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [emailModal, setEmailModal] = useState(false)
  const [customMsg, setCustomMsg] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    Promise.all([teachersAPI.list(), schedulesAPI.drafts()]).then(([t, d]) => {
      setTeachers(t.data)
      setDrafts(d.data)
      const active = d.data.find(x => x.status === 'active')
      if (active) setSelectedDraft(active.id)
    })
  }, [])

  const load = async () => {
    if (!selectedTeacher || !selectedDraft) return
    const r = await teachersAPI.schedule(selectedTeacher, selectedDraft)
    setSchedule(r.data)
  }

  useEffect(() => { load() }, [selectedTeacher, selectedDraft])

  const downloadPdf = async () => {
    try {
      const r = await exportAPI.teacherPdf(selectedTeacher, selectedDraft)
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `schedule_${schedule?.teacher}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error('PDF export failed') }
  }

  const sendEmail = async () => {
    setSending(true)
    try {
      await exportAPI.emailTeacher(selectedTeacher, selectedDraft, customMsg)
      toast.success(`Schedule emailed to ${schedule?.email}`)
      setEmailModal(false)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Email send failed')
    } finally { setSending(false) }
  }

  // Build slot map from schedule
  const slotMap = {}
  if (schedule) {
    schedule.schedule.forEach(s => { slotMap[`${s.day}-${s.period}`] = s })
  }

  const usedPct = schedule ? Math.round((schedule.total_periods / schedule.max_weekly_hours) * 100) : 0

  return (
    <>
      <div className="topbar">
        <h2>Teacher Weekly View</h2>
        {schedule && (
          <div className="topbar-actions">
            <button className="btn btn-teal" onClick={downloadPdf}><Download size={14} /> PDF</button>
            {schedule.email && (
              <button className="btn btn-primary" onClick={() => setEmailModal(true)}>
                <Send size={14} /> Email Schedule
              </button>
            )}
          </div>
        )}
      </div>

      <div className="page">
        {/* Filters */}
        <div className="card mb-4">
          <div className="grid-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Select Teacher</label>
              <select className="form-select" value={selectedTeacher}
                onChange={e => setSelectedTeacher(e.target.value)}>
                <option value="">— Choose Teacher —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.is_part_time ? '(PT)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Timetable Draft</label>
              <select className="form-select" value={selectedDraft}
                onChange={e => setSelectedDraft(e.target.value)}>
                <option value="">— Choose Draft —</option>
                {drafts.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {schedule && (
          <>
            {/* Stats */}
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
              <div className="stat-card" style={{ borderTop: '3px solid var(--indigo)' }}>
                <div className="stat-value">{schedule.total_periods}</div>
                <div className="stat-label">Periods Assigned</div>
              </div>
              <div className="stat-card" style={{ borderTop: '3px solid var(--teal)' }}>
                <div className="stat-value">{schedule.remaining_capacity}</div>
                <div className="stat-label">Remaining Capacity</div>
              </div>
              <div className="stat-card" style={{ borderTop: `3px solid ${usedPct > 90 ? 'var(--red)' : 'var(--green)'}` }}>
                <div className="stat-value">{usedPct}%</div>
                <div className="stat-label">Workload Used</div>
              </div>
            </div>

            {/* Workload bar */}
            <div className="card mb-4">
              <div className="flex-between mb-4">
                <strong>{schedule.teacher}</strong>
                <span className="text-muted text-sm">{schedule.total_periods} / {schedule.max_weekly_hours} periods</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${Math.min(usedPct, 100)}%`,
                  background: usedPct > 90 ? 'var(--red)' : usedPct > 70 ? 'var(--accent)' : 'var(--teal)',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>

            {/* Grid */}
            <div className="card">
              <div className="card-title mb-4">Weekly Schedule — {schedule.teacher}</div>
              <div className="tt-grid">
                <table className="tt-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      {DAYS.map(d => <th key={d}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(p => (
                      <tr key={p}>
                        <td className="tt-period-label">P{p}</td>
                        {DAYS.map(d => {
                          const s = slotMap[`${d}-${p}`]
                          return (
                            <td key={d}>
                              {s ? (
                                <div className="tt-cell" style={{ background: '#e8f5e9', cursor: 'default' }}>
                                  <div className="tt-cell-subject">{s.subject}</div>
                                  <div className="tt-cell-class" style={{ color: 'var(--indigo)', fontWeight: 700 }}>
                                    {s.class}
                                  </div>
                                  {s.is_locked && <span style={{ fontSize: 10, color: '#f59e0b' }}>🔒 locked</span>}
                                </div>
                              ) : (
                                <div className="tt-cell empty" style={{ cursor: 'default' }} />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!schedule && selectedTeacher && selectedDraft && (
          <div className="empty-state">No schedule data found for this teacher in the selected draft.</div>
        )}
        {!selectedTeacher && (
          <div className="empty-state">Select a teacher and draft to view their weekly schedule.</div>
        )}
      </div>

      {/* Email modal */}
      {emailModal && (
        <div className="modal-overlay" onClick={() => setEmailModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Email Schedule to {schedule?.teacher}</div>
            <p className="text-muted text-sm mb-4">
              A PDF of their weekly schedule will be sent to <strong>{schedule?.email}</strong>
            </p>
            <div className="form-group">
              <label className="form-label">Optional Custom Message</label>
              <textarea className="form-textarea" rows={4} value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
                placeholder="Add a personal note to the email…" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEmailModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={sendEmail} disabled={sending}>
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
