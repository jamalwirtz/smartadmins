import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { teachersAPI, subjectsAPI, classesAPI, schedulesAPI } from '../api/client'
import { useGlobalWS } from '../hooks/useWebSocket'
import { Users, BookOpen, School, CalendarDays, CheckCircle, AlertCircle, ArrowRight, Zap } from 'lucide-react'

const stagger = { animate: { transition: { staggerChildren: 0.07 } } }
const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4,0,0.2,1] } },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ teachers: 0, subjects: 0, classes: 0, drafts: 0, active: null })
  const [loading, setLoading] = useState(true)

  const load = () =>
    Promise.all([teachersAPI.list(), subjectsAPI.list(), classesAPI.list(), schedulesAPI.drafts()])
      .then(([t, s, c, d]) => {
        const active = d.data.find(x => x.status === 'active')
        setStats({ teachers: t.data.length, subjects: s.data.length, classes: c.data.length, drafts: d.data.length, active })
      }).finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  // Listen for live events and refresh counts
  useGlobalWS((msg) => {
    if (['draft_generated','draft_activated','draft_deleted'].includes(msg.event)) load()
  })

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>

  const tiles = [
    { label: 'Teachers', value: stats.teachers, icon: <Users size={28} />, color: 'var(--blue-500)', path: '/teachers', sub: 'Staff on record' },
    { label: 'Subjects', value: stats.subjects, icon: <BookOpen size={28} />, color: 'var(--teal)', path: '/subjects', sub: 'Across all grades' },
    { label: 'Classes',  value: stats.classes,  icon: <School size={28} />,  color: 'var(--violet)', path: '/classes', sub: 'Active sections' },
    { label: 'Drafts',   value: stats.drafts,   icon: <CalendarDays size={28} />, color: 'var(--amber)', path: '/timetable', sub: 'Generated schedules' },
  ]

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Dashboard</div>
        <div className="topbar-actions">
          <button className="btn btn-accent btn-sm" onClick={() => navigate('/timetable')}>
            <Zap size={13} /> Open Timetable
          </button>
        </div>
      </div>

      <div className="page">
        {/* Active timetable banner */}
        <motion.div {...fadeUp} style={{ marginBottom: 20 }}>
          {stats.active ? (
            <div className="card" style={{ borderLeft: '4px solid var(--teal)', background: 'linear-gradient(135deg,#f0fdfa,#fff)' }}>
              <div className="flex-between">
                <div className="flex-row">
                  <CheckCircle size={18} color="var(--teal)" />
                  <span style={{ fontWeight:700, color:'var(--teal)', fontFamily:'var(--font-display)' }}>Active Timetable:</span>
                  <span style={{ fontWeight:600 }}>{stats.active.name}</span>
                  <span className="badge badge-teal">{stats.active.slot_count} slots</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/timetable')}>
                  View <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ borderLeft: '4px solid var(--amber)', background: 'linear-gradient(135deg,#fffbeb,#fff)' }}>
              <div className="flex-between">
                <div className="flex-row">
                  <AlertCircle size={18} color="var(--amber)" />
                  <span style={{ fontWeight:600, color:'#92400e' }}>No active timetable yet.</span>
                </div>
                <button className="btn btn-accent btn-sm" onClick={() => navigate('/timetable')}>
                  Generate now <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Stats */}
        <motion.div className="stats-row" variants={stagger} initial="initial" animate="animate">
          {tiles.map((t, i) => (
            <motion.div key={t.label} variants={fadeUp} custom={i}>
              <div
                className="stat-card"
                style={{ cursor:'pointer', borderTop:`3px solid ${t.color}` }}
                onClick={() => navigate(t.path)}
              >
                <div className="stat-icon" style={{ color: t.color }}>{t.icon}</div>
                <motion.div
                  className="stat-value"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.08 + 0.2, duration: 0.4, ease: [0.34,1.56,0.64,1] }}
                >
                  {t.value}
                </motion.div>
                <div className="stat-label">{t.label}</div>
                <div className="text-muted text-xs mt-2">{t.sub}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom cards */}
        <motion.div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
          variants={stagger}
          initial="initial"
          animate="animate"
        >
          <motion.div variants={fadeUp}>
            <div className="card" style={{ height: '100%' }}>
              <div className="card-title mb-4">Quick Actions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { label: 'Manage Teachers', path:'/teachers', style:'btn-primary', icon:<Users size={13}/> },
                  { label: 'Generate Timetable', path:'/timetable', style:'btn-accent', icon:<Zap size={13}/> },
                  { label: 'Teacher Schedules', path:'/teacher-view', style:'btn-teal', icon:<CalendarDays size={13}/> },
                ].map(a => (
                  <motion.button
                    key={a.label}
                    className={`btn ${a.style}`}
                    onClick={() => navigate(a.path)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    {a.icon} {a.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp}>
            <div className="card" style={{ height: '100%' }}>
              <div className="card-title mb-4">Getting Started</div>
              <ol style={{ paddingLeft:18, color:'var(--muted)', fontSize:13, lineHeight:2.2 }}>
                {[
                  'Add Teachers with availability constraints',
                  'Create Subjects with weekly period counts',
                  'Set up Classes / grade sections',
                  'Assign subjects to qualified teachers',
                  'Generate Drafts — 3 conflict-free options',
                  'Lock static slots, reshuffle, drag-and-drop, activate!',
                ].map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </>
  )
}
