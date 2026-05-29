import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  CalendarDays, Users, BookOpen, FileDown, Zap, Lock, Globe,
  ArrowRight, ChevronDown, GripHorizontal, CheckCircle, Star, LogIn
} from 'lucide-react'

/* ── Feature data ────────────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <Zap size={22} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',
    title: 'AI-Powered Scheduling',
    body: 'Constraint-based engine generates multiple conflict-free timetable drafts in seconds — handling teacher availability, max hours, and class requirements automatically.'
  },
  {
    icon: <GripHorizontal size={22} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',
    title: 'Drag & Drop Editor',
    body: 'Visually move and swap any lesson slot. Lock critical slots so they survive reshuffles. Real-time conflict validation — you can\'t break the timetable accidentally.'
  },
  {
    icon: <Users size={22} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)',
    title: 'Teacher Management',
    body: 'Set per-teacher weekly hour caps, part-time day restrictions, and subject assignments. Every constraint is respected at generation time.'
  },
  {
    icon: <FileDown size={22} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',
    title: 'PDF Export & Email',
    body: 'Export the full school timetable or individual teacher PDFs. Email any teacher their personal schedule directly from the dashboard — one click.'
  },
  {
    icon: <Globe size={22} />, color: '#ef4444', bg: 'rgba(239,68,68,0.12)',
    title: 'Real-Time Collaboration',
    body: 'WebSocket-powered live updates mean changes appear instantly for every connected admin — no refreshing, no stale data.'
  },
  {
    icon: <Lock size={22} />, color: '#0d9488', bg: 'rgba(13,148,136,0.12)',
    title: 'Multi-Draft Workflow',
    body: 'Generate 3+ drafts at once, compare them side by side, and activate the best one. Previous drafts are preserved for rollback.'
  },
]

const STEPS = [
  { n: '01', title: 'Add your school data', body: 'Enter your teachers, their subjects and availability, then define your class sections. A one-time setup that takes under 10 minutes.' },
  { n: '02', title: 'Generate timetable drafts', body: 'Hit Generate. The engine produces multiple conflict-free drafts instantly, scoring each one for balance and teacher workload.' },
  { n: '03', title: 'Fine-tune with drag & drop', body: 'Drag lessons, swap slots, lock favourites. Every move is validated live — conflicts are impossible.' },
  { n: '04', title: 'Export and share', body: 'Activate your chosen draft, export PDFs for the school and every teacher, and email them all in one action.' },
]

const STATS = [
  { value: '< 3s', label: 'Timetable generation' },
  { value: '100%', label: 'Conflict-free guarantee' },
  { value: '1-click', label: 'PDF export' },
  { value: '∞', label: 'Draft revisions' },
]

/* ── Nav ─────────────────────────────────────────────────────────────────── */
function HomeNav() {
  const navigate = useNavigate()
  return (
    <motion.header className="home-nav"
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.4,0,0.2,1] }}>
      <div className="home-nav-inner">
        <Link to="/" className="home-nav-brand">
          <img src="/logo.png" alt="Smart Admin" className="home-nav-logo" />
          <span className="home-nav-title">Smart Admin</span>
        </Link>
        <nav className="home-nav-links">
          <a href="#features" className="home-nav-link">Features</a>
          <a href="#how-it-works" className="home-nav-link">How it works</a>
          <a href="#about" className="home-nav-link">About</a>
        </nav>
        <div className="home-nav-actions">
          <Link to="/login" className="home-btn-ghost">Sign in</Link>
          <Link to="/signup" className="home-btn-primary">Get started free <ArrowRight size={14} /></Link>
        </div>
      </div>
    </motion.header>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function Home() {
  const heroRef = useRef(null)
  const { login } = useAuth()
  const [demoLoading, setDemoLoading] = useState(false)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })

  const handleTryDemo = async () => {
    setDemoLoading(true)
    try {
      await login('admin', 'admin123')
      navigate('/dashboard')
    } catch {
      navigate('/login')
    } finally {
      setDemoLoading(false)
    }
  }
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%'])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  return (
    <div className="home-page">
      <HomeNav />

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="home-hero" ref={heroRef}>
        {/* Background grid + orbs */}
        <div className="home-hero-bg" />
        <div className="home-hero-grid" />
        {[
          { w:500,h:500,top:'10%',left:'5%',  c:'rgba(41,82,163,0.2)',  dur:12, dx:30,dy:-20 },
          { w:350,h:350,bottom:'5%',right:'8%',c:'rgba(245,158,11,0.15)',dur:9,  dx:-24,dy:28, delay:2 },
          { w:250,h:250,top:'35%',right:'22%', c:'rgba(13,148,136,0.12)',dur:14, dx:18, dy:-35, delay:4 },
        ].map((o,i) => (
          <motion.div key={i} style={{ position:'absolute',width:o.w,height:o.h,borderRadius:'50%',
            background:`radial-gradient(circle,${o.c},transparent)`,
            top:o.top,bottom:o.bottom,left:o.left,right:o.right,pointerEvents:'none',zIndex:0 }}
            animate={{ y:[0,o.dy,0],x:[0,o.dx,0] }}
            transition={{ duration:o.dur,repeat:Infinity,ease:'easeInOut',delay:o.delay||0 }} />
        ))}

        <motion.div className="home-hero-content" style={{ y: heroY, opacity: heroOpacity }}>
          {/* Badge */}
          <motion.div className="home-hero-badge"
            initial={{ opacity:0, scale:0.85 }} animate={{ opacity:1, scale:1 }}
            transition={{ duration:0.5, delay:0.1, ease:[0.34,1.56,0.64,1] }}>
            <Star size={11} fill="currentColor" /> Enterprise School Timetabling
          </motion.div>

          {/* Headline */}
          <motion.h1 className="home-hero-h1"
            initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.7, delay:0.2, ease:[0.4,0,0.2,1] }}>
            Your school's perfect
            <br />
            <span className="home-hero-gradient">timetable in seconds</span>
          </motion.h1>

          {/* Sub */}
          <motion.p className="home-hero-sub"
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.6, delay:0.35 }}>
            Smart Admin generates conflict-free timetables automatically — no spreadsheets, no clashes, no headaches.
            Teachers get PDFs in their inbox before the first bell.
          </motion.p>

          {/* CTAs */}
          <motion.div className="home-hero-ctas"
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.5, delay:0.5 }}>
            <button
              className="home-cta-primary"
              onClick={handleTryDemo}
              disabled={demoLoading}
              style={{border:'none',cursor:'pointer'}}>
              {demoLoading ? 'Signing in…' : <><Zap size={16} fill="currentColor"/> Try live demo</>}
            </button>
            <Link to="/signup" className="home-cta-secondary">
              Create free account <ArrowRight size={15}/>
            </Link>
          </motion.div>

          {/* Stats row */}
          <motion.div className="home-hero-stats"
            initial={{ opacity:0 }} animate={{ opacity:1 }}
            transition={{ delay:0.7 }}>
            {STATS.map(s => (
              <div key={s.label} className="home-hero-stat">
                <div className="home-hero-stat-val">{s.value}</div>
                <div className="home-hero-stat-lbl">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Demo credentials note */}
        <motion.div className="home-demo-note"
          initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.9}}>
          Demo credentials: <strong>admin</strong> / <strong>admin123</strong>
          {' '}— or{' '}
          <Link to="/login" className="home-demo-link">sign in with your own account</Link>
        </motion.div>

        {/* Scroll hint */}
        <motion.div className="home-scroll-hint"
          animate={{ y:[0,6,0] }} transition={{ duration:1.8, repeat:Infinity }}>
          <ChevronDown size={18} />
        </motion.div>
      </section>

      {/* ── FEATURE GRID ────────────────────────────────────────────────── */}
      <section id="features" className="home-section home-features-section">
        <div className="home-section-inner">
          <motion.div className="home-section-header"
            initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true }} transition={{ duration:0.6 }}>
            <div className="home-section-pill">Everything you need</div>
            <h2 className="home-section-h2">Built for real schools</h2>
            <p className="home-section-lead">Every feature was designed around the actual constraints schools face — not a generic scheduling tool.</p>
          </motion.div>

          <div className="home-features-grid">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} className="home-feature-card"
                initial={{ opacity:0, y:32 }} whileInView={{ opacity:1, y:0 }}
                viewport={{ once:true }} transition={{ duration:0.5, delay: i * 0.08 }}
                whileHover={{ y:-4, boxShadow:'0 20px 50px rgba(15,31,61,0.12)' }}>
                <div className="home-feature-icon" style={{ background:f.bg, color:f.color }}>
                  {f.icon}
                </div>
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-body">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="home-section home-steps-section">
        <div className="home-section-inner">
          <motion.div className="home-section-header"
            initial={{ opacity:0, y:24 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true }} transition={{ duration:0.6 }}>
            <div className="home-section-pill">Simple process</div>
            <h2 className="home-section-h2">From setup to schedule in 4 steps</h2>
          </motion.div>

          <div className="home-steps">
            {STEPS.map((s, i) => (
              <motion.div key={s.n} className="home-step"
                initial={{ opacity:0, x: i%2===0 ? -30 : 30 }}
                whileInView={{ opacity:1, x:0 }}
                viewport={{ once:true }} transition={{ duration:0.55, delay: i*0.1 }}>
                <div className="home-step-num">{s.n}</div>
                <div className="home-step-body">
                  <h3 className="home-step-title">{s.title}</h3>
                  <p className="home-step-text">{s.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT / VALUE PROP ──────────────────────────────────────────── */}
      <section id="about" className="home-section home-about-section">
        <div className="home-section-inner home-about-inner">
          <motion.div className="home-about-text"
            initial={{ opacity:0, x:-40 }} whileInView={{ opacity:1, x:0 }}
            viewport={{ once:true }} transition={{ duration:0.6 }}>
            <div className="home-section-pill">Why Smart Admin?</div>
            <h2 className="home-section-h2 home-about-h2">Stop wrestling spreadsheets.</h2>
            <p className="home-about-lead">Most schools still schedule by hand — copying and pasting into spreadsheets, manually checking for clashes, and distributing timetables via email attachments. Smart Admin eliminates all of that.</p>
            <ul className="home-about-list">
              {[
                'Zero manual conflict checks — the engine handles it all',
                'Teachers get their personal PDF automatically',
                'One-click reshuffles when circumstances change mid-term',
                'Works for any school size — from 5 teachers to 500',
              ].map(item => (
                <li key={item} className="home-about-li">
                  <CheckCircle size={14} color="#10b981" style={{flexShrink:0}} />
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="home-cta-primary" style={{marginTop:32,display:'inline-flex'}}>
              Get started free <ArrowRight size={16} />
            </Link>
          </motion.div>

          <motion.div className="home-about-visual"
            initial={{ opacity:0, x:40 }} whileInView={{ opacity:1, x:0 }}
            viewport={{ once:true }} transition={{ duration:0.6, delay:0.15 }}>
            <div className="home-tt-preview">
              <div className="home-tt-header">
                <div className="home-tt-title">Class 8A — Week 1</div>
                <div className="home-tt-badge">● Live</div>
              </div>
              {['Mon','Tue','Wed','Thu','Fri'].map((day, di) => (
                <div key={day} className="home-tt-row">
                  <div className="home-tt-day">{day}</div>
                  {[
                    ['Maths','Eng','Sci','Hist','PE'],
                    ['Eng','Sci','Maths','Art','Maths'],
                    ['Sci','Hist','Eng','Maths','Eng'],
                    ['Hist','Art','Maths','Sci','Hist'],
                    ['PE','Maths','Hist','Eng','Sci'],
                  ][di].map((subj, pi) => (
                    <motion.div key={pi} className="home-tt-cell"
                      initial={{ opacity:0, scale:0.85 }}
                      whileInView={{ opacity:1, scale:1 }}
                      viewport={{ once:true }}
                      transition={{ delay: di*0.06 + pi*0.04 }}>
                      {subj}
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="home-cta-section">
        <div className="home-section-inner">
          <motion.div className="home-cta-box"
            initial={{ opacity:0, y:30 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true }} transition={{ duration:0.65 }}>
            <img src="/logo.png" alt="" className="home-cta-logo" />
            <h2 className="home-cta-h2">Ready to reclaim your Sundays?</h2>
            <p className="home-cta-sub">Join schools that generate conflict-free timetables in under 3 seconds.</p>
            <div className="home-hero-ctas" style={{justifyContent:'center'}}>
              <Link to="/signup" className="home-cta-primary">Create your school account <ArrowRight size={16} /></Link>
              <Link to="/login" className="home-cta-secondary">Already have an account</Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="home-footer">
        <div className="home-section-inner home-footer-inner">
          <div className="home-footer-brand">
            <img src="/logo.png" alt="" className="home-nav-logo" />
            <span className="home-footer-name">Smart Admin</span>
          </div>
          <p className="home-footer-copy">© {new Date().getFullYear()} Smart Admin — Enterprise School Timetable Generator</p>
          <div className="home-footer-links">
            <Link to="/login" className="home-footer-link">Sign in</Link>
            <Link to="/signup" className="home-footer-link">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
