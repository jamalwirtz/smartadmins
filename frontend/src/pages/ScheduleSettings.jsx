import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { schoolAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Save, Clock, Coffee, Utensils, Calendar, Plus, Trash2 } from 'lucide-react'

const DAYS_ALL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const fade = { initial:{opacity:0,y:14}, animate:{opacity:1,y:0,transition:{duration:.25}} }

function Field({ label, hint, children }) {
  return (
    <div className="sched-field">
      <label className="sched-label">{label}</label>
      {hint && <span className="sched-hint">{hint}</span>}
      <div className="sched-control">{children}</div>
    </div>
  )
}

function NumInput({ value, onChange, min=1, max=20, unit='' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input type="number" className="sched-num" value={value}
        min={min} max={max}
        onChange={e => onChange(Math.min(max, Math.max(min, +e.target.value)))} />
      {unit && <span className="sched-unit">{unit}</span>}
    </div>
  )
}

export default function ScheduleSettings() {
  const [cfg,     setCfg]     = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [preview, setPreview] = useState([])

  const load = async () => {
    try {
      const r = await schoolAPI.getSettings()
      setCfg(r.data)
    } catch { toast.error('Failed to load settings') }
  }

  useEffect(() => { load() }, [])

  // Rebuild time preview whenever config changes
  useEffect(() => {
    if (!cfg) return
    const schedule = []
    const [h, m] = (cfg.start_time || '08:00').split(':').map(Number)
    let cur = h * 60 + m
    for (let p = 1; p <= (cfg.periods_per_day || 8); p++) {
      const st = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
      cur += (cfg.period_minutes || 45)
      const en = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
      schedule.push({ type:'period', label:`Period ${p}`, start:st, end:en })
      if (p === (cfg.break_after_period || 2)) {
        const bst = en
        cur += (cfg.break_minutes || 15)
        const ben = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
        schedule.push({ type:'break', label:'Break', start:bst, end:ben })
      }
      if (p === (cfg.lunch_after_period || 4)) {
        const lst = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
        cur += (cfg.lunch_minutes || 45)
        const len = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
        schedule.push({ type:'lunch', label:'Lunch', start:lst, end:len })
      }
    }
    setPreview(schedule)
  }, [cfg])

  const save = async () => {
    setSaving(true)
    try {
      await schoolAPI.updateSettings({
        start_time:          cfg.start_time,
        period_minutes:      cfg.period_minutes,
        periods_per_day:     cfg.periods_per_day,
        break_after_period:  cfg.break_after_period,
        break_minutes:       cfg.break_minutes,
        lunch_after_period:  cfg.lunch_after_period,
        lunch_minutes:       cfg.lunch_minutes,
        school_days:         cfg.school_days,
      })
      toast.success('Schedule settings saved ✅')
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const toggleDay = (day) => {
    const days = (cfg.school_days || '').split(',').map(d => d.trim()).filter(Boolean)
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day]
    // preserve Monday-first order
    const ordered = DAYS_ALL.filter(d => next.includes(d))
    setCfg(c => ({ ...c, school_days: ordered.join(',') }))
  }

  const activeDays = (cfg?.school_days || 'Monday,Tuesday,Wednesday,Thursday,Friday')
    .split(',').map(d => d.trim()).filter(Boolean)

  if (!cfg) return (
    <div style={{ display:'flex',justifyContent:'center',padding:60 }}>
      <div className="login-spinner" style={{ width:32,height:32,borderWidth:3,borderTopColor:'var(--amber)' }}/>
    </div>
  )

  return (
    <motion.div className="page-container" {...fade}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Schedule Configuration</h1>
          <p className="page-subtitle">Set period times, breaks, lunch, and school days</p>
        </div>
        <button className="btn btn-accent" onClick={save} disabled={saving}>
          <Save size={15}/> {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <div className="sched-layout">

        {/* ── Left: config ── */}
        <div className="sched-config-col">

          {/* School days */}
          <div className="sched-section">
            <div className="sched-section-title"><Calendar size={15}/> School Days</div>
            <div className="sched-days-grid">
              {DAYS_ALL.map(day => (
                <button key={day} type="button"
                  className={`sched-day-btn${activeDays.includes(day) ? ' active' : ''}`}
                  onClick={() => toggleDay(day)}>
                  {day.slice(0,3)}
                </button>
              ))}
            </div>
            <div className="sched-hint" style={{ marginTop:8 }}>
              {activeDays.length} school day{activeDays.length !== 1 ? 's' : ''} selected
            </div>
          </div>

          {/* Time settings */}
          <div className="sched-section">
            <div className="sched-section-title"><Clock size={15}/> Period Settings</div>
            <Field label="School Start Time" hint="When Period 1 begins">
              <input type="time" className="sched-time" value={cfg.start_time || '08:00'}
                onChange={e => setCfg(c => ({ ...c, start_time: e.target.value }))} />
            </Field>
            <Field label="Periods Per Day">
              <NumInput value={cfg.periods_per_day || 8} min={1} max={16}
                onChange={v => setCfg(c => ({ ...c, periods_per_day: v }))} unit="periods" />
            </Field>
            <Field label="Period Duration">
              <NumInput value={cfg.period_minutes || 45} min={20} max={120}
                onChange={v => setCfg(c => ({ ...c, period_minutes: v }))} unit="minutes" />
            </Field>
          </div>

          {/* Break */}
          <div className="sched-section">
            <div className="sched-section-title"><Coffee size={15}/> Break</div>
            <Field label="Break After Period" hint="Insert break after which period">
              <NumInput value={cfg.break_after_period || 2} min={1} max={cfg.periods_per_day || 8}
                onChange={v => setCfg(c => ({ ...c, break_after_period: v }))} />
            </Field>
            <Field label="Break Duration">
              <NumInput value={cfg.break_minutes || 15} min={5} max={60}
                onChange={v => setCfg(c => ({ ...c, break_minutes: v }))} unit="minutes" />
            </Field>
          </div>

          {/* Lunch */}
          <div className="sched-section">
            <div className="sched-section-title"><Utensils size={15}/> Lunch</div>
            <Field label="Lunch After Period">
              <NumInput value={cfg.lunch_after_period || 4} min={1} max={cfg.periods_per_day || 8}
                onChange={v => setCfg(c => ({ ...c, lunch_after_period: v }))} />
            </Field>
            <Field label="Lunch Duration">
              <NumInput value={cfg.lunch_minutes || 45} min={15} max={120}
                onChange={v => setCfg(c => ({ ...c, lunch_minutes: v }))} unit="minutes" />
            </Field>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="sched-preview-col">
          <div className="sched-section" style={{ position:'sticky', top:20 }}>
            <div className="sched-section-title">📅 Daily Schedule Preview</div>
            <div className="sched-preview-list">
              {preview.map((item, i) => (
                <motion.div key={i}
                  className={`sched-preview-row ${item.type}`}
                  initial={{ opacity:0, x:8 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay: i * 0.03 }}>
                  <div className="sched-preview-time">
                    {item.start}<span style={{ opacity:.4 }}> – </span>{item.end}
                  </div>
                  <div className="sched-preview-label">{item.label}</div>
                  <div className={`sched-preview-type-dot ${item.type}`} />
                </motion.div>
              ))}
              {preview.length === 0 && (
                <div style={{ color:'var(--muted)', fontSize:13, padding:'20px 0', textAlign:'center' }}>
                  Configure settings to see preview
                </div>
              )}
            </div>
            <div style={{ marginTop:14, fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
              <strong>School days:</strong> {activeDays.join(', ')}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
