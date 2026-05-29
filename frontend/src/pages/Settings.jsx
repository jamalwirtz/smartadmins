import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'
import {
  User, Mail, Lock, Bell, Palette, Shield, Save,
  Eye, EyeOff, Sun, Moon, Monitor, ChevronRight, Camera
} from 'lucide-react'

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4,0,0.2,1] } },
}

function SettingsSection({ icon, title, children }) {
  return (
    <motion.div className="settings-section" variants={pageVariants}>
      <div className="settings-section-header">
        <span className="settings-section-icon">{icon}</span>
        <h2 className="settings-section-title">{title}</h2>
      </div>
      <div className="settings-section-body">{children}</div>
    </motion.div>
  )
}

function SettingsRow({ label, hint, children }) {
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
    <button
      type="button"
      className={`settings-toggle${value ? ' on' : ''}`}
      onClick={() => onChange(!value)}
      aria-label={label}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  const [profile, setProfile] = useState({
    displayName: user?.username || '',
    email: user?.email || '',
    bio: '',
  })
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [notifs, setNotifs] = useState({
    draftGenerated: true,
    draftActivated: true,
    emailExports: false,
  })
  const [themeMode, setThemeMode] = useState(theme)
  const [saving, setSaving] = useState(false)

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    await new Promise(r => setTimeout(r, 600))
    setSaving(false)
    toast.success('Profile updated')
  }

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    if (!passwords.current) { toast.error('Enter your current password'); return }
    if (passwords.next.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (passwords.next !== passwords.confirm) { toast.error('Passwords don\'t match'); return }
    setSaving(true)
    await new Promise(r => setTimeout(r, 700))
    setSaving(false)
    setPasswords({ current: '', next: '', confirm: '' })
    toast.success('Password changed')
  }

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

  const initials = (user?.username || 'AD').slice(0, 2).toUpperCase()

  return (
    <motion.div className="page" initial="initial" animate="animate" variants={{ animate: { transition: { staggerChildren: 0.07 } } }}>
      {/* Page header */}
      <motion.div className="page-header" variants={pageVariants}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account, appearance, and preferences</p>
        </div>
      </motion.div>

      <div className="settings-layout">

        {/* ── Account / Profile ── */}
        <SettingsSection icon={<User size={16}/>} title="Profile">
          <div className="settings-avatar-row">
            <div className="settings-avatar-wrap">
              <div className="settings-avatar">{initials}</div>
              <button className="settings-avatar-btn" title="Upload photo (coming soon)"
                onClick={() => toast('Profile photo upload coming soon', { icon: '📸' })}>
                <Camera size={13} />
              </button>
            </div>
            <div>
              <div className="settings-avatar-name">{user?.username}</div>
              <div className="settings-avatar-role">Administrator</div>
              <button className="settings-avatar-change" onClick={() => toast('Photo upload coming soon', { icon: '📸' })}>
                Change photo
              </button>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="settings-form">
            <SettingsRow label="Display Name" hint="Shown in the sidebar and topbar">
              <input className="settings-input" value={profile.displayName}
                onChange={e => setProfile(p => ({ ...p, displayName: e.target.value }))}
                placeholder="Your name" />
            </SettingsRow>
            <SettingsRow label="Email" hint="Used for notifications and account recovery">
              <input className="settings-input" type="email" value={profile.email}
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                placeholder="you@school.edu" />
            </SettingsRow>
            <SettingsRow label="Bio" hint="Optional short description">
              <input className="settings-input" value={profile.bio}
                onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                placeholder="Head of timetabling, St Mary's School" />
            </SettingsRow>
            <div className="settings-form-footer">
              <motion.button type="submit" className="btn btn-accent settings-save-btn"
                disabled={saving}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Save size={14} /> {saving ? 'Saving…' : 'Save profile'}
              </motion.button>
            </div>
          </form>
        </SettingsSection>

        {/* ── Password ── */}
        <SettingsSection icon={<Lock size={16}/>} title="Password">
          <form onSubmit={handlePasswordSave} className="settings-form">
            {[
              { key: 'current', label: 'Current password', placeholder: '••••••••' },
              { key: 'next',    label: 'New password',     placeholder: 'At least 8 characters' },
              { key: 'confirm', label: 'Confirm new password', placeholder: 'Must match new password' },
            ].map(({ key, label, placeholder }) => (
              <SettingsRow key={key} label={label}>
                <div className="settings-input-wrap">
                  <input className="settings-input" type={showPw[key] ? 'text' : 'password'}
                    value={passwords[key]} placeholder={placeholder}
                    onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                    style={{ paddingRight: 38 }} />
                  <button type="button" className="settings-eye"
                    onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}>
                    {showPw[key] ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </SettingsRow>
            ))}
            <div className="settings-form-footer">
              <motion.button type="submit" className="btn btn-accent settings-save-btn"
                disabled={saving} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                <Lock size={14} /> {saving ? 'Changing…' : 'Change password'}
              </motion.button>
            </div>
          </form>
        </SettingsSection>

        {/* ── Appearance ── */}
        <SettingsSection icon={<Palette size={16}/>} title="Appearance">
          <div className="settings-theme-picker">
            {[
              { id: 'light',  icon: <Sun size={20}/>,     label: 'Light' },
              { id: 'dark',   icon: <Moon size={20}/>,    label: 'Dark' },
              { id: 'system', icon: <Monitor size={20}/>, label: 'System' },
            ].map(opt => (
              <button key={opt.id}
                className={`settings-theme-opt${themeMode === opt.id ? ' selected' : ''}`}
                onClick={() => applyTheme(opt.id)}>
                <span className="settings-theme-icon">{opt.icon}</span>
                <span className="settings-theme-label">{opt.label}</span>
                {themeMode === opt.id && (
                  <motion.div className="settings-theme-check"
                    layoutId="theme-check"
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400 }}>
                    <ChevronRight size={11} />
                  </motion.div>
                )}
              </button>
            ))}
          </div>
          <SettingsRow label="Compact sidebar" hint="Reduce sidebar padding for more screen space">
            <Toggle value={false} onChange={() => toast('Coming soon', { icon: '🔧' })} label="Compact sidebar" />
          </SettingsRow>
        </SettingsSection>

        {/* ── Notifications ── */}
        <SettingsSection icon={<Bell size={16}/>} title="Notifications">
          <SettingsRow label="Draft generated" hint="Toast when timetable generation completes">
            <Toggle value={notifs.draftGenerated} onChange={v => setNotifs(n => ({ ...n, draftGenerated: v }))} label="Draft generated" />
          </SettingsRow>
          <SettingsRow label="Draft activated" hint="Toast when a draft becomes the active timetable">
            <Toggle value={notifs.draftActivated} onChange={v => setNotifs(n => ({ ...n, draftActivated: v }))} label="Draft activated" />
          </SettingsRow>
          <SettingsRow label="Email export success" hint="Toast when a teacher email is sent successfully">
            <Toggle value={notifs.emailExports} onChange={v => setNotifs(n => ({ ...n, emailExports: v }))} label="Email export" />
          </SettingsRow>
        </SettingsSection>

        {/* ── Security ── */}
        <SettingsSection icon={<Shield size={16}/>} title="Security">
          <SettingsRow label="Active sessions" hint="You are currently signed in on this device">
            <span className="settings-badge-green">1 active session</span>
          </SettingsRow>
          <SettingsRow label="Two-factor authentication" hint="Extra layer of security for your account">
            <span className="settings-badge-muted">Coming soon</span>
          </SettingsRow>
          <SettingsRow label="Account data" hint="Export or delete all your data">
            <button className="settings-link-btn" onClick={() => toast('Data export coming soon', { icon: '📦' })}>
              Request export <ChevronRight size={13}/>
            </button>
          </SettingsRow>
        </SettingsSection>

      </div>
    </motion.div>
  )
}
