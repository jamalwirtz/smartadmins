import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { examLayoutsAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Star, Save, LayoutGrid, LayoutTemplate,
  AlignLeft, Users, MapPin, StickyNote, FlaskConical,
  AlertTriangle, MessageSquare, Check
} from 'lucide-react'

const empty = {
  name: '', group_by: 'day', orientation: 'landscape',
  show_duration: true, show_invigilator: true, show_room: true,
  show_notes: false, show_practical_tag: true,
  footer_text: '', warning_text: '', is_default: false,
}

const FIELD_TOGGLES = [
  { key: 'show_duration',      label: 'Duration',        hint: 'Paper length in minutes',            icon: <AlignLeft size={13}/> },
  { key: 'show_invigilator',   label: 'Invigilator',     hint: 'Assigned supervisor name',            icon: <Users size={13}/> },
  { key: 'show_room',          label: 'Room',             hint: 'Exam venue',                          icon: <MapPin size={13}/> },
  { key: 'show_notes',         label: 'Notes',            hint: 'Free-text notes on each slot',        icon: <StickyNote size={13}/> },
  { key: 'show_practical_tag', label: 'Practical flag',   hint: 'Marks practical papers with an asterisk', icon: <FlaskConical size={13}/> },
]

export default function ExamLayouts() {
  const [layouts, setLayouts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await examLayoutsAPI.list()
      setLayouts(r.data)
      if (r.data.length && !selectedId) selectLayout(r.data[0])
    } catch { toast.error('Could not load exam layout templates') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const selectLayout = (l) => {
    setSelectedId(l.id)
    setForm({
      name: l.name, group_by: l.group_by, orientation: l.orientation,
      show_duration: l.show_duration, show_invigilator: l.show_invigilator,
      show_room: l.show_room, show_notes: l.show_notes,
      show_practical_tag: l.show_practical_tag,
      footer_text: l.footer_text || '', warning_text: l.warning_text || '',
      is_default: l.is_default,
    })
  }

  const startNew = () => { setSelectedId('__new__'); setForm(empty) }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return }
    setSaving(true)
    try {
      if (selectedId === '__new__') {
        const r = await examLayoutsAPI.create(form)
        toast.success(`"${form.name}" created ✅`)
        await load()
        selectLayout(r.data)
      } else {
        await examLayoutsAPI.update(selectedId, form)
        toast.success('Layout saved ✅')
        await load()
      }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const setDefault = async (id) => {
    try {
      await examLayoutsAPI.setDefault(id)
      toast.success('Default layout updated')
      load()
    } catch { toast.error('Could not set default') }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this layout template? Sessions using it will fall back to the default.')) return
    try {
      await examLayoutsAPI.delete(id)
      toast.success('Layout deleted')
      setSelectedId(null)
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Exam Schedule Editor</h1>
          <p className="page-subtitle">
            Manage multiple exam-timetable layouts — which fields appear, how slots are grouped,
            page orientation, footer text, and warning banners on every export.
          </p>
        </div>
        <button className="btn btn-accent" onClick={startNew}>
          <Plus size={15}/> New Layout
        </button>
      </motion.div>

      <div className="teacher-layout">
        {/* ── Left: layout list ── */}
        <div className="teacher-list-panel">
          {loading ? (
            <div className="skeleton-block" style={{ height: 220, borderRadius: 'var(--r-xl)' }}/>
          ) : layouts.length === 0 ? (
            <div className="exam-empty">
              <div className="teacher-empty-icon-wrap"><LayoutTemplate size={26} color="var(--blue-400)"/></div>
              <p style={{ color:'var(--muted)' }}>No layout templates yet</p>
              <button className="btn btn-accent" onClick={startNew}><Plus size={14}/> Create First Layout</button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <AnimatePresence>
                {layouts.map((l, i) => (
                  <motion.div key={l.id} className={`layout-card${selectedId===l.id?' selected':''}`}
                    initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay: i*.04 }}
                    onClick={() => selectLayout(l)}>
                    <div className="layout-card-icon"><LayoutGrid size={16}/></div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="layout-card-name">
                        {l.name}
                        {l.is_default && <span className="layout-default-pill"><Star size={9}/> Default</span>}
                      </div>
                      <div className="layout-card-meta">
                        Grouped by {l.group_by} · {l.orientation}
                        {l.warning_text && <> · <AlertTriangle size={10} style={{verticalAlign:-1}}/> has warning</>}
                      </div>
                    </div>
                    <div onClick={e => e.stopPropagation()} style={{ display:'flex', gap:5 }}>
                      {!l.is_default && (
                        <button className="btn btn-sm btn-secondary" title="Set as default"
                          onClick={() => setDefault(l.id)}>
                          <Star size={12}/>
                        </button>
                      )}
                      <button className="btn btn-sm delete-btn" onClick={() => remove(l.id)}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Right: editor form ── */}
        {selectedId && (
          <div className="teacher-form-panel">
            <div className="teacher-form-card">
              <div className="teacher-form-header">
                <div>
                  <div className="teacher-form-title">
                    {selectedId === '__new__' ? '+ New Layout Template' : `Edit — ${form.name || '…'}`}
                  </div>
                  <div className="teacher-form-sub">Controls the PDF & Excel export for exam sessions using this layout</div>
                </div>
              </div>

              <div className="teacher-form-body">
                <div className="teacher-form-field">
                  <label className="teacher-form-label">Template Name <span className="req">*</span></label>
                  <input className="teacher-form-input" value={form.name} autoFocus
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Notice Board Copy, Invigilator Roster" />
                </div>

                <div className="teacher-form-divider"/>
                <span className="teacher-form-section">Structure</span>

                <div className="teacher-form-row">
                  <div className="teacher-form-field">
                    <label className="teacher-form-label">Group By</label>
                    <select className="teacher-form-select" value={form.group_by}
                      onChange={e => setForm(f => ({ ...f, group_by: e.target.value }))}>
                      <option value="day">Day</option>
                      <option value="class">Class</option>
                    </select>
                  </div>
                  <div className="teacher-form-field">
                    <label className="teacher-form-label">Orientation</label>
                    <select className="teacher-form-select" value={form.orientation}
                      onChange={e => setForm(f => ({ ...f, orientation: e.target.value }))}>
                      <option value="landscape">Landscape</option>
                      <option value="portrait">Portrait</option>
                    </select>
                  </div>
                </div>

                <div className="teacher-form-divider"/>
                <span className="teacher-form-section">Field Placement — columns to include</span>

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {FIELD_TOGGLES.map(t => (
                    <label key={t.key} className="layout-toggle-row">
                      <input type="checkbox" checked={form[t.key]}
                        onChange={e => setForm(f => ({ ...f, [t.key]: e.target.checked }))}/>
                      <span className="layout-toggle-icon">{t.icon}</span>
                      <div>
                        <div className="layout-toggle-label">{t.label}</div>
                        <div className="layout-toggle-hint">{t.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="teacher-form-divider"/>
                <span className="teacher-form-section">Footer & Warnings</span>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><MessageSquare size={12}/> Footer Text</label>
                  <textarea className="teacher-form-input" rows={2}
                    value={form.footer_text}
                    onChange={e => setForm(f => ({ ...f, footer_text: e.target.value }))}
                    placeholder="e.g. Generated by Smart Admin — subject to change until published."
                    style={{ resize:'vertical', fontFamily:'inherit' }}/>
                  <span style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Printed at the bottom of every page</span>
                </div>

                <div className="teacher-form-field">
                  <label className="teacher-form-label"><AlertTriangle size={12} color="#f59e0b"/> Warning Banner</label>
                  <textarea className="teacher-form-input layout-warning-input" rows={2}
                    value={form.warning_text}
                    onChange={e => setForm(f => ({ ...f, warning_text: e.target.value }))}
                    placeholder="e.g. No electronic devices permitted in the exam hall. Arrive 15 minutes early."
                    style={{ resize:'vertical', fontFamily:'inherit' }}/>
                  <span style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Shown as a highlighted amber banner near the top — leave blank to omit</span>
                </div>

                {selectedId !== '__new__' && !form.is_default && (
                  <button className="btn btn-secondary" onClick={() => setDefault(selectedId)} style={{ marginTop:4 }}>
                    <Star size={13}/> Make this the default layout
                  </button>
                )}
                {form.is_default && (
                  <div className="layout-is-default-note"><Check size={13}/> This is the org-wide default layout</div>
                )}

                <button className="teacher-form-save" onClick={save} disabled={saving} style={{ marginTop:8 }}>
                  <Save size={14}/> {saving ? 'Saving…' : selectedId === '__new__' ? 'CREATE LAYOUT' : 'SAVE CHANGES'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
