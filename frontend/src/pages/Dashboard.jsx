import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  teachersAPI, subjectsAPI, classesAPI, schedulesAPI, examsAPI, allocationsAPI
} from '../api/client'
import { fmt, plural, greeting as timeGreeting } from '../utils/format'
import { SkeletonDashboard } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useGlobalWS } from '../hooks/useWebSocket'
import {
  Users, BookOpen, School, CalendarDays, CheckCircle,
  AlertCircle, ArrowRight, Zap, GraduationCap,
  Play, BarChart3, Clock, Star, TrendingUp, ChevronRight
} from 'lucide-react'

const stagger = { animate:{ transition:{ staggerChildren:.06 } } }
const fadeUp  = { initial:{opacity:0,y:16}, animate:{opacity:1,y:0,transition:{duration:.3,ease:[.4,0,.2,1]}} }

export default function Dashboard() {
  const navigate   = useNavigate()
  const { user }   = useAuth()
  const [stats,    setStats]   = useState({ teachers:0,subjects:0,classes:0,drafts:0,exams:0,active:null })
  const [pending,   setPending]  = useState([])   // pending allocations
  const [loading,  setLoading] = useState(true)
  const [greeting, setGreeting]= useState('')

  const load = async () => {
    try {
      const [t, s, c, d, ex, pend] = await Promise.all([
        teachersAPI.list(), subjectsAPI.list(), classesAPI.list(),
        schedulesAPI.drafts(), examsAPI.listSessions().catch(() => ({ data:[] })),
        allocationsAPI.pending().catch(() => ({ data:[] }))
      ])
      setPending(pend.data)
      const active = d.data.find(x => x.status === 'active')
      setStats({
        teachers: t.data.length, subjects: s.data.length,
        classes:  c.data.length, drafts:   d.data.length,
        exams:    ex.data.length, active
      })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const h = new Date().getHours()
    setGreeting(timeGreeting())
  }, [])

  useGlobalWS(msg => {
    if (['draft_generated','draft_activated','draft_deleted'].includes(msg.event)) load()
  })

  const name = user?.username || 'Admin'
  const initials = name.slice(0,2).toUpperCase()

  const STAT_CARDS = [
    {
      label:'Teachers', value:fmt(stats.teachers),
      icon:<Users size={22}/>, color:'#2952a3',
      bg:'rgba(41,82,163,.1)', path:'/teachers',
      sub:'Staff on record', trend:'+2 this term'
    },
    {
      label:'Subjects', value:fmt(stats.subjects),
      icon:<BookOpen size={22}/>, color:'#0d9488',
      bg:'rgba(13,148,136,.1)', path:'/subjects',
      sub:'Across all grades', trend:'All configured'
    },
    {
      label:'Classes', value:fmt(stats.classes),
      icon:<School size={22}/>, color:'#7c3aed',
      bg:'rgba(124,58,237,.1)', path:'/classes',
      sub:'Active sections', trend:'Ready to schedule'
    },
    {
      label:'Drafts', value:fmt(stats.drafts),
      icon:<CalendarDays size={22}/>, color:'#d97706',
      bg:'rgba(217,119,6,.1)', path:'/timetable',
      sub:'Generated timetables', trend:stats.active ? '1 active' : 'None active'
    },
    {
      label:'Exam Sessions', value:fmt(stats.exams),
      icon:<GraduationCap size={22}/>, color:'#be123c',
      bg:'rgba(190,18,60,.1)', path:'/exams',
      sub:'Exam periods', trend:'Manage exams'
    },
  ]

  const QUICK_ACTIONS = [
    {
      label:'Generate Timetable', sub:'Create AI-balanced drafts',
      icon:<Zap size={18}/>, bg:'rgba(245,158,11,.12)', color:'#d97706',
      path:'/timetable'
    },
    {
      label:'Manage Teachers', sub:'Add staff and assign subjects',
      icon:<Users size={18}/>, bg:'rgba(41,82,163,.1)', color:'#2952a3',
      path:'/teachers'
    },
    {
      label:'Plan Exam Schedule', sub:'Create exam sessions with templates',
      icon:<GraduationCap size={18}/>, bg:'rgba(190,18,60,.1)', color:'#be123c',
      path:'/exams'
    },
    {
      label:'Teacher Schedules', sub:'View individual timetables',
      icon:<CalendarDays size={18}/>, bg:'rgba(13,148,136,.1)', color:'#0d9488',
      path:'/teacher-view'
    },
    {
      label:'AI Assistant', sub:'Ask Gemini to generate schedules',
      icon:<Star size={18}/>, bg:'rgba(124,58,237,.1)', color:'#7c3aed',
      path:'/timetable'
    },
  ]

  const isReady = stats.teachers > 0 && stats.subjects > 0 && stats.classes > 0
  const STEPS = [
    { label:'Add Teachers',     sub:'With availability and days off',       done: stats.teachers > 0,  path:'/teachers'   },
    { label:'Create Subjects',  sub:'Set grade level and weekly periods',    done: stats.subjects > 0,  path:'/subjects'   },
    { label:'Set Up Classes',   sub:'Grade sections (7A, 8B, etc.)',         done: stats.classes > 0,   path:'/classes'    },
    { label:'Assign Subjects',  sub:'Link subjects to qualified teachers',   done: isReady,             path:'/teachers'   },
    { label:'Generate Timetable',sub:'Get 3 conflict-free draft options',    done: stats.drafts > 0,    path:'/timetable'  },
    { label:'Plan Exam Schedule',sub:'Sessions with balanced paper allocation',done: stats.exams > 0,   path:'/exams'      },
  ]
  const doneCount = STEPS.filter(s => s.done).length
  const pct = Math.round(doneCount / STEPS.length * 100)

  if (loading) return <SkeletonDashboard />

  return (
    <motion.div className="page-container"
      variants={stagger} initial="initial" animate="animate">

      {/* ── Hero ── */}
      <motion.div className="dash-hero" variants={fadeUp}>
        <div className="dash-hero-left">
          <h1>{greeting}, {name} 👋</h1>
          <p className="dash-hero-sub">
            {isReady
              ? `${pct}% setup complete · ${stats.active ? `Active timetable: ${stats.active.name}` : 'No active timetable yet'}${pending.length ? ` · ${pending.length} pending allocation${pending.length!==1?'s':''}` : ''}`
              : `Let's get your school configured — ${STEPS.filter(s=>!s.done).length} step${STEPS.filter(s=>!s.done).length!==1?'s':''} remaining`}
          </p>
          {/* Progress bar */}
          <div style={{ width:280, height:6, background:'var(--border)',
            borderRadius:3, marginTop:10, overflow:'hidden' }}>
            <motion.div
              style={{ height:'100%', background:'linear-gradient(90deg,#2952a3,#f59e0b)',
                borderRadius:3 }}
              initial={{ width:0 }}
              animate={{ width:`${pct}%` }}
              transition={{ duration:.8, delay:.2, ease:[.4,0,.2,1] }}/>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
            {doneCount}/{STEPS.length} steps complete
          </div>
        </div>
        <div className="dash-hero-actions">
          {!stats.active && (
            <button className="btn btn-accent" onClick={() => navigate('/timetable')}>
              <Play size={14}/> Generate Timetable
            </button>
          )}
          {stats.active && (
            <button className="btn btn-secondary" onClick={() => navigate('/timetable')}>
              <CalendarDays size={14}/> View Timetable
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/exams')}>
            <GraduationCap size={14}/> Exam Schedules
          </button>
        </div>
      </motion.div>

      {/* ── Active timetable / warning banner ── */}
      <motion.div variants={fadeUp}>
        {stats.active ? (
          <div className="dash-banner active">
            <div className="dash-banner-icon">
              <CheckCircle size={20} color="#10b981"/>
            </div>
            <div className="dash-banner-text">
              <div className="dash-banner-title">Active: {stats.active.name}</div>
              <div className="dash-banner-sub">{stats.active.slot_count} timetable slots · Live for all teachers</div>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/timetable')}>
              View <ChevronRight size={12}/>
            </button>
          </div>
        ) : (
          <div className="dash-banner warning">
            <div className="dash-banner-icon">
              <AlertCircle size={20} color="#f59e0b"/>
            </div>
            <div className="dash-banner-text">
              <div className="dash-banner-title">No active timetable</div>
              <div className="dash-banner-sub">Generate and activate a timetable to make it visible to teachers</div>
            </div>
            <button className="btn btn-sm btn-accent" onClick={() => navigate('/timetable')}>
              Generate <Zap size={12}/>
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Stats ── */}
      <motion.div className="dash-stats" variants={stagger}>
        {STAT_CARDS.map((card, i) => (
          <motion.div key={card.label} variants={fadeUp}
            className="dash-stat-card"
            onClick={() => navigate(card.path)}
            style={{ '--card-glow': card.color }}>
            <div className="dash-stat-glow"
              style={{ background: card.color }}/>
            <div className="dash-stat-icon-wrap"
              style={{ background: card.bg }}>
              <span style={{ color: card.color }}>{card.icon}</span>
            </div>
            <motion.div className="dash-stat-value"
              initial={{ scale:.6, opacity:0 }}
              animate={{ scale:1, opacity:1 }}
              transition={{ delay: i*.07+.15, duration:.4, ease:[.34,1.56,.64,1] }}>
              {card.value}
            </motion.div>
            <div className="dash-stat-label">{card.label}</div>
            <div className="dash-stat-sub">{card.sub}</div>
            <div className="dash-stat-arrow"><ChevronRight size={14}/></div>
            <div style={{ marginTop:6, fontSize:10, fontWeight:700,
              color: card.color, opacity:.8 }}>
              {card.trend}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Pending Allocations ── */}
      {pending.length > 0 && (
        <motion.div className="dash-card" variants={fadeUp}
          style={{marginBottom:0,border:'1.5px solid rgba(245,158,11,.3)',
            background:'rgba(245,158,11,.03)'}}>
          <div className="dash-card-title">
            <span style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'#f59e0b',display:'inline-block'}}/>
              Pending Allocations
              <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,
                background:'rgba(245,158,11,.15)',color:'#f59e0b'}}>{pending.length}</span>
            </span>
            <button className="btn btn-sm btn-secondary"
              onClick={() => navigate('/classes')}>
              Allocate Teachers <ChevronRight size={12}/>
            </button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {pending.slice(0,6).map(p => (
              <div key={p.id} style={{
                display:'flex',alignItems:'center',gap:12,
                padding:'8px 12px',background:'var(--surface-2)',
                borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{
                  width:8,height:8,borderRadius:'50%',flexShrink:0,
                  background:p.subject_color||'#6366f1'}}/>
                <div style={{flex:1,minWidth:0}}>
                  <span style={{fontWeight:700,fontSize:13,color:'var(--text)'}}>
                    {p.subject_name}
                  </span>
                  <span style={{fontSize:12,color:'var(--muted)',marginLeft:8}}>
                    → {p.class_name}
                  </span>
                </div>
                <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',
                  borderRadius:10,background:'rgba(245,158,11,.12)',color:'#f59e0b',
                  whiteSpace:'nowrap'}}>No teacher</span>
              </div>
            ))}
            {pending.length > 6 && (
              <div style={{fontSize:12,color:'var(--muted)',textAlign:'center',padding:'4px 0'}}>
                +{pending.length - 6} more pending · <button
                  style={{background:'none',border:'none',color:'var(--amber)',
                    cursor:'pointer',fontWeight:700,fontSize:12}}
                  onClick={() => navigate('/classes')}>View all</button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Bottom grid ── */}
      <motion.div className="dash-grid" variants={stagger}>

        {/* Quick Actions */}
        <motion.div className="dash-card" variants={fadeUp}>
          <div className="dash-card-title">
            Quick Actions
            <span style={{ fontSize:11, fontWeight:400, color:'var(--muted)' }}>
              Jump to any section
            </span>
          </div>
          {QUICK_ACTIONS.map(a => (
            <motion.button key={a.label} className="dash-action-btn"
              onClick={() => navigate(a.path)}
              whileHover={{ x:4 }} whileTap={{ scale:.98 }}>
              <div className="dash-action-icon" style={{ background: a.bg }}>
                <span style={{ color: a.color }}>{a.icon}</span>
              </div>
              <div>
                <div className="dash-action-label">{a.label}</div>
                <div className="dash-action-sub">{a.sub}</div>
              </div>
              <ChevronRight size={14} className="dash-action-arrow"/>
            </motion.button>
          ))}
        </motion.div>

        {/* Setup checklist */}
        <motion.div className="dash-card" variants={fadeUp}>
          <div className="dash-card-title">
            Setup Checklist
            <span style={{ fontSize:11, fontWeight:700,
              color: pct===100 ? '#10b981' : '#f59e0b' }}>
              {pct}%
            </span>
          </div>

          {STEPS.map((step, i) => (
            <motion.div key={step.label} className="dash-step"
              initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }}
              transition={{ delay: i*.05+.1 }}>
              <div className={`dash-step-num ${step.done?'done':'todo'}`}>
                {step.done ? <CheckCircle size={13}/> : i+1}
              </div>
              <div className="dash-step-text"
                style={{ opacity: step.done ? .6 : 1,
                         textDecoration: step.done ? 'line-through' : 'none',
                         cursor: 'pointer' }}
                onClick={() => navigate(step.path)}>
                {step.label}
                <small>{step.sub}</small>
              </div>
              {!step.done && (
                <button style={{ marginLeft:'auto', background:'none', border:'none',
                  cursor:'pointer', color:'var(--amber)', fontSize:11, fontWeight:700,
                  padding:'2px 6px', borderRadius:6, whiteSpace:'nowrap' }}
                  onClick={() => navigate(step.path)}>
                  Go →
                </button>
              )}
            </motion.div>
          ))}

          {pct === 100 && (
            <motion.div initial={{opacity:0}} animate={{opacity:1}}
              style={{ textAlign:'center', padding:'16px 0', color:'#10b981',
                fontWeight:700, fontSize:14 }}>
              🎉 All set up! Your school is ready.
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
