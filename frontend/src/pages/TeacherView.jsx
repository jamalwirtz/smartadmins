import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { teachersAPI, schedulesAPI, exportAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  Download, Send, Users, User, BarChart2,
  AlertTriangle, CheckCircle, Clock, ChevronDown,
  Eye, EyeOff, X
} from 'lucide-react'

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const PERIODS = [1,2,3,4,5,6,7,8]

// Colour palette for multi-teacher comparison
const TEACHER_COLORS = [
  '#2952a3','#0d9488','#d97706','#7c3aed','#dc2626',
  '#0891b2','#16a34a','#c2410c','#7e22ce','#0369a1',
]

function pct(used, max) {
  if (!max) return 0
  return Math.min(100, Math.round((used / max) * 100))
}

// ── Single teacher grid ──────────────────────────────────────────────────────
function SingleGrid({ schedule, periods = PERIODS }) {
  const slotMap = {}
  schedule.schedule.forEach(s => { slotMap[`${s.day}-${s.period}`] = s })
  const used = pct(schedule.total_periods, schedule.max_weekly_hours)

  return (
    <div className="tv-single-wrap">
      {/* Stats row */}
      <div className="tv-stats-row">
        <div className="tv-stat">
          <span className="tv-stat-val">{schedule.total_periods}</span>
          <span className="tv-stat-lbl">Periods</span>
        </div>
        <div className="tv-stat">
          <span className="tv-stat-val">{schedule.remaining_capacity}</span>
          <span className="tv-stat-lbl">Remaining</span>
        </div>
        <div className="tv-stat">
          <span className="tv-stat-val"
            style={{ color: used > 90 ? '#ef4444' : used > 70 ? '#f59e0b' : '#10b981' }}>
            {used}%
          </span>
          <span className="tv-stat-lbl">Workload</span>
        </div>
      </div>

      {/* Workload bar */}
      <div className="tv-workload-bar">
        <div className="tv-workload-fill"
          style={{
            width: `${used}%`,
            background: used > 90 ? '#ef4444' : used > 70 ? '#f59e0b' : '#10b981',
          }}/>
      </div>

      {/* Grid */}
      <div className="tv-grid-scroll">
        <table className="tv-table">
          <thead>
            <tr>
              <th className="tv-th-period">Period</th>
              {DAYS.map(d => <th key={d} className="tv-th-day">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p}>
                <td className="tv-td-period">P{p}</td>
                {DAYS.map(d => {
                  const s = slotMap[`${d}-${p}`]
                  return (
                    <td key={d} className="tv-td">
                      {s ? (
                        <div className="tv-cell occupied">
                          <div className="tv-cell-subj">{s.subject}</div>
                          <div className="tv-cell-class">{s.class}</div>
                          {s.is_locked && <span className="tv-cell-lock">🔒</span>}
                        </div>
                      ) : (
                        <div className="tv-cell free" />
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
  )
}

// ── Comparison grid — all teachers overlaid ──────────────────────────────────
function ComparisonGrid({ schedules, teacherColors, periods = PERIODS }) {
  // Build a map: {day-period: [{teacherName, subject, class, color}]}
  const grid = {}
  DAYS.forEach(d => PERIODS.forEach(p => { grid[`${d}-${p}`] = [] }))

  schedules.forEach((sch, i) => {
    const color = teacherColors[i] || TEACHER_COLORS[i % TEACHER_COLORS.length]
    sch.schedule.forEach(s => {
      const key = `${s.day}-${s.period}`
      if (grid[key]) grid[key].push({
        teacher: sch.teacher,
        initials: sch.initials || sch.teacher?.split(' ').map(w=>w[0]).join('').slice(0,2),
        subject: s.subject,
        cls:     s.class,
        color,
      })
    })
  })

  // Find conflicts (same day+period has >1 teacher — they can teach different classes)
  // Real conflict = same teacher in 2 classes (shouldn't happen but flag it)
  const conflicts = Object.entries(grid).filter(([,slots]) => {
    const teachers = slots.map(s=>s.teacher)
    return new Set(teachers).size < teachers.length
  })

  return (
    <div className="tv-compare-wrap">
      {/* Conflict alert */}
      {conflicts.length > 0 && (
        <div className="tv-conflict-banner">
          <AlertTriangle size={14}/>
          {conflicts.length} potential conflict{conflicts.length!==1?'s':''} detected — same teacher double-booked
        </div>
      )}

      {/* Legend */}
      <div className="tv-legend">
        {schedules.map((sch, i) => (
          <span key={sch.teacher} className="tv-legend-item">
            <span className="tv-legend-dot"
              style={{ background: teacherColors[i] || TEACHER_COLORS[i % TEACHER_COLORS.length] }}/>
            {sch.teacher}
            <span className="tv-legend-periods">({sch.total_periods}p)</span>
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="tv-grid-scroll">
        <table className="tv-table">
          <thead>
            <tr>
              <th className="tv-th-period">Period</th>
              {DAYS.map(d => <th key={d} className="tv-th-day">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p}>
                <td className="tv-td-period">P{p}</td>
                {DAYS.map(d => {
                  const slots = grid[`${d}-${p}`] || []
                  const isConflict = new Set(slots.map(s=>s.teacher)).size < slots.map(s=>s.teacher).length
                  return (
                    <td key={d} className="tv-td">
                      {slots.length === 0 ? (
                        <div className="tv-cell free"/>
                      ) : (
                        <div className={`tv-compare-cell${isConflict?' conflict':''}`}>
                          {slots.map((sl, si) => (
                            <div key={si} className="tv-compare-slot"
                              style={{ borderLeft: `3px solid ${sl.color}`, background: `${sl.color}14` }}
                              title={`${sl.teacher}: ${sl.subject} — ${sl.cls}`}>
                              <span className="tv-compare-init" style={{ color: sl.color }}>
                                {sl.initials}
                              </span>
                              <span className="tv-compare-subj">{sl.subject}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Workload comparison bars */}
      <div className="tv-workload-compare">
        <div className="tv-workload-compare-title">
          <BarChart2 size={14}/> Workload Comparison
        </div>
        {schedules.map((sch, i) => {
          const u = pct(sch.total_periods, sch.max_weekly_hours)
          const color = teacherColors[i] || TEACHER_COLORS[i % TEACHER_COLORS.length]
          return (
            <div key={sch.teacher} className="tv-workload-row">
              <div className="tv-workload-name" style={{ color }}>
                {sch.teacher}
              </div>
              <div className="tv-workload-track">
                <motion.div className="tv-workload-fill"
                  style={{ background: color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${u}%` }}
                  transition={{ duration: 0.6, delay: i * 0.08 }}/>
              </div>
              <div className="tv-workload-pct"
                style={{ color: u > 90 ? '#ef4444' : u > 70 ? '#f59e0b' : 'var(--muted)' }}>
                {sch.total_periods}/{sch.max_weekly_hours} · {u}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TeacherView() {
  const [view,            setView]            = useState('single')  // 'single' | 'compare'
  const [teachers,        setTeachers]        = useState([])
  const [drafts,          setDrafts]          = useState([])
  const [selectedDraft,   setSelectedDraft]   = useState('')
  // Single view
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [schedule,        setSchedule]        = useState(null)
  const [emailModal,      setEmailModal]      = useState(false)
  const [customMsg,       setCustomMsg]       = useState('')
  const [sending,         setSending]         = useState(false)
  // Compare view
  const [selectedForCompare, setSelectedForCompare] = useState([])
  const [compareSchedules,   setCompareSchedules]   = useState([])
  const [loadingCompare,     setLoadingCompare]     = useState(false)
  const [teacherColors,      setTeacherColors]      = useState({})

  useEffect(() => {
    Promise.all([teachersAPI.list(), schedulesAPI.drafts()]).then(([t, d]) => {
      setTeachers(t.data)
      setDrafts(d.data)
      const active = d.data.find(x => x.status === 'active')
      if (active) setSelectedDraft(active.id)
      // Assign colours to teachers upfront
      const colors = {}
      t.data.forEach((teacher, i) => {
        colors[teacher.id] = TEACHER_COLORS[i % TEACHER_COLORS.length]
      })
      setTeacherColors(colors)
    })
  }, [])

  // Single view load
  useEffect(() => {
    if (!selectedTeacher || !selectedDraft || view !== 'single') return
    teachersAPI.schedule(selectedTeacher, selectedDraft)
      .then(r => setSchedule(r.data))
      .catch(() => setSchedule(null))
  }, [selectedTeacher, selectedDraft, view])

  // Compare view load
  const loadComparison = useCallback(async () => {
    if (!selectedDraft || selectedForCompare.length === 0) {
      setCompareSchedules([]); return
    }
    setLoadingCompare(true)
    try {
      const results = await Promise.all(
        selectedForCompare.map(tid =>
          teachersAPI.schedule(tid, selectedDraft).then(r => r.data).catch(() => null)
        )
      )
      setCompareSchedules(results.filter(Boolean))
    } catch { toast.error('Failed to load comparison') }
    finally { setLoadingCompare(false) }
  }, [selectedForCompare, selectedDraft])

  useEffect(() => {
    if (view === 'compare') loadComparison()
  }, [view, loadComparison])

  const toggleCompare = (tid) => {
    setSelectedForCompare(prev =>
      prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid]
    )
  }

  const selectAll = () => setSelectedForCompare(teachers.map(t => t.id))
  const clearAll  = () => setSelectedForCompare([])

  const downloadPdf = async () => {
    try {
      const r = await exportAPI.teacherPdf(selectedTeacher, selectedDraft)
      const url = URL.createObjectURL(new Blob([r.data], { type:'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `schedule_${schedule?.teacher}.pdf`; a.click()
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
      toast.error(e.response?.data?.detail || 'Email failed')
    } finally { setSending(false) }
  }

  const colorArr = selectedForCompare.map(tid => teacherColors[tid] || '#6366f1')

  return (
    <div className="page-container">
      {/* ── Page header ── */}
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Teacher Schedules</h1>
          <p className="page-subtitle">
            {view === 'single' ? 'View individual weekly timetables' : 'Compare multiple teachers side-by-side'}
          </p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* View toggle */}
          <div className="tv-view-toggle">
            <button className={`tv-toggle-btn${view==='single'?' active':''}`}
              onClick={() => setView('single')}>
              <User size={14}/> Single View
            </button>
            <button className={`tv-toggle-btn${view==='compare'?' active':''}`}
              onClick={() => setView('compare')}>
              <Users size={14}/> Compare All
            </button>
          </div>
          {/* Draft selector */}
          <select className="tv-draft-select" value={selectedDraft}
            onChange={e => setSelectedDraft(e.target.value)}>
            <option value="">— Select Draft —</option>
            {drafts.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} {d.status === 'active' ? '✓' : ''}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          SINGLE VIEW
      ══════════════════════════════════════════════ */}
      {view === 'single' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}}>
          {/* Teacher selector */}
          <div className="card tv-teacher-selector">
            <label className="form-label">Select Teacher</label>
            <div className="tv-teacher-chips">
              {teachers.map(t => (
                <button key={t.id}
                  className={`tv-teacher-chip${selectedTeacher===t.id?' active':''}`}
                  style={selectedTeacher===t.id ? {
                    borderColor: teacherColors[t.id],
                    background: `${teacherColors[t.id]}18`,
                    color: teacherColors[t.id],
                  } : {}}
                  onClick={() => setSelectedTeacher(t.id)}>
                  <span className="tv-chip-avatar"
                    style={{ background: teacherColors[t.id] || '#6366f1' }}>
                    {t.initials || t.name.slice(0,2).toUpperCase()}
                  </span>
                  <div className="tv-chip-info">
                    <div className="tv-chip-name">{t.name}</div>
                    <div className="tv-chip-meta">
                      {t.is_part_time ? 'Part-time' : 'Full-time'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          {schedule && selectedDraft ? (
            <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
              <div className="tv-single-header">
                <div>
                  <h2 className="tv-teacher-title">{schedule.teacher}</h2>
                  <div className="tv-teacher-subtitle">
                    {schedule.total_periods} periods · {schedule.remaining_capacity} free slots
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button className="btn btn-secondary btn-sm" onClick={downloadPdf}>
                    <Download size={13}/> PDF
                  </button>
                  {schedule.email && (
                    <button className="btn btn-accent btn-sm" onClick={() => setEmailModal(true)}>
                      <Send size={13}/> Email
                    </button>
                  )}
                </div>
              </div>
              <SingleGrid schedule={schedule}/>
            </motion.div>
          ) : selectedTeacher && selectedDraft ? (
            <div className="exam-empty">
              <Clock size={36} style={{color:'var(--muted)'}}/>
              <p style={{color:'var(--muted)'}}>No schedule data found for this teacher in the selected draft.</p>
            </div>
          ) : (
            <div className="exam-empty">
              <User size={36} style={{color:'var(--muted)'}}/>
              <p style={{color:'var(--muted)'}}>Select a teacher and draft above.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════
          COMPARE VIEW
      ══════════════════════════════════════════════ */}
      {view === 'compare' && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}}>
          {/* Teacher multi-selector */}
          <div className="card tv-teacher-selector">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <label className="form-label" style={{margin:0}}>
                Select Teachers to Compare ({selectedForCompare.length} selected)
              </label>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={selectAll}>All</button>
                <button className="btn btn-secondary btn-sm" onClick={clearAll}>None</button>
                <button className="btn btn-accent btn-sm" onClick={loadComparison}
                  disabled={loadingCompare || !selectedDraft}>
                  {loadingCompare ? 'Loading…' : 'Compare'}
                </button>
              </div>
            </div>
            <div className="tv-teacher-chips">
              {teachers.map((t,i) => {
                const isSelected = selectedForCompare.includes(t.id)
                const color      = teacherColors[t.id] || TEACHER_COLORS[i % TEACHER_COLORS.length]
                return (
                  <button key={t.id}
                    className={`tv-teacher-chip${isSelected?' active':''}`}
                    style={isSelected ? {
                      borderColor: color,
                      background: `${color}18`,
                      color: color,
                    } : {}}
                    onClick={() => toggleCompare(t.id)}>
                    <span className="tv-chip-avatar" style={{ background: color }}>
                      {t.initials || t.name.slice(0,2).toUpperCase()}
                    </span>
                    <div className="tv-chip-info">
                      <div className="tv-chip-name">{t.name}</div>
                      <div className="tv-chip-meta">{t.is_part_time ? 'PT' : 'FT'}</div>
                    </div>
                    {isSelected && (
                      <CheckCircle size={12} style={{marginLeft:'auto',color}}/>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Comparison grid */}
          {loadingCompare ? (
            <div className="exam-loader">
              <motion.div className="exam-loader-ring"
                animate={{rotate:360}} transition={{duration:1,repeat:Infinity,ease:'linear'}}/>
              <span className="exam-loader-text">Loading comparison…</span>
            </div>
          ) : compareSchedules.length > 0 ? (
            <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
              <ComparisonGrid
                schedules={compareSchedules}
                teacherColors={colorArr}/>
            </motion.div>
          ) : selectedForCompare.length > 0 ? (
            <div className="exam-empty">
              <BarChart2 size={36} style={{color:'var(--muted)'}}/>
              <p style={{color:'var(--muted)'}}>Click Compare to load schedules.</p>
            </div>
          ) : (
            <div className="exam-empty">
              <Users size={36} style={{color:'var(--muted)'}}/>
              <p style={{color:'var(--muted)'}}>Select at least 2 teachers to compare.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Email modal */}
      <AnimatePresence>
        {emailModal && (
          <motion.div className="exam-modal-backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            onClick={() => setEmailModal(false)}>
            <motion.div className="exam-modal" style={{maxWidth:480}}
              initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}}
              exit={{opacity:0,scale:.95}}
              onClick={e => e.stopPropagation()}>
              <div className="exam-modal-header">
                <div>
                  <h2 className="exam-modal-title">Email Schedule</h2>
                  <p className="exam-modal-sub">
                    Sending to <strong>{schedule?.teacher}</strong> at {schedule?.email}
                  </p>
                </div>
                <button className="exam-modal-close" onClick={() => setEmailModal(false)}>
                  <X size={16}/>
                </button>
              </div>
              <div style={{padding:'18px 22px'}}>
                <div className="form-group">
                  <label className="form-label">Optional Message</label>
                  <textarea className="form-input" rows={4} value={customMsg}
                    onChange={e => setCustomMsg(e.target.value)}
                    placeholder="Add a personal note to the email…"
                    style={{resize:'vertical',fontFamily:'inherit'}}/>
                </div>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
                  <button className="btn btn-secondary" onClick={() => setEmailModal(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-accent" onClick={sendEmail} disabled={sending}>
                    <Send size={14}/> {sending ? 'Sending…' : 'Send Email'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
