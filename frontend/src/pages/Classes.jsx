import { useEffect, useState } from 'react'
import { classesAPI } from '../api/client'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const empty = { name: '', grade_level: '', max_subjects_per_day: 8 }

export default function Classes() {
  const [classes, setClasses] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => classesAPI.list().then(r => setClasses(r.data))
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(empty); setEditId(null); setModal(true) }
  const openEdit = (c) => {
    setForm({ name: c.name, grade_level: c.grade_level, max_subjects_per_day: c.max_subjects_per_day })
    setEditId(c.id); setModal(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (!editId) await classesAPI.create(form)
      else await classesAPI.update(editId, form)
      toast.success('Saved!'); setModal(false); load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Error') }
    finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete class?')) return
    await classesAPI.delete(id); toast.success('Deleted'); load()
  }

  const grades = [...new Set(classes.map(c => c.grade_level))].sort()

  return (
    <>
      <div className="topbar">
        <h2>Classes &amp; Sections</h2>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Add Class</button>
        </div>
      </div>
      <div className="page">
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Class Name</th><th>Grade</th><th>Max Subjects/Day</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {classes.length === 0 && (
                  <tr><td colSpan={4} className="empty-state">No classes yet.</td></tr>
                )}
                {classes.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>{c.name}</td>
                    <td><span className="badge badge-blue">Grade {c.grade_level}</span></td>
                    <td>{c.max_subjects_per_day}</td>
                    <td>
                      <div className="flex-row">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Pencil size={13} /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editId ? 'Edit Class' : 'Add Class Section'}</div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Class Name *</label>
                <input className="form-input" value={form.name} placeholder="7A, 8B, Form3…"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Grade Level *</label>
                <input className="form-input" value={form.grade_level} placeholder="7, 8, Form3…"
                  onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))} />
                <p className="form-hint">Must match subject grade levels</p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Max Subjects per Day</label>
              <input className="form-input" type="number" min={1} max={12} value={form.max_subjects_per_day}
                onChange={e => setForm(f => ({ ...f, max_subjects_per_day: +e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}
                disabled={saving || !form.name || !form.grade_level}>
                {saving ? 'Saving…' : 'Save Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
