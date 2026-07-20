import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from './context/AuthContext'
import { useTheme } from './context/ThemeContext'
import { useGlobalWS } from './hooks/useWebSocket'
import toast from 'react-hot-toast'

import Home        from './pages/Home'
import ScheduleSettings from './pages/ScheduleSettings'
import Login       from './pages/Login'
import Signup      from './pages/Signup'
import Dashboard   from './pages/Dashboard'
import Teachers    from './pages/Teachers'
import Subjects    from './pages/Subjects'
import Classes     from './pages/Classes'
import Timetable   from './pages/Timetable'
import TeacherView from './pages/TeacherView'
import Settings    from './pages/Settings'
import Exams       from './pages/Exams'
import Walkthrough from './components/Walkthrough'

import {
  LayoutDashboard, Users, BookOpen, School, CalendarDays, UserCheck, Clock,
  LogOut, Sun, Moon, Settings as SettingsIcon, ChevronDown, Bell,
  HelpCircle, GraduationCap, Menu, X as XIcon
} from 'lucide-react'

// ── Page transition config ────────────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.4,0,0.2,1] } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18 } },
}

// ── Breadcrumb map ────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/dashboard':    { label: 'Dashboard',    icon: <LayoutDashboard size={15}/> },
  '/teachers':     { label: 'Teachers',     icon: <Users size={15}/> },
  '/subjects':     { label: 'Subjects',     icon: <BookOpen size={15}/> },
  '/classes':      { label: 'Classes',      icon: <School size={15}/> },
  '/timetable':    { label: 'Timetable',    icon: <CalendarDays size={15}/> },
  '/exams':        { label: 'Exams',        icon: <GraduationCap size={15}/> },
  '/teacher-view': { label: 'Teacher View', icon: <UserCheck size={15}/> },
  '/settings':          { label: 'Settings',          icon: <SettingsIcon size={15}/> },
  '/schedule-settings': { label: 'Schedule Settings',  icon: <Clock size={15}/> },
}

