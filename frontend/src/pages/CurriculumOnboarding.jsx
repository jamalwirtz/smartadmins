import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { curriculumAPI, schoolAPI, classesAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  School, GraduationCap, Layers, Users, Clock, CheckCircle, Check, ArrowRight, ArrowLeft,
  SkipForward, Loader2, Sparkles, Plus, X, BookOpen, CalendarDays, Wand2
} from 'lucide-react'

const SYSTEM_META = {
  CAIE: { blurb: 'Cambridge IGCSE / A-Level syllabus codes', color: '#1565c0', emoji: '🎓' },
  UNEB: { blurb: 'Uganda O-Level / A-Level subject numbers', color: '#2e7d32', emoji: '🇺🇬' },
  IB:   { blurb: 'International Baccalaureate Diploma course codes', color: '#6a1b9a', emoji: '🌐' },
  AP:   { blurb: 'American AP course codes', color: '#c62828', emoji: '🦅' },
  CBC:  { blurb: 'Kenya Competency-Based Curriculum learning areas', color: '#e65100', emoji: '🇰🇪' },
}
const STEPS = [
  { label: 'Your school',  icon: <School size={14}/> },
  { label: 'Curriculum',   icon: <GraduationCap size={14}/> },
  { label: 'Levels & subjects', icon: <Layers size={14}/> },
  { label: 'Classes',      icon: <Users size={14}/> },
  { label: 'Days & times', icon: <Clock size={14}/> },
  { label: 'Finish',       icon: <CheckCircle size={14}/> },
]
const ALL_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]

