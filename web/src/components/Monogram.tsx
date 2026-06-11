interface Props {
  name: string
  size?: number
}

function nameHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % 360
}

export function Monogram({ name, size = 40 }: Props) {
  const initials = name.slice(0, 2).toUpperCase()
  const hue = nameHue(name)
  // Phase 42: quiet tinted tiles — per-name hue kept for identity, but
  // desaturated to sit inside the restrained palette instead of shouting.
  return (
    <span
      className="monogram"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `hsl(${hue}, 28%, 17%)`,
        color: `hsl(${hue}, 55%, 72%)`,
        border: '1px solid rgba(255,255,255,.08)',
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
