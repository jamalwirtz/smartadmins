import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { authAPI } from '../api/client'
import toast from 'react-hot-toast'
import { UserPlus, Eye, EyeOff, Shield, Check, X, AtSign, User, Mail, Lock } from 'lucide-react'

/* ── Password strength ───────────────────────────────────────────────────── */
const RULES = [
  { label: 'At least 8 characters',    test: p => p.length >= 8,           optional: false },
  { label: 'Contains a letter',         test: p => /[a-zA-Z]/.test(p),      optional: false },
  { label: 'Contains a number',         test: p => /\d/.test(p),            optional: false },
  { label: 'Contains a special char',   test: p => /[^a-zA-Z0-9]/.test(p), optional: true  },
  { label: 'Contains uppercase letter', test: p => /[A-Z]/.test(p),        optional: true  },
]

const STRENGTH_LABELS = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Excellent']
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#0d9488']

function strengthScore(p) {
  if (!p) return 0
  let s = 0
  if (p.length >= 8)           s++
  if (/[a-z]/.test(p))         s++
  if (/[A-Z]/.test(p))         s++
  if (/\d/.test(p))             s++
  if (/[^a-zA-Z0-9]/.test(p))  s++
  return s
}

export default function Signup() {
  const { login } = useAuth()
  const navigate   = useNavigate()

  const [form,      setForm]      = useState({ name: '', email: '', username: '', password: '' })
  const [showPass,  setShowPass]  = useState(false)
  const [focused,   setFocused]   = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [showRules, setShowRules] = useState(false)

  const score         = strengthScore(form.password)
  const emailValid    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const requiredOk    = RULES.filter(r => !r.optional).every(r => r.test(form.password))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim())     { toast.error('Please enter your full name'); return }
    if (!emailValid)           { toast.error('Please enter a valid email address'); return }
    if (!form.username.trim()) { toast.error('Please choose a username'); return }
    if (!requiredOk)           { toast.error('Password does not meet the requirements'); return }

    setLoading(true)
    try {
      // Step 1: register the account
      const res = await authAPI.register({
        name:     form.name.trim(),
        email:    form.email.trim(),
        username: form.username.toLowerCase().trim(),
        password: form.password,
      })

      // Step 2: store the token returned by register
      localStorage.setItem('sstg_token', res.data.access_token)

      // Step 3: log in via AuthContext so the user state is set correctly
      await login(form.username.toLowerCase().trim(), form.password)

      toast.success('Account created! Welcome to Smart Admin 🎉', { duration: 3500 })
      navigate('/dashboard')
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (typeof detail === 'string') {
        toast.error(detail)
      } else if (Array.isArray(detail)) {
        toast.error(detail[0]?.msg || 'Signup failed')
      } else if (err?.code === 'ERR_NETWORK') {
        toast.error('Cannot reach the server. Make sure the backend is running.', { duration: 6000 })
      } else {
        toast.error('Signup failed. Please try again.')
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="login-bg" /><div className="login-grid" />

      {/* Background orbs */}
      {[
        { w:350, h:350, top:'5%',    left:'5%',   c:'rgba(41,82,163,0.18)',  dur:9,  dx:25,  dy:-20 },
        { w:250, h:250, bottom:'10%',right:'8%',  c:'rgba(245,158,11,0.12)', dur:7,  dx:-18, dy:22,  delay:1.5 },
        { w:180, h:180, top:'40%',   right:'20%', c:'rgba(13,148,136,0.14)', dur:11, dx:15,  dy:-30, delay:3 },
      ].map((o, i) => (
        <motion.div key={i} style={{
          position:'absolute', width:o.w, height:o.h, borderRadius:'50%',
          background:`radial-gradient(circle,${o.c},transparent)`,
          top:o.top, bottom:o.bottom, left:o.left, right:o.right, pointerEvents:'none',
        }}
          animate={{ y:[0,o.dy,0], x:[0,o.dx,0] }}
          transition={{ duration:o.dur, repeat:Infinity, ease:'easeInOut', delay:o.delay||0 }} />
      ))}

      <div className="login-layout">

        {/* ── Hero ── */}
        <motion.div className="login-hero-panel"
          initial={{ opacity:0, x:-60 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.7, ease:[0.4,0,0.2,1] }}>
          <motion.img src="/logo.png" alt="Smart Admin" className="login-hero-img"
            initial={{ scale:0.92, opacity:0 }} animate={{ scale:1, opacity:1 }}
            transition={{ duration:0.8, delay:0.15, ease:[0.34,1.56,0.64,1] }} />
          <motion.div className="login-hero-badge"
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}>
            <div className="login-hero-badge-inner">
              <Shield size={14} color="var(--amber)" />
              <span>Join Smart Admin Today</span>
            </div>
          </motion.div>
          <div className="login-hero-pills">
            {['Free to start', 'No credit card', 'Instant setup', 'Cancel anytime'].map((f, i) => (
              <motion.div key={f} className="login-pill"
                initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
                transition={{ delay: 0.5 + i * 0.1, ease:[0.34,1.56,0.64,1] }}>
                {f}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Card ── */}
        <motion.div className="login-card"
          initial={{ opacity:0, x:60, scale:0.96 }} animate={{ opacity:1, x:0, scale:1 }}
          transition={{ duration:0.6, delay:0.1, ease:[0.4,0,0.2,1] }}>

          {/* Logo */}
          <motion.div className="login-card-logo"
            initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}>
            <img src="/logo.png" alt="SSTG" className="login-card-logo-img" />
            <div>
              <div className="login-card-title">Smart Admin</div>
              <div className="login-card-sub">Timetable Generator</div>
            </div>
          </motion.div>
          <div className="login-divider" />

          {/* Heading */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}>
            <h2 className="login-heading">Create your account</h2>
            <p className="login-subheading">Set up Smart Admin for your school in minutes</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>

            {/* Full Name */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.35 }}>
              <label className="form-label login-label">Full Name</label>
              <div className={`login-input-wrap${focused==='name' ? ' focused' : ''}`}>
                <User size={14} className="input-prefix-icon" />
                <input
                  className="login-input has-icon"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  placeholder="Your full name"
                  autoFocus
                  autoComplete="name" />
              </div>
            </motion.div>

            {/* Email */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.4 }}>
              <label className="form-label login-label">
                Email
                {form.email && (
                  <span className={`input-validate-icon${emailValid ? ' valid' : ' invalid'}`}>
                    {emailValid ? <Check size={11} /> : <X size={11} />}
                  </span>
                )}
              </label>
              <div className={`login-input-wrap${focused==='email' ? ' focused' : ''}`}>
                <Mail size={14} className="input-prefix-icon" />
                <input
                  className="login-input has-icon"
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="you@school.edu"
                  autoComplete="email" />
              </div>
            </motion.div>

            {/* Username */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.45 }}>
              <label className="form-label login-label">Username</label>
              <div className={`login-input-wrap${focused==='username' ? ' focused' : ''}`}>
                <AtSign size={14} className="input-prefix-icon" />
                <input
                  className="login-input has-icon"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                  onFocus={() => setFocused('username')}
                  onBlur={() => setFocused(null)}
                  placeholder="yourschool"
                  autoComplete="username"
                  spellCheck={false} />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.5 }}>
              <label className="form-label login-label">Password</label>
              <div className={`login-input-wrap${focused==='password' ? ' focused' : ''}`}>
                <Lock size={14} className="input-prefix-icon" />
                <input
                  className="login-input has-icon"
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onFocus={() => { setFocused('password'); setShowRules(true) }}
                  onBlur={() => setFocused(null)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  style={{ paddingRight: 42 }} />
                <button type="button" className="login-eye" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Strength bar */}
              {form.password && (
                <div className="strength-wrap">
                  <div className="strength-bar">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className={`strength-segment${score >= n ? ' filled' : ''}`}
                        style={{ background: score >= n ? STRENGTH_COLORS[score] : undefined }} />
                    ))}
                  </div>
                  <span className="strength-label" style={{ color: STRENGTH_COLORS[score] }}>
                    {STRENGTH_LABELS[score]}
                  </span>
                </div>
              )}

              {/* Rules checklist */}
              <AnimatePresence>
                {showRules && (
                  <motion.div className="password-rules"
                    initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }}
                    exit={{ opacity:0, height:0 }} transition={{ duration:0.2 }}>
                    {RULES.map(rule => (
                      <div key={rule.label}
                        className={`pw-rule${rule.test(form.password) ? ' passed' : ''}${rule.optional ? ' optional' : ''}`}>
                        {rule.test(form.password) ? <Check size={10} /> : <X size={10} />}
                        {rule.label}{rule.optional ? ' (optional)' : ''}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Submit */}
            <motion.button
              type="submit"
              className="btn btn-accent login-submit"
              disabled={loading}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.55 }}
              whileHover={{ scale:1.02, boxShadow:'0 8px 24px rgba(245,158,11,0.4)' }}
              whileTap={{ scale:0.97 }}>
              <AnimatePresence mode="wait">
                {loading
                  ? <motion.span key="l" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                      style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div className="login-spinner" /> Creating account…
                    </motion.span>
                  : <motion.span key="i" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                      style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <UserPlus size={16} /> Create Account
                    </motion.span>
                }
              </AnimatePresence>
            </motion.button>
          </form>

          {/* Sign in link */}
          <motion.p className="auth-switch"
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.6 }}>
            Already have an account?{' '}
            <Link to="/login" className="auth-switch-link">Sign in</Link>
          </motion.p>

        </motion.div>
      </div>
    </div>
  )
}
