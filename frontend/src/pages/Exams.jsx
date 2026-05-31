import AIAssistant from '../components/AIAssistant'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Calendar, ArrowLeft, Check, X, Lock, Unlock,
  BookOpen, Clock, CheckCircle2, RefreshCw, Play,
  Download, FileSpreadsheet, FileText, Trash2,
  Layers, ChevronDown, AlertTriangle, Info,
  GraduationCap, FlaskConical, Zap
} from 'lucide-react'
import toast from 'react-hot-toast'
import { examsAPI, subjectsAPI, classesAPI, teachersAPI,
         exportAPI, templatesAPI } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']

const STATUS = {
  draft:     { bg:'rgba(99,102,241,.13)',  text:'#818cf8', dot:'#6366f1', label:'Draft'     },
  published: { bg:'rgba(16,185,129,.13)',  text:'#34d399', dot:'#10b981', label:'Published' },
  completed: { bg:'rgba(107,114,128,.13)', text:'#9ca3af', dot:'#6b7280', label:'Completed' },
}

// ── Tiny reusable components ──────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.draft
  return (
    <span className="exam-badge" style={{ background: s.bg, color: s.text }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: s.dot,
        display:'inline-block', marginRight:5 }} />
      {s.label}
    </span>
  )
}

const Loader = ({ text = 'Loading…' }) => (
  <div className="exam-loader">
    <motion.div className="exam-loader-ring"
      animate={{ rotate: 360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }} />
    <span className="exam-loader-text">{text}</span>
  </div>
)

const EmptyState = ({ icon: Icon, title, body, action, onAction }) => (
  <motion.div className="exam-empty" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
    <div className="exam-empty-icon"><Icon size={36} /></div>
    <h3 className="exam-empty-title">{title}</h3>
    <p className="exam-empty-body">{body}</p>
    {action && (
      <button className="btn btn-accent" onClick={onAction}>
        <Plus size={14} /> {action}
      </button>
    )}
  </motion.div>
)

