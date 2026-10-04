import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { timetableLayoutsAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Star, Save, LayoutGrid, LayoutTemplate,
  Lock, MapPin, AlertTriangle, MessageSquare, Check, Sparkles
} from 'lucide-react'

const ICON_CHOICES = ['📅','📌','📋','🛠️','🏫','🎓','⏰','🗓️','📖','✨','🌟','🧭']
const ACCENT_CHOICES = ['#2952a3','#0d9488','#d97706','#7c3aed','#be123c','#16a34a','#0891b2','#c2410c']

const empty = {
  name: '', description: '', icon: '📅', accent_color: '#2952a3',
  orientation: 'landscape',
  show_locked_badge: true, show_room: false,
  footer_text: '', warning_text: '', is_default: false,
}

const FIELD_TOGGLES = [
  { key: 'show_locked_badge', label: 'Locked-slot marker', hint: 'Flag locked lessons with a 🔒 on export', icon: <Lock size={13}/> },
  { key: 'show_room',         label: 'Room',                hint: 'Include room name if lessons have one assigned', icon: <MapPin size={13}/> },
]

// ── Small preview of how a layout card will render on export — purely
//    visual, driven by the template's own icon/accent/orientation, so the
//    admin can see the "feel" of a layout before saving it.
function LayoutPreview({ icon, accentColor, orientation, name }) {
  const isPortrait = orientation === 'portrait'
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center', gap:8,
      padding:'18px 14px', background:'var(--surface-2)',
      border:'1.5px dashed var(--border-2)', borderRadius:'var(--r-xl)',
    }}>
      <div style={{
        width: isPortrait ? 74 : 108, height: isPortrait ? 96 : 74,
        background:'var(--surface)', border:`2px solid ${accentColor}`,
        borderRadius:8, display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 4px 14px rgba(0,0,0,.08)',
      }}>
        <div style={{ height:14, background:accentColor, display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:9 }}>{icon}</div>
        <div style={{ flex:1, display:'grid',
          gridTemplateColumns:`repeat(${isPortrait ? 3 : 5}, 1fr)`,
          gap:2, padding:3 }}>
          {Array.from({ length: isPortrait ? 9 : 15 }).map((_, i) => (
            <div key={i} style={{ background:`${accentColor}22`, borderRadius:1 }}/>
          ))}
        </div>
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)' }}>
        {name || 'Untitled layout'} · {orientation}
      </div>
    </div>
  )
}