export default function CurriculumOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const [school, setSchool] = useState({ school_name: '', academic_year: '', country_code: '', school_motto: '' })
  const [systems, setSystems] = useState([])
  const [selected, setSelected] = useState(null)        // system object, or 'none'
  const [levels, setLevels] = useState([])               // level names this school uses (editable)
  const [chosen, setChosen] = useState([])               // which of them are actually used
  const [newLevel, setNewLevel] = useState('')
  const [presets, setPresets] = useState([])
  const [checkedNames, setCheckedNames] = useState([])
  const [classPlan, setClassPlan] = useState({})         // level -> "7 A, 7 B"
  const [timing, setTiming] = useState({ start_time: '08:00', period_minutes: 45, periods_per_day: 8,
    school_days: ['Monday','Tuesday','Wednesday','Thursday','Friday'] })
  const [summary, setSummary] = useState({ subjects: 0, classes: 0 })

  useEffect(() => {
    curriculumAPI.list().then(r => setSystems(r.data)).catch(() => toast.error('Could not load curricula'))
    schoolAPI.getSettings().then(r => {
      const s = r.data
      setSchool({ school_name: s.school_name || '', academic_year: s.academic_year || '', country_code: s.country_code || '', school_motto: s.school_motto || '' })
      setTiming({
        start_time: s.start_time || '08:00', period_minutes: s.period_minutes || 45, periods_per_day: s.periods_per_day || 8,
        school_days: (s.school_days || 'Monday,Tuesday,Wednesday,Thursday,Friday').split(',').map(d => d.trim()).filter(Boolean),
      })
    }).catch(() => {})
  }, [])

  const go = (n) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)))

  // ── step 0: school profile ──
  const saveSchool = async () => {
    if (!school.school_name.trim()) return toast.error('Enter your school name')
    setBusy(true)
    try { await schoolAPI.updateSettings({ ...school, school_name: school.school_name.trim(), country_code: school.country_code.toUpperCase() }); go(1) }
    catch { toast.error('Could not save school details') }
    finally { setBusy(false) }
  }

  // ── step 1: curriculum ──
  const pickSystem = async (sys) => {
    setSelected(sys)
    const lv = sys === 'none' ? [] : (sys.levels || '').split(',').map(x => x.trim()).filter(Boolean)
    setLevels(lv); setChosen(lv.slice(0, 1))
    setPresets([]); setCheckedNames([])
    if (sys !== 'none' && sys.has_presets) {
      try {
        const r = await curriculumAPI.presets(sys.code)
        setPresets(r.data); setCheckedNames(r.data.map(p => p.name))
      } catch { /* presets are optional */ }
    }
    go(2)
  }

  // ── step 2: levels (free names) + subjects ──
  const addLevel = () => {
    const v = newLevel.trim()
    if (!v) return
    if (!levels.includes(v)) setLevels(l => [...l, v])
    setChosen(c => c.includes(v) ? c : [...c, v]); setNewLevel('')
  }
  const saveLevels = async () => {
    if (!chosen.length) return toast.error('Choose or add at least one level (you can add more later)')
    setBusy(true)
    try {
      let subjects = 0
      if (selected !== 'none' && selected?.has_presets && checkedNames.length) {
        for (const lvl of chosen) {
          const r = await curriculumAPI.applyPresets(selected.code, { grade_level: lvl, subject_names: checkedNames })
          subjects += (r.data.created || []).length
        }
      }
      setSummary(s => ({ ...s, subjects }))
      setClassPlan(Object.fromEntries(chosen.map(l => [l, classPlan[l] ?? `${l} A, ${l} B`])))
      if (subjects) toast.success(`${subjects} subject(s) added across ${chosen.length} level(s) ✅`)
      go(3)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not add subjects') }
    finally { setBusy(false) }
  }

  // ── step 3: classes ──
  const saveClasses = async () => {
    setBusy(true)
    try {
      const existing = new Set((await classesAPI.list()).data.map(c => c.name.trim().toLowerCase()))
      let made = 0
      for (const lvl of chosen) {
        const names = (classPlan[lvl] || '').split(',').map(n => n.trim()).filter(Boolean)
        for (const name of names) {
          if (existing.has(name.toLowerCase())) continue
          await classesAPI.create({ name, grade_level: lvl, education_system_id: selected && selected !== 'none' ? selected.id : undefined })
          existing.add(name.toLowerCase()); made++
        }
      }
      setSummary(s => ({ ...s, classes: made }))
      if (made) toast.success(`${made} class(es) created ✅`)
      go(4)
    } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create classes') }
    finally { setBusy(false) }
  }

  // ── step 4: timing ──
  const saveTiming = async () => {
    if (!timing.school_days.length) return toast.error('Pick at least one school day')
    setBusy(true)
    try {
      await schoolAPI.updateSettings({
        start_time: timing.start_time, period_minutes: +timing.period_minutes || 45,
        periods_per_day: +timing.periods_per_day || 8,
        school_days: ALL_DAYS.filter(d => timing.school_days.includes(d)).join(','),
      })
      await curriculumAPI.setActive({ education_system_id: selected && selected !== 'none' ? selected.id : null, onboarding_completed: true })
      go(5)
    } catch { toast.error('Could not save the timetable settings') }
    finally { setBusy(false) }
  }

  const skip = async () => {
    try { await curriculumAPI.setActive({ education_system_id: null, onboarding_completed: true }) } catch {}
    navigate('/dashboard')
  }

  const sysMeta = (s) => SYSTEM_META[s.code] || { blurb: 'Custom curriculum', color: '#38bdf8', emoji: '📘' }
  const slide = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: .2 } }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Set up your school</h1>
          <p className="page-subtitle">Six short steps: school details, curriculum, your own level names, classes, school day, and what to do next. Nothing is locked in — everything can be changed later.</p>
        </div>
        {step < 5 && <button className="btn btn-ghost btn-sm" onClick={skip}><SkipForward size={13}/> Skip for now</button>}
      </motion.div>

      <div className="wizard-steps" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <div key={s.label} className="wizard-step-wrap">
            <div className={`wizard-step-dot${step === i ? ' active' : step > i ? ' done' : ''}`}>{step > i ? <Check size={11}/> : s.icon}</div>
            <span className={`wizard-step-label${step === i ? ' active' : ''}`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className={`wizard-step-line${step > i ? ' done' : ''}`}/>}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── 0 School ── */}
        {step === 0 && (
          <motion.div key="s0" className="card" {...slide}>
            <div className="card-header"><div className="card-title"><School size={16}/> About your school</div></div>
            <div className="wizard-form-grid">
              <div className="wiz-field"><label className="wiz-label">School name <span className="wiz-req">*</span></label>
                <input className="wiz-input" autoFocus value={school.school_name} onChange={e => setSchool(s => ({ ...s, school_name: e.target.value }))} placeholder="e.g. Greenfield Academy"/></div>
              <div className="wiz-field"><label className="wiz-label">Academic year</label>
                <input className="wiz-input" value={school.academic_year} onChange={e => setSchool(s => ({ ...s, academic_year: e.target.value }))} placeholder="2026/2027"/></div>
              <div className="wiz-field"><label className="wiz-label">Country code</label>
                <input className="wiz-input" maxLength={2} value={school.country_code} onChange={e => setSchool(s => ({ ...s, country_code: e.target.value.toUpperCase() }))} placeholder="UG, KE, ZA…"/>
                <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Used for the public-holiday calendar.</span></div>
              <div className="wiz-field"><label className="wiz-label">Motto (printed on PDFs)</label>
                <input className="wiz-input" value={school.school_motto} onChange={e => setSchool(s => ({ ...s, school_motto: e.target.value }))} placeholder="Optional"/></div>
            </div>
            <div className="wizard-footer"><button className="btn btn-accent" disabled={busy} onClick={saveSchool}>{busy ? <Loader2 size={14} className="spinning"/> : <>Continue <ArrowRight size={14}/></>}</button></div>
          </motion.div>
        )}

        {/* ── 1 Curriculum ── */}
        {step === 1 && (
          <motion.div key="s1" {...slide}>
            <div className="curr-grid">
              {systems.map((sys, i) => {
                const m = sysMeta(sys)
                return (
                  <motion.button key={sys.id} className="curr-card" style={{ '--curr-color': m.color }}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .05 }} onClick={() => pickSystem(sys)}>
                    <div className="curr-card-emoji">{m.emoji}</div>
                    <div className="curr-card-name">{sys.name}</div>
                    <div className="curr-card-blurb">{m.blurb}</div>
                    <div className="curr-card-levels">{(sys.levels || '').split(',').slice(0, 4).join(' · ')}</div>
                    {sys.has_presets ? <span className="curr-card-badge"><Sparkles size={11}/> Subject presets included</span> : <span className="curr-card-badge muted">Add subjects manually</span>}
                  </motion.button>
                )
              })}
              <motion.button className="curr-card" style={{ '--curr-color': '#64748b' }} onClick={() => pickSystem('none')}>
                <div className="curr-card-emoji">✏️</div>
                <div className="curr-card-name">My own system</div>
                <div className="curr-card-blurb">Name your levels yourself — "Primary 4", "Year 9", "Form 2", anything.</div>
                <span className="curr-card-badge muted">Fully custom</span>
              </motion.button>
            </div>
            <div className="wizard-footer"><button className="btn btn-secondary" onClick={() => go(0)}><ArrowLeft size={14}/> Back</button></div>
          </motion.div>
        )}

        {/* ── 2 Levels & subjects ── */}
        {step === 2 && (
          <motion.div key="s2" className="card" {...slide}>
            <div className="card-header"><div className="card-title"><Layers size={16}/> Which levels does your school teach?</div></div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Tick the levels you use, or add your own names — they don't have to match the curriculum's wording.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {levels.map(l => (
                <button key={l} type="button" className={`exam-day-btn${chosen.includes(l) ? ' active' : ''}`} onClick={() => setChosen(c => toggle(c, l))}>{chosen.includes(l) && '✓ '}{l}</button>
              ))}
              {levels.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No levels yet — add your first one below.</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginBottom: 18 }}>
              <input className="wiz-input" value={newLevel} placeholder="Add your own level name…" onChange={e => setNewLevel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLevel()}/>
              <button className="btn btn-secondary btn-sm" onClick={addLevel}><Plus size={13}/> Add</button>
            </div>

            {presets.length > 0 && (
              <>
                <div className="card-title" style={{ fontSize: 13, marginBottom: 6 }}><BookOpen size={14}/> Starter subjects for {selected?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Added to every level you ticked above ({chosen.length}). Subjects that already exist are skipped.</div>
                <div className="curr-preset-list" style={{ maxHeight: 240 }}>
                  {presets.map(p => (
                    <label key={p.name} className="curr-preset-row">
                      <input type="checkbox" checked={checkedNames.includes(p.name)} onChange={() => setCheckedNames(c => toggle(c, p.name))}/>
                      <span className="curr-preset-dot" style={{ background: p.color_hex }}/>
                      <span className="curr-preset-name">{p.name}</span><span className="curr-preset-code">{p.subject_code}</span>
                      <span className="curr-preset-periods">{p.weekly_periods}×/wk</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="wizard-footer">
              <button className="btn btn-secondary" onClick={() => go(1)}><ArrowLeft size={14}/> Back</button>
              <button className="btn btn-accent" disabled={busy} onClick={saveLevels}>{busy ? <><Loader2 size={14} className="spinning"/> Adding…</> : <>Continue <ArrowRight size={14}/></>}</button>
            </div>
          </motion.div>
        )}

        {/* ── 3 Classes ── */}
        {step === 3 && (
          <motion.div key="s3" className="card" {...slide}>
            <div className="card-header"><div className="card-title"><Users size={16}/> Create your classes</div></div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Type the class names for each level, separated by commas — use any naming you like. Existing classes are never duplicated. Leave a level empty to add its classes later.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chosen.map(l => (
                <div key={l} className="wiz-field">
                  <label className="wiz-label">{l}</label>
                  <input className="wiz-input" value={classPlan[l] ?? ''} onChange={e => setClassPlan(p => ({ ...p, [l]: e.target.value }))} placeholder={`e.g. ${l} A, ${l} B`}/>
                </div>
              ))}
            </div>
            <div className="wizard-footer">
              <button className="btn btn-secondary" onClick={() => go(2)}><ArrowLeft size={14}/> Back</button>
              <button className="btn btn-accent" disabled={busy} onClick={saveClasses}>{busy ? <><Loader2 size={14} className="spinning"/> Creating…</> : <>Create classes &amp; continue <ArrowRight size={14}/></>}</button>
            </div>
          </motion.div>
        )}

        {/* ── 4 Days & times ── */}
        {step === 4 && (
          <motion.div key="s4" className="card" {...slide}>
            <div className="card-header"><div className="card-title"><Clock size={16}/> Your school day</div></div>
            <div className="wizard-form-grid">
              <div className="wiz-field"><label className="wiz-label">First lesson starts</label>
                <input type="time" className="wiz-input" value={timing.start_time} onChange={e => setTiming(t => ({ ...t, start_time: e.target.value }))}/></div>
              <div className="wiz-field"><label className="wiz-label">Lesson length (minutes)</label>
                <input type="number" min={20} max={120} className="wiz-input" value={timing.period_minutes} onChange={e => setTiming(t => ({ ...t, period_minutes: e.target.value }))}/></div>
              <div className="wiz-field"><label className="wiz-label">Lessons per day</label>
                <input type="number" min={1} max={16} className="wiz-input" value={timing.periods_per_day} onChange={e => setTiming(t => ({ ...t, periods_per_day: e.target.value }))}/></div>
              <div className="wiz-field"><label className="wiz-label">School days</label>
                <div className="exam-day-toggles">
                  {ALL_DAYS.map(d => <button key={d} type="button" className={`exam-day-btn${timing.school_days.includes(d) ? ' active' : ''}`} onClick={() => setTiming(t => ({ ...t, school_days: toggle(t.school_days, d) }))}>{d.slice(0, 3)}</button>)}
                </div></div>
            </div>
            <div className="form-hint" style={{ marginTop: 8 }}>Breaks and lunch can be set on the Schedule Config page afterwards.</div>
            <div className="wizard-footer">
              <button className="btn btn-secondary" onClick={() => go(3)}><ArrowLeft size={14}/> Back</button>
              <button className="btn btn-accent" disabled={busy} onClick={saveTiming}>{busy ? <Loader2 size={14} className="spinning"/> : <>Save &amp; finish <ArrowRight size={14}/></>}</button>
            </div>
          </motion.div>
        )}

        {/* ── 5 Finish ── */}
        {step === 5 && (
          <motion.div key="s5" className="card" {...slide} style={{ padding: '32px 28px' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px', background: 'rgba(74,222,128,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckCircle size={32} color="#16a34a"/></div>
              <h3 style={{ fontSize: 20, fontWeight: 800 }}>{school.school_name || 'Your school'} is set up</h3>
              <p style={{ color: 'var(--muted)' }}>{summary.subjects} subject(s) and {summary.classes} class(es) added this session. Here's the best order for what's left:</p>
            </div>
            <div style={{ display: 'grid', gap: 10, maxWidth: 560, margin: '0 auto' }}>
              {[
                { n: 1, t: 'Add your teachers', s: 'Type them in or import a CSV, then tick the subjects each can teach.', to: '/teachers', i: <Users size={16}/> },
                { n: 2, t: 'Allocate subjects to classes', s: 'Open a class and choose its subjects and teachers.', to: '/classes', i: <School size={16}/> },
                { n: 3, t: 'Generate the timetable', s: 'Three conflict-free drafts in seconds; lock, drag and fine-tune.', to: '/timetable', i: <CalendarDays size={16}/> },
                { n: 4, t: 'Plan exams', s: 'Guided setup: dates, papers, supervisors, rooms.', to: '/exams', i: <Wand2 size={16}/> },
              ].map(x => (
                <button key={x.n} className="dash-action-btn" onClick={() => navigate(x.to)} style={{ margin: 0 }}>
                  <div className="dash-action-icon" style={{ background: 'rgba(56,189,248,.12)', color: 'var(--blue-400)' }}>{x.i}</div>
                  <div><div className="dash-action-label">{x.n}. {x.t}</div><div className="dash-action-sub">{x.s}</div></div>
                  <ArrowRight size={14} className="dash-action-arrow"/>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 18 }}><button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>Go to dashboard</button></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
