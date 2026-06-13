import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { schoolAPI, profileAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  User, Mail, Lock, Bell, Palette, Shield, Save,
  Eye, EyeOff, Sun, Moon, Monitor, ChevronRight,
  Camera, Upload, Trash2, School, Clock, Globe,
  LayoutGrid, RotateCcw, Check, Phone, MapPin
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

function Toggle({ value, onChange, label }) {
  return (
    <button type="button" className={`settings-toggle${value?' on':''}`}
      onClick={() => onChange(!value)} aria-label={label}>
      <span className="settings-toggle-knob" />
    </button>
  )
}

export default function Settings() {
  const { user, setPhotoUrl: setGlobalPhoto } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  // ── state ──
  const [profile, setProfile]     = useState({ display_name:'', email:'', bio:'' })
  const [photoUrl, setPhotoUrl]   = useState(null)
  const [uploading, setUploading] = useState(false)
  const [school, setSchool]       = useState(null)   // school settings
  const [badgeUrl, setBadgeUrl]   = useState(null)
  const [themeMode, setThemeMode] = useState(theme)
  const [saving, setSaving]       = useState(false)
  const [passwords, setPasswords] = useState({ current:'', next:'', confirm:'' })
  const [showPw,  setShowPw]      = useState({ current:false, next:false, confirm:false })
  const [notifs,  setNotifs]      = useState({ draftGenerated:true, draftActivated:true, emailExports:false })

  const photoInput  = useRef()
  const badgeInput  = useRef()

  // ── loaders ──
  useEffect(() => {
    loadProfile()
    loadSchool()
  }, [])

  const loadProfile = async () => {
    try {
      const r = await profileAPI.get()
      setProfile({ display_name: r.data.display_name || '', email: user?.email || '', bio: r.data.bio || '' })
      if (r.data.has_photo) setPhotoUrl(profileAPI.photoUrl(user?.id) + '?t=' + Date.now())
    } catch {}
  }

  const loadSchool = async () => {
    try {
      const r = await schoolAPI.getSettings()
      setSchool(r.data)
      if (r.data.has_badge) setBadgeUrl(schoolAPI.badgeUrl() + '?t=' + Date.now())
    } catch {}
  }

  // ── profile save ──
  const handleProfileSave = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await profileAPI.update({ display_name: profile.display_name, bio: profile.bio })
      toast.success('Profile updated ✅')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  // ── photo upload ──
  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 2*1024*1024) { toast.error('Max 2 MB'); return }
    setUploading(true)
    try {
      await profileAPI.uploadPhoto(file)
      const newUrl = profileAPI.photoUrl(user?.id) + '?t=' + Date.now()
      setPhotoUrl(newUrl)
      if (typeof setGlobalPhoto === 'function') setGlobalPhoto(newUrl)
      toast.success('Photo updated ✅')
    } catch { toast.error('Upload failed') }
    finally { setUploading(false) }
  }

  const handleRemovePhoto = async () => {
    try { await profileAPI.deletePhoto(); setPhotoUrl(null); if (typeof setGlobalPhoto==='function') setGlobalPhoto(null); toast.success('Photo removed') }
    catch { toast.error('Remove failed') }
  }

  // ── badge upload ──
  const handleBadgeChange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 2*1024*1024) { toast.error('Max 2 MB'); return }
    setUploading(true)
    try {
      await schoolAPI.uploadBadge(file)
      setBadgeUrl(schoolAPI.badgeUrl() + '?t=' + Date.now())
      toast.success('School badge uploaded ✅ — will appear on all PDF exports')
    } catch { toast.error('Badge upload failed') }
    finally { setUploading(false) }
  }

  const handleRemoveBadge = async () => {
    try { await schoolAPI.deleteBadge(); setBadgeUrl(null); toast.success('Badge removed') }
    catch { toast.error('Remove failed') }
  }

  // ── school settings save ──
  const handleSchoolSave = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await schoolAPI.updateSettings(school)
      toast.success('School settings saved ✅')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  // ── password ──
  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (!passwords.current) { toast.error('Enter current password'); return }
    if (passwords.next.length < 6) { toast.error('New password must be at least 6 characters'); return }
    if (passwords.next !== passwords.confirm) { toast.error("Passwords don't match"); return }
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    setPasswords({ current:'', next:'', confirm:'' })
    toast.success('Password changed ✅')
  }

  // ── theme ──
  const applyTheme = (mode) => {
    setThemeMode(mode)
    if (mode === 'system') {
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', sys)
      localStorage.setItem('sstg_theme', sys)
    } else {
      document.documentElement.setAttribute('data-theme', mode)
      localStorage.setItem('sstg_theme', mode)
    }
  }

  const initials = (profile.display_name || user?.username || 'AD').slice(0,2).toUpperCase()

  return (
    <motion.div className="page" initial="initial" animate="animate"
      variants={{ animate:{ transition:{ staggerChildren:.06 } } }}>

      <motion.div className="page-header" variants={pv}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account, school branding, and timetable preferences</p>
        </div>
      </motion.div>

      <div className="settings-layout">

        {/* ── Profile ── */}
        <Section icon={<User size={16}/>} title="My Profile">
          <div className="settings-avatar-row">
            <div className="settings-avatar-wrap">
              {photoUrl
                ? <img src={photoUrl} alt="profile" className="settings-avatar-img"
                    style={{ width:60, height:60, borderRadius:'50%', objectFit:'cover' }} />
                : <div className="settings-avatar">{initials}</div>
              }
              <button className="settings-avatar-btn" onClick={() => photoInput.current?.click()}
                title="Upload photo" disabled={uploading}>
                <Camera size={13}/>
              </button>
              <input ref={photoInput} type="file" accept="image/*"
                style={{ display:'none' }} onChange={handlePhotoChange} />
            </div>
            <div>
              <div className="settings-avatar-name">{profile.display_name || user?.username}</div>
              <div className="settings-avatar-role">{user?.is_admin ? 'Administrator' : 'User'}</div>
              <div style={{ display:'flex', gap:8, marginTop:6 }}>
                <button className="settings-avatar-change"
                  onClick={() => photoInput.current?.click()}>
                  {uploading ? 'Uploading…' : 'Upload photo'}
                </button>
                {photoUrl && (
                  <button className="settings-avatar-change"
                    style={{ color:'var(--red,#ef4444)' }}
                    onClick={handleRemovePhoto}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="settings-form">
            <Row label="Display Name" hint="Shown in sidebar and topbar">
              <input className="settings-input" value={profile.display_name}
                onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))}
                placeholder="Your name" />
            </Row>
            <Row label="Email" hint="For notifications and account recovery">
              <input className="settings-input" type="email" value={profile.email}
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                placeholder="you@school.edu" />
            </Row>
            <Row label="Bio" hint="Short description (optional)">
              <input className="settings-input" value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                placeholder="Head of timetabling" />
            </Row>
            <div className="settings-form-footer">
              <button type="submit" className="btn btn-accent settings-save-btn" disabled={saving}>
                <Save size={14}/> {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </Section>

        {/* ── School Branding ── */}
        <Section icon={<School size={16}/>} title="School Branding">
          {/* Badge upload */}
          <Row label="School Badge / Logo" hint="Shown at the top of all PDF exports">
            <div className="settings-badge-upload">
              {badgeUrl
                ? <img src={badgeUrl} alt="School badge"
                    style={{ height:56, objectFit:'contain', borderRadius:6,
                             background:'var(--surface-2)', padding:4, border:'1px solid var(--border)' }} />
                : <div className="settings-badge-placeholder">No badge</div>
              }
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => badgeInput.current?.click()} disabled={uploading}>
                  <Upload size={13}/> {badgeUrl ? 'Replace' : 'Upload'} Badge
                </button>
                {badgeUrl && (
                  <button className="btn btn-sm" style={{ color:'var(--red,#ef4444)',
                    background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)' }}
                    onClick={handleRemoveBadge}>
                    <Trash2 size={13}/>
                  </button>
                )}
              </div>
              <input ref={badgeInput} type="file" accept="image/png,image/jpeg,image/webp"
                style={{ display:'none' }} onChange={handleBadgeChange} />
            </div>
          </Row>

          {school && (
            <form onSubmit={handleSchoolSave} className="settings-form" style={{ marginTop:16 }}>
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
          )}
        </Section>

        {/* Time configuration moved to Schedule Settings page */}
        <motion.div className="card" variants={pv}
          style={{background:'rgba(245,158,11,.04)',border:'1.5px solid rgba(245,158,11,.2)',
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

        {/* ── Appearance & PDF Theme ── */}

        <Section icon={<Palette size={16}/>} title="Appearance & PDF Themes">
          <Row label="App Theme" hint="Light, dark, or follow system preference">
            <div className="settings-theme-picker">
              {[
                { id:'light',  icon:<Sun size={18}/>,     label:'Light' },
                { id:'dark',   icon:<Moon size={18}/>,    label:'Dark' },
                { id:'system', icon:<Monitor size={18}/>, label:'System' },
              ].map(opt => (
                <button key={opt.id}
                  className={`settings-theme-opt${themeMode===opt.id?' selected':''}`}
                  onClick={() => applyTheme(opt.id)}>
                  <span className="settings-theme-icon">{opt.icon}</span>
                  <span className="settings-theme-label">{opt.label}</span>
                  {themeMode===opt.id && (
                    <motion.div className="settings-theme-check" layoutId="theme-check"
                      initial={{scale:0}} animate={{scale:1}}
                      transition={{type:'spring',stiffness:400}}>
                      <Check size={10}/>
                    </motion.div>
                  )}
                </button>
              ))}
            </div>
          </Row>

          {/* PDF colour theme */}
          {school && (
            <Row label="PDF Colour Theme" hint="Applied to all exported PDFs and spreadsheets">
              <div className="settings-pdf-themes">
                {THEMES.map(t => (
                  <button key={t.id}
                    className={`settings-pdf-theme${school.timetable_theme===t.id?' selected':''}`}
                    onClick={() => {
                      setSchool(s => ({ ...s, timetable_theme: t.id }))
                      schoolAPI.updateSettings({ timetable_theme: t.id })
                        .then(() => toast.success(`PDF theme: ${t.label}`))
                    }}>
                    <div className="settings-pdf-swatches">
                      {t.preview.map((c,i) => (
                        <div key={i} style={{ background:c, flex:1 }}/>
                      ))}
                    </div>
                    <span className="settings-pdf-theme-label">{t.label}</span>
                    {school.timetable_theme===t.id && (
                      <div className="settings-pdf-check"><Check size={10}/></div>
                    )}
                  </button>
                ))}
              </div>
            </Row>
          )}

          {/* Timetable orientation */}
          {school && (
            <Row label="Timetable Orientation" hint="How the grid is displayed in the app">
              <div style={{ display:'flex', gap:10 }}>
                {[
                  { id:'horizontal', label:'Horizontal', hint:'Days across top, periods down' },
                  { id:'vertical',   label:'Vertical',   hint:'Periods across top, days down' },
                ].map(o => (
                  <button key={o.id}
                    className={`settings-orientation-btn${school.timetable_orientation===o.id?' active':''}`}
                    onClick={() => {
                      setSchool(s => ({ ...s, timetable_orientation: o.id }))
                      schoolAPI.updateSettings({ timetable_orientation: o.id })
                    }}>
                    <LayoutGrid size={14}/>
                    <div>
                      <div style={{ fontWeight:700, fontSize:12 }}>{o.label}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{o.hint}</div>
                    </div>
                    {school.timetable_orientation===o.id && <Check size={12} style={{ marginLeft:'auto', color:'var(--amber)' }}/>}
                  </button>
                ))}
              </div>
            </Row>
          )}
        </Section>

        {/* ── Password ── */}
        <Section icon={<Lock size={16}/>} title="Password">
          <form onSubmit={handlePasswordSave} className="settings-form">
            {[
              { key:'current', label:'Current password',     placeholder:'••••••••' },
              { key:'next',    label:'New password',          placeholder:'At least 6 characters' },
              { key:'confirm', label:'Confirm new password',  placeholder:'Must match new password' },
            ].map(({ key, label, placeholder }) => (
              <Row key={key} label={label}>
                <div className="settings-input-wrap">
                  <input className="settings-input"
                    type={showPw[key] ? 'text' : 'password'}
                    value={passwords[key]} placeholder={placeholder}
                    onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                    style={{ paddingRight:38 }} />
                  <button type="button" className="settings-eye"
                    onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}>
                    {showPw[key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </Row>
            ))}
            <div className="settings-form-footer">
              <button type="submit" className="btn btn-accent settings-save-btn" disabled={saving}>
                <Lock size={14}/> {saving ? 'Changing…' : 'Change password'}
              </button>
            </div>
          </form>
        </Section>

        {/* ── Notifications ── */}
        <Section icon={<Bell size={16}/>} title="Notifications">
          <Row label="Draft generated" hint="Toast when timetable generation completes">
            <Toggle value={notifs.draftGenerated} onChange={v => setNotifs(n => ({ ...n, draftGenerated:v }))} label="Draft generated"/>
          </Row>
          <Row label="Draft activated" hint="Toast when a draft becomes the active timetable">
            <Toggle value={notifs.draftActivated} onChange={v => setNotifs(n => ({ ...n, draftActivated:v }))} label="Draft activated"/>
          </Row>
          <Row label="Email export" hint="Toast when a teacher email is sent successfully">
            <Toggle value={notifs.emailExports} onChange={v => setNotifs(n => ({ ...n, emailExports:v }))} label="Email export"/>
          </Row>
        </Section>

        {/* ── Security ── */}
        <Section icon={<Shield size={16}/>} title="Security">
          <Row label="Active sessions" hint="Currently signed in on this device">
            <span className="settings-badge-green">1 active</span>
          </Row>
          <Row label="Two-factor authentication">
            <span className="settings-badge-muted">Coming soon</span>
          </Row>
          <Row label="Account data">
            <button className="settings-link-btn"
              onClick={() => toast('Data export coming soon', { icon:'📦' })}>
              Request export <ChevronRight size={13}/>
            </button>
          </Row>
        </Section>

      </div>
    </motion.div>
  )
}
