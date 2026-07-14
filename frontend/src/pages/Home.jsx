import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  CalendarDays, Users, BookOpen, FileDown, Zap, Lock, Globe,
  ArrowRight, CheckCircle, Star, LogIn, Play, Pause,
  GraduationCap, BarChart2, Shield, Clock, Sparkles,
  ChevronRight, Menu, X as XIcon
} from 'lucide-react'

/* ── Data ─────────────────────────────────────────────────────────────── */
const FEATURES = [
  { icon:<Zap size={22}/>,         color:'#f59e0b', bg:'rgba(245,158,11,.12)',  title:'AI-Powered Scheduling',    body:'Constraint-based engine generates multiple conflict-free timetable drafts in seconds — handling teacher availability, max hours, and class requirements automatically.' },
  { icon:<Users size={22}/>,       color:'#10b981', bg:'rgba(16,185,129,.12)',   title:'Teacher Management',       body:'Set per-teacher weekly hour caps, part-time day restrictions, and subject assignments. Every constraint is respected at generation time.' },
  { icon:<GraduationCap size={22}/>,color:'#8b5cf6',bg:'rgba(139,92,246,.12)',  title:'Exam Scheduling',          body:'Full exam session management with paper configuration, supervisor allocation, room assignment, and conflict detection across all classes.' },
  { icon:<FileDown size={22}/>,    color:'#3b82f6', bg:'rgba(59,130,246,.12)',   title:'PDF & Excel Export',       body:'Export the full school timetable or individual teacher PDFs in 5 colour themes. Email any teacher their personal schedule directly from the dashboard.' },
  { icon:<BarChart2 size={22}/>,   color:'#ef4444', bg:'rgba(239,68,68,.12)',    title:'Teacher Comparison',       body:'View all teacher schedules side-by-side on one screen. Colour-coded workload bars instantly reveal who is overloaded and who has capacity.' },
  { icon:<Shield size={22}/>,      color:'#0d9488', bg:'rgba(13,148,136,.12)',   title:'Multi-Draft Workflow',     body:'Generate 3+ drafts at once, compare them, and activate the best one. Previous drafts are preserved for rollback at any time.' },
]

const STEPS = [
  { n:'01', title:'Add your school data',        body:'Enter teachers, subjects, and class sections. A one-time setup that takes under 10 minutes.' },
  { n:'02', title:'Generate timetable drafts',   body:'Hit Generate. The AI produces multiple conflict-free drafts instantly, scoring each for balance.' },
  { n:'03', title:'Fine-tune visually',           body:'Drag lessons, swap slots, lock favourites. Every move is validated live — conflicts are impossible.' },
  { n:'04', title:'Export and share',             body:'Activate your draft, export PDFs for the school and every teacher, and email them all in one action.' },
]

const STATS = [
  { value:'< 3s',  label:'Timetable generation' },
  { value:'100%',  label:'Conflict-free guarantee' },
  { value:'5+',    label:'Curriculum systems' },
  { value:'∞',     label:'Draft revisions' },
]

const TESTIMONIALS = [
  { name:'Mrs R. Nakato', role:'Academic Registrar', school:'Kampala High School', text:'We cut our timetabling time from 3 days to 20 minutes. The conflict detection alone is worth it.', rating:5 },
  { name:'Mr J. Ochieng', role:'Deputy Headteacher', school:'St Mary\'s College Kisubi', text:'The exam scheduling module is brilliant. Supervisors, rooms, and conflict checks — all automated.', rating:5 },
  { name:'Dr A. Ssali',   role:'Head of Academics',  school:'Greenhill Academy',         text:'Teacher comparison view showed us two teachers were overloaded that we hadn\'t noticed. Game changer.', rating:5 },
]

const CURRICULUM = ['Cambridge CAIE','UNEB Uganda','IB Diploma','CBC Kenya','American (AP)','Custom']