export default function TimetableLayouts() {
  const [layouts, setLayouts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await timetableLayoutsAPI.list()
      setLayouts(r.data)
      if (r.data.length && !selectedId) selectLayout(r.data[0])
    } catch { toast.error('Could not load timetable layout templates') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const selectLayout = (l) => {
    setSelectedId(l.id)
    setForm({
      name: l.name,
      description: l.description || '',
      icon: l.icon || '📅',
      accent_color: l.accent_color || '#2952a3',
      orientation: l.orientation,
      show_locked_badge: l.show_locked_badge, show_room: l.show_room,
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
        const r = await timetableLayoutsAPI.create(form)
        toast.success(`"${form.name}" created ✅`)
        await load()
        selectLayout(r.data)
      } else {
        await timetableLayoutsAPI.update(selectedId, form)
        toast.success('Layout saved ✅')
        await load()
      }
    } catch (e) { toast.error(e?.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const setDefault = async (id) => {
    try { await timetableLayoutsAPI.setDefault(id); toast.success('Default layout updated'); load() }
    catch { toast.error('Could not set default') }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this layout template? Drafts using it will fall back to the default.')) return
    try {
      await timetableLayoutsAPI.delete(id)
      toast.success('Layout deleted')
      setSelectedId(null)
      load()
    } catch (e) { toast.error(e?.response?.data?.detail || 'Delete failed') }
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Timetable Schedule Editor</h1>
          <p className="page-subtitle">
            {layouts.length} layout template{layouts.length !== 1 ? 's' : ''} available — each with its own
            look, orientation, and export detail. Twin of the Exam Schedule Editor.
          </p>
        </div>
        <button className="btn btn-accent" onClick={startNew}>
          <Plus size={15}/> New Layout
        </button>
      </motion.div>

      {/* ── Template gallery ── */}
      {loading ? (
        <div className="skeleton-block" style={{ height: 160, borderRadius: 'var(--r-xl)', marginBottom: 20 }}/>
      ) : layouts.length === 0 ? (
        <div className="exam-empty" style={{ marginBottom: 20 }}>
          <div className="teacher-empty-icon-wrap"><LayoutTemplate size={26} color="var(--blue-400)"/></div>
          <p style={{ color:'var(--muted)' }}>No layout templates yet</p>
          <button className="btn btn-accent" onClick={startNew}><Plus size={14}/> Create First Layout</button>
        </div>
      ) : (
        <div className="exam-tpl-grid" style={{ marginBottom: 24 }}>
          <AnimatePresence>
            {layouts.map((l, i) => {
              const accent = l.accent_color || '#2952a3'
              const isSelected = selectedId === l.id
              return (
                <motion.button
                  key={l.id}
                  type="button"
                  className={`exam-tpl-card${isSelected ? ' selected' : ''}`}
                  style={isSelected ? { borderColor: accent, background: `${accent}0f`, boxShadow: `0 0 0 3px ${accent}26` } : {}}
                  initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ y:-2 }}
                  onClick={() => selectLayout(l)}>
                  <div className="exam-tpl-icon" style={{
                    width:40, height:40, borderRadius:12, display:'flex',
                    alignItems:'center', justifyContent:'center',
                    background:`${accent}1c`, marginBottom:8, fontSize:20,
                  }}>
                    {l.icon || '📅'}
                  </div>
                  <div className="exam-tpl-name">
                    {l.name}
                    {l.is_default && (
                      <span className="layout-default-pill" style={{ marginLeft:6 }}>
                        <Star size={9}/> Default
                      </span>
                    )}
                  </div>
                  <div className="exam-tpl-desc">
                    {l.description || 'No description yet.'}
                  </div>
                  <div className="exam-tpl-pills">
                    <span className="exam-tpl-pill" style={{ textTransform:'capitalize' }}>{l.orientation}</span>
                    {l.show_room && <span className="exam-tpl-pill">Room shown</span>}
                    {l.show_locked_badge && <span className="exam-tpl-pill">🔒 badges</span>}
                    {l.warning_text && (
                      <span className="exam-tpl-pill" style={{ color:'#d97706' }}>
                        <AlertTriangle size={9} style={{ verticalAlign:-1, marginRight:2 }}/>warning
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <div className="exam-tpl-check" style={{ background: accent }}><Check size={12}/></div>
                  )}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Editor panel ── */}
      {selectedId && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start' }}
          className="tt-layout-editor-grid">
          <div className="teacher-form-card">
            <div className="teacher-form-header" style={{
              background: `linear-gradient(135deg, ${form.accent_color}1c, ${form.accent_color}05)`,
            }}>
              <div>
                <div className="teacher-form-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Sparkles size={15} style={{ color: form.accent_color }}/>
                  {selectedId === '__new__' ? '+ New Layout Template' : `Edit — ${form.name || '…'}`}
                </div>
                <div className="teacher-form-sub">Controls the PDF export for timetable drafts using this layout</div>
              </div>
            </div>

            <div className="teacher-form-body">
              <div className="teacher-form-row">
                <div className="teacher-form-field">
                  <label className="teacher-form-label">Template Name <span className="req">*</span></label>
                  <input className="teacher-form-input" value={form.name} autoFocus
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Staff Room Copy" />
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

              <div className="teacher-form-field">
                <label className="teacher-form-label">Description</label>
                <input className="teacher-form-input" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="One line describing when to use this layout" />
              </div>

              <div className="teacher-form-divider"/>
              <span className="teacher-form-section">Look & Feel</span>

              <div className="teacher-form-field">
                <label className="teacher-form-label">Icon</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {ICON_CHOICES.map(ic => (
                    <button key={ic} type="button"
                      onClick={() => setForm(f => ({ ...f, icon: ic }))}
                      style={{
                        width:34, height:34, borderRadius:10, fontSize:16,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        border: form.icon === ic ? `2px solid ${form.accent_color}` : '1.5px solid var(--border)',
                        background: form.icon === ic ? `${form.accent_color}18` : 'var(--surface-2)',
                        cursor:'pointer',
                      }}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="teacher-form-field">
                <label className="teacher-form-label">Accent Colour</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {ACCENT_CHOICES.map(c => (
                    <button key={c} type="button"
                      onClick={() => setForm(f => ({ ...f, accent_color: c }))}
                      title={c}
                      style={{
                        width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer',
                        border: form.accent_color === c ? '3px solid var(--text)' : '2px solid transparent',
                        boxShadow: form.accent_color === c ? '0 0 0 2px var(--surface)' : 'none',
                      }}/>
                  ))}
                </div>
              </div>

              <div className="teacher-form-divider"/>
              <span className="teacher-form-section">Field Placement</span>

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
                  placeholder="e.g. Generated by Smart Admin — subject to change until activated."
                  style={{ resize:'vertical', fontFamily:'inherit' }}/>
                <span style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Printed at the bottom of every page</span>
              </div>

              <div className="teacher-form-field">
                <label className="teacher-form-label"><AlertTriangle size={12} color="#f59e0b"/> Warning Banner</label>
                <textarea className="teacher-form-input layout-warning-input" rows={2}
                  value={form.warning_text}
                  onChange={e => setForm(f => ({ ...f, warning_text: e.target.value }))}
                  placeholder="e.g. Draft schedule — not yet published to staff."
                  style={{ resize:'vertical', fontFamily:'inherit' }}/>
                <span style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Shown as a highlighted amber banner — leave blank to omit</span>
              </div>

              {selectedId !== '__new__' && !form.is_default && (
                <button className="btn btn-secondary" onClick={() => setDefault(selectedId)} style={{ marginTop:4 }}>
                  <Star size={13}/> Make this the default layout
                </button>
              )}
              {form.is_default && (
                <div className="layout-is-default-note"><Check size={13}/> This is the org-wide default layout</div>
              )}

              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button className="teacher-form-save" onClick={save} disabled={saving}
                  style={{ background: `linear-gradient(135deg, ${form.accent_color}, ${form.accent_color}cc)` }}>
                  <Save size={14}/> {saving ? 'Saving…' : selectedId === '__new__' ? 'CREATE LAYOUT' : 'SAVE CHANGES'}
                </button>
                {selectedId !== '__new__' && (
                  <button className="btn btn-sm delete-btn" style={{ padding:'0 16px' }}
                    onClick={() => remove(selectedId)} title="Delete this layout">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Live-ish preview sidebar ── */}
          <div style={{ position:'sticky', top:20, display:'flex', flexDirection:'column', gap:14 }}>
            <LayoutPreview icon={form.icon} accentColor={form.accent_color}
              orientation={form.orientation} name={form.name}/>
            <div className="teacher-form-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', textTransform:'uppercase',
                letterSpacing:.6, marginBottom:8 }}>
                At a glance
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, fontSize:12.5 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--muted)' }}>Orientation</span>
                  <strong style={{ textTransform:'capitalize' }}>{form.orientation}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--muted)' }}>Locked badges</span>
                  <strong>{form.show_locked_badge ? 'Shown' : 'Hidden'}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--muted)' }}>Room column</span>
                  <strong>{form.show_room ? 'Shown' : 'Hidden'}</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'var(--muted)' }}>Warning banner</span>
                  <strong>{form.warning_text ? 'Yes' : 'None'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .tt-layout-editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
