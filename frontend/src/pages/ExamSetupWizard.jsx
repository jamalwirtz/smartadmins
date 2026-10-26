import { useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { X, Check, ChevronRight, ChevronLeft, Calendar, FileText, Users, Play, Loader2, UserPlus, Plus } from 'lucide-react'
import { examsAPI, supervisorsAPI, roomsAPI } from '../api/client'
import { examExtrasAPI } from '../api/examExtras'
import ExamGenerateForm from './ExamGenerateForm'

const STEPS = [
  { id: 1, label: 'Session', icon: <Calendar size={14} /> },
  { id: 2, label: 'Papers', icon: <FileText size={14} /> },
  { id: 3, label: 'Supervisors & rooms', icon: <Users size={14} /> },
  { id: 4, label: 'Generate', icon: <Play size={14} /> },
]
const iso = (d) => d.toISOString().slice(0, 10)
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

export default function ExamSetupWizard({
  onClose, onFinished, subjects, classes, papersData, supervisors, rooms, reloadSupport, onOpenResources,
}) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState(null)   // created session
  const [form, setForm] = useState({ name: '', start_date: iso(new Date()), end_date: plusDays(13), description: '' })

  // step 2 — per-subject paper plan
  const existingOf = (sid) => papersData.find(p => p.subject_id === sid)?.papers || []
  const [plan, setPlan] = useState({})
  const planOf = (s) => plan[s.id] || {
    count: Math.max(existingOf(s.id).length, 1),
    duration: existingOf(s.id)[0]?.duration || 120,
    practical: false,
  }
  const setPlanFor = (s, patch) => setPlan(p => ({ ...p, [s.id]: { ...planOf(s), ...patch } }))
  const applyAll = (patch) => setPlan(Object.fromEntries(subjects.map(s => [s.id, { ...planOf(s), ...patch }])))

  // step 3 — quick add
  const [sup, setSup] = useState({ name: '', role: 'teacher' })
  const [room, setRoom] = useState({ name: '', capacity: 40 })

  const next1 = async () => {
    if (!form.name.trim()) return toast.error('Give the exam session a name')
    if (!form.start_date || !form.end_date) return toast.error('Pick start and end dates')
    if (form.start_date > form.end_date) return toast.error('The end date must be after the start date')
    setBusy(true)
    try {
      if (session) {
        await examsAPI.updateSession(session.id, form)
        setSession(s => ({ ...s, ...form }))
      } else {
        const r = await examsAPI.createSession(form)
        setSession(r.data)
      }
      setStep(2)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save the session') }
    finally { setBusy(false) }
  }

  const next2 = async () => {
    setBusy(true)
    let added = 0
    try {
      for (const s of subjects) {
        const p = planOf(s)
        const have = existingOf(s.id)
        const used = new Set(have.map(x => x.paper_number))
        let total = have.length
        for (let n = 1; n <= 6 && total < p.count; n++) {
          if (used.has(n)) continue
          await examsAPI.addPaper(s.id, { paper_number: n, duration_minutes: +p.duration || 120, is_practical: !!p.practical })
          used.add(n); total++; added++
        }
      }
      await reloadSupport()
      if (added) toast.success(`${added} paper(s) created ✅`)
      setStep(3)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create papers') }
    finally { setBusy(false) }
  }

  const addSup = async () => {
    if (!sup.name.trim()) return toast.error('Enter a name')
    try { await supervisorsAPI.create({ name: sup.name.trim(), role: sup.role, max_sessions: 3 }); setSup({ name: '', role: 'teacher' }); await reloadSupport() }
    catch (e) { toast.error(e?.response?.data?.detail || 'Could not add') }
  }
  const addRoom = async () => {
    if (!room.name.trim()) return toast.error('Enter a room name')
    try { await roomsAPI.create({ name: room.name.trim(), capacity: +room.capacity || 30 }); setRoom({ name: '', capacity: 40 }); await reloadSupport() }
    catch (e) { toast.error(e?.response?.data?.detail || 'Could not add') }
  }
  const allTeachers = async () => {
    try { const r = await examExtrasAPI.supervisorsFromTeachers(); toast.success(r.data.message); await reloadSupport() }
    catch (e) { toast.error(e?.response?.data?.detail || 'Failed') }
  }

  return (
    <motion.div className="wizard-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="wizard-modal" initial={{ opacity: 0, scale: .96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} style={{ maxWidth: 780 }}>
        <div className="wizard-header">
          <div>
            <h2 className="wizard-title">Guided exam setup</h2>
            <p className="wizard-sub">
              {step === 1 && 'Name the session and choose its dates'}
              {step === 2 && 'How many papers does each subject have?'}
              {step === 3 && 'Who invigilates and where? (you can skip this and assign later)'}
              {step === 4 && 'Check the plan, then generate the timetable'}
            </p>
          </div>
          <button className="wizard-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div key={s.id} className="wizard-step-wrap">
              <div className={`wizard-step-dot${step === s.id ? ' active' : step > s.id ? ' done' : ''}`}>{step > s.id ? <Check size={11} /> : s.icon}</div>
              <span className={`wizard-step-label${step === s.id ? ' active' : ''}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`wizard-step-line${step > s.id ? ' done' : ''}`} />}
            </div>
          ))}
        </div>

        <div className="wizard-body">
          {step === 1 && (
            <div className="wizard-step-content">
              <div className="wizard-form-grid">
                <div className="wiz-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="wiz-label">Session name <span className="wiz-req">*</span></label>
                  <input className="wiz-input" autoFocus value={form.name} placeholder="e.g. End of Term 3 Exams"
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">First exam day <span className="wiz-req">*</span></label>
                  <input type="date" className="wiz-input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Last exam day <span className="wiz-req">*</span></label>
                  <input type="date" className="wiz-input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div className="wiz-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="wiz-label">Notes (optional)</label>
                  <input className="wiz-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="wiz-info-banner" style={{ marginTop: 12 }}>
                <span>The timetable is built across every exam day between these two dates, so a two-week window gives you ten sitting days.
                  You can skip holidays in the last step.</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step-content">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>Apply to all subjects:</span>
                {[1, 2, 3].map(n => <button key={n} type="button" className="exam-day-btn" onClick={() => applyAll({ count: n })}>{n} paper{n > 1 ? 's' : ''}</button>)}
                {[60, 90, 120, 180].map(m => <button key={m} type="button" className="exam-day-btn" onClick={() => applyAll({ duration: m })}>{m} min</button>)}
              </div>
              {subjects.length === 0
                ? <div className="wiz-info-banner">No subjects yet — add them on the Subjects page first, then come back.</div>
                : (
                  <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th>Subject</th><th>Papers</th><th>Minutes each</th><th>Practical</th><th>Already set</th></tr></thead>
                      <tbody>
                        {subjects.map(s => {
                          const p = planOf(s)
                          return (
                            <tr key={s.id}>
                              <td><strong>{s.name}</strong> <span style={{ color: 'var(--muted)', fontSize: 11 }}>Gr {s.grade_level}</span></td>
                              <td><select className="form-select" style={{ width: 70, padding: '4px 8px' }} value={p.count}
                                onChange={e => setPlanFor(s, { count: +e.target.value })}>
                                {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></td>
                              <td><input type="number" className="form-input" style={{ width: 90, padding: '4px 8px' }} min={30} max={300} step={15}
                                value={p.duration} onChange={e => setPlanFor(s, { duration: e.target.value })} /></td>
                              <td><input type="checkbox" checked={p.practical} onChange={e => setPlanFor(s, { practical: e.target.checked })} /></td>
                              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{existingOf(s.id).length} paper(s)</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              <div className="form-hint" style={{ marginTop: 8 }}>Existing papers are never deleted or changed here — only missing ones are added. "Practical" applies to newly created papers.</div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step-content">
              <div className="wizard-form-grid">
                <div>
                  <div className="wiz-label" style={{ marginBottom: 6 }}>Supervisors <span className="badge badge-blue">{supervisors.length}</span></div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input className="wiz-input" placeholder="Name" value={sup.name} onChange={e => setSup(s => ({ ...s, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSup()} />
                    <button className="btn btn-accent btn-sm" onClick={addSup}><Plus size={13} /></button>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={allTeachers}><UserPlus size={13} /> Add all teachers</button>
                </div>
                <div>
                  <div className="wiz-label" style={{ marginBottom: 6 }}>Rooms <span className="badge badge-blue">{rooms.length}</span></div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input className="wiz-input" placeholder="Room name" value={room.name} onChange={e => setRoom(r => ({ ...r, name: e.target.value }))} />
                    <input className="wiz-input" type="number" style={{ width: 80 }} title="Seats" value={room.capacity} onChange={e => setRoom(r => ({ ...r, capacity: e.target.value }))} />
                    <button className="btn btn-accent btn-sm" onClick={addRoom}><Plus size={13} /></button>
                  </div>
                </div>
              </div>
              <div className="wiz-info-banner" style={{ marginTop: 12 }}>
                <span>Need to import a list or set each person's available days? <a href="#" onClick={e => { e.preventDefault(); onOpenResources() }}>Open the full Supervisors &amp; Rooms page</a>.
                  Supervisors and rooms are optional now — you can also assign them one by one on the timetable.</span>
              </div>
            </div>
          )}

          {step === 4 && session && (
            <ExamGenerateForm session={session} subjects={subjects} classes={classes} papersData={papersData}
              supervisors={supervisors} rooms={rooms} onGenerated={() => onFinished(session.id)} />
          )}

          {step < 4 && (
            <div className="wizard-footer">
              {step > 1 && <button className="btn btn-secondary" onClick={() => setStep(step - 1)}><ChevronLeft size={15} /> Back</button>}
              <button className="btn btn-accent" disabled={busy}
                onClick={step === 1 ? next1 : step === 2 ? next2 : () => setStep(4)}>
                {busy ? <><Loader2 size={14} className="spinning" /> Working…</> : <>{step === 3 ? 'Continue' : 'Save & continue'} <ChevronRight size={15} /></>}
              </button>
            </div>
          )}
          {step === 4 && (
            <div className="wizard-footer" style={{ justifyContent: 'flex-start' }}>
              <button className="btn btn-secondary" onClick={() => setStep(3)}><ChevronLeft size={15} /> Back</button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