/* ── Nav ──────────────────────────────────────────────────────────────── */
function HomeNav() {
  const navigate   = useNavigate()
  const [open, setOpen] = useState(false)
  return (
    <nav className="home-nav">
      <div className="home-nav-inner">
        <div className="home-nav-brand">
          <img src="/logo.png" alt="Smart Admin" className="home-nav-logo"/>
          <span className="home-nav-name">Smart Admin</span>
        </div>
        <div className="home-nav-links">
          <a href="#features"     className="home-nav-link">Features</a>
          <a href="#how-it-works" className="home-nav-link">How it works</a>
          <a href="#testimonials" className="home-nav-link">Reviews</a>
          <a href="#pricing"      className="home-nav-link">Curriculum</a>
        </div>
        <div className="home-nav-actions">
          <Link to="/login"  className="home-nav-btn-ghost">Sign In</Link>
          <Link to="/signup" className="home-nav-btn-solid">Get Started →</Link>
        </div>
        <button className="home-nav-hamburger" onClick={() => setOpen(o=>!o)}>
          {open ? <XIcon size={20}/> : <Menu size={20}/>}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="home-nav-mobile"
            initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
            {['Features','How it works','Reviews','Curriculum'].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/ /g,'-')}`}
                className="home-nav-mobile-link" onClick={() => setOpen(false)}>{l}</a>
            ))}
            <div style={{display:'flex',gap:10,padding:'12px 0'}}>
              <Link to="/login"  className="home-nav-btn-ghost" style={{flex:1,textAlign:'center'}}>Sign In</Link>
              <Link to="/signup" className="home-nav-btn-solid" style={{flex:1,textAlign:'center'}}>Get Started</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

/* ── Demo video player ────────────────────────────────────────────────── */
function DemoVideo() {
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)
  // If /demo.mp4 doesn't exist or fails to load/play, we fall back to the
  // animated CSS timetable preview instead of showing a dead Play button
  // sitting on top of it.
  const [videoAvailable, setVideoAvailable] = useState(true)
  const videoRef = useRef(null)

  const toggle = () => {
    if (!videoAvailable || !videoRef.current) return
    if (playing) {
      videoRef.current.pause()
      setPlaying(false)
    } else {
      videoRef.current.play()
        .then(() => setPlaying(true))
        .catch(() => setVideoAvailable(false))
    }
  }

  return (
    <div className="demo-video-wrap"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {/* Glow effect */}
      <div className="demo-video-glow"/>

      {/* Browser chrome mockup */}
      <div className="demo-browser">
        <div className="demo-browser-bar">
          <div className="demo-browser-dots">
            <span style={{background:'#ef4444'}}/><span style={{background:'#f59e0b'}}/><span style={{background:'#22c55e'}}/>
          </div>
          <div className="demo-browser-url">smartadmin.onrender.com/timetable</div>
        </div>
        <div className="demo-browser-body">
          {/* Video element — only rendered while we believe a real file exists.
              Add your own screen recording at frontend/public/demo.mp4 to activate it. */}
          {videoAvailable && (
            <video
              ref={videoRef}
              className="demo-video-el"
              src="/demo.mp4"
              playsInline muted loop
              poster="/demo-poster.png"
              onEnded={() => setPlaying(false)}
              onError={() => setVideoAvailable(false)}
            />
          )}

          {/* Animated UI preview (fallback + always shown until real video plays) */}
          <div className="demo-ui-preview"
            style={videoAvailable && playing ? { opacity: 0, pointerEvents: 'none' } : undefined}>
            <AnimatedTimetable/>
          </div>

          {/* Play/pause overlay — only shown when a real video is available */}
          {videoAvailable && (
            <motion.div className="demo-play-overlay"
              animate={{ opacity: hovered || !playing ? 1 : 0 }}
              transition={{ duration: .2 }}
              onClick={toggle}>
              <motion.button className="demo-play-btn"
                whileHover={{ scale:1.08 }} whileTap={{ scale:.94 }}>
                {playing ? <Pause size={28}/> : <Play size={28} style={{marginLeft:3}}/>}
              </motion.button>
              {!playing && (
                <div className="demo-play-label">
                  Watch the 20-second demo
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Animated timetable (CSS-only demo when no video) ────────────────── */
function AnimatedTimetable() {
  const DAYS    = ['Mon','Tue','Wed','Thu','Fri']
  const PERIODS = [1,2,3,4]
  const SUBJECTS = [
    {name:'Maths',   color:'#2952a3'}, {name:'English', color:'#0d9488'},
    {name:'Science', color:'#7c3aed'}, {name:'History', color:'#d97706'},
    {name:'PE',      color:'#dc2626'}, {name:'Art',     color:'#0891b2'},
    {name:'Music',   color:'#16a34a'}, {name:'ICT',     color:'#c2410c'},
  ]

  const cells = DAYS.flatMap((d,di) =>
    PERIODS.map((p,pi) => ({
      day:d, period:p,
      subj: SUBJECTS[(di*PERIODS.length + pi) % SUBJECTS.length],
      delay: (di*PERIODS.length + pi) * 0.07,
    }))
  )

  return (
    <div className="demo-anim-wrap">
      <div className="demo-anim-header">
        <div className="demo-anim-title">Class 7A — Timetable Draft 2</div>
        <div className="demo-anim-badge">● Live</div>
      </div>
      <div className="demo-anim-grid">
        {/* Header row */}
        <div className="demo-anim-corner"/>
        {DAYS.map(d => <div key={d} className="demo-anim-day">{d}</div>)}
        {/* Body */}
        {PERIODS.map(p => (
          <div key={p} style={{display:'contents'}}>
            <div className="demo-anim-period">P{p}</div>
            {DAYS.map((d,di) => {
              const cell = cells.find(c=>c.day===d&&c.period===p)
              return (
                <motion.div key={d} className="demo-anim-cell"
                  style={{ background:`${cell.subj.color}20`, borderColor:`${cell.subj.color}50` }}
                  initial={{opacity:0,scale:.8}}
                  animate={{opacity:1,scale:1}}
                  transition={{delay:cell.delay, duration:.35, ease:[.34,1.56,.64,1]}}>
                  <div style={{fontSize:9,fontWeight:800,color:cell.subj.color}}>
                    {cell.subj.name}
                  </div>
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="demo-anim-footer">
        <motion.div className="demo-anim-progress"
          initial={{width:0}} animate={{width:'100%'}}
          transition={{duration:3,ease:'linear',repeat:Infinity}}>
          <div className="demo-anim-progress-fill"/>
        </motion.div>
        <span className="demo-anim-footer-label">
          <Zap size={11}/> Generating conflict-free schedule…
        </span>
      </div>
    </div>
  )
}

/* ── Star rating ─────────────────────────────────────────────────────── */
function Stars({ n }) {
  return (
    <div style={{display:'flex',gap:3,marginBottom:10}}>
      {[...Array(n)].map((_,i) => <Star key={i} size={13} fill="#f59e0b" color="#f59e0b"/>)}
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function Home() {
  const { user, login } = useAuth()
  const navigate  = useNavigate()
  const heroRef   = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset:['start start','end start'] })
  const heroY     = useTransform(scrollYProgress, [0,1], ['0%','30%'])
  const heroOpac  = useTransform(scrollYProgress, [0,.7], [1,0])
  const [demoLoading, setDemoLoading] = useState(false)

  // FIX: previously this called authAPI.login() directly and only wrote the
  // token to localStorage. AuthContext's `user` state was never updated, so
  // ProtectedLayout immediately redirected back to /login (looked like the
  // demo credentials "weren't found"). Using the context's login() keeps
  // everything — token, user state, profile photo — in sync.
  const handleDemo = async () => {
    setDemoLoading(true)
    try {
      await login('admin', 'admin123')
      toast.success('Signed in as demo admin ✅')
      navigate('/dashboard')
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
        'Demo login failed — make sure the backend is running.'
      )
      navigate('/login')
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="home-page">
      <HomeNav/>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="home-hero">
        <div className="home-hero-bg"/>
        <div className="home-hero-grid"/>
        <div className="home-hero-orbs">
          <div className="home-orb home-orb-1"/>
          <div className="home-orb home-orb-2"/>
          <div className="home-orb home-orb-3"/>
        </div>
        <motion.div className="home-hero-content" style={{ y: heroY, opacity: heroOpac }}>
          <motion.div className="home-hero-badge"
            initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.1}}>
            <Sparkles size={13}/> AI-Powered School Management
          </motion.div>
          <motion.h1 className="hero-headline"
            style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,letterSpacing:"-0.03em"}}
            initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.2,duration:.6}}>
            Build Your School's<br/>
            <span className="hero-headline-accent">Perfect Timetable</span><br/>
            in Under 3 Minutes
          </motion.h1>
          <motion.p className="hero-sub"
            initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.35}}>
            Smart Admin generates conflict-free timetables, manages exam schedules,
            and exports beautiful PDFs — automatically. Built for African schools
            across Cambridge, UNEB, IB, and CBC curricula.
          </motion.p>
          <motion.div className="hero-actions"
            initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.5}}>
            {user ? (
              <button className="hero-btn-primary" onClick={() => navigate('/dashboard')}>
                Go to Dashboard <ArrowRight size={16}/>
              </button>
            ) : (
              <>
                <Link to="/signup" className="hero-btn-primary">
                  Get Started Free <ArrowRight size={16}/>
                </Link>
                <button className="hero-btn-ghost" onClick={handleDemo} disabled={demoLoading}>
                  {demoLoading
                    ? <><div className="login-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Signing in…</>
                    : <><Play size={15}/> Try Demo</>}
                </button>
              </>
            )}
          </motion.div>
          <motion.div className="hero-trust"
            initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.7}}>
            <CheckCircle size={13} color="#10b981"/> No credit card
            <CheckCircle size={13} color="#10b981"/> Free forever on Render
            <CheckCircle size={13} color="#10b981"/> Setup in 10 minutes
          </motion.div>
        </motion.div>

        {/* Stats bar */}
        <motion.div className="home-stats-bar"
          initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.6}}>
          {STATS.map(s => (
            <div key={s.label} className="home-stat">
              <span className="home-stat-val">{s.value}</span>
              <span className="home-stat-lbl">{s.label}</span>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Demo video section ────────────────────────────────────────── */}
      <section className="home-section home-demo-section">
        <div className="home-section-inner">
          <motion.div className="home-section-label"
            initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}}>
            See it in action
          </motion.div>
          <motion.h2 className="home-section-title"
            initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}}>
            Watch a timetable get generated<br/>
            <span style={{color:'#f59e0b'}}>in real time</span>
          </motion.h2>
          <motion.p className="home-section-sub"
            initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} transition={{delay:.1}}>
            From zero to a full conflict-free timetable in under 20 seconds.
            No configuration. No manual effort.
          </motion.p>
          <motion.div
            initial={{opacity:0,y:30,scale:.97}}
            whileInView={{opacity:1,y:0,scale:1}}
            viewport={{once:true}} transition={{delay:.15,duration:.6}}>
            <DemoVideo/>
          </motion.div>
          <motion.div className="demo-cta"
            initial={{opacity:0}} whileInView={{opacity:1}} viewport={{once:true}} transition={{delay:.3}}>
            <Link to="/signup" className="hero-btn-primary" style={{fontSize:14}}>
              Try it yourself — free <ArrowRight size={14}/>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="home-section home-features-section">
        <div className="home-section-inner">
          <div className="home-section-label">Everything you need</div>
          <h2 className="home-section-title">Built for the real school day</h2>
          <p className="home-section-sub">
            Every feature was designed around how schools actually work — not how software thinks they do.
          </p>
          <div className="home-features-grid">
            {FEATURES.map((f,i) => (
              <motion.div key={f.title} className="home-feature-card"
                initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}}
                viewport={{once:true}} transition={{delay:i*.07}}>
                <div className="home-feature-icon" style={{background:f.bg,color:f.color}}>
                  {f.icon}
                </div>
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-body">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="home-section home-steps-section">
        <div className="home-section-inner">
          <div className="home-section-label">Simple process</div>
          <h2 className="home-section-title">Up and running in 4 steps</h2>
          <div className="home-steps-grid">
            {STEPS.map((s,i) => (
              <motion.div key={s.n} className="home-step"
                initial={{opacity:0,x:-16}} whileInView={{opacity:1,x:0}}
                viewport={{once:true}} transition={{delay:i*.1}}>
                <div className="home-step-num">{s.n}</div>
                <div>
                  <h3 className="home-step-title">{s.title}</h3>
                  <p className="home-step-body">{s.body}</p>
                </div>
                {i < STEPS.length-1 && <div className="home-step-arrow"><ChevronRight size={20}/></div>}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Curriculum support ────────────────────────────────────────── */}
      <section id="pricing" className="home-section home-curriculum-section">
        <div className="home-section-inner">
          <div className="home-section-label">Multi-curriculum</div>
          <h2 className="home-section-title">Works with every curriculum</h2>
          <p className="home-section-sub">
            Built from the ground up to support the way schools across Africa and beyond actually teach.
          </p>
          <div className="home-curriculum-pills">
            {CURRICULUM.map(c => (
              <motion.div key={c} className="home-curriculum-pill"
                initial={{opacity:0,scale:.9}} whileInView={{opacity:1,scale:1}}
                viewport={{once:true}}>
                <CheckCircle size={14} color="#10b981"/>{c}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section id="testimonials" className="home-section home-testimonials-section">
        <div className="home-section-inner">
          <div className="home-section-label">Real schools, real results</div>
          <h2 className="home-section-title">What educators say</h2>
          <div className="home-testimonials-grid">
            {TESTIMONIALS.map((t,i) => (
              <motion.div key={t.name} className="home-testimonial-card"
                initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}}
                viewport={{once:true}} transition={{delay:i*.1}}>
                <Stars n={t.rating}/>
                <p className="home-testimonial-text">"{t.text}"</p>
                <div className="home-testimonial-author">
                  <div className="home-testimonial-avatar">
                    {t.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div className="home-testimonial-name">{t.name}</div>
                    <div className="home-testimonial-role">{t.role} · {t.school}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="home-cta-section">
        <motion.div className="home-cta-inner"
          initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}}>
          <div className="home-cta-badge"><Sparkles size={13}/> Free to deploy</div>
          <h2 className="home-cta-title">
            Ready to reclaim your<br/>timetabling time?
          </h2>
          <p className="home-cta-sub">
            Join schools already running Smart Admin. Takes 10 minutes to set up,
            saves hours every term.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/signup" className="hero-btn-primary" style={{fontSize:15,padding:'13px 28px'}}>
              Create Free Account <ArrowRight size={16}/>
            </Link>
            <button className="hero-btn-ghost" onClick={handleDemo} disabled={demoLoading}>
              {demoLoading
                ? <><div className="login-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Signing in…</>
                : <><Play size={14}/> View Demo First</>}
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">
            <img src="/logo.png" alt="Smart Admin" style={{height:28,marginRight:8}}/>
            <span style={{fontWeight:700,color:'rgba(255,255,255,.9)'}}>Smart Admin</span>
          </div>
          <div className="home-footer-links">
            <Link to="/login"  style={{color:'rgba(255,255,255,.5)',fontSize:13,textDecoration:'none'}}>Sign In</Link>
            <Link to="/signup" style={{color:'rgba(255,255,255,.5)',fontSize:13,textDecoration:'none'}}>Get Started</Link>
          </div>
          <div className="home-footer-copy">
            © {new Date().getFullYear()} Smart Admin · Built with FastAPI + React
          </div>
        </div>
      </footer>
    </div>
  )
}
