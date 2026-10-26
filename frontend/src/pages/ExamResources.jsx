import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Pencil, Trash2, Upload, Download, Users, MapPin, Save, X, UserPlus } from 'lucide-react'
import { supervisorsAPI, roomsAPI } from '../api/client'
import { examExtrasAPI } from '../api/examExtras'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CONFIG = {
  supervisors: {
    title: 'Supervisors / Invigilators', icon: <Users size={15} />,
    api: supervisorsAPI, empty: { name: '', role: 'teacher', department: '', email: '', phone: '', max_sessions: 3, availability: '' },
    fields: [
      { key: 'name', label: 'Full name', required: true, placeholder: 'e.g. Mr Brian Otieno', full: true },
      { key: 'role', label: 'Role', type: 'select', options: [['teacher', 'Teacher'], ['ra', 'Residential assistant'], ['external', 'External'], ['admin', 'Admin']] },
      { key: 'max_sessions', label: 'Max exams per day', type: 'number', min: 1, max: 8 },
      { key: 'department', label: 'Department', placeholder: 'Optional' },
      { key: 'phone', label: 'Phone', placeholder: 'Optional' },
      { key: 'email', label: 'Email', placeholder: 'Optional', full: true },
      { key: 'availability', label: 'Available days (none selected = any day)', type: 'days', full: true },
    ],
    row: s => ({ title: s.name, sub: `${s.role}${s.department ? ' · ' + s.department : ''} · max ${s.max_sessions}/day · ${s.availability || 'any day'}`, count: s.session_count != null ? `${s.session_count} exam(s)` : '' }),
    importFn: examExtrasAPI.importSupervisors, templateUrl: examExtrasAPI.supervisorsTemplateUrl,
  },
  rooms: {
    title: 'Rooms / Venues', icon: <MapPin size={15} />,
    api: roomsAPI, empty: { name: '', building: '', capacity: 30, equipment: '' },
    fields: [
      { key: 'name', label: 'Room name', required: true, placeholder: 'e.g. Main Hall, Science Lab 1', full: true },
      { key: 'building', label: 'Building', placeholder: 'Optional' },
      { key: 'capacity', label: 'Seats', type: 'number', min: 1, max: 1000 },
      { key: 'equipment', label: 'Equipment (put "lab" here for practical rooms)', placeholder: 'lab bench, projector', full: true },
    ],
    row: r => ({ title: r.name, sub: `${r.capacity} seats${r.building ? ' · ' + r.building : ''}${r.equipment ? ' · ' + r.equipment : ''}` }),
    importFn: examExtrasAPI.importRooms, templateUrl: examExtrasAPI.roomsTemplateUrl,
  },
}

