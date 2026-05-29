import { useEffect, useState } from 'react'
import { teachersAPI, subjectsAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, BookOpen, X } from 'lucide-react'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const empty = { name: '', email: '', is_part_time: false, max_weekly_hours: 30, days_off: '', unavailable_slots: '' }

export default function Teachers() {
  const [teachers, setTeachers] = useState([])
  const [subjects, setSubjects] = useState([])
  const [modal, setModal] = useState(null)       // null | 'create' | 'edit' | 'subjects'
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [subjectTarget, setSubjectTarget] = useState(null)
  const [selectedSubs, setSelectedSubs] = useState([])
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([teachersAPI.list(), subjectsAPI.list()])
    .then(([t, s]) => { setTeachers(t.data); setSubjects(s.data) })

  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(empty); setEditId(null); setModal('create') }
  const openEdit = (t) => {
    setForm({ name: t.name, email: t.email || '', is_part_time: t.is_part_time,
              max_weekly_hours: t.max_weekly_hours, days_off: t.days_off || '',
              unavailable_slots: t.unavailable_slots || '' })
    setEditId(t.id); setModal('edit')
  }
  const openSubjects = (t) => {
    setSubjectTarget(t)
    setSelectedSubs(t.subject_ids || [])
    setModal('subjects')
  }

  const save = async () => {
    setSaving(true)
    try {
      if (modal === 'create') await teachersAPI.create(form)
      else await teachersAPI.update(editId, form)
      toast.success('Saved!')
      setModal(null); load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error saving')
    } finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this teacher?')) return
    await teachersAPI.delete(id)
    toast.success('Deleted'); load()
  }

  const saveSubjects = async () => {
    setSaving(true)
    try {
      await teachersAPI.assignSubjects(subjectTarget.id, selectedSubs)
      toast.success('Subjects assigned'); setModal(null); load()
    } catch { toast.error('Error') } finally { setSaving(false) }
  }

  const toggleDay = (day) => {
    const list = form.days_off ? form.days_off.split(',').map(d => d.trim()).filter(Boolean) : []
    const updated = list.includes(day) ? list.filter(d => d !== day) : [...list, day]
    setForm(f => ({ ...f, days_off: updated.join(',') }))
  }
  const daysOffList = form.days_off ? form.days_off.split(',').map(d => d.trim()).filter(Boolean) : []

  return (
    <>
      <div className="topbar">
        <h2>Teachers</h2>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Teacher</button>
        </div>
      </div>
      <div className="page">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Status</th>
                  <th>Max Hrs/Week</th><th>Days Off</th><th>Subjects</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 && (
                  <tr><td colSpan={7} className="empty-state">No teachers yet. Add one to get started.</td></tr>
                )}
                {teachers.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="text-muted">{t.email || '—'}</td>
                    <td>
                      <span className={`badge ${t.is_part_time ? 'badge-amber' : 'badge-green'}`}>
                        {t.is_part_time ? 'Part-time' : 'Full-time'}
                      </span>
                    </td>
                    <td>{t.max_weekly_hours}</td>
                    <td className="text-muted text-sm">{t.days_off || '—'}</td>
                    <td>
                      <span className="badge badge-blue">{t.subject_ids?.length || 0} subjects</span>
                    </td>
                    <td>
                      <div className="flex-row">
                        <button className="btn btn-ghost btn-sm" onClick={() => openSubjects(t)} title="Assign subjects">
                          <BookOpen size={13} />
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{modal === 'create' ? 'Add Teacher' : 'Edit Teacher'}</div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Max Weekly Hours</label>
                <input className="form-input" type="number" min={1} max={45} value={form.max_weekly_hours}
                  onChange={e => setForm(f => ({ ...f, max_weekly_hours: +e.target.value }))} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_part_time}
                    onChange={e => setForm(f => ({ ...f, is_part_time: e.target.checked }))} />
                  Part-time teacher
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Days Off</label>
              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {DAYS.map(d => (
                  <button key={d} type="button"
                    className={`btn btn-sm ${daysOffList.includes(d) ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => toggleDay(d)}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
              <p className="form-hint">Click days this teacher is NOT available</p>
            </div>
            <div className="form-group">
              <label className="form-label">Unavailable Periods (JSON)</label>
              <input className="form-input" value={form.unavailable_slots} placeholder='{"Monday":[1,2]}'
                onChange={e => setForm(f => ({ ...f, unavailable_slots: e.target.value }))} />
              <p className="form-hint">Format: {`{"Monday":[1,2],"Friday":[8]}`}</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>
                {saving ? 'Saving…' : 'Save Teacher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subject assignment modal */}
      {modal === 'subjects' && subjectTarget && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Assign Subjects — {subjectTarget.name}</div>
            <p className="text-muted text-sm mb-4">Select all subjects this teacher can teach:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {subjects.map(s => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', border: '1px solid var(--border)',
                  borderRadius: 8, cursor: 'pointer',
                  background: selectedSubs.includes(s.id) ? '#eef2ff' : 'var(--surface)' }}>
                  <input type="checkbox" checked={selectedSubs.includes(s.id)}
                    onChange={() => setSelectedSubs(prev =>
                      prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                    )} />
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="badge badge-grey">Gr {s.grade_level}</span>
                  <span className="text-muted text-sm">{s.weekly_periods}×/wk</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSubjects} disabled={saving}>
                {saving ? 'Saving…' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
