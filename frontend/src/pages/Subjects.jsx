import { useEffect, useState } from 'react'
import { subjectsAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const empty = { name: '', grade_level: '', weekly_periods: 4, allows_double_period: false, is_static_eligible: false, color_hex: '#1565c0' }
const COLORS = ['#1565c0','#6a1b9a','#2e7d32','#bf360c','#0277bd','#e65100','#558b2f','#004d40','#4a148c','#880e4f']

export default function Subjects() {
  const [subjects, setSubjects] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => subjectsAPI.list().then(r => setSubjects(r.data))
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = (s) => {
    setForm({ name: s.name, grade_level: s.grade_level, weekly_periods: s.weekly_periods,
              allows_double_period: s.allows_double_period, is_static_eligible: s.is_static_eligible,
              color_hex: s.color_hex || '#1565c0' })
    setEditId(s.id); setModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (!editId) await subjectsAPI.create(form)
      else await subjectsAPI.update(editId, form)
      toast.success('Saved!'); setModal(false); load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Error') }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete subject?')) return
    await subjectsAPI.delete(id); toast.success('Deleted'); load()
  }

  // Group by grade
  const grades = [...new Set(subjects.map(s => s.grade_level))].sort()

  return (
    <>
      <div className="topbar">
        <h2>Subjects</h2>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Subject</button>
        </div>
      </div>
      <div className="page">
        {grades.map(grade => (
          <div key={grade} className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">Grade {grade}</div>
              <span className="badge badge-blue">{subjects.filter(s => s.grade_level === grade).length} subjects</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Subject</th><th>Periods/Week</th><th>Double Period</th><th>Static Lock</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {subjects.filter(s => s.grade_level === grade).map(s => (
                    <tr key={s.id}>
                      <td>
                        <div className="flex-row">
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: s.color_hex || '#999', flexShrink: 0 }} />
                          <strong>{s.name}</strong>
                        </div>
                      </td>
                      <td><span className="badge badge-blue">{s.weekly_periods}×</span></td>
                      <td>{s.allows_double_period ? '✅' : '—'}</td>
                      <td>{s.is_static_eligible ? '🔒 Eligible' : '—'}</td>
                      <td>
                        <div className="flex-row">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><Pencil size={13} /></button>
                          <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {subjects.length === 0 && (
          <div className="empty-state">No subjects yet. Add subjects to begin scheduling.</div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? 'Edit Subject' : 'Add Subject'}</div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Subject Name *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Grade Level *</label>
                <input className="form-input" value={form.grade_level} placeholder="7, 8, Form3…"
                  onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Weekly Periods</label>
              <input className="form-input" type="number" min={1} max={10} value={form.weekly_periods}
                onChange={e => setForm(f => ({ ...f, weekly_periods: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {COLORS.map(c => (
                  <div key={c} onClick={() => setForm(f => ({ ...f, color_hex: c }))}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: form.color_hex === c ? '3px solid var(--text)' : '2px solid transparent' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.allows_double_period}
                  onChange={e => setForm(f => ({ ...f, allows_double_period: e.target.checked }))} />
                Allows double period
              </label>
              <label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_static_eligible}
                  onChange={e => setForm(f => ({ ...f, is_static_eligible: e.target.checked }))} />
                Static lock eligible
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name || !form.grade_level}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
