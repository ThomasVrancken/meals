import { useState } from 'react'
import { api } from '../services/api'

// Access-code gate. Also handles `/?code=...` auto-login (App.jsx strips the
// param and calls onUnlocked once verified) so Thomas can send Lote one link.
export function AuthGate({ onUnlocked, error: externalError, checking: externalChecking }) {
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!code.trim() || checking) return
    setChecking(true)
    setError(null)
    api.setToken(code.trim())
    try {
      await api.me()
      onUnlocked()
    } catch (err) {
      api.clearToken()
      setError(err.status === 401 ? 'That code was rejected. Try again.' : 'Could not reach the server. Try again.')
    } finally {
      setChecking(false)
    }
  }

  const isChecking = checking || externalChecking
  const shownError = error || externalError

  return (
    <div className="min-h-[100dvh] bg-cream flex items-center justify-center px-6 safe-top safe-bottom">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <div className="text-6xl mb-4">🍳</div>
        <h1 className="text-ink-800 text-2xl font-bold mb-1 tracking-tight">Two Pans</h1>
        <p className="text-ink-500 text-sm mb-8">Enter your access code to continue</p>
        <input
          type="password"
          inputMode="text"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full bg-white border border-ink-100 text-ink-800 text-center text-base rounded-2xl px-4 py-3.5 outline-none mb-3 shadow-card focus:border-tomato-400 transition-colors"
          placeholder="Access code"
        />
        {shownError && <p className="text-tomato-600 text-sm mb-3">{shownError}</p>}
        <button
          type="submit"
          disabled={isChecking || !code.trim()}
          className="w-full bg-tomato-500 text-white rounded-2xl py-3.5 font-semibold text-base disabled:opacity-50 active:bg-tomato-600 transition-colors shadow-card"
        >
          {isChecking ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
