import AIAssistant from '../components/AIAssistant'
import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext, DragOverlay, closestCenter,
  useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { schedulesAPI, exportAPI, schoolAPI } from '../api/client'
import { useDraftWS } from '../hooks/useWebSocket'
import toast from 'react-hot-toast'
import {
  Zap, RefreshCw, Lock, Unlock, Download, CheckCircle, Check,
  Trash2, ShieldCheck, Users, Eye, Palette, X, CalendarDays, Pencil, Plus
} from 'lucide-react'

const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const PERIODS = [1,2,3,4,5,6,7,8]

// ── Slot type definitions ─────────────────────────────────────────────────────
const SLOT_TYPES = {
  lesson:   { label:'Lesson',    color:'#2952a3', bg:'rgba(41,82,163,.1)',   icon:'📚', dark:false },
  break:    { label:'Break',     color:'#f59e0b', bg:'rgba(245,158,11,.12)', icon:'☕', dark:false },
  lunch:    { label:'Lunch',     color:'#10b981', bg:'rgba(16,185,129,.12)', icon:'🍽️', dark:false },
  assembly: { label:'Assembly',  color:'#8b5cf6', bg:'rgba(139,92,246,.12)', icon:'🎓', dark:false },
  devotion: { label:'Devotion',  color:'#f97316', bg:'rgba(249,115,22,.12)', icon:'🙏', dark:false },
  event:    { label:'Event',     color:'#ec4899', bg:'rgba(236,72,153,.12)', icon:'📌', dark:false },
  free:     { label:'Free',      color:'#64748b', bg:'rgba(100,116,139,.1)', icon:'💤', dark:false },
}

// ── Draggable timetable cell ──────────────────────────────────────────────────
function TimetableCell({ slot, onLock, onEditSlot }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: slot?.id || '__empty__',
    disabled: !slot || slot.is_locked,
    data: { slot },
  })

  const style = transform
    ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex:999, opacity:0.85 }
    : {}

  if (!slot) {
    return (
      <div className="tt-cell empty">
        <div style={{ flex:1 }} />
      </div>
    )
  }

  const stype    = SLOT_TYPES[slot.slot_type] || SLOT_TYPES.lesson
  const isSpecial = slot.slot_type && slot.slot_type !== 'lesson'
  const bg       = isSpecial ? stype.bg
    : slot.subject_color ? `${slot.subject_color}1a` : '#f0f4ff'
  const border   = isSpecial ? `${stype.color}55`
    : slot.subject_color ? `${slot.subject_color}40` : 'var(--border)'
  const textCol  = isSpecial ? stype.color : (slot.subject_color || 'var(--navy-900)')

  return (
    <motion.div
      ref={setNodeRef}
      className={`tt-cell${slot.is_locked ? ' locked' : ''}${isSpecial ? ' tt-cell-special' : ''}`}
      style={{ background:bg, borderColor:border, ...style }}
      layout initial={{ opacity:0, scale:0.9 }}
      animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.8 }}
      transition={{ duration:0.2 }}
      {...(slot.is_locked ? {} : { ...attributes, ...listeners })}>

      {isSpecial ? (
        <div className="tt-cell-special-inner">
          <span className="tt-cell-type-icon">{stype.icon}</span>
          <span className="tt-cell-type-label" style={{ color: textCol }}>
            {slot.event_label || stype.label}
          </span>
        </div>
      ) : (
        <>
          <div className="tt-cell-subject" style={{ color: textCol }}>
            {slot.subject_name}
          </div>
          <div className="tt-cell-teacher">{slot.teacher_name}</div>
          {slot.class_name && <div className="tt-cell-class">{slot.class_name}</div>}
        </>
      )}
      {slot.notes && <div className="tt-cell-note-dot" title={slot.notes}>📝</div>}

      <div className="tt-cell-btns">
        <button className="tt-lock-btn"
          onClick={e => { e.stopPropagation(); onLock(slot) }}
          title={slot.is_locked ? 'Unlock slot' : 'Lock slot'}>
          {slot.is_locked ? <Lock size={9} color="var(--amber)"/> : <Unlock size={9} color="var(--muted)"/>}
        </button>
        <button className="tt-edit-slot-btn"
          onClick={e => { e.stopPropagation(); onEditSlot && onEditSlot(slot) }}
          title="Change slot type">
          <Pencil size={9}/>
        </button>
      </div>
    </motion.div>
  )
}

