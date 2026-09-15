export function Chip({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-ink-50 text-ink-600',
    tomato: 'bg-tomato-50 text-tomato-600',
    basil: 'bg-basil-50 text-basil-600',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}
