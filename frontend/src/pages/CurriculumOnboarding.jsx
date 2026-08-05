import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { curriculumAPI } from '../api/client'
import toast from 'react-hot-toast'
import {
  GraduationCap, Check, ArrowRight, ArrowLeft, BookOpen,
  Sparkles, SkipForward, Loader2
} from 'lucide-react'

const SYSTEM_META = {
  CAIE: { blurb: 'Cambridge IGCSE / A-Level syllabus codes', color: '#1565c0', emoji: '🎓' },
  UNEB: { blurb: 'Uganda O-Level / A-Level subject numbers', color: '#2e7d32', emoji: '🇺🇬' },
  IB:   { blurb: 'International Baccalaureate Diploma course codes', color: '#6a1b9a', emoji: '🌐' },
  AP:   { blurb: 'American AP course codes', color: '#c62828', emoji: '🦅' },
  CBC:  { blurb: 'Kenya Competency-Based Curriculum learning areas', color: '#e65100', emoji: '🇰🇪' },
}

export default function CurriculumOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)          // 1 = pick system, 2 = preview & configure, 3 = done
  const [systems, setSystems] = useState([])
  const [selected, setSelected] = useState(null)   // { id, code, name, levels }
  const [presets, setPresets] = useState([])
  const [checkedNames, setCheckedNames] = useState([])
  const [gradeLevel, setGradeLevel] = useState('')
  const [loadingPresets, setLoadingPresets] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    curriculumAPI.list().then(r => setSystems(r.data)).catch(() => toast.error('Could not load curriculum list'))
  }, [])

  const pickSystem = async (sys) => {
    setSelected(sys)
    if (!sys.has_presets) {
      // Custom / no-preset system — skip straight to just marking it active
      await finishWithoutPresets(sys)
      return
    }
    setLoadingPresets(true)
    try {
      const r = await curriculumAPI.presets(sys.code)
      setPresets(r.data)
      setCheckedNames(r.data.map(p => p.name))
      const firstLevel = (sys.levels || '').split(',')[0]?.trim() || ''
      setGradeLevel(firstLevel)
      setStep(2)
    } catch {
      toast.error('No presets available for this curriculum — you can still add subjects manually')
    } finally { setLoadingPresets(false) }
  }

  const finishWithoutPresets = async (sys) => {
    try {
      await curriculumAPI.setActive({ education_system_id: sys.id, onboarding_completed: true })
      toast.success(`Curriculum set to ${sys.name}`)
      navigate('/subjects')
    } catch { toast.error('Could not save curriculum selection') }
  }

  const toggleName = (name) =>
    setCheckedNames(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name])

  const applyAndFinish = async () => {
    if (!gradeLevel.trim()) { toast.error('Enter a grade/level to apply these subjects to'); return }
    if (checkedNames.length === 0) { toast.error('Select at least one subject'); return }
    setApplying(true)
    try {
      const r = await curriculumAPI.applyPresets(selected.code, {
        grade_level: gradeLevel.trim(),
        subject_names: checkedNames,
      })
      await curriculumAPI.setActive({ education_system_id: selected.id, onboarding_completed: true })
      setResult(r.data)
      setStep(3)
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to apply curriculum presets')
    } finally { setApplying(false) }
  }

  const skip = async () => {
    try { await curriculumAPI.setActive({ education_system_id: null, onboarding_completed: true }) } catch {}
    navigate('/subjects')
  }

  return (
    <div className="page-container">
      <motion.div className="page-header" initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}}>
        <div>
          <h1 className="page-title">Curriculum Setup</h1>
          <p className="page-subtitle">
            Pick your school's curriculum to pre-fill subjects with the right codes — or skip and add subjects manually.
          </p>
        </div>
        {step === 1 && (
          <button className="btn btn-ghost btn-sm" onClick={skip}>
            <SkipForward size={13}/> Skip for now
          </button>
        )}
      </motion.div>

      {/* ── STEP 1: pick a system ── */}
      {step === 1 && (
        <div className="curr-grid">
          {systems.map((sys, i) => {
            const meta = SYSTEM_META[sys.code] || { blurb: 'Custom curriculum', color: '#38bdf8', emoji: '📘' }
            return (
              <motion.button key={sys.id} className="curr-card"
                initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
                transition={{ delay: i * .06 }}
                style={{ '--curr-color': meta.color }}
                onClick={() => pickSystem(sys)}
                disabled={loadingPresets}>
                <div className="curr-card-emoji">{meta.emoji}</div>
                <div className="curr-card-name">{sys.name}</div>
                <div className="curr-card-blurb">{meta.blurb}</div>
                <div className="curr-card-levels">{(sys.levels || '').split(',').slice(0,4).join(' · ')}</div>
                {sys.has_presets
                  ? <span className="curr-card-badge"><Sparkles size={11}/> {SYSTEM_META[sys.code] ? 'Subject presets included' : ''}</span>
                  : <span className="curr-card-badge muted">Add subjects manually</span>}
              </motion.button>
            )
          })}
        </div>
      )}

      {/* ── STEP 2: preview + configure ── */}
      <AnimatePresence>
        {step === 2 && selected && (
          <motion.div className="card" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}>
            <div className="card-header">
              <div className="card-title" style={{ display:'flex', alignItems:'center', gap:9 }}>
                <BookOpen size={16} color="var(--blue-400)"/> {selected.name} — Starter Subjects
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
                <ArrowLeft size={13}/> Change curriculum
              </button>
            </div>

            <div className="form-group" style={{ maxWidth: 260 }}>
              <label className="form-label">Apply to Grade / Level</label>
              <select className="form-select" value={gradeLevel} onChange={e => setGradeLevel(e.target.value)}>
                {(selected.levels || '').split(',').map(l => l.trim()).filter(Boolean).map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <div className="form-hint">You can repeat this step for other grades from the Subjects page later.</div>
            </div>

            <div className="curr-preset-list">
              {presets.map(p => (
                <label key={p.name} className="curr-preset-row">
                  <input type="checkbox" checked={checkedNames.includes(p.name)}
                    onChange={() => toggleName(p.name)} />
                  <span className="curr-preset-dot" style={{ background: p.color_hex }}/>
                  <span className="curr-preset-name">{p.name}</span>
                  <span className="curr-preset-code">{p.subject_code}</span>
                  <span className="curr-preset-periods">{p.weekly_periods}×/wk</span>
                </label>
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', marginTop:18 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>
                {checkedNames.length} of {presets.length} subjects selected
              </span>
              <button className="btn btn-accent" onClick={applyAndFinish} disabled={applying}>
                {applying
                  ? <><Loader2 size={14} className="spinning"/> Applying…</>
                  : <>Apply & Continue <ArrowRight size={14}/></>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── STEP 3: done ── */}
      <AnimatePresence>
        {step === 3 && result && (
          <motion.div className="card" style={{ textAlign:'center', padding:'40px 24px' }}
            initial={{ opacity:0, scale:.96 }} animate={{ opacity:1, scale:1 }}>
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }}
              transition={{ type:'spring', stiffness:300, delay:.1 }}
              style={{ width:64, height:64, borderRadius:'50%', margin:'0 auto 18px',
                background:'rgba(74,222,128,.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Check size={30} color="#16a34a"/>
            </motion.div>
            <h3 style={{ fontSize:20, fontWeight:800, marginBottom:6 }}>Curriculum applied</h3>
            <p style={{ color:'var(--muted)', marginBottom:22 }}>{result.message}</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button className="btn btn-secondary" onClick={() => { setStep(1); setSelected(null) }}>
                <GraduationCap size={14}/> Add another grade
              </button>
              <button className="btn btn-accent" onClick={() => navigate('/subjects')}>
                Go to Subjects <ArrowRight size={14}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
