import { Lightbulb, CalendarDays, MessageCircle, Clock, SlidersHorizontal } from 'lucide-react'

const CONFIG = {
  ideas: { label: 'Ideas', Icon: Lightbulb },
  week: { label: 'Week', Icon: CalendarDays },
  chat: { label: 'Chat', Icon: MessageCircle },
  history: { label: 'History', Icon: Clock },
  prefs: { label: 'Prefs', Icon: SlidersHorizontal },
}

export function TabBar({ active, onChange, tabs }) {
  return (
    <nav className="shrink-0 bg-paper/95 backdrop-blur border-t border-ink-100 safe-bottom">
      <div className="flex items-stretch">
        {tabs.map((key) => {
          const { label, Icon } = CONFIG[key]
          const isActive = active === key
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] active:opacity-60 transition-opacity"
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.4 : 1.9}
                className={isActive ? 'text-tomato-500' : 'text-ink-400'}
              />
              <span className={`text-[11px] font-medium ${isActive ? 'text-tomato-600' : 'text-ink-400'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
