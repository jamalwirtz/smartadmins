import AIAssistant from '../components/AIAssistant'
import ExamGenerateForm from '../components/ExamGenerateForm'
import ExamSetupWizard from '../components/ExamSetupWizard'
import ExamResources from '../components/ExamResources'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Calendar, ArrowLeft, Check, X, Lock, Unlock,
  BookOpen, Clock, CheckCircle2, Play,
  Download, FileSpreadsheet, FileText, Trash2,
  Layers, ChevronDown, GraduationCap, FlaskConical, Zap, User, MapPin, Pencil, Users, Wand2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { examsAPI, subjectsAPI, classesAPI, exportAPI, templatesAPI,
         supervisorsAPI, roomsAPI, examLayoutsAPI } from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const STATUS = {
  draft:     { bg:'rgba(99,102,241,.13)',  text:'#818cf8', dot:'#6366f1', label:'Draft'     },
  published: { bg:'rgba(16,185,129,.13)',  text:'#34d399', dot:'#10b981', label:'Published' },
  completed: { bg:'rgba(107,114,128,.13)', text:'#9ca3af', dot:'#6b7280', label:'Completed' },
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const addDaysStr = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

// A slot's column is its calendar date when it has one (new slots), else its weekday name (older slots)
const colKey = (sl) => sl.exam_date || sl.day
const colLabel = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key)
  ? new Date(key + 'T00:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
  : key

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.draft
  return (
    <span className="exam-badge" style={{ background: s.bg, color: s.text }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: s.dot, display:'inline-block', marginRight:5 }} />
      {s.label}
    </span>
  )
}

const Loader = ({ text = 'Loading…' }) => (
  <div className="exam-loader">
    <motion.div className="exam-loader-ring" animate={{ rotate: 360 }} transition={{ duration:1, repeat:Infinity, ease:'linear' }} />
    <span className="exam-loader-text">{text}</span>
  </div>
)

