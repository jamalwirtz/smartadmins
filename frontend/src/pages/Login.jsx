import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { LogIn, Eye, EyeOff, Shield, Mail } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [focused, setFocused] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!form.email.trim()) { toast.error('Please enter your email or username'); return }
    if (!form.password)     { toast.error('Please enter your password'); return }
    setLoading(true)
    try {
      await login(form.email.trim(), form.password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err?.response?.data?.detail
      if (msg) {
        toast.error(msg)
      } else if (err?.code === 'ERR_NETWORK' || err?.message?.includes('ECONNREFUSED')) {
        toast.error('Cannot reach the server. Make sure the backend is running on port 8000.', { duration: 6000 })
      } else {
        toast.error('Sign in failed. Check your credentials and try again.')
      }
    } finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-grid" />

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

      {/* Back to home */}
      <motion.div style={{ position:'fixed', top:20, left:24, zIndex:10 }}
        initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:.2}}>
        <Link to="/" style={{
          display:'flex', alignItems:'center', gap:7,
          color:'rgba(255,255,255,.7)', fontSize:13, fontWeight:600,
          textDecoration:'none', padding:'7px 14px',
          background:'rgba(255,255,255,.08)',
          borderRadius:20, border:'1px solid rgba(255,255,255,.12)',
          backdropFilter:'blur(8px)', transition:'all .15s',
        }}
        onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,.15)'; e.currentTarget.style.color='#fff' }}
        onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,.08)'; e.currentTarget.style.color='rgba(255,255,255,.7)' }}>
          ← Back to Home
        </Link>
      </motion.div>

      <div className="login-layout">

        {/* ── Hero panel ── */}
        <motion.div className="login-hero-panel"
          initial={{ opacity:0, x:-60 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.7, ease:[0.4,0,0.2,1] }}>
          <motion.img src="/logo.png" alt="Smart Admin" className="login-hero-img"
            initial={{ scale:0.92, opacity:0 }} animate={{ scale:1, opacity:1 }}
            transition={{ duration:0.8, delay:0.15, ease:[0.34,1.56,0.64,1] }} />
          <motion.div className="login-hero-badge"
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.5 }}>
            <div className="login-hero-badge-inner">
              <Shield size={14} color="var(--amber)" />
              <span>Enterprise School Management</span>
            </div>
          </motion.div>
          <div className="login-hero-pills">
            {['Drag & Drop','Real-Time','PDF Export','Zero Conflicts'].map((f, i) => (
              <motion.div key={f} className="login-pill"
                initial={{ opacity:0, scale:0.8 }} animate={{ opacity:1, scale:1 }}
                transition={{ delay: 0.6 + i * 0.1, ease:[0.34,1.56,0.64,1] }}>
                {f}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Auth card ── */}
        <motion.div className="login-card"
          initial={{ opacity:0, x:60, scale:0.96 }} animate={{ opacity:1, x:0, scale:1 }}
          transition={{ duration:0.6, delay:0.1, ease:[0.4,0,0.2,1] }}>

          {/* Logo */}
          <motion.div className="login-card-logo"
            initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3 }}>
            <img src="/logo.png" alt="SSTG" className="login-card-logo-img" />
            <div>
              <div className="login-card-title">Smart Admin</div>
              <div className="login-card-sub">Timetable Generator</div>
            </div>
          </motion.div>

          <div className="login-divider" />

          {/* Heading */}
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.35 }}>
            <h2 className="login-heading">Welcome back</h2>
            <p className="login-subheading">Sign in to manage your school schedule</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ marginTop: 20 }}>

            {/* Email / Username */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.4 }}>
              <label className="form-label login-label">Email or Username</label>
              <div className={`login-input-wrap${focused==='email' ? ' focused' : ''}`}>
                <Mail size={14} className="input-prefix-icon" />
                <input
                  className="login-input has-icon"
                  type="text"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="you@school.edu or your username"
                  autoFocus
                  autoComplete="username" />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div className="form-group"
              initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.46 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <label className="form-label login-label">Password</label>
                <span className="auth-forgot"
                  onClick={() => toast('Password reset is not yet configured.', { icon:'🔑' })}>
                  Forgot password?
                </span>
              </div>
              <div className={`login-input-wrap${focused==='password' ? ' focused' : ''}`}>
                <input
                  className="login-input"
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPass(v => !v)} className="login-eye" tabIndex={-1}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </motion.div>

            {/* Submit */}
            <motion.button
              type="submit"
              className="btn btn-accent login-submit"
              disabled={loading}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.52 }}
              whileHover={{ scale:1.02, boxShadow:'0 8px 24px rgba(245,158,11,0.4)' }}
              whileTap={{ scale:0.97 }}>
              <AnimatePresence mode="wait">
                {loading
                  ? <motion.span key="l" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                      style={{display:'flex',alignItems:'center',gap:8}}>
                      <div className="login-spinner" /> Signing in…
                    </motion.span>
                  : <motion.span key="i" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                      style={{display:'flex',alignItems:'center',gap:8}}>
                      <LogIn size={16} /> Sign In
                    </motion.span>
                }
              </AnimatePresence>
            </motion.button>
          </form>

          {/* Demo credentials */}
          <motion.div
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.54 }}
            style={{
              margin:'12px 0', padding:'10px 14px',
              background:'rgba(245,158,11,.07)',
              border:'1px solid rgba(245,158,11,.2)',
              borderRadius:10, fontSize:12, color:'rgba(255,255,255,.65)',
              display:'flex', alignItems:'center', gap:10,
            }}>
            <span style={{fontSize:16}}>💡</span>
            <span>
              <strong style={{color:'#f59e0b'}}>Demo:</strong>{' '}
              username <code style={{background:'rgba(255,255,255,.1)',padding:'1px 5px',borderRadius:4}}>admin</code>{' '}
              / password <code style={{background:'rgba(255,255,255,.1)',padding:'1px 5px',borderRadius:4}}>admin123</code>
              <button
                style={{
                  marginLeft:8, background:'rgba(245,158,11,.2)',
                  border:'1px solid rgba(245,158,11,.4)',
                  color:'#f59e0b', borderRadius:6, padding:'2px 8px',
                  cursor:'pointer', fontSize:11, fontWeight:700,
                }}
                onClick={() => setForm({ email:'admin', password:'admin123' })}>
                Fill in
              </button>
            </span>
          </motion.div>

          {/* Sign up link */}
          <motion.p className="auth-switch"
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.58 }}>
            Don't have an account?{' '}
            <Link to="/signup" className="auth-switch-link">Create one — it's free</Link>
          </motion.p>

        </motion.div>
      </div>
    </div>
  )
}