// Download helper
const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Exams() {
  // navigation
  const [view,    setView]    = useState('list')  // list | papers | session
  const [active,  setActive]  = useState(null)

  // data
  const [sessions,   setSessions]   = useState([])
  const [subjects,   setSubjects]   = useState([])
  const [classes,    setClasses]    = useState([])
  const [papersData, setPapersData] = useState([])
  const [examTpls,   setExamTpls]   = useState([])
  const [ttTpls,     setTtTpls]     = useState([])

  // UI state
  const [loading,       setLoading]       = useState(true)
  const [exporting,     setExporting]     = useState(null)     // 'pdf'|'xlsx'
  const [showCreate,    setShowCreate]    = useState(false)
  const [showGenerate,  setShowGenerate]  = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showPaperFor,  setShowPaperFor]  = useState(null)
  const [applyingTpl,   setApplyingTpl]   = useState(false)

  // forms
  const [createForm, setCreateForm] = useState({
    name:'', start_date:'', end_date:'', description:''
  })
  const [genForm, setGenForm] = useState({
    subject_ids:[], class_ids:[], start_period:1, max_per_day:1,
    school_days:[...DAYS],
  })
  const [tplApplyForm, setTplApplyForm] = useState({
    template_id:'', session_name:'', start_date:'', end_date:'',
    class_ids:[], subject_ids:[],
  })

  // ── loaders ─────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const r = await examsAPI.listSessions()
      setSessions(r.data)
    } catch { toast.error('Could not load exam sessions') }
    finally { setLoading(false) }
  }, [])

  const loadSession = useCallback(async (id) => {
    setLoading(true)
    try {
      const r = await examsAPI.getSession(id)
      setActive(r.data)
    } catch { toast.error('Could not load session') }
    finally { setLoading(false) }
  }, [])

  const loadSupport = useCallback(async () => {
    try {
      const [s, c, p, et] = await Promise.all([
        subjectsAPI.list(), classesAPI.list(),
        examsAPI.allPapers(), templatesAPI.examTemplates(),
      ])
      setSubjects(s.data); setClasses(c.data)
      setPapersData(p.data); setExamTpls(et.data)
      setGenForm(f => ({
        ...f,
        subject_ids: s.data.map(x => x.id),
        class_ids:   c.data.map(x => x.id),
      }))
      setTplApplyForm(f => ({
        ...f,
        class_ids:   c.data.map(x => x.id),
        subject_ids: s.data.map(x => x.id),
      }))
    } catch { toast.error('Could not load support data') }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])
  useEffect(() => { if (view !== 'list') loadSupport() }, [view, loadSupport])

  // ── actions ──────────────────────────────────────────────────────────────
  const handleCreateSession = async (e) => {
    e.preventDefault()
    if (!createForm.name.trim()) return toast.error('Session name required')
    if (!createForm.start_date || !createForm.end_date) return toast.error('Dates required')
    if (createForm.start_date > createForm.end_date) return toast.error('End must be after start')
    try {
      await examsAPI.createSession(createForm)
      toast.success('Session created ✅')
      setShowCreate(false)
      setCreateForm({ name:'', start_date:'', end_date:'', description:'' })
      loadSessions()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Create failed') }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this session and all its slots?')) return
    try {
      await examsAPI.deleteSession(id)
      toast.success('Deleted')
      loadSessions()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const handlePublish = async (id, status) => {
    const next = status === 'draft' ? 'published' : 'draft'
    try {
      await examsAPI.updateSession(id, { status: next })
      toast.success(`Session ${next}`)
      active ? loadSession(active.id) : loadSessions()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Update failed') }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    if (!genForm.subject_ids.length) return toast.error('Select at least one subject')
    if (!genForm.class_ids.length)   return toast.error('Select at least one class')
    if (!genForm.school_days.length) return toast.error('Select at least one day')
    try {
      const r = await examsAPI.generateSlots(active.id, genForm)
      toast.success(r.data.message || `Created ${r.data.slots_created} slots ✅`, { duration:4000 })
      setShowGenerate(false)
      loadSession(active.id)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Generation failed', { duration:6000 }) }
  }

  const handleApplyTemplate = async (e) => {
    e.preventDefault()
    if (!tplApplyForm.template_id)   return toast.error('Pick a template')
    if (!tplApplyForm.start_date)    return toast.error('Start date required')
    if (!tplApplyForm.end_date)      return toast.error('End date required')
    if (!tplApplyForm.class_ids.length) return toast.error('Select classes')
    setApplyingTpl(true)
    try {
      const r = await templatesAPI.applyExamTemplate(tplApplyForm)
      toast.success(`Session created with ${r.data.papers_added} papers pre-configured ✅`, { duration:5000 })
      setShowTemplates(false)
      // Auto-navigate to the new session
      await loadSession(r.data.session_id)
      setView('session')
      // Pre-fill the generate form with the template's payload
      setGenForm(r.data.generate_payload)
      setShowGenerate(true)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Apply failed') }
    finally { setApplyingTpl(false) }
  }

  const handleAddPaper = async (subjectId, data) => {
    try {
      await examsAPI.addPaper(subjectId, data)
      toast.success(`Paper ${data.paper_number} added ✅`)
      const u = await examsAPI.allPapers()
      setPapersData(u.data); setShowPaperFor(null)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Add paper failed') }
  }

  const handleDeletePaper = async (paperId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this paper? Scheduled slots using it will also be removed.')) return
    try {
      await examsAPI.deletePaper(paperId)
      toast.success('Paper deleted')
      const u = await examsAPI.allPapers()
      setPapersData(u.data)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const handleLock = async (slotId, lock) => {
    try {
      await examsAPI.updateSlot(slotId, { is_locked: lock })
      loadSession(active.id)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Update failed') }
  }

  const handleDeleteSlot = async (slotId) => {
    try {
      await examsAPI.deleteSlot(slotId)
      loadSession(active.id)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Cannot delete locked slot') }
  }

  const handleValidate = async () => {
    try {
      const r = await examsAPI.validateSession(active.id)
      const { errors, warnings } = r.data
      if (!errors.length && !warnings.length) {
        toast.success(`All clear — ${r.data.total_slots} slots, no issues ✅`, { duration:4000 })
      } else {
        errors.forEach(e => toast.error(e, { duration:7000 }))
        warnings.forEach(w => toast(`⚠️  ${w}`, { duration:5000 }))
      }
    } catch { toast.error('Validation failed') }
  }

  const handleExport = async (format) => {
    if (!active) return
    setExporting(format)
    try {
      const r = format === 'pdf'
        ? await exportAPI.examPdf(active.id)
        : await exportAPI.examXlsx(active.id)
      const ext  = format === 'pdf' ? 'pdf' : 'xlsx'
      const name = active.name.replace(/\s+/g, '_').replace(/[/\\]/g, '-')
      triggerDownload(r.data, `exam_${name}.${ext}`)
      toast.success(`Exported as ${ext.toUpperCase()} ✅`)
    } catch { toast.error('Export failed — ensure the backend is running') }
    finally { setExporting(null) }
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  const toggleId = (arr, id) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  const buildGrid = (slots = []) => {
    const g = {}
    DAYS.forEach(d => { g[d] = {} })
    slots.forEach(sl => {
      if (!g[sl.day]) g[sl.day] = {}
      g[sl.day][sl.period] = g[sl.day][sl.period] || []
      g[sl.day][sl.period].push(sl)
    })
    return g
  }

  const periods = active
    ? [...new Set((active.slots || []).map(s => s.period))].sort((a,b) => a-b)
    : []

  // ────────────────────────────────────────────────────────────────────────────
  // VIEW: LIST
  // ────────────────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="page-container">

      {/* ── Page header ── */}
      <motion.div className="exam-page-header"
        initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div>
          <h1 className="page-title">Exam Timetables</h1>
          <p className="page-subtitle">Create and manage conflict-free exam schedules</p>
        </div>
        <div className="exam-header-actions">
          <button className="btn btn-secondary" onClick={() => { setView('papers'); loadSupport() }}>
            <BookOpen size={14}/> Manage Papers
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowTemplates(true); loadSupport() }}>
            <Layers size={14}/> From Template
          </button>
          <button className="btn btn-accent" onClick={() => setShowCreate(true)}>
            <Plus size={14}/> New Session
          </button>
        </div>
      </motion.div>

      {/* ── Template picker modal ── */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div className="exam-modal-backdrop"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setShowTemplates(false)}>
            <motion.div className="exam-modal"
              initial={{ opacity:0, scale:.96, y:20 }}
              animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:.96, y:20 }}
              onClick={e => e.stopPropagation()}>

              <div className="exam-modal-header">
                <div>
                  <h2 className="exam-modal-title">Exam Templates</h2>
                  <p className="exam-modal-sub">Pick a template to pre-configure your exam session</p>
                </div>
                <button className="exam-modal-close" onClick={() => setShowTemplates(false)}>
                  <X size={18}/>
                </button>
              </div>

              {/* Template grid */}
              <div className="exam-tpl-grid">
                {examTpls.map(tpl => (
                  <motion.button
                    key={tpl.id}
                    className={`exam-tpl-card${tplApplyForm.template_id === tpl.id ? ' selected' : ''}`}
                    whileHover={{ y:-2 }} whileTap={{ scale:.98 }}
                    onClick={() => setTplApplyForm(f => ({
                      ...f, template_id: tpl.id,
                      session_name: tpl.config.suggested_name || tpl.name,
                    }))}>
                    <div className="exam-tpl-icon">{tpl.icon}</div>
                    <div className="exam-tpl-name">{tpl.name}</div>
                    <div className="exam-tpl-desc">{tpl.description}</div>
                    <div className="exam-tpl-pills">
                      <span className="exam-tpl-pill">{tpl.config.duration_days}d</span>
                      <span className="exam-tpl-pill">{tpl.config.papers_per_subject}p/subj</span>
                      <span className="exam-tpl-pill">max {tpl.config.max_per_day}/day</span>
                    </div>
                    {tplApplyForm.template_id === tpl.id && (
                      <div className="exam-tpl-check"><Check size={12}/></div>
                    )}
                  </motion.button>
                ))}
              </div>

              {/* Apply form */}
              {tplApplyForm.template_id && (
                <motion.form className="exam-tpl-apply-form"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  onSubmit={handleApplyTemplate}>
                  <div className="exam-tpl-apply-row">
                    <div className="form-group">
                      <label className="form-label">Session Name</label>
                      <input className="form-input" value={tplApplyForm.session_name}
                        onChange={e => setTplApplyForm(f=>({...f,session_name:e.target.value}))}
                        placeholder="e.g. June 2024 Finals" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Start Date</label>
                      <input type="date" className="form-input" value={tplApplyForm.start_date}
                        onChange={e => setTplApplyForm(f=>({...f,start_date:e.target.value}))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date</label>
                      <input type="date" className="form-input" value={tplApplyForm.end_date}
                        onChange={e => setTplApplyForm(f=>({...f,end_date:e.target.value}))} />
                    </div>
                  </div>
                  <div className="exam-tpl-apply-row">
                    <div className="form-group">
                      <label className="form-label">Classes ({tplApplyForm.class_ids.length} selected)</label>
                      <div className="exam-check-list">
                        {classes.map(c => (
                          <label key={c.id} className="exam-check-item">
                            <input type="checkbox"
                              checked={tplApplyForm.class_ids.includes(c.id)}
                              onChange={() => setTplApplyForm(f=>({
                                ...f, class_ids: toggleId(f.class_ids, c.id)
                              }))} />
                            <span>{c.name}</span>
                            <span className="exam-check-meta">Gr{c.grade_level}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Subjects ({tplApplyForm.subject_ids.length} selected)</label>
                      <div className="exam-check-list">
                        {subjects.map(s => (
                          <label key={s.id} className="exam-check-item">
                            <input type="checkbox"
                              checked={tplApplyForm.subject_ids.includes(s.id)}
                              onChange={() => setTplApplyForm(f=>({
                                ...f, subject_ids: toggleId(f.subject_ids, s.id)
                              }))} />
                            <span>{s.name}</span>
                            <span className="exam-check-meta">Gr{s.grade_level}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button type="button" className="btn btn-secondary"
                      onClick={() => setShowTemplates(false)}>Cancel</button>
                    <button type="submit" className="btn btn-accent" disabled={applyingTpl}>
                      {applyingTpl
                        ? <><div className="login-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Applying…</>
                        : <><Zap size={14}/> Apply Template</>}
                    </button>
                  </div>
                </motion.form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Create form ── */}
      <AnimatePresence>
        {showCreate && (
          <motion.div className="card exam-create-card"
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
            <h3 className="card-title" style={{ marginBottom:16 }}>New Exam Session</h3>
            <form onSubmit={handleCreateSession}>
              <div className="exam-create-grid">
                <div className="form-group">
                  <label className="form-label">Session Name *</label>
                  <input className="form-input" value={createForm.name} autoFocus
                    onChange={e => setCreateForm(f=>({...f,name:e.target.value}))}
                    placeholder="e.g. June 2024 Final Exams" />
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-input" value={createForm.start_date}
                    onChange={e => setCreateForm(f=>({...f,start_date:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-input" value={createForm.end_date}
                    onChange={e => setCreateForm(f=>({...f,end_date:e.target.value}))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">Description (optional)</label>
                <input className="form-input" value={createForm.description}
                  onChange={e => setCreateForm(f=>({...f,description:e.target.value}))}
                  placeholder="e.g. End of term exams for all classes" />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button type="submit" className="btn btn-accent">
                  <Check size={14}/> Create Session
                </button>
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowCreate(false)}>
                  <X size={14}/> Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sessions list ── */}
      {loading ? <Loader /> : sessions.length === 0 ? (
        <EmptyState icon={Calendar} title="No exam sessions yet"
          body="Start from a template or create a blank session"
          action="Create Session" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="exam-session-grid">
          {sessions.map((s, i) => (
            <motion.div key={s.id} className="exam-session-card"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => { loadSession(s.id); setView('session'); loadSupport() }}>

              <div className="exam-session-card-top">
                <div>
                  <div className="exam-session-name">{s.name}</div>
                  <div className="exam-session-dates">
                    <Calendar size={11}/> {s.start_date} → {s.end_date}
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>

              <div className="exam-session-stats">
                <div className="exam-stat">
                  <span className="exam-stat-val">{s.slot_count}</span>
                  <span className="exam-stat-lbl">Slots</span>
                </div>
              </div>

              <div className="exam-session-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-secondary"
                  onClick={() => { loadSession(s.id); setView('session'); loadSupport() }}>
                  <Calendar size={12}/> Open
                </button>
                <button className="btn btn-sm btn-secondary"
                  onClick={() => handlePublish(s.id, s.status)}>
                  {s.status === 'draft'
                    ? <><Check size={12}/> Publish</>
                    : <><ArrowLeft size={12}/> Unpublish</>}
                </button>
                <button className="exam-delete-btn" onClick={e => handleDelete(s.id, e)}>
                  <Trash2 size={13}/>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // VIEW: PAPERS CONFIG
  // ────────────────────────────────────────────────────────────────────────────
  if (view === 'papers') return (
    <div className="page-container">
      <motion.div className="exam-page-header"
        initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('list')}>
            <ArrowLeft size={14}/>
          </button>
          <div>
            <h1 className="page-title">Exam Papers</h1>
            <p className="page-subtitle">Configure up to 6 papers per subject</p>
          </div>
        </div>
      </motion.div>

      {papersData.length === 0 ? <Loader /> : (
        <div className="exam-papers-grid">
          {papersData.map((subj, i) => (
            <motion.div key={subj.subject_id} className="exam-paper-card"
              initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
              transition={{ delay: i * 0.04 }}>

              <div className="exam-paper-card-head">
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div className="exam-subject-dot"
                    style={{ background: subj.color_hex || '#6366f1' }} />
                  <div>
                    <div className="exam-subject-name">{subj.subject_name}</div>
                    <div className="exam-subject-grade">Grade {subj.grade_level}</div>
                  </div>
                </div>
                <span className="exam-paper-count">
                  {subj.papers.length}/6 papers
                </span>
              </div>

              <div className="exam-paper-list">
                {subj.papers.length === 0
                  ? <div className="exam-no-papers">No papers yet — add Paper 1 to start</div>
                  : subj.papers.map(p => (
                    <div key={p.id} className="exam-paper-item">
                      <div className="exam-paper-item-left">
                        <span className="exam-paper-num">Paper {p.paper_number}</span>
                        {p.is_practical && (
                          <span className="exam-practical-tag">
                            <FlaskConical size={9}/> Practical
                          </span>
                        )}
                      </div>
                      <div className="exam-paper-item-right">
                        <Clock size={11}/> {p.duration}min
                        <button className="exam-paper-del"
                          onClick={e => handleDeletePaper(p.id, e)}>
                          <X size={11}/>
                        </button>
                      </div>
                    </div>
                  ))
                }
              </div>

              {showPaperFor === subj.subject_id ? (
                <PaperAddForm
                  existing={subj.papers.map(p => p.paper_number)}
                  onAdd={data => handleAddPaper(subj.subject_id, data)}
                  onCancel={() => setShowPaperFor(null)} />
              ) : subj.papers.length < 6 ? (
                <button className="exam-add-paper-btn"
                  onClick={() => setShowPaperFor(subj.subject_id)}>
                  <Plus size={13}/> Add Paper {subj.papers.length + 1}
                </button>
              ) : (
                <div className="exam-max-papers">Max 6 papers reached</div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // VIEW: SESSION DETAIL + TIMETABLE GRID
  // ────────────────────────────────────────────────────────────────────────────
  if (!active) return <Loader text="Loading session…" />

  const grid = buildGrid(active.slots)

  return (
    <div className="page-container">

      {/* ── Header ── */}
      <motion.div className="exam-page-header"
        initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <button className="btn btn-secondary btn-sm"
            onClick={() => { setView('list'); setActive(null) }}>
            <ArrowLeft size={14}/>
          </button>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <h1 className="page-title" style={{ margin:0 }}>{active.name}</h1>
              <StatusBadge status={active.status} />
            </div>
            <p className="page-subtitle" style={{ margin:0 }}>
              <Calendar size={12}/> {active.start_date} → {active.end_date}
              &nbsp;&nbsp;·&nbsp;&nbsp;
              {(active.slots || []).length} exam slots
            </p>
          </div>
        </div>

        <div className="exam-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleValidate}>
            <CheckCircle2 size={13}/> Validate
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={() => handlePublish(active.id, active.status)}>
            {active.status === 'draft'
              ? <><Check size={13}/> Publish</>
              : <><ArrowLeft size={13}/> Unpublish</>}
          </button>
          <ExportDropdown
            onPdf={() => handleExport('pdf')}
            onXlsx={() => handleExport('xlsx')}
            loading={exporting} />
          <button className="btn btn-accent btn-sm" onClick={() => setShowGenerate(true)}>
            <Play size={13}/> Generate
          </button>
        </div>
      </motion.div>

      {/* ── Generate dialog ── */}
      <AnimatePresence>
        {showGenerate && (
          <motion.div className="card exam-gen-card"
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <h3 className="card-title" style={{ margin:0 }}>Auto-Generate Exam Schedule</h3>
              <button className="exam-modal-close" onClick={() => setShowGenerate(false)}>
                <X size={16}/>
              </button>
            </div>
            <form onSubmit={handleGenerate}>
              <div className="exam-gen-grid">
                {/* Subjects */}
                <div>
                  <label className="form-label" style={{ marginBottom:8 }}>
                    Subjects&nbsp;
                    <span className="exam-sel-count">({genForm.subject_ids.length} selected)</span>
                  </label>
                  <div className="exam-check-list">
                    {subjects.map(s => (
                      <label key={s.id} className="exam-check-item">
                        <input type="checkbox"
                          checked={genForm.subject_ids.includes(s.id)}
                          onChange={() => setGenForm(f=>({
                            ...f, subject_ids: toggleId(f.subject_ids, s.id)
                          }))} />
                        <span>{s.name}</span>
                        <span className="exam-check-meta">Gr{s.grade_level}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Classes */}
                <div>
                  <label className="form-label" style={{ marginBottom:8 }}>
                    Classes&nbsp;
                    <span className="exam-sel-count">({genForm.class_ids.length} selected)</span>
                  </label>
                  <div className="exam-check-list">
                    {classes.map(c => (
                      <label key={c.id} className="exam-check-item">
                        <input type="checkbox"
                          checked={genForm.class_ids.includes(c.id)}
                          onChange={() => setGenForm(f=>({
                            ...f, class_ids: toggleId(f.class_ids, c.id)
                          }))} />
                        <span>{c.name}</span>
                        <span className="exam-check-meta">Gr{c.grade_level}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="exam-gen-options">
                <div className="form-group">
                  <label className="form-label">Start Period</label>
                  <input type="number" className="form-input" min={1} max={8}
                    value={genForm.start_period}
                    onChange={e => setGenForm(f=>({...f, start_period:+e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Exams / Day</label>
                  <input type="number" className="form-input" min={1} max={4}
                    value={genForm.max_per_day}
                    onChange={e => setGenForm(f=>({...f, max_per_day:+e.target.value}))} />
                </div>
                <div>
                  <label className="form-label" style={{ marginBottom:8, display:'block' }}>Exam Days</label>
                  <div className="exam-day-toggles">
                    {DAYS.map(d => (
                      <button key={d} type="button"
                        className={`exam-day-btn${genForm.school_days.includes(d) ? ' active' : ''}`}
                        onClick={() => setGenForm(f => ({
                          ...f, school_days: toggleId(f.school_days, d)
                        }))}>
                        {d.slice(0,3)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowGenerate(false)}>Cancel</button>
                <button type="submit" className="btn btn-accent">
                  <Play size={14}/> Generate Schedule
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Timetable grid ── */}
      {loading ? <Loader /> : !(active.slots?.length) ? (
        <EmptyState icon={GraduationCap}
          title="No exam slots yet"
          body="Click Generate to auto-schedule, or use a template to get started quickly" />
      ) : (
        <motion.div className="exam-grid-wrap"
          initial={{ opacity:0 }} animate={{ opacity:1 }}>
          <div className="exam-grid-scroll">
            <table className="exam-grid-table">
              <thead>
                <tr>
                  <th className="exam-grid-period-head">Period</th>
                  {DAYS.map(d => (
                    <th key={d} className="exam-grid-day-head">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(periods.length ? periods : [1,2,3,4]).map(period => (
                  <tr key={period}>
                    <td className="exam-grid-period-cell">P{period}</td>
                    {DAYS.map(day => {
                      const slots = grid[day]?.[period] || []
                      return (
                        <td key={day} className="exam-grid-day-cell">
                          {slots.length === 0
                            ? <div className="exam-grid-empty-cell" />
                            : slots.map(sl => (
                              <ExamSlotCard key={sl.id} slot={sl}
                                onLock={lock => handleLock(sl.id, lock)}
                                onDelete={() => handleDeleteSlot(sl.id)} />
                            ))
                          }
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

                {/* Legend */}
      <div className="exam-legend">
        <span className="exam-legend-title">Legend:</span>

        <span className="exam-legend-item">
          <Lock size={10} /> Locked
        </span>

        <span className="exam-legend-item">
          <FlaskConical size={10} /> Practical
        </span>

        <span className="exam-legend-item exam-legend-note">
          Click <Lock size={10} /> to lock a slot
        </span>
      </div>
    </motion.div>
  )}
</div>

<AIAssistant context="exam" />
</>
)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExamSlotCard({ slot, onLock, onDelete }) {
  const hex = slot.subject_color || '#6366f1'

  return (
    <motion.div
      className="exam-slot-card"
      initial={{ opacity: 0, scale: 0.93 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        borderLeft: `3px solid ${hex}`,
        background: `${hex}14`,
      }}
    >
      <div
        className="exam-slot-subject"
        style={{ color: hex }}
      >
        {slot.subject_name}

        {slot.is_practical && (
          <FlaskConical
            size={9}
            style={{ marginLeft: 4, opacity: 0.7 }}
          />
        )}
      </div>

      <div className="exam-slot-paper">
        Paper {slot.paper_number}
      </div>

      <div className="exam-slot-meta">
        <span>{slot.class_name}</span>
        <span>{slot.duration}min</span>
      </div>

      {slot.invigilator_name && (
        <div className="exam-slot-invig">
          👤 {slot.invigilator_name}
        </div>
      )}

      {slot.room && (
        <div className="exam-slot-room">
          📍 {slot.room}
        </div>
      )}

      <div className="exam-slot-actions">
        <button
          className={`exam-slot-btn${slot.is_locked ? ' locked' : ''}`}
          onClick={() => onLock(!slot.is_locked)}
          title={slot.is_locked ? 'Unlock slot' : 'Lock slot'}
        >
          {slot.is_locked ? (
            <Lock size={10} />
          ) : (
            <Unlock size={10} />
          )}
        </button>

        {!slot.is_locked && (
          <button
            className="exam-slot-btn delete"
            onClick={onDelete}
            title="Remove slot"
          >
            <X size={10} />
          </button>
        )}
      </div>
    </motion.div>
  )
}
                <div className="exam-export-item-title">Export as PDF</div>
                <div className="exam-export-item-sub">Printable schedule by day</div>
              </div>
            </button>
            <button className="exam-export-item" onClick={() => { onXlsx(); setOpen(false) }}>
              <FileSpreadsheet size={14} color="#22c55e"/>
              <div>
                <div className="exam-export-item-title">Export as Excel</div>
                <div className="exam-export-item-sub">Spreadsheet with per-day sheets</div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PaperAddForm({ existing, onAdd, onCancel }) {
  const available = [1,2,3,4,5,6].filter(n => !existing.includes(n))
  const [num,      setNum]       = useState(available[0] || 1)
  const [duration, setDuration]  = useState(120)
  const [practical,setPractical] = useState(false)

  return (
    <motion.form className="exam-paper-form"
      initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
      onSubmit={e => { e.preventDefault(); onAdd({ paper_number:num, duration_minutes:duration, is_practical:practical }) }}>
      <div className="exam-paper-form-row">
        <div>
          <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Paper #</label>
          <select className="form-input" value={num} onChange={e => setNum(+e.target.value)}
            style={{ padding:'5px 8px', fontSize:13 }}>
            {available.map(n => <option key={n} value={n}>Paper {n}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Duration (min)</label>
          <input type="number" className="form-input" value={duration}
            min={30} max={300} step={15}
            onChange={e => setDuration(+e.target.value)}
            style={{ padding:'5px 8px', fontSize:13 }} />
        </div>
      </div>
      <label className="exam-practical-label">
        <input type="checkbox" checked={practical}
          onChange={e => setPractical(e.target.checked)} />
        Practical paper
      </label>
      <div style={{ display:'flex', gap:6, marginTop:8 }}>
        <button type="submit" className="btn btn-accent btn-sm" style={{ flex:1 }}>
          <Check size={12}/> Add
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          <X size={12}/>
        </button>
      </div>
    </motion.form>
  )
}
