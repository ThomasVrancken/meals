export function TopBar({ title, right }) {
  return (
    <div className="shrink-0 safe-top px-5 pt-4 pb-3 bg-cream flex items-center justify-between">
      <h1 className="text-2xl font-bold text-ink-800 tracking-tight">{title}</h1>
      {right}
    </div>
  )
}
