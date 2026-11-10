import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { personalTimetableAPI } from '../api/client'
import { personalExtrasAPI } from '../api/personalExtras'
import toast from 'react-hot-toast'
import {
  Plus, Home, Briefcase, Trash2, X, Check, Clock, Palette, Pencil,
  LayoutTemplate, Upload, Download, FileDown, User as UserIcon, Users
} from 'lucide-react'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const COLORS = ['#38bdf8','#f59e0b','#4ade80','#a855f7','#ec4899','#f97316','#14b8a6','#ef4444']
const KIND_META = {
  home:   { icon: <Home size={14}/>,      label: 'Home' },
  office: { icon: <Briefcase size={14}/>, label: 'Office' },
  other:  { icon: <Clock size={14}/>,     label: 'Other' },
}
const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const blankBlock = (day = 'Monday') => ({ label:'', day, start_time:'08:00', end_time:'09:00', color_hex: COLORS[0], notes:'', assignee:'' })

export default function PersonalTimetable() {
  const [timetables, setTimetables] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showNewTT, setShowNewTT] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('home')

  // template gallery
  const [showTpl, setShowTpl] = useState(false)
  const [templates, setTemplates] = useState([])
  const [pickedTpl, setPickedTpl] = useState(null)
  const [tplName, setTplName] = useState('')
  const [tplPeople, setTplPeople] = useState('')
  const [creatingTpl, setCreatingTpl] = useState(false)

  // block editor (add + edit share one form)
  const [blockForm, setBlockForm] = useState(null)   // null | { id?: string, ...fields }
  const [saving, setSaving] = useState(false)
  const [person, setPerson] = useState('')            // filter by person
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  const load = async (keepActive) => {
    setLoading(true)
    try {
      const r = await personalTimetableAPI.list()
      setTimetables(r.data)
      if (!keepActive && r.data.length && !activeId) setActiveId(r.data[0].id)
    } catch { toast.error('Could not load your timetables') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const active = timetables.find(t => t.id === activeId)
  const people = active ? [...new Set(active.blocks.map(b => b.assignee).filter(Boolean))].sort() : []

  // ── timetables ──────────────────────────────────────────────────────────
  const createTimetable = async () => {
    if (!newName.trim()) { toast.error('Give it a name'); return }
    try {
      const r = await personalTimetableAPI.create({ name: newName.trim(), kind: newKind })
      toast.success(`"${r.data.name}" created ✅`)
      setShowNewTT(false); setNewName(''); setNewKind('home')
      await load(true); setActiveId(r.data.id)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Create failed') }
  }
  const deleteTimetable = async (id) => {
    if (!window.confirm('Delete this timetable and all its tasks?')) return
    try { await personalTimetableAPI.delete(id); toast.success('Deleted'); if (activeId === id) setActiveId(null); load() }
    catch { toast.error('Delete failed') }
  }

  // ── templates ───────────────────────────────────────────────────────────
  const openGallery = async () => {
    setShowTpl(true); setPickedTpl(null)
    if (!templates.length) {
      try { setTemplates((await personalExtrasAPI.templates()).data) }
      catch { toast.error('Could not load templates') }
    }
  }
  const useTemplate = async () => {
    if (!pickedTpl) return
    setCreatingTpl(true)
    try {
      const r = await personalExtrasAPI.fromTemplate({
        template_id: pickedTpl.id, name: tplName.trim() || undefined,
        people: tplPeople.split(/[,\n]/).map(s => s.trim()).filter(Boolean),
      })
      toast.success(`"${r.data.name}" created with ${r.data.block_count} tasks — edit anything you like ✅`, { duration: 5000 })
      setShowTpl(false); setTplName(''); setTplPeople('')
      await load(true); setActiveId(r.data.id)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create from template') }
    finally { setCreatingTpl(false) }
  }

  // ── blocks ──────────────────────────────────────────────────────────────
  const saveBlock = async () => {
    const b = blockForm
    if (!b.label.trim()) { toast.error('Give the task a name'); return }
    if (b.start_time >= b.end_time) { toast.error('End time must be after start time'); return }
    setSaving(true)
    const body = { label: b.label.trim(), day: b.day, start_time: b.start_time, end_time: b.end_time,
                   color_hex: b.color_hex, notes: b.notes || '', assignee: (b.assignee || '').trim() }
    try {
      if (b.id) await personalTimetableAPI.updateBlock(b.id, body)
      else await personalTimetableAPI.addBlock(active.id, body)
      toast.success(b.id ? 'Saved ✅' : 'Added ✅')
      setBlockForm(null); load(true)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not save') }
    finally { setSaving(false) }
  }
  const deleteBlock = async (id) => {
    try { await personalTimetableAPI.deleteBlock(id); setBlockForm(null); load(true) }
    catch { toast.error('Delete failed') }
  }

  // ── import / export ─────────────────────────────────────────────────────
  const doImport = async (e) => {
    const file = e.target.files?.[0]; if (!file || !active) return
    setImporting(true)
    try {
      const r = await personalExtrasAPI.importFile(active.id, file)
      toast.success(r.data.message, { duration: 5000 })
      ;(r.data.errors || []).slice(0, 4).forEach(m => toast(m, { icon: 'ℹ️', duration: 6000 }))
      load(true)
    } catch (err) { toast.error(err?.response?.data?.detail || 'Import failed') }
    finally { setImporting(false); e.target.value = '' }
  }
  const doExport = async () => {
    try {
      const r = await personalExtrasAPI.exportBlob(active.id)
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a'); a.href = url
      a.download = `${active.name.replace(/[^\w-]+/g, '_')}.csv`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { toast.error('Export failed') }
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Home &amp; Personal Timetables</h1>
          <p className="page-subtitle">Chores, family routines, work-from-home, study and more — start from a template or import your own sheet.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowNewTT(true)}><Plus size={15}/> Blank</button>
          <button className="btn btn-accent" onClick={openGallery}><LayoutTemplate size={15}/> Use a Template</button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showNewTT && (
          <motion.div className="card mb-4" initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={newName} autoFocus onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Home routine, Office week" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(KIND_META).map(([k, m]) => (
                  <button key={k} type="button" className={`btn btn-sm ${newKind === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setNewKind(k)}>{m.icon} {m.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-accent" onClick={createTimetable}><Check size={14}/> Create</button>
              <button className="btn btn-secondary" onClick={() => setShowNewTT(false)}><X size={14}/> Cancel</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner"/></div>
      ) : timetables.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Home size={52}/></div>
          <div className="empty-state-title">No timetables yet</div>
          <div className="empty-state-sub">Pick a ready-made template (chores rota, kids' routine, meal plan…) or import a spreadsheet.</div>
          <button className="btn btn-accent" style={{ marginTop:16 }} onClick={openGallery}><LayoutTemplate size={14}/> Browse Templates</button>
        </div>
      ) : (
        <>
          <div className="flex-row mb-4" style={{ flexWrap:'wrap', gap:6 }}>
            {timetables.map(t => (
              <button key={t.id} className={`btn btn-sm ${activeId === t.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setActiveId(t.id); setPerson('') }}>
                {KIND_META[t.kind]?.icon} {t.name}<span style={{ marginLeft:6, opacity:.6, fontSize:11 }}>({t.block_count})</span>
              </button>
            ))}
          </div>

          {active && (
            <motion.div className="card" key={active.id} initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
              <div className="card-header" style={{ flexWrap:'wrap', gap:10 }}>
                <div className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>{KIND_META[active.kind]?.icon} {active.name}</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setBlockForm(blankBlock())}><Plus size={13}/> Add task</button>
                  <button className="btn btn-secondary btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}><Upload size={13}/> {importing ? 'Importing…' : 'Import CSV / Excel'}</button>
                  <a className="btn btn-ghost btn-sm" style={{ textDecoration:'none' }} href={personalExtrasAPI.importTemplateUrl()}><FileDown size={13}/> Sample file</a>
                  <button className="btn btn-ghost btn-sm" onClick={doExport}><Download size={13}/> Export CSV</button>
                  <button className="btn btn-sm delete-btn" onClick={() => deleteTimetable(active.id)}><Trash2 size={13}/></button>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display:'none' }} onChange={doImport} />
                </div>
              </div>

              {people.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
                  <span style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}><Users size={12}/> Show tasks for:</span>
                  <button className={`exam-day-btn${!person ? ' active' : ''}`} onClick={() => setPerson('')}>Everyone</button>
                  {people.map(p => <button key={p} className={`exam-day-btn${person === p ? ' active' : ''}`} onClick={() => setPerson(person === p ? '' : p)}>{p}</button>)}
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, minmax(130px, 1fr))', gap:8, overflowX:'auto' }}>
                {DAYS.map(day => {
                  const dayBlocks = active.blocks.filter(b => b.day === day && (!person || b.assignee === person))
                    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
                  return (
                    <div key={day} style={{ minWidth:130 }}>
                      <div style={{ fontSize:11.5, fontWeight:800, color:'var(--text)', textAlign:'center', padding:'6px 0', background:'var(--surface-2)', borderRadius:8, marginBottom:8 }}>{day.slice(0,3)}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6, minHeight:120 }}>
                        {dayBlocks.map(b => (
                          <div key={b.id} onClick={() => setBlockForm({ ...blankBlock(b.day), ...b, notes: b.notes || '', assignee: b.assignee || '' })}
                            style={{ borderLeft:`3px solid ${b.color_hex}`, background:`${b.color_hex}14`, borderRadius:8, padding:'7px 9px', cursor:'pointer' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{b.label}</div>
                            <div style={{ fontSize:10.5, color:'var(--muted)', fontFamily:'var(--font-numeric)' }}>{b.start_time}–{b.end_time}</div>
                            {b.assignee && <div style={{ fontSize:10.5, fontWeight:700, color:b.color_hex, marginTop:2, display:'flex', alignItems:'center', gap:3 }}><UserIcon size={9}/> {b.assignee}</div>}
                            {b.notes && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}>{b.notes}</div>}
                          </div>
                        ))}
                        <button onClick={() => setBlockForm(blankBlock(day))}
                          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:8, borderRadius:8, border:'1.5px dashed var(--border-2)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer' }}>
                          <Plus size={11}/> Add
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="form-hint" style={{ marginTop:10 }}>Click any task to edit its name, time, day, colour, notes or who is responsible.</div>
            </motion.div>
          )}
        </>
      )}

      {/* ── Template gallery ── */}
      <AnimatePresence>
        {showTpl && (
          <motion.div className="exam-modal-backdrop" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} onClick={() => setShowTpl(false)}>
            <motion.div className="exam-modal" initial={{ opacity:0, scale:.96, y:20 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:.96, y:20 }} onClick={e => e.stopPropagation()}>
              <div className="exam-modal-header">
                <div>
                  <h2 className="exam-modal-title">Schedule templates</h2>
                  <p className="exam-modal-sub">Pick one — every task can be edited, moved or deleted afterwards.</p>
                </div>
                <button className="exam-modal-close" onClick={() => setShowTpl(false)}><X size={18}/></button>
              </div>
              <div className="exam-tpl-grid">
                {templates.map(t => (
                  <motion.button key={t.id} type="button" className={`exam-tpl-card${pickedTpl?.id === t.id ? ' selected' : ''}`}
                    whileHover={{ y:-2 }} onClick={() => { setPickedTpl(t); setTplName(t.name) }}>
                    <div className="exam-tpl-icon">{t.icon}</div>
                    <div className="exam-tpl-name">{t.name}</div>
                    <div className="exam-tpl-desc">{t.description}</div>
                    <div className="exam-tpl-pills">
                      <span className="exam-tpl-pill">{t.block_count} tasks</span>
                      {t.shares_tasks && <span className="exam-tpl-pill">shared between people</span>}
                    </div>
                    {pickedTpl?.id === t.id && <div className="exam-tpl-check"><Check size={12}/></div>}
                  </motion.button>
                ))}
              </div>
              {pickedTpl && (
                <div className="exam-tpl-apply-form">
                  <div className="exam-tpl-apply-row">
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input className="form-input" value={tplName} onChange={e => setTplName(e.target.value)} />
                    </div>
                    {pickedTpl.shares_tasks && (
                      <div className="form-group">
                        <label className="form-label">Who is in the household? (comma-separated)</label>
                        <input className="form-input" value={tplPeople} placeholder="e.g. Amina, Brian, Cate"
                          onChange={e => setTplPeople(e.target.value)} />
                        <div className="form-hint">Tasks are shared out fairly in turn. Leave empty to assign later.</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowTpl(false)}>Cancel</button>
                    <button className="btn btn-accent" disabled={creatingTpl} onClick={useTemplate}>{creatingTpl ? 'Creating…' : <><Check size={14}/> Create timetable</>}</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add / edit task ── */}
      <AnimatePresence>
        {blockForm && (
          <motion.div className="modal-overlay" onClick={() => setBlockForm(null)} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="modal" onClick={e => e.stopPropagation()} initial={{ opacity:0, y:16, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:10, scale:.97 }} style={{ maxWidth:440 }}>
              <div className="modal-title">{blockForm.id ? 'Edit task' : 'Add task'}</div>
              <div className="form-group">
                <label className="form-label">Task</label>
                <input className="form-input" autoFocus value={blockForm.label} placeholder="e.g. Wash dishes, Gym, Kids pickup"
                  onChange={e => setBlockForm(f => ({ ...f, label: e.target.value }))} />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Day</label>
                  <select className="form-select" value={blockForm.day} onChange={e => setBlockForm(f => ({ ...f, day: e.target.value }))}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Who? (optional)</label>
                  <input className="form-input" list="people-list" value={blockForm.assignee} placeholder="Name"
                    onChange={e => setBlockForm(f => ({ ...f, assignee: e.target.value }))} />
                  <datalist id="people-list">{people.map(p => <option key={p} value={p} />)}</datalist>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Start</label>
                  <input type="time" className="form-input" value={blockForm.start_time} onChange={e => setBlockForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End</label>
                  <input type="time" className="form-input" value={blockForm.end_time} onChange={e => setBlockForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label"><Palette size={12}/> Colour</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {COLORS.map(c => <div key={c} onClick={() => setBlockForm(f => ({ ...f, color_hex: c }))} className={`color-swatch${blockForm.color_hex === c ? ' selected' : ''}`} style={{ background: c }} />)}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={blockForm.notes} placeholder="e.g. the meal, what to bring"
                  onChange={e => setBlockForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="modal-actions" style={{ justifyContent:'space-between' }}>
                {blockForm.id ? <button className="btn btn-sm delete-btn" onClick={() => deleteBlock(blockForm.id)}><Trash2 size={13}/> Delete</button> : <span />}
                <div style={{ display:'flex', gap:10 }}>
                  <button className="btn btn-ghost" onClick={() => setBlockForm(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveBlock} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
