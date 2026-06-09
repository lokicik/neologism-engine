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
  const bg = `hsl(${hue}, 55%, 32%)`
  return (
    <span
      className="monogram"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: bg,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
