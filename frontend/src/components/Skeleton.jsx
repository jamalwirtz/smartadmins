/**
 * Skeleton screens — replace spinners with content-shaped placeholders.
 * Much better UX: users understand what's loading before it arrives.
 */
import { motion } from 'framer-motion'

const pulse = {
  animate: { opacity: [.4, .8, .4] },
  transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
}

export function SkeletonBlock({ width = '100%', height = 16, radius = 6, style = {} }) {
  return (
    <motion.div {...pulse} style={{
      width, height, borderRadius: radius,
      background: 'var(--border)', ...style
    }} />
  )
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-xl)', padding: 20,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <SkeletonBlock width={44} height={44} radius={12} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBlock width="60%" height={14} />
          <SkeletonBlock width="40%" height={10} />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} width={`${100 - i * 8}%`} height={12} />
      ))}
    </div>
  )
}

export function SkeletonStatCards({ count = 5 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))',
      gap: 16, marginBottom: 24,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-xl)', padding: '20px 22px',
        }}>
          <SkeletonBlock width={44} height={44} radius={12} style={{ marginBottom: 14 }} />
          <SkeletonBlock width="50%" height={32} style={{ marginBottom: 8 }} />
          <SkeletonBlock width="70%" height={12} style={{ marginBottom: 4 }} />
          <SkeletonBlock width="50%" height={10} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`,
        gap: 1, padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} height={12} width={`${60 + Math.random()*30}%`} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} style={{ display: 'grid',
          gridTemplateColumns: `repeat(${cols},1fr)`,
          gap: 1, padding: '12px 16px',
          borderBottom: ri < rows-1 ? '1px solid var(--border)' : 'none',
          background: ri % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
          {Array.from({ length: cols }).map((_, ci) => (
            <SkeletonBlock key={ci} height={11} width={`${50 + Math.random()*40}%`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)', padding: '24px 28px', marginBottom: 4 }}>
        <SkeletonBlock width="30%" height={26} style={{ marginBottom: 10 }} />
        <SkeletonBlock width="50%" height={14} style={{ marginBottom: 14 }} />
        <SkeletonBlock width={280} height={6} radius={3} />
      </div>
      <SkeletonStatCards count={5} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <SkeletonCard rows={5} />
        <SkeletonCard rows={6} />
      </div>
    </div>
  )
}
