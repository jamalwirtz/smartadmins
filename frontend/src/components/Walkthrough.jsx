import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, LayoutDashboard, Users, Sparkles, GripHorizontal, FileDown } from 'lucide-react'

const SLIDES = [
  {
    id:1, icon:<LayoutDashboard size={28}/>, color:'#3b82f6', subtitle:'The Dashboard', title:'Your Command Centre',
    body:'The Dashboard gives you a live overview — total teachers, subjects, classes, and timetable drafts. Real-time WebSocket updates keep everything current without ever refreshing the page.',
    visual:(
      <div className="wt-visual wt-dashboard">
        {[{n:12,lbl:'Teachers',c:'#3b82f6'},{n:8,lbl:'Subjects',c:'#f59e0b'},{n:6,lbl:'Classes',c:'#10b981'},{n:3,lbl:'Drafts',c:'#8b5cf6'}].map(s=>(
          <div key={s.lbl} className="wt-stat-card"><div className="wt-stat-num" style={{color:s.c}}>{s.n}</div><div className="wt-stat-lbl">{s.lbl}</div></div>
        ))}
      </div>
    ),
  },
  {
    id:2, icon:<Users size={28}/>, color:'#f59e0b', subtitle:'Setup', title:'Add Teachers & Subjects',
    body:'Add teachers with their max weekly hours and days off, then assign which subjects they teach. Create your class sections. This one-time setup takes about 5 minutes.',
    visual:(
      <div className="wt-visual wt-setup">
        {[{init:'AK',name:'Mrs Alice Kamau',meta:'Math · 25 hrs/wk',c:'#3b82f6'},{init:'BO',name:'Mr Brian Otieno',meta:'English · Part-time',c:'#10b981'},{init:'CW',name:'Ms Carol Wanjiku',meta:'Science · 30 hrs/wk',c:'#8b5cf6'}].map(t=>(
          <div key={t.init} className="wt-teacher-row"><div className="wt-avatar" style={{background:t.c+'33',color:t.c}}>{t.init}</div><div><div className="wt-name">{t.name}</div><div className="wt-meta">{t.meta}</div></div></div>
        ))}
      </div>
    ),
  },
  {
    id:3, icon:<Sparkles size={28}/>, color:'#10b981', subtitle:'AI Scheduling', title:'Generate in Seconds',
    body:'Hit Generate — the constraint engine creates multiple conflict-free drafts instantly, respecting teacher availability, max hours, and class requirements. Compare drafts and pick the best.',
    visual:(
      <div className="wt-visual wt-generate">
        <motion.div className="wt-gen-btn" animate={{scale:[1,1.04,1]}} transition={{duration:2,repeat:Infinity}}><Sparkles size={13}/> Generate Timetable</motion.div>
        <div className="wt-gen-drafts">
          {['Draft A','Draft B','Draft C'].map((d,i)=>(
            <motion.div key={d} className="wt-draft-pill" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:0.3+i*0.15}}>{d} <span className="wt-draft-score">98%</span></motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id:4, icon:<GripHorizontal size={28}/>, color:'#8b5cf6', subtitle:'Timetable Editor', title:'Drag, Drop & Fine-Tune',
    body:"Drag any slot to an empty cell to move it, or drop it onto another slot to swap. Lock important slots so they never move during a reshuffle. Constraint validation happens live.",
    visual:(
      <div className="wt-visual wt-drag">
        <div className="wt-tt-mini">
          {['Mon','Tue','Wed','Thu','Fri'].map((d,di)=>(
            <div key={d} className="wt-tt-col">
              <div className="wt-tt-head">{d}</div>
              {[0,1,2].map(p=>(
                <motion.div key={p} className={`wt-tt-cell${di===1&&p===1?' dragging':di===3&&p===1?' target':''}`} whileHover={{scale:1.06}}
                  style={di===1&&p===1?{background:'rgba(139,92,246,0.3)',border:'1.5px dashed #8b5cf6'}:{}}>
                  {di===0&&p===0&&'Math'}{di===2&&p===1&&'Eng'}{di===4&&p===2&&'Sci'}
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id:5, icon:<FileDown size={28}/>, color:'#ef4444', subtitle:'PDF & Email', title:'Export & Share',
    body:'Activate the best draft to make it official. Export the full school PDF or individual teacher PDFs with one click. Email any teacher their personal schedule directly from the app.',
    visual:(
      <div className="wt-visual wt-export">
        {[{name:'School_Timetable_2025.pdf',size:'2.4 MB · Ready',c:'#ef4444'},{name:'Mrs_Alice_Kamau.pdf',size:'320 KB · Emailed ✓',c:'#f59e0b'}].map(f=>(
          <motion.div key={f.name} className="wt-export-pdf" whileHover={{y:-2}}>
            <FileDown size={17} color={f.c}/><div><div className="wt-export-name">{f.name}</div><div className="wt-export-size">{f.size}</div></div>
          </motion.div>
        ))}
      </div>
    ),
  },
]

export default function Walkthrough({ onClose }) {
  const [slide, setSlide] = useState(0)
  const [dir, setDir] = useState(1)

  const go = (next) => { setDir(next > slide ? 1 : -1); setSlide(next) }

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const cur = SLIDES[slide]

  return (
    <motion.div className="wt-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <motion.div className="wt-modal"
        initial={{opacity:0,scale:0.9,y:30}} animate={{opacity:1,scale:1,y:0}}
        exit={{opacity:0,scale:0.92,y:20}} transition={{type:'spring',stiffness:300,damping:28}}>

        <div className="wt-header">
          <div className="wt-logo-row">
            <img src="/logo.png" alt="" style={{width:30,height:30,borderRadius:7,objectFit:'cover'}}/>
            <span className="wt-header-title">How Smart Admin works</span>
          </div>
          <button className="wt-close" onClick={onClose}><X size={15}/></button>
        </div>

        <div className="wt-dots">
          {SLIDES.map((s,i)=>(
            <motion.button key={i} className={`wt-dot${i===slide?' active':''}`}
              style={i===slide?{background:cur.color}:{}} onClick={()=>go(i)} whileHover={{scale:1.4}}/>
          ))}
        </div>

        <div className="wt-body">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={slide} className="wt-slide"
              initial={{opacity:0,x:dir*40}} animate={{opacity:1,x:0}} exit={{opacity:0,x:dir*-40}}
              transition={{duration:0.22,ease:[0.4,0,0.2,1]}}>
              <div className="wt-visual-wrap" style={{borderColor:cur.color+'33'}}>{cur.visual}</div>
              <div className="wt-text">
                <div className="wt-step-badge" style={{background:cur.color+'22',color:cur.color}}>
                  {cur.icon}<span>{cur.subtitle}</span>
                </div>
                <h3 className="wt-slide-title">{cur.title}</h3>
                <p className="wt-slide-body">{cur.body}</p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="wt-footer">
          <button className="wt-nav-btn" onClick={()=>go(slide-1)} disabled={slide===0}><ChevronLeft size={15}/> Previous</button>
          <span className="wt-counter">{slide+1} / {SLIDES.length}</span>
          {slide < SLIDES.length-1
            ? <button className="wt-nav-btn wt-nav-next" onClick={()=>go(slide+1)} style={{color:cur.color,borderColor:cur.color+'55'}}>Next <ChevronRight size={15}/></button>
            : <button className="wt-nav-btn wt-nav-next wt-nav-done" onClick={onClose} style={{background:cur.color,borderColor:cur.color}}>Get Started <ChevronRight size={15}/></button>
          }
        </div>
      </motion.div>
    </motion.div>
  )
}