// ── Nav link ──────────────────────────────────────────────────────────────────
function NavItem({ to, icon, label, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

// ── WebSocket global listener ─────────────────────────────────────────────────
function GlobalWSListener() {
  useGlobalWS((msg) => {
    if      (msg.event === 'draft_generated') toast.success(`${msg.drafts?.length||0} draft(s) generated`, { icon: '⚡' })
    else if (msg.event === 'draft_activated') toast.success(`"${msg.name}" is now active`, { icon: '✅' })
    else if (msg.event === 'draft_deleted')   toast('Draft deleted', { icon: '🗑️' })
  })
  return null
}

// ── User dropdown ─────────────────────────────────────────────────────────────
function UserDropdown({ user, onLogout, photoUrl }) {
  const navigate  = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const initials = (user?.username || 'AD').slice(0,2).toUpperCase()

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="topbar-user-wrap" ref={ref}>
      <button className="topbar-user-btn" onClick={() => setOpen(o => !o)}>
        <div className="topbar-avatar" style={photoUrl?{padding:0,overflow:'hidden'}:{}}>
          {photoUrl
            ? <img src={photoUrl} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
            : initials}
        </div>
        <div className="topbar-user-info">
          <span className="topbar-user-name">{user?.username || 'Admin'}</span>
          <span className="topbar-user-role">Administrator</span>
        </div>
        <ChevronDown size={13} className={`topbar-chevron${open ? ' open' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="topbar-dropdown"
            initial={{ opacity:0, y:-8, scale:0.96 }}
            animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-8, scale:0.96 }}
            transition={{ duration:0.15 }}>
            <div className="topbar-dropdown-header">
              <div className="topbar-dd-avatar">{initials}</div>
              <div>
                <div className="topbar-dd-name">{user?.username}</div>
                <div className="topbar-dd-email">{user?.email || 'admin@school.edu'}</div>
              </div>
            </div>
            <div className="topbar-dropdown-divider"/>
            <button className="topbar-dd-item" onClick={() => { setOpen(false); navigate('/settings') }}>
              <SettingsIcon size={14}/> Account settings
            </button>
            <button className="topbar-dd-item" onClick={() => {
              setOpen(false)
              window.dispatchEvent(new CustomEvent('open-walkthrough'))
            }}>
              <HelpCircle size={14}/> How it works
            </button>
            <div className="topbar-dropdown-divider"/>
            <button className="topbar-dd-item topbar-dd-logout" onClick={() => { setOpen(false); onLogout() }}>
              <LogOut size={14}/> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ user, onLogout, onMenuClick, photoUrl }) {
  const location = useLocation()
  const { theme, toggle: toggleTheme } = useTheme()
  const pageInfo = PAGE_TITLES[location.pathname] || { label: 'Smart Admin', icon: null }

  return (
    <motion.header className="topbar"
      initial={{ opacity:0, y:-12 }} animate={{ opacity:1, y:0 }}
      transition={{ duration:0.35, ease:[0.4,0,0.2,1] }}>
      <div className="topbar-left">
        {/* Mobile hamburger */}
        <button className="topbar-menu-btn" onClick={onMenuClick} aria-label="Toggle sidebar">
          <Menu size={18}/>
        </button>
        {pageInfo.icon && <span className="topbar-page-icon">{pageInfo.icon}</span>}
        <span className="topbar-page-label topbar-title">{pageInfo.label}</span>
      </div>
      <div className="topbar-right">
        <button className="topbar-icon-btn" onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          <AnimatePresence mode="wait">
            {theme === 'dark'
              ? <motion.span key="sun"  initial={{opacity:0,rotate:-30}} animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:30}}><Sun  size={16}/></motion.span>
              : <motion.span key="moon" initial={{opacity:0,rotate:30}}  animate={{opacity:1,rotate:0}} exit={{opacity:0,rotate:-30}}><Moon size={16}/></motion.span>
            }
          </AnimatePresence>
        </button>
        <button className="topbar-icon-btn" title="Notifications"
          onClick={() => toast('Notifications coming soon', { icon:'🔔' })}>
          <Bell size={16}/>
        </button>
        <UserDropdown user={user} onLogout={onLogout} photoUrl={photoUrl}/>
      </div>
    </motion.header>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ user, onLogout, onClose, photoUrl }) {
  const navigate = useNavigate()
  const closeOnMobile = () => {
    if (window.innerWidth <= 900) onClose?.()
  }

  return (
    <motion.aside className="sidebar"
      initial={{ x:-240 }} animate={{ x:0 }}
      transition={{ duration:0.35, ease:[0.4,0,0.2,1] }}>

      <div className="sidebar-brand">
        <div className="sidebar-brand-inner">
          <img src="/logo.png" alt="SSTG" className="sidebar-logo-img"/>
          <div>
            <div className="sidebar-title">Smart Admin</div>
            <div className="sidebar-subtitle">Timetable Generator</div>
          </div>
        </div>
        {/* FIX: previously there was no visible way to close the sidebar on
            mobile other than tapping the dimmed overlay behind it — easy to
            miss, especially on very narrow screens where the sidebar covers
            most of the viewport. This close button is always reachable. */}
        <button className="sidebar-mobile-close" onClick={onClose} aria-label="Close menu">
          <XIcon size={16}/>
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">Overview</div>
        <NavItem to="/dashboard"    icon={<LayoutDashboard size={16}/>} label="Dashboard"    onClick={closeOnMobile}/>

        <div className="nav-section-label">Setup</div>
        <NavItem to="/teachers"     icon={<Users size={16}/>}          label="Teachers"     onClick={closeOnMobile}/>
        <NavItem to="/subjects"     icon={<BookOpen size={16}/>}       label="Subjects"     onClick={closeOnMobile}/>
        <NavItem to="/classes"      icon={<School size={16}/>}         label="Classes"      onClick={closeOnMobile}/>

        <div className="nav-section-label">Scheduling</div>
        <NavItem to="/timetable"    icon={<CalendarDays size={16}/>}   label="Timetable"    onClick={closeOnMobile}/>
        <NavItem to="/exams"        icon={<GraduationCap size={16}/>}  label="Exams"        onClick={closeOnMobile}/>
        <NavItem to="/teacher-view" icon={<UserCheck size={16}/>}      label="Teacher View" onClick={closeOnMobile}/>

        <div className="nav-section-label">Account</div>
        <NavItem to="/settings"          icon={<SettingsIcon size={16}/>}   label="Settings"     onClick={closeOnMobile}/>
        <NavItem to="/schedule-settings" icon={<Clock size={16}/>}            label="Schedule Config" onClick={closeOnMobile}/>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user sidebar-user-clickable"
          onClick={() => { navigate('/settings'); closeOnMobile() }}
          title="Open settings">
          <div className="sidebar-avatar" style={photoUrl?{padding:0,overflow:'hidden'}:{}}>
            {photoUrl
              ? <img src={photoUrl} alt="avatar" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>
              : (user?.username||'AD').slice(0,2).toUpperCase()}
          </div>
          <div>
            <div className="sidebar-username">{user?.username}</div>
            <div className="sidebar-role">Administrator</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={() => { onLogout(); navigate('/login') }}>
          <LogOut size={13}/> Sign out
        </button>
      </div>
      <button className="sidebar-help-btn"
        onClick={() => { window.dispatchEvent(new CustomEvent('open-walkthrough')); closeOnMobile() }}>
        <HelpCircle size={14}/> How it works
      </button>
    </motion.aside>
  )
}

// ── Protected layout (with mobile sidebar state here where it belongs) ────────
function ProtectedLayout({ children }) {
  const { user, loading, logout, photoUrl } = useAuth()
  const navigate    = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'var(--bg)' }}>
      <div className="spinner" style={{ borderTopColor:'var(--amber)' }}/>
    </div>
  )
  if (!user) return <Navigate to="/login" replace/>

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className={`app-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <GlobalWSListener/>

      {/* Mobile overlay — click to close sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div className="sidebar-overlay"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setSidebarOpen(false)}/>
        )}
      </AnimatePresence>

      <Sidebar user={user} onLogout={handleLogout} onClose={() => setSidebarOpen(false)} photoUrl={photoUrl}/>

      <div className="app-main">
        <Topbar user={user} onLogout={handleLogout} onMenuClick={() => setSidebarOpen(o => !o)} photoUrl={photoUrl}/>
        <div className="main-content">{children}</div>
      </div>
    </div>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading } = useAuth()
  const [showWalkthrough, setShowWalkthrough] = useState(false)

  useEffect(() => {
    const openHandler = () => setShowWalkthrough(true)
    window.addEventListener('open-walkthrough', openHandler)
    let loginHandler = null
    if (!localStorage.getItem('sstg_wt_seen')) {
      loginHandler = () => {
        localStorage.setItem('sstg_wt_seen', '1')
        setTimeout(() => setShowWalkthrough(true), 1200)
      }
      window.addEventListener('sstg_logged_in', loginHandler, { once: true })
    }
    return () => {
      window.removeEventListener('open-walkthrough', openHandler)
      if (loginHandler) window.removeEventListener('sstg_logged_in', loginHandler)
    }
  }, [])

  if (loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', background:'var(--navy-950)' }}>
      <div className="spinner" style={{ borderTopColor:'var(--amber)' }}/>
    </div>
  )

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/"       element={user ? <Navigate to="/dashboard" replace/> : <Home/>}/>
        <Route path="/login"  element={user ? <Navigate to="/dashboard" replace/> : <Login/>}/>
        <Route path="/signup" element={user ? <Navigate to="/dashboard" replace/> : <Signup/>}/>

        {/* Protected routes */}
        <Route path="/*" element={
          <ProtectedLayout>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/dashboard"    element={<motion.div key="dash"  {...pageVariants}><Dashboard/></motion.div>}/>
                <Route path="/teachers"     element={<motion.div key="teach" {...pageVariants}><Teachers/></motion.div>}/>
                <Route path="/subjects"     element={<motion.div key="subj"  {...pageVariants}><Subjects/></motion.div>}/>
                <Route path="/classes"      element={<motion.div key="cls"   {...pageVariants}><Classes/></motion.div>}/>
                <Route path="/timetable"    element={<motion.div key="tt"    {...pageVariants}><Timetable/></motion.div>}/>
                <Route path="/exams"        element={<motion.div key="ex"    {...pageVariants}><Exams/></motion.div>}/>
                <Route path="/teacher-view" element={<motion.div key="tv"    {...pageVariants}><TeacherView/></motion.div>}/>
                <Route path="/settings"     element={<motion.div key="sett"  {...pageVariants}><Settings/></motion.div>}/>
                <Route path="/schedule-settings" element={<motion.div key="schset" {...pageVariants}><ScheduleSettings/></motion.div>}/>
                <Route path="*"             element={<Navigate to="/dashboard"/>}/>
              </Routes>
            </AnimatePresence>
          </ProtectedLayout>
        }/>
      </Routes>

      <AnimatePresence>
        {showWalkthrough && <Walkthrough onClose={() => setShowWalkthrough(false)}/>}
      </AnimatePresence>
    </>
  )
}
