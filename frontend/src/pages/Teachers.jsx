import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { teachersAPI, subjectsAPI, classesAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Trash2, BookOpen, X, Save,
  User, Mail, Phone, Clock, Calendar,
  CheckCircle, ChevronRight, Search
} from 'lucide-react'

const DAYS   = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const COLORS = ['#2952a3','#0d9488','#d97706','#7c3aed','#dc2626','#0891b2','#16a34a']
const initials = name => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
const avatarColor = name => COLORS[name.charCodeAt(0) % COLORS.length]

const empty = {
  name:'', email:'', phone:'',
  initials:'', short_name:'',
  is_part_time:false, max_weekly_hours:30,
  days_off:'', unavailable_slots:''
}

export default function Teachers() {
  const [teachers,      setTeachers]      = useState([])
  const [subjects,      setSubjects]      = useState([])
  const [classes,       setClasses]       = useState([])
  const [selected,      setSelected]      = useState(null)   // teacher being edited/assigned
  const [formMode,      setFormMode]      = useState('create') // 'create'|'edit'|'assign'
  const [form,          setForm]          = useState(empty)
  const [selectedSubs,  setSelectedSubs]  = useState([])
  const [saving,        setSaving]        = useState(false)
  const [search,        setSearch]        = useState('')
  // Quick-assign fields
  const [qaSubject,     setQaSubject]     = useState('')
  const [qaClass,       setQaClass]       = useState('')
  const [qaPeriods,     setQaPeriods]     = useState(4)

  const load = async () => {
    const [t, s, c] = await Promise.all([
      teachersAPI.list(), subjectsAPI.list(), classesAPI.list()
    ])
    setTeachers(t.data); setSubjects(s.data); setClasses(c.data)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setSelected(null); setForm(empty); setSelectedSubs([])
    setFormMode('create')
  }

  const openEdit = (t, e) => {
    e?.stopPropagation()
    setSelected(t)
    setForm({
      name:t.name, email:t.email||'', phone:t.phone||'',
      is_part_time:t.is_part_time,
      max_weekly_hours:t.max_weekly_hours,
      days_off:t.days_off||'',
      unavailable_slots:t.unavailable_slots||''
    })
    setSelectedSubs(t.subject_ids||[])
    setFormMode('edit')
  }

  const openAssign = (t, e) => {
    e?.stopPropagation()
    setSelected(t)
    setSelectedSubs(t.subject_ids||[])
    setQaSubject(''); setQaClass(''); setQaPeriods(4)
    setFormMode('assign')
  }

  const saveTeacher = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      if (formMode === 'create') {
        const r = await teachersAPI.create(form)
        // auto-open assignment panel for the new teacher
        const newT = r.data
        setSelected(newT); setSelectedSubs([])
        setFormMode('assign')
        toast.success(`${form.name} added ✅ — now assign subjects`)
      } else {
        await teachersAPI.update(selected.id, form)
        toast.success('Teacher updated ✅')
        setFormMode('assign')
      }
      load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const saveSubjects = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await teachersAPI.assignSubjects(selected.id, selectedSubs)
      toast.success(`Subjects assigned to ${selected.name} ✅`)
      load()
    } catch { toast.error('Assignment failed') }
    finally { setSaving(false) }
  }

  const deleteTeacher = async (id, e) => {
    e?.stopPropagation()
    if (!window.confirm('Delete this teacher?')) return
    await teachersAPI.delete(id)
    toast.success('Teacher deleted')
    if (selected?.id === id) { setSelected(null); setFormMode('create') }
    load()
  }

  const toggleDay = (day) => {
    const list = form.days_off.split(',').map(d=>d.trim()).filter(Boolean)
    const next = list.includes(day) ? list.filter(d=>d!==day) : [...list, day]
    setForm(f => ({ ...f, days_off: next.join(',') }))
  }

  const toggleSubject = (id) =>
    setSelectedSubs(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id])

  const daysOff = form.days_off.split(',').map(d=>d.trim()).filter(Boolean)

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.email||'').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page-container">
      {/* ── Page header ── */}
      <motion.div className="page-header"
        initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Teachers</h1>
          <p className="page-subtitle">{teachers.length} staff member{teachers.length!==1?'s':''} · manage and assign subjects</p>
        </div>
        <button className="btn btn-accent" onClick={openCreate}>
          <Plus size={15}/> Add Teacher
        </button>
      </motion.div>

      <div className="teacher-layout">

        {/* ── Left: Teacher List ── */}
        <div className="teacher-list-panel">
          {/* Search */}
          <div style={{ position:'relative', marginBottom:14 }}>
            <Search size={14} style={{ position:'absolute', left:12, top:'50%',
              transform:'translateY(-50%)', color:'var(--muted)', pointerEvents:'none' }}/>
            <input
              style={{ width:'100%', padding:'9px 12px 9px 36px',
                background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:'var(--r-lg)', fontSize:13, color:'var(--text)', outline:'none' }}
              placeholder="Search teachers…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* List */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.length === 0 && (
              <div className="exam-empty" style={{ padding:'40px 0' }}>
                <User size={36} style={{ color:'var(--muted)' }}/>
                <p style={{ color:'var(--muted)', margin:8 }}>
                  {search ? 'No teachers match your search' : 'No teachers yet'}
                </p>
                {!search && (
                  <button className="btn btn-accent" onClick={openCreate}>
                    <Plus size={14}/> Add First Teacher
                  </button>
                )}
              </div>
            )}
            <AnimatePresence>
              {filtered.map((t, i) => (
                <motion.div key={t.id}
                  className={`teacher-card${selected?.id===t.id?' selected':''}`}
                  initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
                  exit={{opacity:0,scale:.97}}
                  transition={{delay:i*.04}}
                  onClick={() => openAssign(t)}>

                  <div className="teacher-avatar"
                    style={{ background: avatarColor(t.name) }}
                    title={`Initials: ${t.initials || initials(t.name)} | Short: ${t.short_name || t.name}`}>
                    {t.initials || initials(t.name)}
                  </div>

                  <div className="teacher-info">
                    <div className="teacher-name">{t.name}</div>
                    <div className="teacher-meta">
                      {t.email || 'No email'} ·{' '}
                      <span style={{ color: t.is_part_time ? '#f59e0b' : '#10b981' }}>
                        {t.is_part_time ? 'Part-time' : 'Full-time'}
                      </span>
                      {' '}· {t.max_weekly_hours}h/wk
                    </div>
                    <div style={{ marginTop:5, display:'flex', gap:5, flexWrap:'wrap' }}>
                      {(t.subject_ids||[]).slice(0,4).map(sid => {
                        const subj = subjects.find(s=>s.id===sid)
                        return subj ? (
                          <span key={sid} style={{
                            fontSize:10, fontWeight:700, padding:'2px 7px',
                            borderRadius:10, background: `${subj.color_hex||'#6366f1'}22`,
                            color: subj.color_hex||'#6366f1'
                          }}>{subj.name}</span>
                        ) : null
                      })}
                      {(t.subject_ids||[]).length > 4 && (
                        <span style={{ fontSize:10, color:'var(--muted)' }}>
                          +{(t.subject_ids||[]).length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="teacher-actions" onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-sm btn-secondary"
                      onClick={e=>openEdit(t,e)} title="Edit teacher">
                      <Pencil size={13}/>
                    </button>
                    <button className="btn btn-sm"
                      style={{ color:'var(--red,#ef4444)', background:'rgba(239,68,68,.08)',
                               border:'1px solid rgba(239,68,68,.2)' }}
                      onClick={e=>deleteTeacher(t.id,e)} title="Delete">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: Form Panel ── */}
        <div className="teacher-form-panel">
          <div className="teacher-form-card">
            <div className="teacher-form-header">
              <div>
                <div className="teacher-form-title">
                  {formMode === 'create' ? '+ New Teacher'
                  : formMode === 'edit'   ? `Edit — ${selected?.name}`
                  : `Assign — ${selected?.name}`}
                </div>
                <div className="teacher-form-sub">
                  {formMode === 'create' ? 'Fill in details, then assign subjects'
                  : formMode === 'edit'   ? 'Update teacher details'
                  : 'Assign subjects this teacher can teach'}
                </div>
              </div>
              {formMode !== 'create' && (
                <button style={{ background:'none', border:'none', cursor:'pointer',
                  color:'var(--muted)', padding:4 }} onClick={openCreate}>
                  <X size={16}/>
                </button>
              )}
            </div>

            <div className="teacher-form-body">

              {/* ── CREATE / EDIT form ── */}
              {(formMode === 'create' || formMode === 'edit') && (<>
                <span className="teacher-form-section">Personal Info</span>

                <div className="teacher-form-field">
                  <label className="teacher-form-label">
                    <User size={12}/> Teacher Name <span className="req">*</span>
                  </label>
                  <input className="teacher-form-input" value={form.name} autoFocus
                    onChange={e => {
                      const n = e.target.value
                      const titles = new Set(['mr','mrs','ms','dr','prof','rev'])
                      const parts = n.trim().split(' ').filter(p => !titles.has(p.toLowerCase().replace('.','')))
                      const autoInit = parts.map(p=>p[0]?.toUpperCase()||'').join('').slice(0,4)
                      const autoShort = parts.length >= 2
                        ? `${n.trim().split(' ')[0]} ${parts[parts.length-1]}`
                        : n
                      setForm(f=>({...f, name:n,
                        initials:   f.initials   || autoInit,
                        short_name: f.short_name || autoShort,
                      }))
                    }}
                    placeholder="e.g. Mrs Alice Kamau" />
                </div>

                <div className="teacher-form-row">
                  <div className="teacher-form-field">
                    <label className="teacher-form-label">Initials</label>
                    <input className="teacher-form-input" value={form.initials}
                      onChange={e => setForm(f=>({...f, initials:e.target.value.toUpperCase().slice(0,4)}))}
                      placeholder="AK" maxLength={4}
                      style={{fontFamily:'var(--font-numeric)',fontWeight:800,letterSpacing:2}} />
                    <span style={{fontSize:10,color:'var(--muted)',marginTop:2}}>Auto-filled from name</span>
                  </div>
                  <div className="teacher-form-field">
                    <label className="teacher-form-label">Short Name</label>
                    <input className="teacher-form-input" value={form.short_name}
                      onChange={e => setForm(f=>({...f, short_name:e.target.value}))}
                      placeholder="Mrs Kamau" />
                    <span style={{fontSize:10,color:'var(--muted)',marginTop:2}}>Used on compact exports</span>
                  </div>
                </div>

                <div className="teacher-form-row">
                  <div className="teacher-form-field">
                    <label className="teacher-form-label"><Mail size={12}/> Email</label>
                    <input className="teacher-form-input" type="email" value={form.email}
                      onChange={e => setForm(f=>({...f,email:e.target.value}))}
                      placeholder="alice@school.edu" />
                  </div>
                  <div className="teacher-form-field">
                    <label className="teacher-form-label"><Phone size={12}/> Phone</label>
                    <input className="teacher-form-input" value={form.phone||''}
                      onChange={e => setForm(f=>({...f,phone:e.target.value}))}
                      placeholder="+254 700 000 000" />
                  </div>
                </div>

                <div className="teacher-form-divider"/>
                <span className="teacher-form-section">Schedule Settings</span>

                <div className="teacher-form-row">
                  <div className="teacher-form-field">
                    <label className="teacher-form-label"><Clock size={12}/> Max Hrs/Week</label>
                    <input className="teacher-form-input" type="number" min={1} max={45}
                      value={form.max_weekly_hours}
                      onChange={e => setForm(f=>({...f,max_weekly_hours:+e.target.value}))} />
                  </div>
                  <div className="teacher-form-field" style={{ justifyContent:'flex-end' }}>
                    <label className="teacher-form-label">
                      <input type="checkbox" checked={form.is_part_time}
                        onChange={e => setForm(f=>({...f,is_part_time:e.target.checked}))}
                        style={{ marginRight:6 }} />
                      Part-time
                    </label>
                  </div>
                </div>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><Calendar size={12}/> Days Off</label>
                  <div className="teacher-form-days">
                    {DAYS.map(d => (
                      <button key={d} type="button"
                        className={`teacher-form-day${daysOff.includes(d)?' off':''}`}
                        onClick={() => toggleDay(d)}>
                        {d.slice(0,3)}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                    Click days this teacher is unavailable
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
                  <button className="teacher-form-save" onClick={saveTeacher} disabled={saving}>
                    <Save size={14}/>
                    {saving ? 'Saving…' : formMode==='create' ? 'SAVE & ASSIGN SUBJECTS →' : 'SAVE TEACHER'}
                  </button>
                  {formMode === 'edit' && (
                    <button className="teacher-form-cancel" onClick={openCreate}>
                      Cancel
                    </button>
                  )}
                </div>
              </>)}

              {/* ── ASSIGN form ── */}
              {formMode === 'assign' && selected && (<>
                <span className="teacher-form-section">Subject Assignment</span>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>
                  Select all subjects <strong>{selected.name.split(' ')[0]}</strong> can teach:
                </div>

                <div className="subject-chips">
                  {subjects.map(s => (
                    <button key={s.id} type="button"
                      className={`subject-chip${selectedSubs.includes(s.id)?' selected':''}`}
                      style={selectedSubs.includes(s.id)
                        ? { background: s.color_hex||'#6366f1',
                            borderColor: s.color_hex||'#6366f1' }
                        : {}}
                      onClick={() => toggleSubject(s.id)}>
                      {s.name}
                      {selectedSubs.includes(s.id) && ' ✓'}
                    </button>
                  ))}
                </div>

                {selectedSubs.length > 0 && (
                  <div style={{ padding:'10px 12px', background:'rgba(16,185,129,.06)',
                    border:'1px solid rgba(16,185,129,.2)', borderRadius:8,
                    fontSize:12, color:'#10b981' }}>
                    ✓ {selectedSubs.length} subject{selectedSubs.length!==1?'s':''} selected
                  </div>
                )}

                <div className="teacher-form-divider"/>
                <span className="teacher-form-section">Quick Allocation</span>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>
                  Allocate a specific subject to a class:
                </div>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><BookOpen size={12}/> Subject</label>
                  <select className="teacher-form-select" value={qaSubject}
                    onChange={e => setQaSubject(e.target.value)}>
                    <option value="">Select Subject ▼</option>
                    {subjects.filter(s => selectedSubs.includes(s.id)).map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Gr {s.grade_level})</option>
                    ))}
                    {selectedSubs.length === 0 && subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Gr {s.grade_level})</option>
                    ))}
                  </select>
                </div>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><BookOpen size={12}/> Class</label>
                  <select className="teacher-form-select" value={qaClass}
                    onChange={e => setQaClass(e.target.value)}>
                    <option value="">Select Class ▼</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — Grade {c.grade_level}</option>
                    ))}
                  </select>
                </div>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><Clock size={12}/> Weekly Periods</label>
                  <input className="teacher-form-input" type="number" min={1} max={12}
                    value={qaPeriods} onChange={e => setQaPeriods(+e.target.value)} />
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
                  <button className="teacher-form-save" onClick={saveSubjects} disabled={saving}>
                    <CheckCircle size={14}/>
                    {saving ? 'Saving…' : 'SAVE ASSIGNMENT'}
                  </button>
                  <button className="teacher-form-cancel"
                    onClick={() => openEdit(selected)}>
                    ← Back to edit teacher
                  </button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
