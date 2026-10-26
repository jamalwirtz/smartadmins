import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Play, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { examsAPI } from '../api/client'
import { examExtrasAPI } from '../api/examExtras'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const toggle = (arr, id) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

/**
 * Generate form with a live "will this fit?" check (preflight).
 * Used by the guided setup wizard (step 4) and by the session screen.
 */
export default function ExamGenerateForm({
  session, subjects, classes, papersData, supervisors = [], rooms = [],
  onGenerated, onCancel, onConfigurePapers,
}) {
  const [f, setF] = useState({
    subject_ids: [], class_ids: [], start_period: 1, max_period: 8, max_per_day: 2,
    school_days: DAYS.slice(0, 5), exclude_text: '',
    auto_assign_supervisors: supervisors.length > 0,
    auto_assign_rooms: rooms.length > 0,
    clear_existing: false,
  })
  const [pre, setPre] = useState(null)
  const [checking, setChecking] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  // select everything once the lists arrive
  useEffect(() => {
    setF(s => ({
      ...s,
      subject_ids: s.subject_ids.length ? s.subject_ids : subjects.map(x => x.id),
      class_ids: s.class_ids.length ? s.class_ids : classes.map(x => x.id),
    }))
  }, [subjects, classes])

  const payload = useMemo(() => {
    const { exclude_text, ...rest } = f
    return { ...rest, exclude_dates: exclude_text.match(/\d{4}-\d{2}-\d{2}/g) || [] }
  }, [f])

  // live preflight, debounced
  useEffect(() => {
    if (!session?.id || !f.subject_ids.length || !f.class_ids.length || !f.school_days.length) {
      setPre(null); return
    }
    setChecking(true)
    const t = setTimeout(async () => {
      try { setPre((await examExtrasAPI.preflight(session.id, payload)).data) }
      catch (e) { setPre({ issues: [{ level: 'error', text: e?.response?.data?.detail || 'Could not check the plan' }], ready: false }) }
      finally { setChecking(false) }
    }, 500)
    return () => clearTimeout(t)
  }, [session?.id, payload]) // eslint-disable-line

  const hasPapers = (sid) => (papersData.find(p => p.subject_id === sid)?.papers || []).length > 0

  const run = async (e) => {
    e.preventDefault()
    setRunning(true)
    try {
      const r = (await examsAPI.generateSlots(session.id, payload)).data
      setResult(r)
      if (r.status === 'nothing_to_schedule') toast.error(r.message, { duration: 7000 })
      else {
        toast.success(r.message, { duration: 5000 })
        if (!r.unscheduled_count) onGenerated?.(r)
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Generation failed', { duration: 7000 })
    } finally { setRunning(false) }
  }

  const list = (title, items, key, meta) => (
    <div>
      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{title} <span className="exam-sel-count">({f[key].length} selected)</span></span>
        <span style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <a href="#" onClick={e => { e.preventDefault(); setF(s => ({ ...s, [key]: items.map(i => i.id) })) }}>All</a>
          <a href="#" onClick={e => { e.preventDefault(); setF(s => ({ ...s, [key]: [] })) }}>None</a>
        </span>
      </label>
      <div className="exam-check-list">
        {items.map(i => (
          <label key={i.id} className="exam-check-item">
            <input type="checkbox" checked={f[key].includes(i.id)}
              onChange={() => setF(s => ({ ...s, [key]: toggle(s[key], i.id) }))} />
            <span>{i.name}</span>
            {meta(i)}
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <form onSubmit={run}>
      <div className="exam-gen-grid">
        {list('Subjects', subjects, 'subject_ids', s =>
          hasPapers(s.id)
            ? <span className="exam-check-meta">Gr {s.grade_level}</span>
            : <span className="exam-check-meta" style={{ color: '#ef4444' }}>no papers</span>)}
        {list('Classes', classes, 'class_ids', c => <span className="exam-check-meta">Gr {c.grade_level}</span>)}
      </div>

      <div className="exam-gen-options" style={{ marginTop: 16 }}>
        <div className="form-group">
          <label className="form-label">First period of the day</label>
          <input type="number" className="form-input" min={1} max={12} value={f.start_period}
            onChange={e => setF(s => ({ ...s, start_period: +e.target.value || 1 }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Exams per class per day</label>
          <input type="number" className="form-input" min={1} max={6} value={f.max_per_day}
            onChange={e => setF(s => ({ ...s, max_per_day: +e.target.value || 1 }))} />
        </div>
        <div>
          <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>Exam days</label>
          <div className="exam-day-toggles">
            {DAYS.map(d => (
              <button key={d} type="button" className={`exam-day-btn${f.school_days.includes(d) ? ' active' : ''}`}
                onClick={() => setF(s => ({ ...s, school_days: toggle(s.school_days, d) }))}>{d.slice(0, 3)}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="form-group" style={{ marginTop: 12 }}>
        <label className="form-label">Dates to skip (public holidays, sports day…)</label>
        <input className="form-input" value={f.exclude_text} placeholder="e.g. 2026-10-20, 2026-10-27"
          onChange={e => setF(s => ({ ...s, exclude_text: e.target.value }))} />
        <div className="form-hint">Type dates as YYYY-MM-DD, separated by commas.</div>
      </div>

      <div className="exam-gen-toggles">
        <label className="exam-gen-toggle-row">
          <input type="checkbox" checked={f.auto_assign_supervisors}
            onChange={e => setF(s => ({ ...s, auto_assign_supervisors: e.target.checked }))} />
          <div>
            <div className="exam-gen-toggle-label">Assign supervisors automatically ({supervisors.length} available)</div>
            <div className="exam-gen-toggle-hint">Respects each person's available days and daily limit; never double-books.</div>
          </div>
        </label>
        <label className="exam-gen-toggle-row">
          <input type="checkbox" checked={f.auto_assign_rooms}
            onChange={e => setF(s => ({ ...s, auto_assign_rooms: e.target.checked }))} />
          <div>
            <div className="exam-gen-toggle-label">Assign rooms automatically ({rooms.length} available)</div>
            <div className="exam-gen-toggle-hint">Picks the smallest room that fits the class; practicals prefer labs.</div>
          </div>
        </label>
        <label className="exam-gen-toggle-row">
          <input type="checkbox" checked={f.clear_existing}
            onChange={e => setF(s => ({ ...s, clear_existing: e.target.checked }))} />
          <div>
            <div className="exam-gen-toggle-label">Start over (replace slots that are not locked)</div>
            <div className="exam-gen-toggle-hint">Use this to re-run after changing settings. Locked slots are kept.</div>
          </div>
        </label>
      </div>

      {/* ── Preflight ── */}
      <div className="wiz-info-banner" style={{ marginTop: 14, flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          {checking ? <Loader2 size={14} className="spinning" /> : pre?.ready ? <CheckCircle2 size={14} color="#16a34a" /> : <Info size={14} />}
          {checking ? 'Checking the plan…' : pre
            ? (pre.ready
              ? `${pre.total_papers} papers over ${pre.exam_days} exam day(s) — ${pre.first_date} → ${pre.last_date}`
              : 'Plan needs attention')
            : 'Select subjects, classes and exam days'}
        </div>
        {pre?.classes?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pre.classes.map(c => (
              <span key={c.class_id} className="exam-tpl-pill"
                style={{ color: c.fits ? '#16a34a' : '#ef4444', borderColor: c.fits ? undefined : '#ef4444' }}>
                {c.class_name}: {c.papers} / {c.capacity}
              </span>
            ))}
          </div>
        )}
        {(pre?.issues || []).map((i, k) => (
          <div key={k} style={{ display: 'flex', gap: 6, fontSize: 12, color: i.level === 'error' ? '#ef4444' : '#b45309' }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{i.text}</span>
          </div>
        ))}
        {pre?.no_papers?.length > 0 && onConfigurePapers && (
          <a href="#" style={{ fontSize: 12 }} onClick={e => { e.preventDefault(); onConfigurePapers() }}>Configure papers →</a>
        )}
      </div>

      {result?.unscheduled_count > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="wiz-info-banner"
          style={{ marginTop: 12, background: 'rgba(239,68,68,.07)', borderColor: 'rgba(239,68,68,.3)', flexDirection: 'column' }}>
          <strong>{result.unscheduled_count} paper(s) did not fit and were left out:</strong>
          <ul style={{ margin: '4px 0 0 18px', fontSize: 12 }}>
            {result.unscheduled.map(u => <li key={u}>{u}</li>)}
          </ul>
          <div style={{ fontSize: 12 }}>Increase "exams per class per day", add exam days, or widen the session dates, then tick "Start over" and generate again.</div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGenerated?.(result)}>Open timetable anyway</button>
        </motion.div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        {onCancel && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn btn-accent" disabled={running || checking || pre?.ready === false}>
          {running ? <><Loader2 size={14} className="spinning" /> Generating…</> : <><Play size={14} /> Generate Schedule</>}
        </button>
      </div>
    </form>
  )
}
