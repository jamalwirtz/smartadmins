import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { billingAPI } from '../api/client'
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  CalendarDays, Users, FileDown, Zap, Globe, ArrowRight, CheckCircle, Play, Pause,
  GraduationCap, BarChart2, Shield, Sparkles, ChevronRight, Menu, X as XIcon,
  Upload, LayoutTemplate, Home as HomeIcon, Radio, Palette, Wand2, School, Briefcase
} from 'lucide-react'

/* ── Data (every item below is something the app actually does) ───────── */
const FEATURES = [
  { icon:<Zap size={22}/>,           color:'#f59e0b', bg:'rgba(245,158,11,.12)',  title:'Automatic timetables',        body:'A constraint engine builds three conflict-checked drafts at once, respecting teacher days off, unavailable periods, weekly hour limits and class allocations. Compare, then activate the best.' },
  { icon:<CalendarDays size={22}/>,  color:'#38bdf8', bg:'rgba(56,189,248,.12)',  title:'Edit by drag and drop',        body:'Move or swap lessons on the grid, lock the ones that must never move, add breaks, assemblies and events, and validate for clashes at any time.' },
  { icon:<GraduationCap size={22}/>, color:'#8b5cf6', bg:'rgba(139,92,246,.12)',  title:'Exam timetables, end to end',  body:'A guided setup covers session dates, papers per subject, supervisors and rooms. Exams are spread over real calendar dates, with a plan check that tells you if everything fits before you generate.' },
  { icon:<Users size={22}/>,         color:'#10b981', bg:'rgba(16,185,129,.12)',  title:'Supervisors & rooms',          body:'Keep a list of invigilators (with available days and daily limits) and rooms (with seats and equipment). Auto-assign without double-booking, or assign by hand.' },
  { icon:<School size={22}/>,        color:'#0d9488', bg:'rgba(13,148,136,.12)',  title:'Your own class and level names', body:'Use Cambridge, UNEB, IB, AP or CBC presets, or name levels and classes your own way — "Primary 4", "Year 9", "Form 2 Blue". Allocate subjects and teachers per class.' },
  { icon:<Upload size={22}/>,        color:'#3b82f6', bg:'rgba(59,130,246,.12)',  title:'Import from CSV or Excel',     body:'Bring in teachers, subjects, classes, supervisors and rooms from a spreadsheet instead of typing them, with a clear report of any rows that were skipped.' },
  { icon:<FileDown size={22}/>,      color:'#ef4444', bg:'rgba(239,68,68,.12)',   title:'PDF, Excel and CSV export',    body:'Print the whole school timetable, per-class pages, exam schedules and individual teacher timetables in five colour themes. Email a teacher their own schedule (needs email settings).' },
  { icon:<LayoutTemplate size={22}/>,color:'#ec4899', bg:'rgba(236,72,153,.12)',  title:'Layout templates',             body:'Design reusable exam and timetable print layouts — orientation, which columns show, footer text and warning banners — and pick one when you export.' },
  { icon:<BarChart2 size={22}/>,     color:'#f97316', bg:'rgba(249,115,22,.12)',  title:'Teacher schedules & workload', body:'View any teacher\'s week, or compare several side by side with colour-coded workload bars to see who is overloaded.' },
  { icon:<Radio size={22}/>,         color:'#14b8a6', bg:'rgba(20,184,166,.12)',  title:'Live updates',                 body:'Changes to drafts show up for everyone viewing them in real time, with a live indicator and viewer count.' },
  { icon:<HomeIcon size={22}/>,      color:'#a855f7', bg:'rgba(168,85,247,.12)',  title:'Home & office planners',       body:'Not just for schools: start from ready-made templates — chores rota, kids\' routine, meal plan, study week — assign tasks to people, edit anything, and import or export a sheet.' },
  { icon:<Palette size={22}/>,       color:'#0ea5e9', bg:'rgba(14,165,233,.12)',  title:'Your school\'s look',          body:'Add your badge, name and motto to every printout, switch between light and dark mode, and use it comfortably on a phone.' },
]

const STEPS = [
  { n:'01', title:'Set up your school',     body:'The guided onboarding takes your school details, curriculum, level names, classes and school day — about five minutes.' },
  { n:'02', title:'Add people and subjects', body:'Add teachers and subjects by hand or import a spreadsheet, then allocate subjects and teachers to each class.' },
  { n:'03', title:'Generate and fine-tune',  body:'Generate three timetable drafts, compare them, drag lessons around, lock what must stay, and validate.' },
  { n:'04', title:'Plan exams and share',    body:'Run the exam setup, assign supervisors and rooms, then export PDFs and spreadsheets for staff and the notice board.' },
]

