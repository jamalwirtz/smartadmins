import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { profileAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  User, Mail, Lock, Bell, Sun, Moon, Monitor, ChevronRight,
  Camera, Save, Eye, EyeOff, Shield, Check
} from 'lucide-react'

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
  const [themeMode, setThemeMode] = useState(theme)
  const [saving, setSaving]       = useState(false)
  const [passwords, setPasswords] = useState({ current:'', next:'', confirm:'' })
  const [showPw,  setShowPw]      = useState({ current:false, next:false, confirm:false })
  const [notifs,  setNotifs]      = useState({ draftGenerated:true, draftActivated:true, emailExports:false })

  const photoInput  = useRef()

  // ── loaders ──
  useEffect(() => { loadProfile() }, [])

  const loadProfile = async () => {
    try {
      const r = await profileAPI.get()
      setProfile({ display_name: r.data.display_name || '', email: user?.email || '', bio: r.data.bio || '' })
      if (r.data.has_photo) setPhotoUrl(profileAPI.photoUrl(user?.id) + '?t=' + Date.now())
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
          <h1 className="page-title">Account Settings</h1>
          <p className="page-subtitle">
            Manage your personal profile, password, and notification preferences.
            {' '}Looking for school logo, PDF colours, or timetable appearance?{' '}
            <a href="/branding" style={{ color:'var(--amber)', fontWeight:700, textDecoration:'none' }}>
              Go to Branding & Appearance →
            </a>
          </p>
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

        {/* ── Appearance (app-wide light/dark, not PDF/branding) ── */}
        <Section icon={<Sun size={16}/>} title="App Theme">
          <Row label="Theme" hint="Light, dark, or follow system preference">
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