// ── Droppable cell wrapper ────────────────────────────────────────────────────
function DroppableCell({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`tt-cell-wrapper${isOver ? ' drag-over' : ''}`}
      style={{ borderRadius: 'var(--r-sm)', overflow:'hidden', transition:'background 0.1s' }}>
      {children}
    </div>
  )
}

// ── Timetable grid ────────────────────────────────────────────────────────────
function TimetableGrid({ slots, classes, onLock, onMove, activeDraftId }) {
  const [selectedClass, setSelectedClass] = useState('')
  const [activeSlot, setActiveSlot] = useState(null)

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]?.id || '')
  }, [classes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const slotMap = {}
  slots.filter(s => !selectedClass || s.class_id === selectedClass)
       .forEach(s => { slotMap[`${s.day}-${s.period}`] = s })

  const handleDragStart = (e) => {
    setActiveSlot(e.active.data.current?.slot || null)
  }

  const handleDragEnd = async ({ active, over }) => {
    setActiveSlot(null)
    if (!over || !active.data.current?.slot) return
    const slot = active.data.current.slot
    const [newDay, newPeriod] = over.id.toString().split('-')
    const period = parseInt(newPeriod, 10)
    if (slot.day === newDay && slot.period === period) return

    // Optimistic UI update
    const key = `${slot.day}-${slot.period}`
    const targetKey = `${newDay}-${newPeriod}`
    const targetSlot = slotMap[targetKey]

    try {
      if (targetSlot && !targetSlot.is_locked) {
        // Swap
        await schedulesAPI.swapSlots(slot.id, targetSlot.id)
        toast.success('Slots swapped', { icon: '🔄' })
      } else if (!targetSlot) {
        // Move
        await schedulesAPI.moveSlot(slot.id, newDay, period)
        toast.success('Slot moved', { icon: '✅' })
      } else {
        toast.error('Target slot is locked')
      }
      onMove()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Move failed')
    }
  }

  const overlaySlot = activeSlot
  const overlayBg = overlaySlot?.subject_color ? `${overlaySlot.subject_color}22` : '#f0f4ff'

  return (
    <div>
      {/* Class selector */}
      <div className="flex-row mb-4" style={{ flexWrap:'wrap', gap:6 }}>
        <span className="text-muted text-sm" style={{ fontWeight:700 }}>Class:</span>
        {classes.map(c => (
          <motion.button
            key={c.id}
            className={`btn btn-sm ${selectedClass === c.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedClass(c.id)}
            whileHover={{ scale:1.04 }}
            whileTap={{ scale:0.96 }}
          >
            {c.class_name}
          </motion.button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="tt-wrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th style={{ width:52, minWidth:52 }}>P</th>
                {DAYS.map(d => <th key={d}>{d.slice(0,3)}</th>)}
              </tr>
            </thead>
            <AnimatePresence>
              <tbody>
                {PERIODS.map(p => (
                  <tr key={p}>
                    <td><div className="tt-period-label">P{p}</div></td>
                    {DAYS.map(d => {
                      const slot = slotMap[`${d}-${p}`]
                      const cellId = `${d}-${p}`
                      return (
                        <td key={d} style={{ padding:0, border:'none' }}>
                          <DroppableCell id={cellId}>
                            <TimetableCell
                              slot={slot || null}
                              onLock={onLock}
                            />
                          </DroppableCell>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </AnimatePresence>
          </table>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={{ duration:180, easing:'ease' }}>
          {activeSlot && (
            <div className="tt-cell drag-overlay" style={{ background: overlayBg, width:130, minHeight:68, padding:'8px 10px' }}>
              <div className="tt-cell-subject">{activeSlot.subject_name}</div>
              <div className="tt-cell-teacher">{activeSlot.teacher_name}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <p className="text-muted text-xs mt-4">
        Drag cells to move or swap. Click 🔒 to lock a slot. Locked slots survive reshuffles.
      </p>
    </div>
  )
}

// ── Draft card ────────────────────────────────────────────────────────────────
function DraftCard({ draft, isSelected, onSelect, onActivate, onDelete }) {
  return (
    <motion.div
      className={`draft-card${draft.status === 'active' ? ' active-draft' : ''}${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(draft.id)}
      layout
      initial={{ opacity:0, scale:0.95 }}
      animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0, scale:0.9, transition:{ duration:0.15 } }}
      whileHover={{ y:-3 }}
      transition={{ duration:0.2 }}
    >
      <div className="flex-between">
        <div className="draft-card-name">{draft.name}</div>
        <span className={`badge ${draft.status==='active'?'badge-teal':draft.status==='archived'?'badge-grey':'badge-blue'}`}>
          {draft.status}
        </span>
      </div>
      <div className="draft-card-meta">{draft.slot_count} slots &bull; seed {draft.seed}</div>
      <div className="draft-card-actions" onClick={e => e.stopPropagation()}>
        <button className="btn btn-ghost btn-xs" onClick={() => onSelect(draft.id)}>
          <Eye size={11} /> View
        </button>
        {draft.status !== 'active' && (
          <button className="btn btn-teal btn-xs" onClick={() => onActivate(draft.id)}>
            <CheckCircle size={11} /> Activate
          </button>
        )}
        <button className="btn btn-danger btn-xs" onClick={() => onDelete(draft.id)}>
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  )
}

// ── Main Timetable page ───────────────────────────────────────────────────────
export default function Timetable() {
  const [drafts, setDrafts] = useState([])
  const [selectedDraftId, setSelectedDraftId] = useState(null)
  const [draftDetail, setDraftDetail] = useState(null)
  const [classes, setClasses] = useState([])
  const [generating, setGenerating] = useState(false)
  const [reshuffling, setReshuffling] = useState(false)
  const [validating,    setValidating]    = useState(false)
  const [validation,    setValidation]    = useState(null)
  const [showPdfPanel,  setShowPdfPanel]  = useState(false)
  const [schoolCfg,     setSchoolCfg]     = useState(null)
  const [savingPdf,     setSavingPdf]     = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const loadDrafts = useCallback(() =>
    schedulesAPI.drafts().then(r => {
      setDrafts(r.data)
      const active = r.data.find(d => d.status === 'active')
      if (active && !selectedDraftId) setSelectedDraftId(active.id)
    })
  , []) // eslint-disable-line

  const loadDetail = useCallback((id) => {
    setLoadingDetail(true)
    schedulesAPI.getDraft(id).then(r => {
      setDraftDetail(r.data)
      const seen = new Set()
      const cls = []
      r.data.slots.forEach(s => {
        if (!seen.has(s.class_id)) { seen.add(s.class_id); cls.push({ id: s.class_id, class_name: s.class_name }) }
      })
      setClasses(cls)
    }).finally(() => setLoadingDetail(false))
  }, [])

  useEffect(() => { loadDrafts() }, [loadDrafts])
  useEffect(() => {
    schoolAPI.getSettings().then(r => setSchoolCfg(r.data)).catch(() => {})
  }, [])
  useEffect(() => { if (selectedDraftId) loadDetail(selectedDraftId) }, [selectedDraftId, loadDetail])

  // Real-time WebSocket
  const { connected, viewers } = useDraftWS(selectedDraftId, (msg) => {
    if (msg.event === 'slot_moved' || msg.event === 'slots_swapped') {
      loadDetail(selectedDraftId)
    } else if (msg.event === 'slot_locked') {
      setDraftDetail(prev => {
        if (!prev) return prev
        return { ...prev, slots: prev.slots.map(s => s.id === msg.slot_id ? { ...s, is_locked: msg.is_locked } : s) }
      })
    } else if (msg.event === 'draft_reshuffled') {
      loadDetail(selectedDraftId)
      toast('Timetable was reshuffled by another user', { icon: '🔄' })
    }
  })

  const generate = async () => {
    setGenerating(true)
    try {
      const r = await schedulesAPI.generate(3)
      toast.success(`Generated ${r.data.length} drafts!`)
      await loadDrafts()
      setSelectedDraftId(r.data[0].id)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Generation failed — add teachers, subjects, classes first')
    } finally { setGenerating(false) }
  }

  const reshuffle = async () => {
    if (!selectedDraftId) return
    setReshuffling(true)
    try {
      await schedulesAPI.reshuffle(selectedDraftId, null, true)
      toast.success('Reshuffled! Locked slots preserved.')
      loadDetail(selectedDraftId)
    } catch { toast.error('Reshuffle failed') }
    finally { setReshuffling(false) }
  }

  const activate = async (id) => {
    await schedulesAPI.activate(id)
    toast.success('Draft activated!')
    loadDrafts()
  }

  const deleteDraft = async (id) => {
    if (!confirm('Delete this draft?')) return
    await schedulesAPI.deleteDraft(id)
    toast.success('Deleted')
    if (selectedDraftId === id) { setDraftDetail(null); setSelectedDraftId(null) }
    loadDrafts()
  }

  const toggleLock = async (slot) => {
    try {
      await schedulesAPI.lockSlot(slot.id, !slot.is_locked)
    } catch { toast.error('Lock failed') }
  }

  const validate = async () => {
    if (!selectedDraftId) return
    setValidating(true)
    try {
      const r = await schedulesAPI.validate(selectedDraftId)
      setValidation(r.data)
      if (r.data.valid) toast.success('No conflicts found!', { icon: '✅' })
      else toast.error(`${r.data.errors.length} conflict(s) detected`, { icon: '⚠️' })
    } finally { setValidating(false) }
  }

  const savePdfCfg = async (updates) => {
    setSavingPdf(true)
    try {
      await schoolAPI.updateSettings(updates)
      setSchoolCfg(c => ({ ...c, ...updates }))
      toast.success('PDF settings saved ✅')
    } catch { toast.error('Save failed') }
    finally { setSavingPdf(false) }
  }

  const downloadPdf = async () => {
    if (!selectedDraftId) return
    try {
      const r = await exportAPI.draftPdf(selectedDraftId)
      const url = URL.createObjectURL(new Blob([r.data], { type:'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `timetable_${draftDetail?.name || 'draft'}.pdf`; a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded')
    } catch { toast.error('PDF export failed — ensure ReportLab is installed') }
  }

  const currentDraft = drafts.find(d => d.id === selectedDraftId)

  return (
    <>
      <div className="topbar">
        <div className="flex-row gap-2">
          <div className="topbar-title">Timetable</div>
          {selectedDraftId && connected && (
            <div className="live-dot">
              <div className="live-dot-pulse" />
              LIVE
            </div>
          )}
          {viewers > 0 && (
            <div className="viewer-badge">
              <Users size={10} style={{ marginRight:3 }} />{viewers} viewing
            </div>
          )}
        </div>
        <div className="topbar-actions">
          <motion.button
            className="btn btn-accent"
            onClick={generate}
            disabled={generating}
            whileHover={{ scale:1.03 }}
            whileTap={{ scale:0.97 }}
          >
            <Zap size={14} /> {generating ? 'Generating…' : 'Generate 3 Drafts'}
          </motion.button>
          {selectedDraftId && <>
            <button className="btn btn-ghost btn-sm" onClick={reshuffle} disabled={reshuffling}>
              <RefreshCw size={13} className={reshuffling ? 'spinning' : ''} />
              {reshuffling ? 'Reshuffling…' : 'Reshuffle'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={validate} disabled={validating}>
              <ShieldCheck size={13} /> Validate
            </button>
            <button className="btn btn-teal btn-sm" onClick={downloadPdf}>
              <Download size={13} /> PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPdfPanel(p => !p)}
              title="PDF & export settings" style={{padding:'5px 8px'}}>
              <Palette size={13} />
            </button>
          </>}
        </div>
      </div>

      <div className="page">
        {/* Validation result */}
        <AnimatePresence>
          {validation && (
            <motion.div
              initial={{ opacity:0, y:-10 }}
              animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-10 }}
              className="card mb-4"
              style={{
                borderLeft: `4px solid ${validation.valid ? 'var(--green-dark)' : 'var(--red)'}`,
                background: validation.valid ? 'linear-gradient(135deg,#f0fdf4,#fff)' : 'linear-gradient(135deg,#fef2f2,#fff)',
              }}
            >
              <div className="flex-between">
                <div className="flex-row">
                  <ShieldCheck size={16} color={validation.valid ? 'var(--green-dark)' : 'var(--red)'} />
                  <strong style={{ color: validation.valid ? 'var(--green-dark)' : 'var(--red)' }}>
                    {validation.valid ? 'No conflicts found!' : `${validation.errors.length} conflict(s) detected`}
                  </strong>
                  <span className="text-muted text-xs">({validation.total_slots} total slots)</span>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => setValidation(null)}>✕</button>
              </div>
              {!validation.valid && (
                <ul style={{ marginTop:10, paddingLeft:20, fontSize:12, color:'var(--red)' }}>
                  {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Draft cards */}
        <AnimatePresence>
          {drafts.length > 0 && (
            <motion.div
              className="card mb-4"
              initial={{ opacity:0, y:10 }}
              animate={{ opacity:1, y:0 }}
            >
              <div className="card-header">
                <div className="card-title">Drafts</div>
                <span className="badge badge-blue">{drafts.length}</span>
              </div>
              <div className="draft-cards">
                <AnimatePresence>
                  {drafts.map(d => (
                    <DraftCard
                      key={d.id}
                      draft={d}
                      isSelected={selectedDraftId === d.id}
                      onSelect={setSelectedDraftId}
                      onActivate={activate}
                      onDelete={deleteDraft}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timetable grid */}
        {loadingDetail ? (
          <div className="spinner-wrap"><div className="spinner" /></div>
        ) : draftDetail ? (
          <motion.div
            className="card"
            key={draftDetail.id}
            initial={{ opacity:0, y:16 }}
            animate={{ opacity:1, y:0 }}
            transition={{ duration:0.3 }}
          >
            <div className="card-header">
              <div className="flex-row">
                <div className="card-title">{draftDetail.name}</div>
                <span className={`badge ${draftDetail.status==='active'?'badge-teal':draftDetail.status==='archived'?'badge-grey':'badge-blue'}`}>
                  {draftDetail.status}
                </span>
              </div>
              <div className="text-muted text-xs">{draftDetail.slots?.length} slots</div>
            </div>
            <TimetableGrid
              slots={draftDetail.slots || []}
              classes={classes}
              onLock={toggleLock}
              onMove={() => loadDetail(selectedDraftId)}
              activeDraftId={selectedDraftId}
            />
          </motion.div>
        ) : (
          <motion.div className="card" initial={{ opacity:0 }} animate={{ opacity:1 }}>
            <div className="empty-state">
              <div className="empty-state-icon"><CalendarDaysIcon size={52} /></div>
              <div className="empty-state-title">
                {drafts.length === 0 ? 'No drafts yet' : 'Select a draft to view the grid'}
              </div>
              <div className="empty-state-sub">
                {drafts.length === 0
                  ? 'Add teachers, subjects, classes — then click "Generate 3 Drafts"'
                  : 'Click any draft card above'}
              </div>
              {drafts.length === 0 && (
                <motion.button
                  className="btn btn-accent"
                  style={{ marginTop:16 }}
                  onClick={generate}
                  disabled={generating}
                  whileHover={{ scale:1.04 }}
                  whileTap={{ scale:0.97 }}
                >
                  <Zap size={14} /> Generate Now
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </div>
      {/* ── PDF & Theme panel ── */}
      <AnimatePresence>
        {showPdfPanel && schoolCfg && (
          <motion.div className="tt-pdf-panel"
            initial={{opacity:0,x:320}} animate={{opacity:1,x:0}} exit={{opacity:0,x:320}}>
            <div className="tt-pdf-panel-header">
              <span className="tt-pdf-panel-title">PDF & Export Settings</span>
              <button className="wizard-close" onClick={() => setShowPdfPanel(false)}>
                <X size={15}/>
              </button>
            </div>

            <div className="tt-pdf-panel-body">
              <div className="tt-pdf-section-label">Colour Theme</div>
              <div className="tt-pdf-themes">
                {[
                  {id:'navy', label:'Navy',  colors:['#1A237E','#E8EAF6','#9FA8DA']},
                  {id:'green',label:'Green', colors:['#1B5E20','#E8F5E9','#A5D6A7']},
                  {id:'amber',label:'Amber', colors:['#E65100','#FFF3E0','#FFCC80']},
                  {id:'rose', label:'Rose',  colors:['#880E4F','#FCE4EC','#F48FB1']},
                  {id:'slate',label:'Slate', colors:['#263238','#ECEFF1','#B0BEC5']},
                ].map(t => (
                  <button key={t.id}
                    className={`tt-pdf-theme-btn${schoolCfg.timetable_theme===t.id?' active':''}`}
                    onClick={() => savePdfCfg({ timetable_theme: t.id })}>
                    <div className="tt-pdf-swatches">
                      {t.colors.map((c,i) => <div key={i} style={{background:c,flex:1}}/>)}
                    </div>
                    <span>{t.label}</span>
                    {schoolCfg.timetable_theme===t.id && <Check size={10} style={{marginLeft:'auto',color:'var(--amber)'}}/>}
                  </button>
                ))}
              </div>

              <div className="tt-pdf-section-label" style={{marginTop:16}}>Badge Position on PDF</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {['top-left','top-center','top-right'].map(pos => (
                  <button key={pos}
                    className={`tt-pdf-pos-btn${schoolCfg.badge_position===pos?' active':''}`}
                    onClick={() => savePdfCfg({ badge_position: pos })}>
                    {pos.replace('top-','').replace('-',' ')}
                    {schoolCfg.badge_position===pos && <Check size={10}/>}
                  </button>
                ))}
              </div>

              <div className="tt-pdf-section-label" style={{marginTop:16}}>Orientation</div>
              <div style={{display:'flex',gap:8}}>
                {[{id:'horizontal',label:'Horizontal'},{id:'vertical',label:'Vertical'}].map(o => (
                  <button key={o.id}
                    className={`tt-pdf-pos-btn${schoolCfg.timetable_orientation===o.id?' active':''}`}
                    onClick={() => savePdfCfg({ timetable_orientation: o.id })}>
                    {o.label}
                    {schoolCfg.timetable_orientation===o.id && <Check size={10}/>}
                  </button>
                ))}
              </div>

              <div style={{marginTop:20,display:'flex',gap:8}}>
                <button className="btn btn-accent" style={{flex:1}} onClick={downloadPdf}
                  disabled={!selectedDraftId}>
                  <Download size={13}/> Download PDF
                </button>
              </div>
              {savingPdf && <div style={{fontSize:11,color:'var(--muted)',textAlign:'center',marginTop:6}}>Saving…</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AIAssistant context="timetable" />
    </>
  )
}

function CalendarDaysIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
