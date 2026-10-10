import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { personalTimetableAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  Plus, Home, Briefcase, Trash2, X, Check, Clock, Palette
} from 'lucide-react'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6)   // 06:00 → 22:00
const COLORS = ['#38bdf8','#f59e0b','#4ade80','#a855f7','#ec4899','#f97316','#14b8a6','#ef4444']

const KIND_META = {
  home:   { icon: <Home size={14}/>,      label: 'Home' },
  office: { icon: <Briefcase size={14}/>, label: 'Office' },
  other:  { icon: <Clock size={14}/>,     label: 'Other' },
}

function toMinutes(t) { const [h,m] = t.split(':').map(Number); return h*60+m }

export default function PersonalTimetable() {
  const [timetables, setTimetables] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNewTT, setShowNewTT] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState('home')

  const [showBlockForm, setShowBlockForm] = useState(null) // { day } or null
  const [blockForm, setBlockForm] = useState({ label:'', start_time:'08:00', end_time:'09:00', color_hex: COLORS[0], notes:'' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await personalTimetableAPI.list()
      setTimetables(r.data)
      if (r.data.length && !activeId) setActiveId(r.data[0].id)
    } catch { toast.error('Could not load your personal timetables') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const active = timetables.find(t => t.id === activeId)

  const createTimetable = async () => {
    if (!newName.trim()) { toast.error('Give it a name'); return }
    try {
      const r = await personalTimetableAPI.create({ name: newName.trim(), kind: newKind })
      toast.success(`"${r.data.name}" created ✅`)
      setShowNewTT(false); setNewName(''); setNewKind('home')
      await load()
      setActiveId(r.data.id)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Create failed') }
  }

  const deleteTimetable = async (id) => {
    if (!window.confirm('Delete this timetable and all its blocks?')) return
    try {
      await personalTimetableAPI.delete(id)
      toast.success('Deleted')
      if (activeId === id) setActiveId(null)
      load()
    } catch { toast.error('Delete failed') }
  }

  const openBlockForm = (day) => {
    setBlockForm({ label:'', start_time:'08:00', end_time:'09:00', color_hex: COLORS[0], notes:'' })
    setShowBlockForm({ day })
  }

  const saveBlock = async () => {
    if (!blockForm.label.trim()) { toast.error('Give the block a label'); return }
    if (blockForm.start_time >= blockForm.end_time) { toast.error('End time must be after start time'); return }
    setSaving(true)
    try {
      await personalTimetableAPI.addBlock(active.id, { ...blockForm, day: showBlockForm.day })
      toast.success('Added ✅')
      setShowBlockForm(null)
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not add block') }
    finally { setSaving(false) }
  }

  const deleteBlock = async (blockId) => {
    try {
      await personalTimetableAPI.deleteBlock(blockId)
      load()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Personal Timetables</h1>
          <p className="page-subtitle">
            Your own home or office schedule — no classes, no teachers, just your week.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowNewTT(true)}>
          <Plus size={15}/> New Timetable
        </button>
      </motion.div>

      {/* ── New timetable form ── */}
      <AnimatePresence>
        {showNewTT && (
          <motion.div className="card mb-4"
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input className="form-input" value={newName} autoFocus
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Home routine, Office week" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <div style={{ display:'flex', gap:8 }}>
                {Object.entries(KIND_META).map(([k, meta]) => (
                  <button key={k} type="button"
                    className={`btn btn-sm ${newKind === k ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setNewKind(k)}>
                    {meta.icon} {meta.label}
                  </button>
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
          <div className="empty-state-title">No personal timetables yet</div>
          <div className="empty-state-sub">Create one for your home routine or your office week.</div>
          <button className="btn btn-accent" style={{ marginTop:16 }} onClick={() => setShowNewTT(true)}>
            <Plus size={14}/> Create Your First Timetable
          </button>
        </div>
      ) : (
        <>
          {/* Timetable switcher */}
          <div className="flex-row mb-4" style={{ flexWrap:'wrap', gap:6 }}>
            {timetables.map(t => (
              <button key={t.id}
                className={`btn btn-sm ${activeId === t.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveId(t.id)}>
                {KIND_META[t.kind]?.icon} {t.name}
                <span style={{ marginLeft:6, opacity:.6, fontSize:11 }}>({t.block_count})</span>
              </button>
            ))}
          </div>

          {active && (
            <motion.div className="card" key={active.id}
              initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
              <div className="card-header">
                <div className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {KIND_META[active.kind]?.icon} {active.name}
                </div>
                <button className="btn btn-sm delete-btn" onClick={() => deleteTimetable(active.id)}>
                  <Trash2 size={13}/> Delete timetable
                </button>
              </div>

              {/* 7-day grid, each column scrollable, blocks positioned by time */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7, minmax(120px, 1fr))', gap:8, overflowX:'auto' }}>
                {DAYS.map(day => {
                  const dayBlocks = active.blocks.filter(b => b.day === day)
                    .sort((a,b) => toMinutes(a.start_time) - toMinutes(b.start_time))
                  return (
                    <div key={day} style={{ minWidth:130 }}>
                      <div style={{
                        fontSize:11.5, fontWeight:800, color:'var(--text)', textAlign:'center',
                        padding:'6px 0', background:'var(--surface-2)', borderRadius:8, marginBottom:8,
                      }}>
                        {day.slice(0,3)}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6, minHeight:120 }}>
                        {dayBlocks.map(b => (
                          <div key={b.id}
                            style={{
                              borderLeft:`3px solid ${b.color_hex}`, background:`${b.color_hex}14`,
                              borderRadius:8, padding:'7px 9px', position:'relative',
                            }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{b.label}</div>
                            <div style={{ fontSize:10.5, color:'var(--muted)', fontFamily:'var(--font-numeric)' }}>
                              {b.start_time}–{b.end_time}
                            </div>
                            {b.notes && (
                              <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}>{b.notes}</div>
                            )}
                            <button onClick={() => deleteBlock(b.id)}
                              style={{
                                position:'absolute', top:4, right:4, background:'none', border:'none',
                                cursor:'pointer', color:'var(--muted)', padding:2,
                              }}>
                              <X size={11}/>
                            </button>
                          </div>
                        ))}
                        <button onClick={() => openBlockForm(day)}
                          style={{
                            display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                            padding:'8px', borderRadius:8, border:'1.5px dashed var(--border-2)',
                            background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer',
                          }}>
                          <Plus size={11}/> Add
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* ── Add block modal ── */}
      <AnimatePresence>
        {showBlockForm && (
          <motion.div className="modal-overlay" onClick={() => setShowBlockForm(null)}
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
            <motion.div className="modal" onClick={e => e.stopPropagation()}
              initial={{ opacity:0, y:16, scale:.97 }} animate={{ opacity:1, y:0, scale:1 }}
              exit={{ opacity:0, y:10, scale:.97 }} style={{ maxWidth:420 }}>
              <div className="modal-title">Add block — {showBlockForm.day}</div>
              <div className="form-group">
                <label className="form-label">Label</label>
                <input className="form-input" value={blockForm.label} autoFocus
                  onChange={e => setBlockForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Gym, Standup, Kids pickup" />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input type="time" className="form-input" value={blockForm.start_time}
                    onChange={e => setBlockForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input type="time" className="form-input" value={blockForm.end_time}
                    onChange={e => setBlockForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label"><Palette size={12}/> Colour</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {COLORS.map(c => (
                    <div key={c} onClick={() => setBlockForm(f => ({ ...f, color_hex: c }))}
                      className={`color-swatch${blockForm.color_hex === c ? ' selected' : ''}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={blockForm.notes}
                  onChange={e => setBlockForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything extra to remember" />
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowBlockForm(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveBlock} disabled={saving}>
                  {saving ? 'Saving…' : 'Add Block'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