const STATS = [
  { value:'3',        label:'Conflict-checked drafts per run' },
  { value:'5 + yours',label:'Curriculum presets, or your own' },
  { value:'CSV · XLSX · PDF', label:'Import and export' },
  { value:'Free',     label:'Plan to get started' },
]

const AUDIENCES = [
  { icon:<School size={20}/>,        title:'School administrators', body:'Timetabling, class allocations and printable timetables without rebuilding a spreadsheet every term.' },
  { icon:<GraduationCap size={20}/>, title:'Exam officers',         body:'Multi-week exam schedules with papers, invigilators and rooms in one place, and a plan check before you generate.' },
  { icon:<Briefcase size={20}/>,     title:'Teachers & staff',      body:'See your own weekly schedule, check workload, and get it as a PDF.' },
  { icon:<HomeIcon size={20}/>,      title:'Families & individuals', body:'Home chores, study plans and work routines on the free personal planner.' },
]

const CURRICULUM = ['Cambridge CAIE','UNEB Uganda','IB Diploma','CBC Kenya','American (AP)','Your own level names']

// Shown only if the live plan list cannot be loaded
const FALLBACK_PLANS = [
  { id:'free', name:'Free', tagline:'Try the basics.', price_monthly:0, price_yearly:0, currency:'USD', features:['1 personal timetable','1 school class','Community support'] },
  { id:'personal', name:'Personal', tagline:'Unlimited home & office timetables.', price_monthly:3, price_yearly:30, currency:'USD', features:['Unlimited personal timetables','Custom colours & labels','Email support'] },
  { id:'school_starter', name:'School Starter', tagline:'For a single small school.', price_monthly:29, price_yearly:290, currency:'USD', highlighted:true, features:['Up to 10 classes','Up to 25 teachers','Timetable + exam generation'] },
  { id:'school_pro', name:'School Pro', tagline:'Larger schools and groups.', price_monthly:79, price_yearly:790, currency:'USD', features:['Unlimited classes & teachers','Layout templates','Priority support'] },
]

