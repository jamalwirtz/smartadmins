/**
 * Formatting utilities — keep numbers human-readable throughout the app.
 */

/** 1234 → "1,234" */
export const fmt = (n) => {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

/** 45 → "45 min", 90 → "1h 30m", 120 → "2 hours" */
export const fmtDuration = (minutes) => {
  if (!minutes) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h} hour${h !== 1 ? 's' : ''}`
  return `${h}h ${m}m`
}

/** "08:00" → "8:00 AM",  "13:30" → "1:30 PM" */
export const fmtTime = (timeStr) => {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour   = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

/** "2024-06-01" → "1 Jun 2024" */
export const fmtDate = (dateStr) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB',
    { day:'numeric', month:'short', year:'numeric' })
}

/** Time-based greeting */
export const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd" */
export const ordinal = (n) => {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v-20)%10] || s[v] || s[0])
}

/** plural(3, 'class', 'classes') → "3 classes" */
export const plural = (n, singular, pluralForm) =>
  `${fmt(n)} ${n === 1 ? singular : (pluralForm || singular + 's')}`

/** pct(23, 100) → "23%" */
export const pct = (part, total, decimals = 0) =>
  !total ? '0%' : `${((part/total)*100).toFixed(decimals)}%`
