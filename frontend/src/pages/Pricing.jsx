import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { billingAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Check, Sparkles, ArrowRight, Home, School, User as UserIcon, Menu, X as XIcon } from 'lucide-react'

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
          <Link to="/#features" className="home-nav-link">Features</Link>
          <Link to="/pricing" className="home-nav-link" style={{ color:'#fff' }}>Pricing</Link>
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
            <Link to="/" className="home-nav-mobile-link" onClick={() => setOpen(false)}>Home</Link>
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

function fmtPrice(n, currency) {
  if (n === 0) return 'Free'
  const symbol = currency === 'USD' ? '$' : currency + ' '
  return `${symbol}${n}`
}

const AUDIENCE_ICON = { personal: <Home size={13}/>, school: <School size={13}/> }

export default function Pricing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState('yearly')   // monthly | yearly — default to yearly to lead with savings
  const [subscribing, setSubscribing] = useState(null)

  // Derived from the real plan data so the headline can never drift out of
  // sync with the actual prices (it previously hard-coded "20%" while the
  // real yearly discount is ~17% — i.e. two months free).
  const maxSavings = plans.reduce((m, p) => Math.max(m, p.yearly_savings_pct || 0), 0)

  useEffect(() => {
    billingAPI.plans()
      .then(r => setPlans(r.data))
      .catch(() => toast.error('Could not load pricing'))
      .finally(() => setLoading(false))
  }, [])

  const choosePlan = async (planId) => {
    if (!user) { navigate('/signup'); return }
    setSubscribing(planId)
    try {
      const r = await billingAPI.subscribe({ plan_id: planId, billing_cycle: cycle })
      toast.success(r.data.message)
      navigate('/dashboard')
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Could not update plan')
    } finally { setSubscribing(null) }
  }

  return (
    <div className="home-page">
      <HomeNav/>

      <section className="home-hero" style={{ minHeight:'auto', padding:'140px 24px 60px' }}>
        <div className="home-hero-bg"/>
        <div className="home-hero-grid"/>
        <motion.div className="home-hero-content"
          initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
          <div className="home-hero-badge"><Sparkles size={13}/> Simple, transparent pricing</div>
          <h1 className="hero-headline">
            One tool for <span className="hero-headline-accent">schools</span><br/>
            and your <span className="hero-headline-accent">own week</span>
          </h1>
          <p className="hero-sub">
            Run a full school's timetable and exam schedule, or just keep your own home
            and office routines organised — pick the plan that fits.
          </p>

          {/* Monthly / Yearly toggle */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap:4, marginTop:10,
            background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.14)',
            borderRadius:999, padding:4,
          }}>
            {['monthly','yearly'].map(c => (
              <button key={c} onClick={() => setCycle(c)}
                style={{
                  padding:'8px 20px', borderRadius:999, border:'none', cursor:'pointer',
                  fontSize:13, fontWeight:700, fontFamily:'inherit',
                  background: cycle === c ? '#f59e0b' : 'transparent',
                  color: cycle === c ? '#000' : 'rgba(255,255,255,.7)',
                  transition:'all .18s',
                }}>
                {c === 'monthly' ? 'Monthly' : 'Yearly'}
                {c === 'yearly' && maxSavings > 0 && (
                  <span style={{ marginLeft:6, fontSize:10.5, opacity:.85 }}>save up to {maxSavings}%</span>
                )}
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="home-section" style={{ paddingTop:20 }}>
        <div className="home-section-inner">
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
              <div className="login-spinner" style={{ width:32, height:32, borderWidth:3, borderTopColor:'#f59e0b' }}/>
            </div>
          ) : (
            <div style={{
              display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',
              gap:20, alignItems:'stretch',
            }}>
              {plans.map((p, i) => {
                const price = cycle === 'monthly' ? p.price_monthly : p.price_yearly
                const periodLabel = cycle === 'monthly' ? '/mo' : '/yr'
                return (
                  <motion.div key={p.id}
                    initial={{ opacity:0, y:20 }} whileInView={{ opacity:1, y:0 }}
                    viewport={{ once:true }} transition={{ delay: i * 0.06 }}
                    style={{
                      position:'relative', display:'flex', flexDirection:'column',
                      padding:'28px 24px', borderRadius:20,
                      background: p.highlighted ? 'rgba(245,158,11,.07)' : 'rgba(255,255,255,.04)',
                      border: p.highlighted ? '1.5px solid rgba(245,158,11,.5)' : '1px solid rgba(255,255,255,.08)',
                    }}>
                    {p.highlighted && (
                      <div style={{
                        position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
                        background:'#f59e0b', color:'#000', fontSize:10.5, fontWeight:800,
                        padding:'4px 14px', borderRadius:20, letterSpacing:.3,
                      }}>
                        MOST POPULAR
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6,
                      fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:.6,
                      color:'rgba(255,255,255,.4)' }}>
                      {AUDIENCE_ICON[p.audience]} {p.audience === 'personal' ? 'Personal' : 'School'}
                    </div>
                    <div style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:19, fontWeight:800, color:'#fff' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize:12.5, color:'rgba(255,255,255,.5)', marginTop:4, minHeight:32 }}>
                      {p.tagline}
                    </div>

                    <div style={{ display:'flex', alignItems:'baseline', gap:4, margin:'18px 0 4px' }}>
                      <span style={{ fontSize:34, fontWeight:900, color:'#fff' }}>
                        {fmtPrice(price, p.currency)}
                      </span>
                      {price > 0 && (
                        <span style={{ fontSize:13, color:'rgba(255,255,255,.4)' }}>{periodLabel}</span>
                      )}
                    </div>
                    {cycle === 'yearly' && p.yearly_savings_pct > 0 && (
                      <div style={{ fontSize:11, color:'#4ade80', fontWeight:700, marginBottom:8 }}>
                        Save {p.yearly_savings_pct}% vs monthly
                      </div>
                    )}

                    <ul style={{ listStyle:'none', margin:'14px 0 20px', padding:0,
                      display:'flex', flexDirection:'column', gap:9, flex:1 }}>
                      {p.features.map(f => (
                        <li key={f} style={{ display:'flex', gap:8, fontSize:12.5, color:'rgba(255,255,255,.75)' }}>
                          <Check size={14} color="#4ade80" style={{ flexShrink:0, marginTop:1 }}/>
                          {f}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => choosePlan(p.id)}
                      disabled={subscribing === p.id}
                      style={{
                        display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                        padding:'11px 16px', borderRadius:12, border:'none', cursor:'pointer',
                        fontSize:13.5, fontWeight:700, fontFamily:'inherit',
                        background: p.highlighted ? '#f59e0b' : 'rgba(255,255,255,.1)',
                        color: p.highlighted ? '#000' : '#fff',
                        opacity: subscribing === p.id ? .7 : 1,
                      }}>
                      {subscribing === p.id
                        ? 'Saving…'
                        : <>{p.price_monthly === 0 ? 'Start Free' : 'Choose Plan'} <ArrowRight size={14}/></>}
                    </button>
                  </motion.div>
                )
              })}
            </div>
          )}

          <p style={{ textAlign:'center', marginTop:28, fontSize:12.5, color:'rgba(255,255,255,.35)' }}>
            Prices shown in USD. Payment collection isn't live yet — choosing a paid plan
            records your selection and we'll follow up before any charge.
          </p>
        </div>
      </section>

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
            © {new Date().getFullYear()} Smart Admin
          </div>
        </div>
      </footer>
    </div>
  )
}
