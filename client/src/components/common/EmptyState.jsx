export function EmptyState({ emoji = '🍽️', title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8 gap-2">
      <div className="text-4xl mb-1">{emoji}</div>
      <p className="text-ink-700 font-semibold">{title}</p>
      {sub && <p className="text-ink-400 text-sm max-w-[260px]">{sub}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
