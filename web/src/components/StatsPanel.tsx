import type { BatchStats } from '../lib/engine'

interface Props {
  stats: BatchStats
  tips: string[]
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <span className="stat">
      <span className="stat-label">{label}</span>{' '}
      <span className="stat-value">{value.toFixed(value >= 10 ? 0 : 1)}{suffix}</span>
    </span>
  )
}

// Phase 40: a thin hairline strip above the results, not a panel.
export function StatsPanel({ stats, tips }: Props) {
  if (stats.count === 0) return null
  return (
    <section className="stats-strip">
      <div className="stats-row">
        <Stat label="pronounce" value={stats.avg_pronounce} />
        <Stat label="novelty" value={stats.avg_novelty} />
        <Stat label="memorable" value={stats.avg_memorability} />
        <Stat label="diversity" value={stats.diversity * 100} suffix="%" />
        <Stat label="unique" value={stats.unique_pct} suffix="%" />
        <Stat label="avg len" value={stats.avg_length} />
      </div>
      {tips.length > 0 && <p className="stats-tip">💡 {tips[0]}</p>}
    </section>
  )
}