function Panel({ kind, onChanged }) {
  const cfg = CONFIG[kind]
  const [items, setItems] = useState([])
  const [form, setForm] = useState(cfg.empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  const load = async () => {
    try { const r = await cfg.api.list(); setItems(r.data); onChanged?.() }
    catch { toast.error('Could not load the list') }
  }
  useEffect(() => { setForm(cfg.empty); setEditId(null); load() }, [kind]) // eslint-disable-line

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const body = { ...form, name: form.name.trim() }
      cfg.fields.filter(fd => fd.type === 'number').forEach(fd => { body[fd.key] = Number(body[fd.key]) || cfg.empty[fd.key] })
      if (editId) await cfg.api.update(editId, body); else await cfg.api.create(body)
      toast.success(editId ? 'Saved ✅' : 'Added ✅')
      setForm(cfg.empty); setEditId(null); load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const edit = (it) => {
    setEditId(it.id)
    setForm(Object.fromEntries(Object.keys(cfg.empty).map(k => [k, it[k] ?? cfg.empty[k]])))
  }
  const remove = async (it) => {
    if (!window.confirm(`Remove "${it.name}"? Existing exam slots keep their record.`)) return
    try { await cfg.api.delete(it.id); toast.success('Removed'); if (editId === it.id) { setEditId(null); setForm(cfg.empty) } load() }
    catch { toast.error('Remove failed') }
  }
  const doImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const r = await cfg.importFn(file)
      toast.success(r.data.message, { duration: 5000 })
      ;(r.data.errors || []).slice(0, 4).forEach(m => toast(m, { icon: 'ℹ️', duration: 6000 }))
      load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Import failed') }
    finally { setImporting(false); e.target.value = '' }
  }
  const fromTeachers = async () => {
    try { const r = await examExtrasAPI.supervisorsFromTeachers(); toast.success(r.data.message); load() }
    catch (err) { toast.error(err?.response?.data?.detail || 'Could not copy teachers') }
  }
  const toggleDay = (d) => {
    const cur = (form.availability || '').split(',').map(x => x.trim()).filter(Boolean)
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d]
    setForm(f => ({ ...f, availability: DAYS.filter(x => next.includes(x)).join(',') }))
  }

  return (
    <div className="teacher-layout">
      <div className="teacher-list-panel">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {kind === 'supervisors' && (
            <button className="btn btn-secondary btn-sm" onClick={fromTeachers}><UserPlus size={13} /> Add all teachers</button>
          )}
          <button className="btn btn-secondary btn-sm" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> {importing ? 'Importing…' : 'Import CSV / Excel'}
          </button>
          <a className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }} href={cfg.templateUrl()}><Download size={13} /> Template</a>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={doImport} />
        </div>

        {items.length === 0 ? (
          <div className="exam-empty" style={{ padding: '36px 0' }}>
            <div className="teacher-empty-icon-wrap">{cfg.icon}</div>
            <p style={{ color: 'var(--muted)', margin: 8 }}>Nobody here yet — use the form, import a file{kind === 'supervisors' ? ', or add all your teachers in one click' : ''}.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AnimatePresence>
              {items.map((it, i) => {
                const r = cfg.row(it)
                return (
                  <motion.div key={it.id} className={`teacher-card${editId === it.id ? ' selected' : ''}`}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .02 }}
                    onClick={() => edit(it)}>
                    <div className="teacher-info">
                      <div className="teacher-name">{r.title}</div>
                      <div className="teacher-meta">{r.sub}</div>
                    </div>
                    {r.count && <span className="badge badge-blue">{r.count}</span>}
                    <div className="teacher-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm btn-secondary" onClick={() => edit(it)}><Pencil size={13} /></button>
                      <button className="btn btn-sm delete-btn" onClick={() => remove(it)}><Trash2 size={13} /></button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="teacher-form-panel">
        <form className="teacher-form-card" onSubmit={save}>
          <div className="teacher-form-header">
            <div>
              <div className="teacher-form-title">{editId ? `Edit — ${form.name || '…'}` : `+ Add ${kind === 'rooms' ? 'room' : 'supervisor'}`}</div>
              <div className="teacher-form-sub">{kind === 'rooms' ? 'Rooms are matched to class size automatically' : 'Anyone can invigilate any exam'}</div>
            </div>
            {editId && <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}
              onClick={() => { setEditId(null); setForm(cfg.empty) }}><X size={16} /></button>}
          </div>
          <div className="teacher-form-body">
            <div className="teacher-form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {cfg.fields.map(fd => (
                <div key={fd.key} className="teacher-form-field" style={fd.full ? { gridColumn: '1 / -1' } : {}}>
                  <label className="teacher-form-label">{fd.label}{fd.required && <span className="req"> *</span>}</label>
                  {fd.type === 'select' ? (
                    <select className="teacher-form-select" value={form[fd.key]} onChange={e => setForm(f => ({ ...f, [fd.key]: e.target.value }))}>
                      {fd.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : fd.type === 'days' ? (
                    <div className="teacher-form-days">
                      {DAYS.map(d => {
                        const on = (form.availability || '').split(',').includes(d)
                        return <button key={d} type="button" className={`exam-day-btn${on ? ' active' : ''}`} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</button>
                      })}
                    </div>
                  ) : (
                    <input className="teacher-form-input" type={fd.type || 'text'} min={fd.min} max={fd.max}
                      value={form[fd.key] ?? ''} placeholder={fd.placeholder}
                      autoFocus={fd.key === 'name'}
                      onChange={e => setForm(f => ({ ...f, [fd.key]: fd.type === 'number' ? (+e.target.value || '') : e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <button className="teacher-form-save" type="submit" disabled={saving}>
              <Save size={14} /> {saving ? 'Saving…' : editId ? 'SAVE CHANGES' : 'ADD'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ExamResources({ onBack, onChanged }) {
  const [tab, setTab] = useState('supervisors')
  return (
    <div className="page-container">
      <motion.div className="exam-page-header" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /></button>
          <div>
            <h1 className="page-title">Supervisors &amp; Rooms</h1>
            <p className="page-subtitle">Who invigilates and where exams are sat — used by the auto-assign option when you generate.</p>
          </div>
        </div>
      </motion.div>
      <div className="tv-view-toggle" style={{ width: 'fit-content', marginBottom: 16 }}>
        {Object.entries(CONFIG).map(([k, c]) => (
          <button key={k} className={`tv-toggle-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{c.icon} {c.title}</button>
        ))}
      </div>
      <Panel kind={tab} onChanged={onChanged} />
    </div>
  )
}
