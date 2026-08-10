import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { schoolAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  School, Palette, Save, Upload, Trash2, LayoutGrid, Check
} from 'lucide-react'

const THEMES = [
  { id:'navy',  label:'Navy',   preview:['#1A237E','#E8EAF6','#9FA8DA'] },
  { id:'green', label:'Green',  preview:['#1B5E20','#E8F5E9','#A5D6A7'] },
  { id:'amber', label:'Amber',  preview:['#E65100','#FFF3E0','#FFCC80'] },
  { id:'rose',  label:'Rose',   preview:['#880E4F','#FCE4EC','#F48FB1'] },
  { id:'slate', label:'Slate',  preview:['#263238','#ECEFF1','#B0BEC5'] },
]

const pv = { initial:{opacity:0,y:12}, animate:{opacity:1,y:0,transition:{duration:.22,ease:[.4,0,.2,1]}} }

function Section({ icon, title, children }) {
  return (
    <motion.div className="settings-section" variants={pv}>
      <div className="settings-section-header">
        <span className="settings-section-icon">{icon}</span>
        <h2 className="settings-section-title">{title}</h2>
      </div>
      <div className="settings-section-body">{children}</div>
    </motion.div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span>{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

export default function Branding() {
  const [school, setSchool]     = useState(null)
  const [badgeUrl, setBadgeUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]     = useState(false)
  const badgeInput = useRef()

  const load = async () => {
    try {
      const r = await schoolAPI.getSettings()
      setSchool(r.data)
      if (r.data.has_badge) setBadgeUrl(schoolAPI.badgeUrl() + '?t=' + Date.now())
    } catch { toast.error('Failed to load branding settings') }
  }
  useEffect(() => { load() }, [])

  const handleBadgeChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 2*1024*1024) { toast.error('Max 2 MB'); return }
    setUploading(true)
    try {
      await schoolAPI.uploadBadge(file)
      setBadgeUrl(schoolAPI.badgeUrl() + '?t=' + Date.now())
      toast.success('School badge uploaded ✅ — appears on all PDF exports')
    } catch { toast.error('Badge upload failed') }
    finally { setUploading(false) }
  }

  const handleRemoveBadge = async () => {
    try { await schoolAPI.deleteBadge(); setBadgeUrl(null); toast.success('Badge removed') }
    catch { toast.error('Remove failed') }
  }

  const handleSchoolSave = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await schoolAPI.updateSettings(school)
      toast.success('School settings saved ✅')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const patch = (updates, msg) => {
    setSchool(s => ({ ...s, ...updates }))
    schoolAPI.updateSettings(updates)
      .then(() => msg && toast.success(msg))
      .catch(() => toast.error('Save failed'))
  }

  if (!school) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
      <div className="login-spinner" style={{ width:32, height:32, borderWidth:3, borderTopColor:'var(--amber)' }}/>
    </div>
  )

  return (
    <motion.div className="page-container" initial="initial" animate="animate"
      variants={{ animate:{ transition:{ staggerChildren:.06 } } }}>

      <motion.div className="page-header" variants={pv}>
        <div>
          <h1 className="page-title">Branding & Appearance</h1>
          <p className="page-subtitle">
            Control how your school's logo, name, and colours appear across timetables and exam exports —
            separate from your personal account settings.
          </p>
        </div>
      </motion.div>

      <div className="settings-layout">

        {/* ── School Branding ── */}
        <Section icon={<School size={16}/>} title="School Branding">
          <div className="branding-badge-block">
            <div className="branding-badge-preview">
              {badgeUrl
                ? <img src={badgeUrl} alt="School badge" className="branding-badge-img"/>
                : <div className="branding-badge-placeholder"><School size={22}/></div>
              }
            </div>
            <div className="branding-badge-actions">
              <div className="branding-badge-btns">
                <button className="btn btn-secondary btn-sm"
                  onClick={() => badgeInput.current?.click()} disabled={uploading}>
                  <Upload size={13}/> {badgeUrl ? 'Replace' : 'Upload'} Badge
                </button>
                {badgeUrl && (
                  // FIX: now uses the shared .delete-btn class (same red-danger
                  // treatment as Teachers/Subjects/Classes) instead of a
                  // one-off inline style that drifted from the rest of the app.
                  <button className="btn btn-sm delete-btn" onClick={handleRemoveBadge}>
                    <Trash2 size={13}/>
                  </button>
                )}
              </div>
              <div className="branding-badge-hint">PNG, JPG or WebP · max 2 MB · shown top-left on every PDF</div>
            </div>
            <input ref={badgeInput} type="file" accept="image/png,image/jpeg,image/webp"
              style={{ display:'none' }} onChange={handleBadgeChange} />
          </div>

          <form onSubmit={handleSchoolSave} className="settings-form" style={{ marginTop:20 }}>
            <Row label="School Name" hint="Shown on PDFs and in the app">
              <input className="settings-input" value={school.school_name || ''}
                onChange={e => setSchool(s => ({ ...s, school_name: e.target.value }))}
                placeholder="Greenfield Academy" />
            </Row>
            <Row label="Academic Year">
              <input className="settings-input" value={school.academic_year || ''}
                onChange={e => setSchool(s => ({ ...s, academic_year: e.target.value }))}
                placeholder="2025/2026" style={{ maxWidth:160 }} />
            </Row>
            <Row label="School Motto" hint="Italic subline on PDF exports">
              <input className="settings-input" value={school.school_motto || ''}
                onChange={e => setSchool(s => ({ ...s, school_motto: e.target.value }))}
                placeholder="Excellence in Education" />
            </Row>
            <Row label="Email" hint="School contact email">
              <input className="settings-input" type="email" value={school.school_email || ''}
                onChange={e => setSchool(s => ({ ...s, school_email: e.target.value }))}
                placeholder="admin@school.edu" />
            </Row>
            <Row label="Phone">
              <input className="settings-input" value={school.school_phone || ''}
                onChange={e => setSchool(s => ({ ...s, school_phone: e.target.value }))}
                placeholder="+27 12 345 6789" style={{ maxWidth:220 }} />
            </Row>
            <Row label="Address">
              <input className="settings-input" value={school.school_address || ''}
                onChange={e => setSchool(s => ({ ...s, school_address: e.target.value }))}
                placeholder="123 School Road, City" />
            </Row>
            <Row label="Country Code" hint="For public holiday calendar (ZA, KE, US, GB…)">
              <input className="settings-input" value={school.country_code || ''}
                onChange={e => setSchool(s => ({ ...s, country_code: e.target.value.toUpperCase() }))}
                maxLength={2} style={{ maxWidth:80 }} placeholder="ZA" />
            </Row>
            <div className="settings-form-footer">
              <button type="submit" className="btn btn-accent settings-save-btn" disabled={saving}>
                <Save size={14}/> {saving ? 'Saving…' : 'Save school info'}
              </button>
            </div>
          </form>
        </Section>

        {/* ── PDF / Timetable Appearance ── */}
        <Section icon={<Palette size={16}/>} title="PDF & Timetable Appearance">
          <Row label="PDF Colour Theme" hint="Applied to all exported PDFs and spreadsheets">
            <div className="settings-pdf-themes">
              {THEMES.map(t => (
                <button key={t.id}
                  className={`settings-pdf-theme${school.timetable_theme===t.id?' selected':''}`}
                  onClick={() => patch({ timetable_theme: t.id }, `PDF theme: ${t.label}`)}>
                  <div className="settings-pdf-swatches">
                    {t.preview.map((c,i) => <div key={i} style={{ background:c, flex:1 }}/>)}
                  </div>
                  <span className="settings-pdf-theme-label">{t.label}</span>
                  {school.timetable_theme===t.id && (
                    <div className="settings-pdf-check"><Check size={10}/></div>
                  )}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Timetable Orientation" hint="How the grid is displayed in the app">
            <div style={{ display:'flex', gap:10 }}>
              {[
                { id:'horizontal', label:'Horizontal', hint:'Days across top, periods down' },
                { id:'vertical',   label:'Vertical',   hint:'Periods across top, days down' },
              ].map(o => (
                <button key={o.id}
                  className={`settings-orientation-btn${school.timetable_orientation===o.id?' active':''}`}
                  onClick={() => patch({ timetable_orientation: o.id })}>
                  <LayoutGrid size={14}/>
                  <div>
                    <div style={{ fontWeight:700, fontSize:12 }}>{o.label}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{o.hint}</div>
                  </div>
                  {school.timetable_orientation===o.id && <Check size={12} style={{ marginLeft:'auto', color:'var(--blue-400)' }}/>}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Teacher Name Format on Exports" hint="How teacher names appear in generated PDFs and spreadsheets">
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {[
                {id:'full_name',  label:'Full Name',   ex:'Mrs Alice Kamau'},
                {id:'short_name', label:'Short Name',  ex:'Mrs Kamau'},
                {id:'initials',   label:'Initials',    ex:'AK'},
              ].map(opt => (
                <button key={opt.id}
                  className={`settings-orientation-btn${school.teacher_name_format===opt.id?' active':''}`}
                  style={{flexDirection:'column',alignItems:'flex-start',gap:2,minWidth:100}}
                  onClick={() => patch({ teacher_name_format: opt.id }, `Name format: ${opt.label}`)}>
                  <div style={{fontWeight:700,fontSize:12}}>{opt.label}</div>
                  <div style={{fontSize:10,color:'var(--muted)',fontStyle:'italic'}}>{opt.ex}</div>
                  {school.teacher_name_format===opt.id && <Check size={11} style={{color:'var(--blue-400)',marginTop:2}}/>}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Exam Export Columns" hint="Choose which columns appear in exam PDF and Excel exports">
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13}}>
                <input type="checkbox"
                  checked={!!school.exam_include_supervisors}
                  onChange={e => patch({ exam_include_supervisors: e.target.checked })}/>
                <div>
                  <div style={{fontWeight:600,color:'var(--text)'}}>Include Supervisors column</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>Show invigilator names in exam exports</div>
                </div>
              </label>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13}}>
                <input type="checkbox"
                  checked={!!school.exam_include_rooms}
                  onChange={e => patch({ exam_include_rooms: e.target.checked })}/>
                <div>
                  <div style={{fontWeight:600,color:'var(--text)'}}>Include Rooms column</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>Show room names in exam exports</div>
                </div>
              </label>
            </div>
          </Row>
        </Section>

        {/* Time config lives on its own dedicated page */}
        <motion.div className="card" variants={pv}
          style={{background:'rgba(56,189,248,.04)',border:'1.5px solid rgba(56,189,248,.2)',
            borderRadius:'var(--r-xl)',padding:'18px 22px',display:'flex',
            alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div>
            <div style={{fontWeight:700,color:'var(--text)',marginBottom:4}}>
              ⏰ Schedule & Time Configuration
            </div>
            <div style={{fontSize:13,color:'var(--muted)'}}>
              Set period durations, break times, lunch, and school days
            </div>
          </div>
          <a href="/schedule-settings" className="btn btn-secondary btn-sm"
            style={{whiteSpace:'nowrap',textDecoration:'none'}}>
            Open Schedule Settings →
          </a>
        </motion.div>
      </div>
    </motion.div>
  )
}
