import type { BatchStats } from '../lib/engine'

interface Props {
  stats: BatchStats
  tips: string[]
}

function Stat({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value.toFixed(value >= 10 ? 0 : 1)}{suffix}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

export function StatsPanel({ stats, tips }: Props) {
  if (stats.count === 0) return null
  return (
    <section className="stats-panel">
      <div className="stats-row">
        <Stat label="Pronounce" value={stats.avg_pronounce} />
        <Stat label="Novelty" value={stats.avg_novelty} />
        <Stat label="Memorable" value={stats.avg_memorability} />
        <Stat label="Diversity" value={stats.diversity * 100} suffix="%" />
        <Stat label="Unique" value={stats.unique_pct} suffix="%" />
        <Stat label="Avg len" value={stats.avg_length} />
      </div>
      {tips.length > 0 && (
        <ul className="stats-tips">
          {tips.map((t, i) => (
            <li key={i} className="stats-tip">💡 {t}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