const EmptyState = ({ title, body, action, onAction, secondary, onSecondary }) => (
  <motion.div className="exam-empty" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}>
    <div className="exam-empty-icon"><BookOpen size={36} /></div>
    <h3 className="exam-empty-title">{title}</h3>
    <p className="exam-empty-body">{body}</p>
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
      {action && <button className="btn btn-accent" onClick={onAction}><Wand2 size={14} /> {action}</button>}
      {secondary && <button className="btn btn-secondary" onClick={onSecondary}>{secondary}</button>}
    </div>
  </motion.div>
)

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Exams() {
  const [view,    setView]    = useState('list')  // list | papers | resources | session
  const [active,  setActive]  = useState(null)

  const [sessions,    setSessions]    = useState([])
  const [subjects,    setSubjects]    = useState([])
  const [classes,     setClasses]     = useState([])
  const [papersData,  setPapersData]  = useState([])
  const [supervisors, setSupervisors] = useState([])
  const [rooms,       setRooms]       = useState([])
  const [editingSlot, setEditingSlot] = useState(null)
  const [examTpls,    setExamTpls]    = useState([])
  const [layouts,        setLayouts]        = useState([])
  const [activeLayoutId, setActiveLayoutId] = useState(null)

  const [loading,       setLoading]       = useState(true)
  const [exporting,     setExporting]     = useState(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [showGenerate,  setShowGenerate]  = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showWizard,    setShowWizard]    = useState(false)
  const [showPaperFor,  setShowPaperFor]  = useState(null)
  const [applyingTpl,   setApplyingTpl]   = useState(false)

  const [createForm, setCreateForm] = useState({ name:'', start_date:'', end_date:'', description:'' })
  const [tplApplyForm, setTplApplyForm] = useState({
    template_id:'', session_name:'', start_date:'', end_date:'', class_ids:[], subject_ids:[],
  })

  // ── loaders ─────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoading(true)
    try { setSessions((await examsAPI.listSessions()).data) }
    catch { toast.error('Could not load exam sessions') }
    finally { setLoading(false) }
  }, [])

  const loadSession = useCallback(async (id) => {
    setLoading(true)
    try { setActive((await examsAPI.getSession(id)).data) }
    catch { toast.error('Could not load session') }
    finally { setLoading(false) }
  }, [])

  const loadSupport = useCallback(async () => {
    try {
      const [s, c, p, et, sv, rm, lay] = await Promise.all([
        subjectsAPI.list(), classesAPI.list(), examsAPI.allPapers(), templatesAPI.examTemplates(),
        supervisorsAPI.list().catch(() => ({ data:[] })),
        roomsAPI.list().catch(() => ({ data:[] })),
        examLayoutsAPI.list().catch(() => ({ data:[] })),
      ])
      setSubjects(s.data); setClasses(c.data); setPapersData(p.data); setExamTpls(et.data)
      setSupervisors(sv.data); setRooms(rm.data); setLayouts(lay.data)
      setTplApplyForm(f => ({ ...f, class_ids: f.class_ids.length ? f.class_ids : c.data.map(x => x.id),
                                     subject_ids: f.subject_ids.length ? f.subject_ids : s.data.map(x => x.id) }))
    } catch { toast.error('Could not load support data') }
  }, [])

  useEffect(() => { loadSessions(); loadSupport() }, [loadSessions, loadSupport])

  // ── actions ──────────────────────────────────────────────────────────────
  const openCreateForm = () => {
    setCreateForm({ name:'', start_date: todayStr(), end_date: addDaysStr(13), description:'' })
    setShowCreate(true)
  }
  const applyQuickRange = (days) =>
    setCreateForm(f => ({ ...f, start_date: f.start_date || todayStr(), end_date: addDaysStr(days) }))

  const handleCreateSession = async (e) => {
    e.preventDefault()
    if (!createForm.name.trim()) return toast.error('Session name required')
    if (!createForm.start_date || !createForm.end_date) return toast.error('Dates required')
    if (createForm.start_date > createForm.end_date) return toast.error('End must be after start')
    try {
      await examsAPI.createSession(createForm)
      toast.success('Session created ✅')
      setShowCreate(false); loadSessions()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Create failed') }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this session and all its slots?')) return
    try { await examsAPI.deleteSession(id); toast.success('Deleted'); loadSessions() }
    catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const handlePublish = async (id, status) => {
    const next = status === 'draft' ? 'published' : 'draft'
    try {
      await examsAPI.updateSession(id, { status: next })
      toast.success(`Session ${next}`)
      active ? loadSession(active.id) : loadSessions()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Update failed') }
  }

  const openSession = (id) => { loadSession(id); setView('session') }

  const handleApplyTemplate = async (e) => {
    e.preventDefault()
    if (!tplApplyForm.template_id)      return toast.error('Pick a template')
    if (!tplApplyForm.start_date)       return toast.error('Start date required')
    if (!tplApplyForm.end_date)         return toast.error('End date required')
    if (!tplApplyForm.class_ids.length) return toast.error('Select classes')
    setApplyingTpl(true)
    try {
      const r = await templatesAPI.applyExamTemplate(tplApplyForm)
      toast.success(`Session created with ${r.data.papers_added} papers pre-configured ✅`, { duration:5000 })
      setShowTemplates(false)
      await loadSupport()
      await loadSession(r.data.session_id)
      setView('session'); setShowGenerate(true)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Apply failed') }
    finally { setApplyingTpl(false) }
  }

  const handleAddPaper = async (subjectId, data) => {
    try {
      await examsAPI.addPaper(subjectId, data)
      toast.success(`Paper ${data.paper_number} added ✅`)
      setPapersData((await examsAPI.allPapers()).data); setShowPaperFor(null)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Add paper failed') }
  }

  const handleDeletePaper = async (paperId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this paper? Scheduled slots using it will also be removed.')) return
    try {
      await examsAPI.deletePaper(paperId)
      toast.success('Paper deleted'); setPapersData((await examsAPI.allPapers()).data)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Delete failed') }
  }

  const handleLock = async (slotId, lock) => {
    try { await examsAPI.updateSlot(slotId, { is_locked: lock }); loadSession(active.id) }
    catch (err) { toast.error(err?.response?.data?.detail || 'Update failed') }
  }
  const handleDeleteSlot = async (slotId) => {
    try { await examsAPI.deleteSlot(slotId); loadSession(active.id) }
    catch (err) { toast.error(err?.response?.data?.detail || 'Cannot delete locked slot') }
  }
  const handleAssignSlot = async (slotId, updates) => {
    try {
      await examsAPI.updateSlot(slotId, updates)
      setEditingSlot(null); toast.success('Assignment saved ✅'); loadSession(active.id)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Update failed') }
  }

  const handleValidate = async () => {
    try {
      const { errors, warnings, total_slots } = (await examsAPI.validateSession(active.id)).data
      if (!errors.length && !warnings.length) toast.success(`All clear — ${total_slots} slots, no issues ✅`, { duration:4000 })
      else {
        errors.forEach(e => toast.error(e, { duration:7000 }))
        warnings.forEach(w => toast(`⚠️  ${w}`, { duration:5000 }))
      }
    } catch { toast.error('Validation failed') }
  }

  const handleExport = async (format) => {
    if (!active) return
    setExporting(format)
    try {
      const r = format === 'pdf' ? await exportAPI.examPdf(active.id, activeLayoutId)
                                 : await exportAPI.examXlsx(active.id, activeLayoutId)
      const name = active.name.replace(/\s+/g, '_').replace(/[/\\]/g, '-')
      triggerDownload(r.data, `exam_${name}.${format === 'pdf' ? 'pdf' : 'xlsx'}`)
      toast.success(`Exported as ${format.toUpperCase()} ✅`)
    } catch { toast.error('Export failed — ensure the backend is running') }
    finally { setExporting(null) }
  }

  const toggleId = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]

  // ── modals shared by every view ──────────────────────────────────────────
  const wizard = (
    <AnimatePresence>
      {showWizard && (
        <ExamSetupWizard
          subjects={subjects} classes={classes} papersData={papersData}
          supervisors={supervisors} rooms={rooms} reloadSupport={loadSupport}
          onClose={() => { setShowWizard(false); loadSessions() }}
          onOpenResources={() => { setShowWizard(false); setView('resources') }}
          onFinished={(id) => { setShowWizard(false); loadSessions(); openSession(id) }} />
      )}
    </AnimatePresence>
  )

  // ────────────────────────────────────────────────────────────────────────────
  // VIEW: SUPERVISORS & ROOMS
  // ────────────────────────────────────────────────────────────────────────────
  if (view === 'resources') return (
    <ExamResources onBack={() => { setView('list'); loadSupport() }} onChanged={loadSupport} />
  )

  // ────────────────────────────────────────────────────────────────────────────
  // VIEW: LIST
  // ────────────────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="page-container">
      <motion.div className="exam-page-header" initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div>
          <h1 className="page-title">Exam Timetables</h1>
          <p className="page-subtitle">Set up papers, supervisors and rooms, then generate a conflict-free exam schedule</p>
        </div>
        <div className="exam-header-actions">
          <button className="btn btn-secondary" onClick={() => setView('resources')}>
            <Users size={14}/> Supervisors &amp; Rooms
          </button>
          <button className="btn btn-secondary" onClick={() => setView('papers')}>
            <BookOpen size={14}/> Manage Papers
          </button>
          <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>
            <Layers size={14}/> From Template
          </button>
          <button className="btn btn-secondary" onClick={openCreateForm}>
            <Plus size={14}/> Blank Session
          </button>
          <button className="btn btn-accent" onClick={() => setShowWizard(true)}>
            <Wand2 size={14}/> Guided Setup
          </button>
        </div>
      </motion.div>

      {wizard}

      <AnimatePresence>
        {showTemplates && (
          <motion.div className="exam-modal-backdrop" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setShowTemplates(false)}>
            <motion.div className="exam-modal" initial={{ opacity:0, scale:.96, y:20 }} animate={{ opacity:1, scale:1, y:0 }}
              exit={{ opacity:0, scale:.96, y:20 }} onClick={e => e.stopPropagation()}>
              <div className="exam-modal-header">
                <div>
                  <h2 className="exam-modal-title">Exam Templates</h2>
                  <p className="exam-modal-sub">Pick a template to pre-configure your exam session</p>
                </div>
                <button className="exam-modal-close" onClick={() => setShowTemplates(false)}><X size={18}/></button>
              </div>
              <div className="exam-tpl-grid">
                {examTpls.map(tpl => (
                  <motion.button key={tpl.id} type="button"
                    className={`exam-tpl-card${tplApplyForm.template_id === tpl.id ? ' selected' : ''}`}
                    whileHover={{ y:-2 }} whileTap={{ scale:.98 }}
                    onClick={() => setTplApplyForm(f => ({
                      ...f, template_id: tpl.id,
                      session_name: tpl.config.suggested_name || tpl.name,
                      start_date: f.start_date || todayStr(),
                      end_date: f.end_date || addDaysStr((tpl.config.duration_days || 10) - 1),
                    }))}>
                    <div className="exam-tpl-icon">{tpl.icon}</div>
                    <div className="exam-tpl-name">{tpl.name}</div>
                    <div className="exam-tpl-desc">{tpl.description}</div>
                    <div className="exam-tpl-pills">
                      <span className="exam-tpl-pill">{tpl.config.duration_days}d</span>
                      <span className="exam-tpl-pill">{tpl.config.papers_per_subject}p/subj</span>
                      <span className="exam-tpl-pill">max {tpl.config.max_per_day}/day</span>
                    </div>
                    {tplApplyForm.template_id === tpl.id && <div className="exam-tpl-check"><Check size={12}/></div>}
                  </motion.button>
                ))}
              </div>
              {tplApplyForm.template_id && (
                <motion.form className="exam-tpl-apply-form" initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  onSubmit={handleApplyTemplate}>
                  <div className="exam-tpl-apply-row">
                    <div className="form-group">
                      <label className="form-label">Session Name</label>
                      <input className="form-input" value={tplApplyForm.session_name}
                        onChange={e => setTplApplyForm(f=>({...f,session_name:e.target.value}))} />
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
                    {[['Classes', classes, 'class_ids'], ['Subjects', subjects, 'subject_ids']].map(([label, items, key]) => (
                      <div className="form-group" key={key}>
                        <label className="form-label">{label} ({tplApplyForm[key].length} selected)</label>
                        <div className="exam-check-list">
                          {items.map(i => (
                            <label key={i.id} className="exam-check-item">
                              <input type="checkbox" checked={tplApplyForm[key].includes(i.id)}
                                onChange={() => setTplApplyForm(f => ({ ...f, [key]: toggleId(f[key], i.id) }))} />
                              <span>{i.name}</span><span className="exam-check-meta">Gr{i.grade_level}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowTemplates(false)}>Cancel</button>
                    <button type="submit" className="btn btn-accent" disabled={applyingTpl}>
                      {applyingTpl ? 'Applying…' : <><Zap size={14}/> Apply Template</>}
                    </button>
                  </div>
                </motion.form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreate && (
          <motion.div className="card exam-create-card" initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
            <h3 className="card-title" style={{ marginBottom:16 }}>New Exam Session</h3>
            <form onSubmit={handleCreateSession}>
              <div className="exam-create-grid">
                <div className="form-group">
                  <label className="form-label">Session Name *</label>
                  <input className="form-input" value={createForm.name} autoFocus placeholder="e.g. June 2026 Final Exams"
                    onChange={e => setCreateForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">First exam day *</label>
                  <input type="date" className="form-input" value={createForm.start_date}
                    onChange={e => setCreateForm(f=>({...f,start_date:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last exam day *</label>
                  <input type="date" className="form-input" value={createForm.end_date}
                    onChange={e => setCreateForm(f=>({...f,end_date:e.target.value}))} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted)' }}>Quick range:</span>
                {[['1 week',6],['2 weeks',13],['3 weeks',20],['1 month',29]].map(([label, days]) => (
                  <button key={label} type="button" className="exam-day-btn" onClick={() => applyQuickRange(days)}>{label}</button>
                ))}
              </div>
              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">Description (optional)</label>
                <input className="form-input" value={createForm.description}
                  onChange={e => setCreateForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button type="submit" className="btn btn-accent"><Check size={14}/> Create Session</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}><X size={14}/> Cancel</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <Loader /> : sessions.length === 0 ? (
        <EmptyState title="No exam sessions yet"
          body="The guided setup walks you through dates, papers, supervisors and rooms, then builds the timetable."
          action="Start Guided Setup" onAction={() => setShowWizard(true)}
          secondary="Use a template" onSecondary={() => setShowTemplates(true)} />
      ) : (
        <div className="exam-session-grid">
          {sessions.map((s, i) => (
            <motion.div key={s.id} className="exam-session-card"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.05 }}
              onClick={() => openSession(s.id)}>
              <div className="exam-session-card-top">
                <div>
                  <div className="exam-session-name">{s.name}</div>
                  <div className="exam-session-dates"><Calendar size={11}/> {s.start_date} → {s.end_date}</div>
                </div>
                <StatusBadge status={s.status} />
              </div>
              <div className="exam-session-stats">
                <div className="exam-stat"><span className="exam-stat-val">{s.slot_count}</span><span className="exam-stat-lbl">Slots</span></div>
              </div>
              <div className="exam-session-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-secondary" onClick={() => openSession(s.id)}><Calendar size={12}/> Open</button>
                <button className="btn btn-sm btn-secondary" onClick={() => handlePublish(s.id, s.status)}>
                  {s.status === 'draft' ? <><Check size={12}/> Publish</> : <><ArrowLeft size={12}/> Unpublish</>}
                </button>
                <button className="exam-delete-btn" onClick={e => handleDelete(s.id, e)}><Trash2 size={13}/></button>
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
      <motion.div className="exam-page-header" initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setView('list')}><ArrowLeft size={14}/></button>
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
              initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.04 }}>
              <div className="exam-paper-card-head">
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div className="exam-subject-dot" style={{ background: subj.color_hex || '#6366f1' }} />
                  <div>
                    <div className="exam-subject-name">{subj.subject_name}</div>
                    <div className="exam-subject-grade">Grade {subj.grade_level}</div>
                  </div>
                </div>
                <span className="exam-paper-count">{subj.papers.length}/6 papers</span>
              </div>
              <div className="exam-paper-list">
                {subj.papers.length === 0
                  ? <div className="exam-no-papers">No papers yet — add Paper 1 to start</div>
                  : subj.papers.map(p => (
                    <div key={p.id} className="exam-paper-item">
                      <div className="exam-paper-item-left">
                        <span className="exam-paper-num">Paper {p.paper_number}</span>
                        {p.is_practical && <span className="exam-practical-tag"><FlaskConical size={9}/> Practical</span>}
                      </div>
                      <div className="exam-paper-item-right">
                        <Clock size={11}/> {p.duration}min
                        <button className="exam-paper-del" onClick={e => handleDeletePaper(p.id, e)}><X size={11}/></button>
                      </div>
                    </div>
                  ))}
              </div>
              {showPaperFor === subj.subject_id ? (
                <PaperAddForm existing={subj.papers.map(p => p.paper_number)}
                  onAdd={data => handleAddPaper(subj.subject_id, data)} onCancel={() => setShowPaperFor(null)} />
              ) : subj.papers.length < 6 ? (
                <button className="exam-add-paper-btn" onClick={() => setShowPaperFor(subj.subject_id)}>
                  <Plus size={13}/> Add Paper {subj.papers.length + 1}
                </button>
              ) : <div className="exam-max-papers">Max 6 papers reached</div>}
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

  const slots = active.slots || []
  const grid = {}
  slots.forEach(sl => {
    const k = colKey(sl)
    grid[k] = grid[k] || {}
    grid[k][sl.period] = grid[k][sl.period] || []
    grid[k][sl.period].push(sl)
  })
  const columns = Object.keys(grid).sort((a, b) => {
    const da = /^\d/.test(a), db = /^\d/.test(b)
    if (da && db) return a.localeCompare(b)
    if (da) return -1
    if (db) return 1
    return DAYS.indexOf(a) - DAYS.indexOf(b)
  })
  const periods = [...new Set(slots.map(s => s.period))].sort((a, b) => a - b)

  return (
    <>
    <div className="page-container">
      <motion.div className="exam-page-header" initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setView('list'); setActive(null); setShowGenerate(false); loadSessions() }}>
            <ArrowLeft size={14}/>
          </button>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <h1 className="page-title" style={{ margin:0 }}>{active.name}</h1>
              <StatusBadge status={active.status} />
            </div>
            <p className="page-subtitle" style={{ margin:0 }}>
              <Calendar size={12}/> {active.start_date} → {active.end_date} &nbsp;·&nbsp; {slots.length} exam slots
              &nbsp;·&nbsp; {supervisors.length} supervisors &nbsp;·&nbsp; {rooms.length} rooms
            </p>
          </div>
        </div>
        <div className="exam-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setView('resources')}><Users size={13}/> Supervisors &amp; Rooms</button>
          <button className="btn btn-secondary btn-sm" onClick={handleValidate}><CheckCircle2 size={13}/> Validate</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handlePublish(active.id, active.status)}>
            {active.status === 'draft' ? <><Check size={13}/> Publish</> : <><ArrowLeft size={13}/> Unpublish</>}
          </button>
          <ExportDropdown onPdf={() => handleExport('pdf')} onXlsx={() => handleExport('xlsx')} loading={exporting}
            layouts={layouts} activeLayoutId={activeLayoutId} onSelectLayout={setActiveLayoutId} />
          <button className="btn btn-accent btn-sm" onClick={() => setShowGenerate(g => !g)}><Play size={13}/> Generate</button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showGenerate && (
          <motion.div className="card exam-gen-card" initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <h3 className="card-title" style={{ margin:0 }}>Generate Exam Schedule</h3>
              <button className="exam-modal-close" onClick={() => setShowGenerate(false)}><X size={16}/></button>
            </div>
            <ExamGenerateForm session={active} subjects={subjects} classes={classes} papersData={papersData}
              supervisors={supervisors} rooms={rooms}
              onCancel={() => setShowGenerate(false)}
              onConfigurePapers={() => { setShowGenerate(false); setView('papers') }}
              onGenerated={() => { setShowGenerate(false); loadSession(active.id) }} />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <Loader /> : !slots.length ? (
        <EmptyState title="No exam slots yet"
          body="Click Generate. The plan check tells you beforehand if everything will fit."
          action="Generate now" onAction={() => setShowGenerate(true)} />
      ) : (
        <motion.div className="exam-grid-wrap" initial={{ opacity:0 }} animate={{ opacity:1 }}>
          <div className="exam-grid-scroll">
            <table className="exam-grid-table">
              <thead>
                <tr>
                  <th className="exam-grid-period-head">Period</th>
                  {columns.map(c => <th key={c} className="exam-grid-day-head">{colLabel(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period}>
                    <td className="exam-grid-period-cell">P{period}</td>
                    {columns.map(c => {
                      const cell = grid[c]?.[period] || []
                      return (
                        <td key={c} className="exam-grid-day-cell">
                          {cell.length === 0 ? <div className="exam-grid-empty-cell" /> : cell.map(sl => (
                            <ExamSlotCard key={sl.id} slot={sl}
                              onLock={lock => handleLock(sl.id, lock)}
                              onDelete={() => handleDeleteSlot(sl.id)}
                              onAssign={handleAssignSlot}
                              supervisors={supervisors} rooms={rooms}
                              isEditing={editingSlot === sl.id}
                              onEditToggle={() => setEditingSlot(prev => prev === sl.id ? null : sl.id)} />
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="exam-legend">
            <span className="exam-legend-title">Legend:</span>
            <span className="exam-legend-item"><Lock size={10}/> Locked</span>
            <span className="exam-legend-item"><FlaskConical size={10}/> Practical</span>
            <span className="exam-legend-item exam-legend-note">
              Click <Pencil size={10}/> to assign a supervisor/room, <Lock size={10}/> to lock a slot
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

function ExamSlotCard({ slot, onLock, onDelete, onAssign, supervisors=[], rooms=[], isEditing, onEditToggle }) {
  const hex = slot.subject_color || '#6366f1'
  const [supId,   setSupId]   = useState(slot.invigilator_id || '')
  const [roomVal, setRoomVal] = useState(slot.room || '')
  const [roomId,  setRoomId]  = useState(slot.room_id || '')

  useEffect(() => {
    setSupId(slot.invigilator_id || ''); setRoomVal(slot.room || ''); setRoomId(slot.room_id || '')
  }, [slot.invigilator_id, slot.room, slot.room_id])

  return (
    <motion.div className="exam-slot-card" initial={{ opacity:0, scale:.93 }} animate={{ opacity:1, scale:1 }}
      style={{ borderLeft:`3px solid ${hex}`, background:`${hex}14` }}>
      <div className="exam-slot-subject" style={{ color: hex }}>
        {slot.subject_name}
        {slot.is_practical && <FlaskConical size={9} style={{ marginLeft:4, opacity:.7 }}/>}
      </div>
      <div className="exam-slot-paper">Paper {slot.paper_number}</div>
      <div className="exam-slot-meta"><span>{slot.class_name}</span><span>{slot.duration}min</span></div>

      {isEditing ? (
        <div className="exam-slot-assign-row">
          <User size={9}/>
          <select className="exam-slot-assign-select" value={supId} onChange={e => setSupId(e.target.value)}>
            <option value="">No supervisor</option>
            {supervisors.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
          </select>
        </div>
      ) : slot.invigilator_name ? (
        <div className="exam-slot-invig">👤 {slot.invigilator_name}</div>
      ) : (
        <div className="exam-slot-invig" style={{ color:'var(--muted)', fontStyle:'italic' }}>No supervisor</div>
      )}

      {isEditing ? (
        <div className="exam-slot-assign-row">
          <MapPin size={9}/>
          {rooms.length > 0 ? (
            <select className="exam-slot-assign-select" value={roomId} onChange={e => { setRoomId(e.target.value); setRoomVal('') }}>
              <option value="">No room</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.name} (cap:{r.capacity})</option>)}
            </select>
          ) : (
            <input className="exam-slot-assign-input" value={roomVal} placeholder="Room name…"
              onChange={e => { setRoomVal(e.target.value); setRoomId('') }}/>
          )}
        </div>
      ) : slot.room ? <div className="exam-slot-room">📍 {slot.room}</div> : null}

      {isEditing && (
        <div style={{ display:'flex', gap:4, marginTop:4 }}>
          <button className="exam-slot-save-btn"
            onClick={() => onAssign(slot.id, { invigilator_id: supId || null, room_id: roomId || null, room: roomVal || null })}>
            <Check size={10}/> Save
          </button>
          <button className="exam-slot-cancel-btn" onClick={onEditToggle}><X size={10}/></button>
        </div>
      )}

      <div className="exam-slot-actions">
        <button className={`exam-slot-btn${slot.is_locked ? ' locked' : ''}`} onClick={() => onLock(!slot.is_locked)}>
          {slot.is_locked ? <Lock size={10}/> : <Unlock size={10}/>}
        </button>
        {!slot.is_locked && (
          <button className="exam-slot-btn" onClick={onEditToggle} style={{ color: isEditing ? 'var(--amber)' : 'var(--muted)' }}>
            <Pencil size={10}/>
          </button>
        )}
        {!slot.is_locked && <button className="exam-slot-btn delete" onClick={onDelete}><X size={10}/></button>}
      </div>
    </motion.div>
  )
}

function ExportDropdown({ onPdf, onXlsx, loading, layouts = [], activeLayoutId, onSelectLayout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const activeLayout = layouts.find(l => l.id === activeLayoutId)
  const defaultLayout = layouts.find(l => l.is_default)

  return (
    <div className="exam-export-wrap" ref={ref}>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(o => !o)} disabled={!!loading}>
        {loading ? 'Exporting…' : <><Download size={13}/> Export <ChevronDown size={11}/></>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="exam-export-dropdown" initial={{ opacity:0, y:-6, scale:.97 }}
            animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-6, scale:.97 }}>
            {layouts.length > 0 && (
              <div className="exam-export-layout-section">
                <div className="exam-export-layout-label">Layout template</div>
                <button className={`exam-export-layout-opt${!activeLayoutId ? ' active' : ''}`} onClick={() => onSelectLayout(null)}>
                  {!activeLayoutId && <Check size={12}/>} Default {defaultLayout ? `(${defaultLayout.name})` : ''}
                </button>
                {layouts.map(l => (
                  <button key={l.id} className={`exam-export-layout-opt${activeLayoutId===l.id ? ' active' : ''}`} onClick={() => onSelectLayout(l.id)}>
                    {activeLayoutId === l.id && <Check size={12}/>} {l.name}
                  </button>
                ))}
              </div>
            )}
            <button className="exam-export-item" onClick={() => { onPdf(); setOpen(false) }}>
              <FileText size={14} color="#ef4444"/>
              <div>
                <div className="exam-export-item-title">Export as PDF</div>
                <div className="exam-export-item-sub">{activeLayout ? `Using "${activeLayout.name}" layout` : 'Printable schedule by exam date'}</div>
              </div>
            </button>
            <button className="exam-export-item" onClick={() => { onXlsx(); setOpen(false) }}>
              <FileSpreadsheet size={14} color="#22c55e"/>
              <div>
                <div className="exam-export-item-title">Export as Excel</div>
                <div className="exam-export-item-sub">{activeLayout ? `Using "${activeLayout.name}" layout` : 'One sheet, date by date'}</div>
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
  const [num,       setNum]       = useState(available[0] || 1)
  const [duration,  setDuration]  = useState(120)
  const [practical, setPractical] = useState(false)

  return (
    <motion.form className="exam-paper-form" initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
      onSubmit={e => { e.preventDefault(); onAdd({ paper_number:num, duration_minutes:duration, is_practical:practical }) }}>
      <div className="exam-paper-form-row">
        <div>
          <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Paper #</label>
          <select className="form-input" value={num} onChange={e => setNum(+e.target.value)} style={{ padding:'5px 8px', fontSize:13 }}>
            {available.map(n => <option key={n} value={n}>Paper {n}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Duration (min)</label>
          <input type="number" className="form-input" value={duration} min={30} max={300} step={15}
            onChange={e => setDuration(+e.target.value)} style={{ padding:'5px 8px', fontSize:13 }} />
        </div>
      </div>
      <label className="exam-practical-label">
        <input type="checkbox" checked={practical} onChange={e => setPractical(e.target.checked)} /> Practical paper
      </label>
      <div style={{ display:'flex', gap:6, marginTop:8 }}>
        <button type="submit" className="btn btn-accent btn-sm" style={{ flex:1 }}><Check size={12}/> Add</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}><X size={12}/></button>
      </div>
    </motion.form>
  )
}
