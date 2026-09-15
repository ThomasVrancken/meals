export function LoadingDots({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-current animate-bounce-dot"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

// Friendly full-panel loading state for long AI calls (generate/ai-edit/chat),
// so a 20-40s wait reads as "working on it" rather than "broken".
export function LoadingPanel({ message = 'Working on it…', sub }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
      <div className="text-4xl animate-pulse">🍳</div>
      <p className="text-ink-600 font-medium">{message}</p>
      {sub && <p className="text-ink-400 text-sm max-w-[240px]">{sub}</p>}
      <LoadingDots className="text-tomato-400 text-lg mt-1" />
    </div>
  )
}
