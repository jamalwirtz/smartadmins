import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  classesAPI, subjectsAPI, teachersAPI, allocationsAPI
} from '../api/client'
import toast from 'react-hot-toast'
import {
  Plus, School, Pencil, Trash2, ChevronRight, ChevronLeft,
  Check, X, BookOpen, Users, Clock, Search,
  AlertCircle, CheckCircle, ArrowRight
} from 'lucide-react'

// ── Wizard step definitions ───────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Class Details',        icon: <School    size={14}/> },
  { id: 2, label: 'Select Subjects',      icon: <BookOpen  size={14}/> },
  { id: 3, label: 'Assign Teachers',      icon: <Users     size={14}/> },
  { id: 4, label: 'Done',                 icon: <Check     size={14}/> },
]

const GRADES = ['1','2','3','4','5','6','7','8','9','10','11','12',
                'S1','S2','S3','S4','S5','S6','Form 1','Form 2','Form 3','Form 4']

const COLORS = ['#2952a3','#0d9488','#d97706','#7c3aed','#dc2626','#0891b2','#16a34a','#c2410c']
const avatarBg = (name='') => COLORS[name.charCodeAt(0) % COLORS.length] || COLORS[0]

// ── Wizard step indicator ─────────────────────────────────────────────────────
function StepBar({ current }) {
  return (
    <div className="wizard-steps">
      {STEPS.map((s, i) => (
        <div key={s.id} className="wizard-step-wrap">
          <div className={`wizard-step-dot${current === s.id ? ' active' : current > s.id ? ' done' : ''}`}>
            {current > s.id ? <Check size={11}/> : s.icon}
          </div>
          <span className={`wizard-step-label${current === s.id ? ' active' : ''}`}>{s.label}</span>
          {i < STEPS.length - 1 && <div className={`wizard-step-line${current > s.id ? ' done' : ''}`}/>}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Classes() {
  const [classes,   setClasses]   = useState([])
  const [subjects,  setSubjects]  = useState([])
  const [teachers,  setTeachers]  = useState([])
  const [allocs,    setAllocs]    = useState({})   // {classId: allocations[]}
  const [loading,   setLoading]   = useState(true)

  // Wizard state
  const [wizardOpen,  setWizardOpen]  = useState(false)
  const [step,        setStep]        = useState(1)
  const [editingId,   setEditingId]   = useState(null)
  const [saving,      setSaving]      = useState(false)

  // Step 1 — class details
  const [classForm, setClassForm] = useState({
    name:'', grade_level:'', stream:'', capacity:40, max_subjects_per_day:8
  })

  // Step 2 — subjects
  const [selectedSubjects, setSelectedSubjects] = useState([])
  const [subSearch,        setSubSearch]        = useState('')
  const [newSubjectName,   setNewSubjectName]   = useState('')
  const [newSubjectCode,   setNewSubjectCode]   = useState('')
  const [addingSubject,    setAddingSubject]     = useState(false)
  const [creatingSubject,  setCreatingSubject]   = useState(false)

  // Step 3 — teacher assignment
  const [teacherMap, setTeacherMap] = useState({})  // {subjectId: teacherId|''}

  // Step 4 — result
  const [saveResult, setSaveResult] = useState(null)

  // Search
  const [classSearch, setClassSearch] = useState('')

  // ── Data loading ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s, t] = await Promise.all([
        classesAPI.list(), subjectsAPI.list(), teachersAPI.list()
      ])
      setClasses(c.data); setSubjects(s.data); setTeachers(t.data)

      // Load allocations for each class
      const allocMap = {}
      await Promise.all(c.data.map(async cls => {
        try {
          const r = await allocationsAPI.forClass(cls.id)
          allocMap[cls.id] = r.data.allocations || []
        } catch { allocMap[cls.id] = [] }
      }))
      setAllocs(allocMap)
    } catch { toast.error('Failed to load data') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Wizard helpers ────────────────────────────────────────────────────────
  const resetWizard = () => {
    setStep(1); setEditingId(null)
    setClassForm({ name:'', grade_level:'', stream:'', capacity:40, max_subjects_per_day:8 })
    setSelectedSubjects([]); setTeacherMap({})
    setSaveResult(null); setSubSearch('')
    setNewSubjectName(''); setNewSubjectCode('')
    setAddingSubject(false)
  }

  const openCreate = () => { resetWizard(); setWizardOpen(true) }

  const openEdit = (cls) => {
    resetWizard()
    setEditingId(cls.id)
    setClassForm({
      name: cls.name, grade_level: cls.grade_level,
      stream: cls.stream||'', capacity: cls.capacity||40,
      max_subjects_per_day: cls.max_subjects_per_day||8
    })
    const clsAllocs = allocs[cls.id] || []
    setSelectedSubjects(clsAllocs.map(a => a.subject_id))
    const tm = {}
    clsAllocs.forEach(a => { tm[a.subject_id] = a.teacher_id || '' })
    setTeacherMap(tm)
    setWizardOpen(true)
  }

  // ── Step 1: Save class ────────────────────────────────────────────────────
  const saveClass = async () => {
    if (!classForm.name.trim())        { toast.error('Class name is required'); return }
    if (!classForm.grade_level.trim()) { toast.error('Grade level is required'); return }
    setSaving(true)
    try {
      let cls
      if (editingId) {
        await classesAPI.update(editingId, classForm)
        cls = { id: editingId, ...classForm }
      } else {
        const r = await classesAPI.create(classForm)
        cls = r.data
        setEditingId(cls.id)
      }
      toast.success(editingId ? 'Class updated ✅' : 'Class created ✅')
      setStep(2)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  // ── Step 2: Create new subject inline ────────────────────────────────────
  const createSubjectInline = async () => {
    if (!newSubjectName.trim()) { toast.error('Subject name required'); return }
    setCreatingSubject(true)
    try {
      const r = await subjectsAPI.create({
        name: newSubjectName.trim(),
        subject_code: newSubjectCode.trim(),
        grade_level: classForm.grade_level,
        weekly_periods: 4,
        color_hex: COLORS[Math.floor(Math.random()*COLORS.length)],
      })
      const newSubj = r.data
      setSubjects(prev => [...prev, newSubj])
      setSelectedSubjects(prev => [...prev, newSubj.id])
      setNewSubjectName(''); setNewSubjectCode('')
      setAddingSubject(false)
      toast.success(`"${newSubj.name}" created and selected ✅`)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed to create subject') }
    finally { setCreatingSubject(false) }
  }

  // ── Step 3 → Step 4: Save allocations ────────────────────────────────────
  const saveAllocations = async () => {
    if (!editingId) return
    setSaving(true)
    try {
      const r = await allocationsAPI.saveForClass(editingId, {
        subject_ids: selectedSubjects,
        teacher_map: teacherMap,
      })
      setSaveResult(r.data)
      toast.success(r.data.message)
      setStep(4)
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Allocation save failed') }
    finally { setSaving(false) }
  }

  const deleteClass = async (id) => {
    if (!window.confirm('Delete this class and all its allocations?')) return
    try {
      await classesAPI.delete(id)
      toast.success('Class deleted')
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Delete failed') }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(subSearch.toLowerCase()) ||
    (s.subject_code||'').toLowerCase().includes(subSearch.toLowerCase())
  )

  const filteredClasses = classes.filter(c =>
    c.name.toLowerCase().includes(classSearch.toLowerCase()) ||
    (c.grade_level||'').toLowerCase().includes(classSearch.toLowerCase())
  )

  const pendingCount = Object.values(allocs).flat().filter(a => a.status === 'pending').length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">

      {/* ── Page header ── */}
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Classes</h1>
          <p className="page-subtitle">
            {classes.length} class{classes.length!==1?'es':''} ·{' '}
            {pendingCount > 0 && (
              <span style={{color:'#f59e0b', fontWeight:700}}>
                ⚠ {pendingCount} pending allocation{pendingCount!==1?'s':''}
              </span>
            )}
            {pendingCount === 0 && 'All teachers assigned'}
          </p>
        </div>
        <button className="btn btn-accent" onClick={openCreate}>
          <Plus size={15}/> New Class
        </button>
      </motion.div>

      {/* ── Wizard modal ── */}
      <AnimatePresence>
        {wizardOpen && (
          <motion.div className="wizard-backdrop"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            onClick={e => { if (e.target === e.currentTarget) { setWizardOpen(false); resetWizard() } }}>
            <motion.div className="wizard-modal"
              initial={{opacity:0,scale:.95,y:20}}
              animate={{opacity:1,scale:1,y:0}}
              exit={{opacity:0,scale:.95,y:20}}>

              {/* Modal header */}
              <div className="wizard-header">
                <div>
                  <h2 className="wizard-title">
                    {editingId ? 'Edit Class' : 'Create New Class'}
                  </h2>
                  <p className="wizard-sub">
                    {step===1 && 'Enter class details'}
                    {step===2 && 'Choose subjects for this class'}
                    {step===3 && 'Assign teachers — leave blank to save as pending'}
                    {step===4 && 'Setup complete'}
                  </p>
                </div>
                <button className="wizard-close"
                  onClick={() => { setWizardOpen(false); resetWizard() }}>
                  <X size={18}/>
                </button>
              </div>

              <StepBar current={step}/>

              <div className="wizard-body">

                {/* ── STEP 1: Class Details ── */}
                {step === 1 && (
                  <motion.div className="wizard-step-content"
                    initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}>
                    <div className="wizard-form-grid">
                      <div className="wiz-field">
                        <label className="wiz-label">Class Name <span className="wiz-req">*</span></label>
                        <input className="wiz-input" value={classForm.name} autoFocus
                          onChange={e=>setClassForm(f=>({...f,name:e.target.value}))}
                          placeholder="e.g. 7A, 8 Blue, Form 3" />
                      </div>
                      <div className="wiz-field">
                        <label className="wiz-label">Grade Level <span className="wiz-req">*</span></label>
                        <select className="wiz-select" value={classForm.grade_level}
                          onChange={e=>setClassForm(f=>({...f,grade_level:e.target.value}))}>
                          <option value="">Select grade ▼</option>
                          {GRADES.map(g=><option key={g} value={g}>Grade {g}</option>)}
                        </select>
                      </div>
                      <div className="wiz-field">
                        <label className="wiz-label">Stream / Section</label>
                        <input className="wiz-input" value={classForm.stream}
                          onChange={e=>setClassForm(f=>({...f,stream:e.target.value}))}
                          placeholder="e.g. Science, Arts, Blue" />
                      </div>
                      <div className="wiz-field">
                        <label className="wiz-label">Capacity</label>
                        <input className="wiz-input" type="number" min={1} max={200}
                          value={classForm.capacity}
                          onChange={e=>setClassForm(f=>({...f,capacity:+e.target.value}))} />
                      </div>
                      <div className="wiz-field">
                        <label className="wiz-label">Max Subjects Per Day</label>
                        <input className="wiz-input" type="number" min={1} max={12}
                          value={classForm.max_subjects_per_day}
                          onChange={e=>setClassForm(f=>({...f,max_subjects_per_day:+e.target.value}))} />
                      </div>
                    </div>
                    <div className="wizard-footer">
                      <button className="btn btn-accent" onClick={saveClass} disabled={saving}>
                        {saving ? 'Saving…' : <><span>Save & Continue</span> <ChevronRight size={15}/></>}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 2: Subject Selection ── */}
                {step === 2 && (
                  <motion.div className="wizard-step-content"
                    initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}>
                    <div style={{position:'relative',marginBottom:14}}>
                      <Search size={14} style={{position:'absolute',left:10,top:'50%',
                        transform:'translateY(-50%)',color:'var(--muted)',pointerEvents:'none'}}/>
                      <input className="wiz-input" style={{paddingLeft:34}}
                        value={subSearch}
                        onChange={e=>setSubSearch(e.target.value)}
                        placeholder="Search subjects…"/>
                    </div>

                    <div className="wiz-subject-grid">
                      {filteredSubjects.map(s=>(
                        <button key={s.id} type="button"
                          className={`wiz-subject-card${selectedSubjects.includes(s.id)?' selected':''}`}
                          style={selectedSubjects.includes(s.id)
                            ?{borderColor:s.color_hex,background:`${s.color_hex}18`}:{}}
                          onClick={()=>setSelectedSubjects(p=>
                            p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}>
                          <div className="wiz-subject-dot" style={{background:s.color_hex||'#6366f1'}}/>
                          <span className="wiz-subject-name">{s.name}</span>
                          {s.subject_code && <span className="wiz-subject-code">{s.subject_code}</span>}
                          {selectedSubjects.includes(s.id)&&(
                            <span className="wiz-subject-check"><Check size={11}/></span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Create new subject inline */}
                    {!addingSubject ? (
                      <button className="wiz-add-btn" onClick={()=>setAddingSubject(true)}>
                        <Plus size={14}/> Create New Subject
                      </button>
                    ) : (
                      <motion.div className="wiz-new-subject"
                        initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
                        <div className="wiz-new-subject-fields">
                          <input className="wiz-input" value={newSubjectName}
                            onChange={e=>setNewSubjectName(e.target.value)}
                            placeholder="Subject Name *" autoFocus/>
                          <input className="wiz-input" value={newSubjectCode}
                            onChange={e=>setNewSubjectCode(e.target.value)}
                            placeholder="Code (optional, e.g. MATH01)"/>
                        </div>
                        <div style={{display:'flex',gap:8,marginTop:8}}>
                          <button className="btn btn-accent btn-sm" disabled={creatingSubject}
                            onClick={createSubjectInline}>
                            {creatingSubject?'Creating…':<><Check size={13}/> Create & Select</>}
                          </button>
                          <button className="btn btn-secondary btn-sm"
                            onClick={()=>{setAddingSubject(false);setNewSubjectName('');setNewSubjectCode('')}}>
                            <X size={13}/> Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}

                    <div style={{marginTop:14,fontSize:13,color:'var(--muted)'}}>
                      {selectedSubjects.length} subject{selectedSubjects.length!==1?'s':''} selected
                    </div>

                    <div className="wizard-footer">
                      <button className="btn btn-secondary" onClick={()=>setStep(1)}>
                        <ChevronLeft size={15}/> Back
                      </button>
                      <button className="btn btn-accent"
                        onClick={()=>{
                          if(!selectedSubjects.length){toast.error('Select at least one subject');return}
                          setStep(3)
                        }}>
                        Continue <ChevronRight size={15}/>
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 3: Teacher Assignment ── */}
                {step === 3 && (
                  <motion.div className="wizard-step-content"
                    initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}>
                    <div className="wiz-info-banner">
                      <AlertCircle size={14}/>
                      <span>
                        Subjects without a teacher will be saved as <strong>Pending</strong>.
                        You can assign them later from the dashboard — no errors will block you.
                      </span>
                    </div>

                    <div className="wiz-teacher-list">
                      {selectedSubjects.map(sid=>{
                        const subj = subjects.find(s=>s.id===sid)
                        if(!subj) return null
                        const hasTeacher = !!(teacherMap[sid])
                        return (
                          <div key={sid} className={`wiz-teacher-row${hasTeacher?'':' pending'}`}>
                            <div className="wiz-teacher-subject">
                              <div className="wiz-teacher-dot"
                                style={{background:subj.color_hex||'#6366f1'}}/>
                              <div>
                                <div className="wiz-teacher-subj-name">{subj.name}</div>
                                {subj.subject_code&&(
                                  <div className="wiz-teacher-code">{subj.subject_code}</div>
                                )}
                              </div>
                            </div>
                            <ArrowRight size={14} style={{color:'var(--muted)',flexShrink:0}}/>
                            <select
                              className="wiz-teacher-select"
                              value={teacherMap[sid]||''}
                              onChange={e=>setTeacherMap(m=>({...m,[sid]:e.target.value}))}>
                              <option value="">— Leave Blank (Pending) —</option>
                              {teachers.map(t=>(
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                            <div className={`wiz-teacher-status${hasTeacher?' assigned':' pending'}`}>
                              {hasTeacher
                                ? <><CheckCircle size={12}/> Assigned</>
                                : <><Clock size={12}/> Pending</>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="wizard-footer">
                      <button className="btn btn-secondary" onClick={()=>setStep(2)}>
                        <ChevronLeft size={15}/> Back
                      </button>
                      <button className="btn btn-accent" onClick={saveAllocations} disabled={saving}>
                        {saving?'Saving…':<><Check size={15}/> SAVE ALLOCATION</>}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── STEP 4: Done ── */}
                {step === 4 && saveResult && (
                  <motion.div className="wizard-step-content"
                    initial={{opacity:0,scale:.95}} animate={{opacity:1,scale:1}}
                    style={{textAlign:'center',padding:'32px 20px'}}>
                    <motion.div
                      initial={{scale:0}} animate={{scale:1}}
                      transition={{type:'spring',stiffness:300,delay:.1}}
                      style={{
                        width:64,height:64,borderRadius:'50%',margin:'0 auto 20px',
                        background:'rgba(16,185,129,.12)',
                        display:'flex',alignItems:'center',justifyContent:'center',
                      }}>
                      <CheckCircle size={32} color="#10b981"/>
                    </motion.div>
                    <h3 style={{fontSize:20,fontWeight:800,color:'var(--text)',marginBottom:8}}>
                      Setup Complete!
                    </h3>
                    <p style={{color:'var(--muted)',marginBottom:20,fontSize:14}}>
                      {saveResult.message}
                    </p>
                    <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap'}}>
                      <div className="wiz-result-stat" style={{background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.2)'}}>
                        <span style={{fontSize:28,fontWeight:900,color:'#10b981'}}>{saveResult.assigned_count}</span>
                        <span style={{fontSize:12,color:'#10b981'}}>Assigned</span>
                      </div>
                      {saveResult.pending_count>0&&(
                        <div className="wiz-result-stat" style={{background:'rgba(245,158,11,.08)',border:'1px solid rgba(245,158,11,.2)'}}>
                          <span style={{fontSize:28,fontWeight:900,color:'#f59e0b'}}>{saveResult.pending_count}</span>
                          <span style={{fontSize:12,color:'#f59e0b'}}>Pending</span>
                        </div>
                      )}
                    </div>
                    <div className="wizard-footer" style={{justifyContent:'center',marginTop:28}}>
                      <button className="btn btn-secondary"
                        onClick={()=>{resetWizard();setWizardOpen(false)}}>
                        Close
                      </button>
                      <button className="btn btn-accent"
                        onClick={()=>{resetWizard()}}>
                        <Plus size={14}/> Add Another Class
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Class list ── */}
      <div style={{position:'relative',marginBottom:16,maxWidth:360}}>
        <Search size={14} style={{position:'absolute',left:10,top:'50%',
          transform:'translateY(-50%)',color:'var(--muted)',pointerEvents:'none'}}/>
        <input style={{width:'100%',padding:'9px 12px 9px 34px',
          background:'var(--surface)',border:'1px solid var(--border)',
          borderRadius:'var(--r-lg)',fontSize:13,color:'var(--text)',outline:'none'}}
          placeholder="Search classes…"
          value={classSearch} onChange={e=>setClassSearch(e.target.value)}/>
      </div>

      {loading ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{height:160,background:'var(--surface)',
              border:'1px solid var(--border)',borderRadius:'var(--r-xl)',
              animation:'pulse 1.5s ease-in-out infinite'}}/>
          ))}
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="exam-empty">
          <School size={44} style={{color:'var(--muted)'}}/>
          <h3 className="exam-empty-title">
            {classSearch?'No matching classes':'No classes yet'}
          </h3>
          <p className="exam-empty-body">
            {classSearch?'Try a different search':'Create your first class to get started'}
          </p>
          {!classSearch&&<button className="btn btn-accent" onClick={openCreate}><Plus size={14}/> New Class</button>}
        </div>
      ) : (
        <div className="class-grid">
          {filteredClasses.map((cls,i)=>{
            const clsAllocs  = allocs[cls.id]||[]
            const assigned   = clsAllocs.filter(a=>a.status==='assigned').length
            const pending    = clsAllocs.filter(a=>a.status==='pending').length
            const hasPending = pending > 0
            return (
              <motion.div key={cls.id} className="class-card"
                initial={{opacity:0,y:16}} animate={{opacity:1,y:0}}
                transition={{delay:i*.04}}>
                <div className="class-card-top">
                  <div className="class-avatar"
                    style={{background:avatarBg(cls.name)}}>
                    {cls.name.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="class-name">{cls.name}</div>
                    <div className="class-meta">
                      Grade {cls.grade_level}
                      {cls.stream&&<> · {cls.stream}</>}
                      {cls.capacity&&<> · {cls.capacity} students</>}
                    </div>
                  </div>
                  {hasPending&&(
                    <span className="class-pending-badge">
                      <AlertCircle size={11}/> {pending} pending
                    </span>
                  )}
                </div>

                {/* Allocation pills */}
                {clsAllocs.length>0&&(
                  <div className="class-alloc-pills">
                    {clsAllocs.slice(0,6).map(a=>(
                      <span key={a.id}
                        className={`class-alloc-pill${a.status==='pending'?' pending':''}`}
                        style={a.status==='assigned'
                          ?{background:`${a.subject_color||'#6366f1'}18`,
                            color:a.subject_color||'#6366f1',
                            borderColor:`${a.subject_color||'#6366f1'}44`}:{}}>
                        {a.subject_name}
                        {a.status==='pending'&&' ⏳'}
                      </span>
                    ))}
                    {clsAllocs.length>6&&(
                      <span className="class-alloc-pill" style={{color:'var(--muted)'}}>
                        +{clsAllocs.length-6} more
                      </span>
                    )}
                  </div>
                )}

                {clsAllocs.length===0&&(
                  <div style={{fontSize:12,color:'var(--muted)',fontStyle:'italic',
                    padding:'8px 0'}}>No subjects assigned yet</div>
                )}

                <div style={{marginTop:12,fontSize:12,color:'var(--muted)',
                  display:'flex',gap:12}}>
                  {assigned>0&&<span style={{color:'#10b981'}}>✓ {assigned} assigned</span>}
                  {pending>0 &&<span style={{color:'#f59e0b'}}>⏳ {pending} pending</span>}
                </div>

                <div className="class-actions">
                  <button className="btn btn-sm btn-secondary" onClick={()=>openEdit(cls)}>
                    <Pencil size={13}/> Edit
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={()=>openEdit(cls)}>
                    <Users size={13}/> Allocate
                  </button>
                  <button className="btn btn-sm"
                    style={{marginLeft:'auto',color:'var(--red,#ef4444)',
                      background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)'}}
                    onClick={()=>deleteClass(cls.id)}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