/* ── Nav ──────────────────────────────────────────────────────────────── */
function HomeNav() {
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
          <a href="#plans"        className="home-nav-link">Plans</a>
          <a href="#who"          className="home-nav-link">Who it's for</a>
        </div>
        <div className="home-nav-actions">
          <Link to="/login"  className="home-nav-btn-ghost">Sign In</Link>
          <Link to="/signup" className="home-nav-btn-solid">Get Started →</Link>
        </div>
        <button className="home-nav-hamburger" onClick={() => setOpen(o=>!o)}>{open ? <XIcon size={20}/> : <Menu size={20}/>}</button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="home-nav-mobile" initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
            {[['Features','features'],['How it works','how-it-works'],['Plans','plans'],["Who it's for",'who']].map(([l, id]) => (
              <a key={id} href={`#${id}`} className="home-nav-mobile-link" onClick={() => setOpen(false)}>{l}</a>
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

/* ── Demo video player (falls back to the animated preview) ───────────── */
function DemoVideo() {
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [videoAvailable, setVideoAvailable] = useState(true)
  const videoRef = useRef(null)

  const toggle = () => {
    if (!videoAvailable || !videoRef.current) return
    if (playing) { videoRef.current.pause(); setPlaying(false) }
    else videoRef.current.play().then(() => setPlaying(true)).catch(() => setVideoAvailable(false))
  }

  return (
    <div className="demo-video-wrap" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="demo-video-glow"/>
      <div className="demo-browser">
        <div className="demo-browser-bar">
          <div className="demo-browser-dots"><span style={{background:'#ef4444'}}/><span style={{background:'#f59e0b'}}/><span style={{background:'#22c55e'}}/></div>
          <div className="demo-browser-url">smartadmin.onrender.com/timetable</div>
        </div>
        <div className="demo-browser-body">
          {videoAvailable && (
            <video ref={videoRef} className="demo-video-el" src="/demo.mp4" playsInline muted loop poster="/demo-poster.png"
              onEnded={() => setPlaying(false)} onError={() => setVideoAvailable(false)}/>
          )}
          <div className="demo-ui-preview" style={videoAvailable && playing ? { opacity: 0, pointerEvents: 'none' } : undefined}>
            <AnimatedTimetable/>
          </div>
          {videoAvailable && (
            <motion.div className="demo-play-overlay" animate={{ opacity: hovered || !playing ? 1 : 0 }} transition={{ duration: .2 }} onClick={toggle}>
              <motion.button className="demo-play-btn" whileHover={{ scale:1.08 }} whileTap={{ scale:.94 }}>
                {playing ? <Pause size={28}/> : <Play size={28} style={{marginLeft:3}}/>}
              </motion.button>
              {!playing && <div className="demo-play-label">Watch the demo</div>}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

function AnimatedTimetable() {
  const DAYS = ['Mon','Tue','Wed','Thu','Fri']
  const PERIODS = [1,2,3,4]
  const SUBJECTS = [
    {name:'Maths',color:'#2952a3'},{name:'English',color:'#0d9488'},{name:'Science',color:'#7c3aed'},{name:'History',color:'#d97706'},
    {name:'PE',color:'#dc2626'},{name:'Art',color:'#0891b2'},{name:'Music',color:'#16a34a'},{name:'ICT',color:'#c2410c'},
  ]
  const cells = DAYS.flatMap((d,di) => PERIODS.map((p,pi) => ({
    day:d, period:p, subj: SUBJECTS[(di*PERIODS.length + pi) % SUBJECTS.length], delay: (di*PERIODS.length + pi) * 0.07,
  })))
  return (
    <div className="demo-anim-wrap">
      <div className="demo-anim-header"><div className="demo-anim-title">Class 7A — Timetable Draft 2</div><div className="demo-anim-badge">● Live</div></div>
      <div className="demo-anim-grid">
        <div className="demo-anim-corner"/>
        {DAYS.map(d => <div key={d} className="demo-anim-day">{d}</div>)}
        {PERIODS.map(p => (
          <div key={p} style={{display:'contents'}}>
            <div className="demo-anim-period">P{p}</div>
            {DAYS.map(d => {
              const cell = cells.find(c=>c.day===d&&c.period===p)
              return (
                <motion.div key={d} className="demo-anim-cell" style={{ background:`${cell.subj.color}20`, borderColor:`${cell.subj.color}50` }}
                  initial={{opacity:0,scale:.8}} animate={{opacity:1,scale:1}} transition={{delay:cell.delay, duration:.35, ease:[.34,1.56,.64,1]}}>
                  <div style={{fontSize:9,fontWeight:800,color:cell.subj.color}}>{cell.subj.name}</div>
                </motion.div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="demo-anim-footer">
        <motion.div className="demo-anim-progress" initial={{width:0}} animate={{width:'100%'}} transition={{duration:3,ease:'linear',repeat:Infinity}}>
          <div className="demo-anim-progress-fill"/>
        </motion.div>
        <span className="demo-anim-footer-label"><Zap size={11}/> Building a conflict-checked schedule…</span>
      </div>
    </div>
  )
}

const fmtPrice = (n, cur) => n === 0 ? 'Free' : `${cur === 'USD' ? '$' : cur + ' '}${n}`

/* ── Main ─────────────────────────────────────────────────────────────── */
export default function Home() {
  const { user, login } = useAuth()
  const navigate  = useNavigate()
  const heroRef   = useRef(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset:['start start','end start'] })
  const heroY     = useTransform(scrollYProgress, [0,1], ['0%','30%'])
  const heroOpac  = useTransform(scrollYProgress, [0,.7], [1,0])
  const [demoLoading, setDemoLoading] = useState(false)
  const [plans, setPlans] = useState(FALLBACK_PLANS)

  useEffect(() => { billingAPI.plans().then(r => r.data?.length && setPlans(r.data)).catch(() => {}) }, [])

  // Uses the context's login() so the token, user state and photo stay in sync.
  const handleDemo = async () => {
    setDemoLoading(true)
    try {
      await login('admin', 'admin123')
      toast.success('Signed in as demo admin ✅')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Demo login failed — make sure the backend is running.')
      navigate('/login')
    } finally { setDemoLoading(false) }
  }

  return (
    <div className="home-page">
      <HomeNav/>

      <section ref={heroRef} className="home-hero">
        <div className="home-hero-bg"/><div className="home-hero-grid"/>
        <div className="home-hero-orbs"><div className="home-orb home-orb-1"/><div className="home-orb home-orb-2"/><div className="home-orb home-orb-3"/></div>
        <motion.div className="home-hero-content" style={{ y: heroY, opacity: heroOpac }}>
          <motion.div className="home-hero-badge" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:.1}}>
            <Sparkles size={13}/> Timetables, exams and personal planners
          </motion.div>
          <motion.h1 className="hero-headline" style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:800,letterSpacing:"-0.03em"}}
            initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.2,duration:.6}}>
            Build your school's<br/><span className="hero-headline-accent">timetable and exam schedule</span><br/>without the spreadsheet
          </motion.h1>
          <motion.p className="hero-sub" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:.35}}>
            Smart Admin generates conflict-checked timetables, plans multi-week exams with supervisors and rooms,
            and exports print-ready PDFs and spreadsheets. Use Cambridge, UNEB, IB, AP or CBC presets — or name
            your classes and levels your own way. There's a free planner for home and office too.
          </motion.p>
          <motion.div className="hero-actions" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:.5}}>
            {user ? (
              <button className="hero-btn-primary" onClick={() => navigate('/dashboard')}>Go to Dashboard <ArrowRight size={16}/></button>
            ) : (
              <>
                <Link to="/signup" className="hero-btn-primary">Get Started Free <ArrowRight size={16}/></Link>
                <button className="hero-btn-ghost" onClick={handleDemo} disabled={demoLoading}>
                  {demoLoading ? <><div className="login-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Signing in…</> : <><Play size={15}/> Try Demo</>}
                </button>
              </>
            )}
          </motion.div>
          <motion.div className="hero-trust" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:.7}}>
            <CheckCircle size={13} color="#10b981"/> Free plan available
            <CheckCircle size={13} color="#10b981"/> No credit card to start
            <CheckCircle size={13} color="#10b981"/> Import your data from a spreadsheet
          </motion.div>
        </motion.div>

        <motion.div className="home-stats-bar" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:.6}}>
          {STATS.map(s => (<div key={s.label} className="home-stat"><span className="home-stat-val" style={{fontSize: s.value.length > 8 ? 15 : undefined}}>{s.value}</span><span className="home-stat-lbl">{s.label}</span></div>))}
        </motion.div>
      </section>

      <section className="home-section home-demo-section">
        <div className="home-section-inner">
          <div className="home-section-label">See it in action</div>
          <h2 className="home-section-title">Watch a timetable take shape</h2>
          <p className="home-section-sub">Teachers, subjects and classes in — conflict-checked drafts out.</p>
          <motion.div initial={{opacity:0,y:30,scale:.97}} whileInView={{opacity:1,y:0,scale:1}} viewport={{once:true}} transition={{delay:.15,duration:.6}}>
            <DemoVideo/>
          </motion.div>
          <div className="demo-cta"><Link to="/signup" className="hero-btn-primary" style={{fontSize:14}}>Try it yourself — free <ArrowRight size={14}/></Link></div>
        </div>
      </section>

      <section id="features" className="home-section home-features-section">
        <div className="home-section-inner">
          <div className="home-section-label">What's inside</div>
          <h2 className="home-section-title">Everything for the school term — and your own week</h2>
          <p className="home-section-sub">Each feature below is part of the app today.</p>
          <div className="home-features-grid">
            {FEATURES.map((f,i) => (
              <motion.div key={f.title} className="home-feature-card" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:(i%6)*.06}}>
                <div className="home-feature-icon" style={{background:f.bg,color:f.color}}>{f.icon}</div>
                <h3 className="home-feature-title">{f.title}</h3>
                <p className="home-feature-body">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="home-section home-steps-section">
        <div className="home-section-inner">
          <div className="home-section-label">Simple process</div>
          <h2 className="home-section-title">Up and running in 4 steps</h2>
          <div className="home-steps-grid">
            {STEPS.map((s,i) => (
              <motion.div key={s.n} className="home-step" initial={{opacity:0,x:-16}} whileInView={{opacity:1,x:0}} viewport={{once:true}} transition={{delay:i*.1}}>
                <div className="home-step-num">{s.n}</div>
                <div><h3 className="home-step-title">{s.title}</h3><p className="home-step-body">{s.body}</p></div>
                {i < STEPS.length-1 && <div className="home-step-arrow"><ChevronRight size={20}/></div>}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-curriculum-section">
        <div className="home-section-inner">
          <div className="home-section-label">Curricula</div>
          <h2 className="home-section-title">Your names, your curriculum</h2>
          <p className="home-section-sub">Presets add the right subjects and codes in a click. You can rename levels, add your own, and edit every subject afterwards.</p>
          <div className="home-curriculum-pills">
            {CURRICULUM.map(c => (
              <motion.div key={c} className="home-curriculum-pill" initial={{opacity:0,scale:.9}} whileInView={{opacity:1,scale:1}} viewport={{once:true}}>
                <CheckCircle size={14} color="#10b981"/>{c}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="home-section home-testimonials-section">
        <div className="home-section-inner">
          <div className="home-section-label">Plans</div>
          <h2 className="home-section-title">Start free, upgrade when you need more</h2>
          <p className="home-section-sub">A free plan covers simple tasks. Paid plans add more classes, teachers and drafts. Payment collection isn't switched on yet — choosing a paid plan records your choice and nothing is charged.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(230px, 1fr))', gap:16 }}>
            {plans.map((p,i) => (
              <motion.div key={p.id} initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.06}}
                style={{ position:'relative', padding:'24px 20px', borderRadius:18, display:'flex', flexDirection:'column',
                  background: p.highlighted ? 'rgba(245,158,11,.07)' : 'rgba(255,255,255,.04)',
                  border: p.highlighted ? '1.5px solid rgba(245,158,11,.5)' : '1px solid rgba(255,255,255,.08)' }}>
                {p.highlighted && <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'#f59e0b', color:'#000', fontSize:10, fontWeight:800, padding:'3px 12px', borderRadius:20 }}>MOST POPULAR</div>}
                <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:17, fontWeight:800 }}>{p.name}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', margin:'4px 0 12px', minHeight:30 }}>{p.tagline}</div>
                <div style={{ fontSize:30, fontWeight:900 }}>{fmtPrice(p.price_monthly, p.currency)}{p.price_monthly > 0 && <span style={{ fontSize:12, color:'rgba(255,255,255,.4)', fontWeight:500 }}> /mo</span>}</div>
                <ul style={{ listStyle:'none', padding:0, margin:'14px 0 0', display:'flex', flexDirection:'column', gap:7 }}>
                  {(p.features || []).slice(0,4).map(f => (<li key={f} style={{ display:'flex', gap:7, fontSize:12.5, color:'rgba(255,255,255,.75)' }}><CheckCircle size={13} color="#4ade80" style={{ flexShrink:0, marginTop:2 }}/>{f}</li>))}
                </ul>
              </motion.div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:26, display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Link to="/signup" className="hero-btn-primary" style={{ fontSize:14 }}>Start on the Free plan <ArrowRight size={14}/></Link>
            <Link to="/pricing" className="hero-btn-ghost" style={{ fontSize:14, textDecoration:'none' }}>Compare all plans</Link>
          </div>
        </div>
      </section>

      <section id="who" className="home-section">
        <div className="home-section-inner">
          <div className="home-section-label">Who it's for</div>
          <h2 className="home-section-title">Made for the people who run the timetable</h2>
          <div className="home-features-grid" style={{ marginTop:30 }}>
            {AUDIENCES.map((a,i) => (
              <motion.div key={a.title} className="home-feature-card" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.07}}>
                <div className="home-feature-icon" style={{background:'rgba(56,189,248,.12)',color:'#38bdf8'}}>{a.icon}</div>
                <h3 className="home-feature-title">{a.title}</h3>
                <p className="home-feature-body">{a.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-cta-section">
        <motion.div className="home-cta-inner" initial={{opacity:0,y:20}} whileInView={{opacity:1,y:0}} viewport={{once:true}}>
          <div className="home-cta-badge"><Wand2 size={13}/> Guided setup included</div>
          <h2 className="home-cta-title">Ready to reclaim your<br/>timetabling time?</h2>
          <p className="home-cta-sub">Sign up, follow the onboarding, and have a first set of drafts the same day.</p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
            <Link to="/signup" className="hero-btn-primary" style={{fontSize:15,padding:'13px 28px'}}>Create Free Account <ArrowRight size={16}/></Link>
            <button className="hero-btn-ghost" onClick={handleDemo} disabled={demoLoading}>
              {demoLoading ? <><div className="login-spinner" style={{ width:14, height:14, borderWidth:2 }}/> Signing in…</> : <><Play size={14}/> View Demo First</>}
            </button>
          </div>
        </motion.div>
      </section>

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand"><img src="/logo.png" alt="Smart Admin" style={{height:28,marginRight:8}}/><span style={{fontWeight:700,color:'rgba(255,255,255,.9)'}}>Smart Admin</span></div>
          <div className="home-footer-links">
            <Link to="/pricing" style={{color:'rgba(255,255,255,.5)',fontSize:13,textDecoration:'none'}}>Pricing</Link>
            <Link to="/login"   style={{color:'rgba(255,255,255,.5)',fontSize:13,textDecoration:'none'}}>Sign In</Link>
            <Link to="/signup"  style={{color:'rgba(255,255,255,.5)',fontSize:13,textDecoration:'none'}}>Get Started</Link>
          </div>
          <div className="home-footer-copy">© {new Date().getFullYear()} Smart Admin</div>
        </div>
      </footer>
    </div>
  )
}
