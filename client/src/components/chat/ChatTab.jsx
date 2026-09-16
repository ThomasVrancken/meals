import { useEffect, useRef, useState } from 'react'
import { ArrowUp, RefreshCw } from 'lucide-react'
import { TopBar } from '../common/TopBar'
import { LoadingDots } from '../common/LoadingDots'
import { api } from '../../services/api'
import { useData } from '../../context/DataContext'

const QUICK_PROMPTS = [
  'Give me 5 ideas for this week',
  'We cooked something not in the app',
  'Less of something',
  "What's for dinner tonight?",
]

const ACTION_LABELS = {
  recipe: '🍽️',
  preferences: '⚙️',
  week: '🗓️',
  history: '📝',
  feedback: '👍',
  shopping: '🛒',
}

function actionEmoji(type) {
  return ACTION_LABELS[type] || '✅'
}

export function ChatTab({ onOpenRecipe }) {
  const { applyChanged } = useData()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    api.getChat().then(({ messages }) => {
      setMessages(messages)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text: trimmed, actions: [] }])
    try {
      const { messages: newMsgs, changed } = await api.sendChat(trimmed)
      setMessages((prev) => {
        // Replace the optimistic local user message + append the real pair.
        const withoutLocal = prev.filter((m) => !String(m.id).startsWith('local-'))
        return [...withoutLocal, ...newMsgs]
      })
      await applyChanged(changed)
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', text: `Sorry, that didn't go through (${err.message}). Try again?`, actions: [] },
      ])
    } finally {
      setSending(false)
    }
  }

  const newConversation = async () => {
    if (sending) return
    await api.clearChat()
    setMessages([])
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopBar
        title="Chat"
        right={
          <button
            onClick={newConversation}
            className="flex items-center gap-1 text-xs font-medium text-ink-400 active:text-ink-600"
          >
            <RefreshCw size={13} /> New
          </button>
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-5 pb-4">
        {loaded && messages.length === 0 && (
          <div className="pt-4">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">💬</div>
              <p className="text-ink-500 text-sm max-w-[260px] mx-auto">
                Tell it what you ate, what you're craving, or ask it to change anything.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-sm font-medium text-tomato-600 bg-tomato-50 rounded-full px-3.5 py-2 active:bg-tomato-100"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%]">
                <div
                  className={`rounded-2xl px-4 py-2.5 text-[15px] leading-snug whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-tomato-500 text-white rounded-br-md'
                      : 'bg-white text-ink-800 shadow-card rounded-bl-md'
                  }`}
                >
                  {m.text}
                </div>
                {m.actions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {m.actions.map((a, i) =>
                      a.recipeId ? (
                        <button
                          key={i}
                          onClick={() => onOpenRecipe?.(a.recipeId)}
                          className="text-xs font-medium text-basil-600 bg-basil-50 rounded-full px-2.5 py-1 active:bg-basil-100"
                        >
                          {actionEmoji(a.type)} {a.label}
                        </button>
                      ) : (
                        <span
                          key={i}
                          className="text-xs font-medium text-basil-600 bg-basil-50 rounded-full px-2.5 py-1"
                        >
                          {actionEmoji(a.type)} {a.label}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white shadow-card rounded-2xl rounded-bl-md px-4 py-3 text-ink-400">
                <LoadingDots />
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="shrink-0 px-4 pt-2 pb-3 flex items-end gap-2 bg-cream"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Message Two Pans…"
          rows={1}
          disabled={sending}
          className="flex-1 bg-white border border-ink-100 rounded-2xl px-4 py-3 text-[15px] outline-none focus:border-tomato-400 resize-none max-h-28 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-tomato-500 text-white active:bg-tomato-600 disabled:opacity-40"
        >
          <ArrowUp size={19} />
        </button>
      </form>
    </div>
  )
}
