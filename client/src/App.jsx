import { useCallback, useEffect, useState } from 'react'
import { api } from './services/api'
import { AuthGate } from './components/AuthGate'
import { DataProvider } from './context/DataContext'
import { TabBar } from './components/common/TabBar'
import { IdeasTab } from './components/ideas/IdeasTab'
import { WeekTab } from './components/week/WeekTab'
import { ChatTab } from './components/chat/ChatTab'
import { HistoryTab } from './components/history/HistoryTab'
import { PrefsTab } from './components/prefs/PrefsTab'
import { RecipeDetail } from './components/recipe/RecipeDetail'

const TABS = ['ideas', 'week', 'chat', 'history', 'prefs']

export default function App() {
  const [authState, setAuthState] = useState('checking') // checking | locked | unlocked
  const [authError, setAuthError] = useState(null)
  const [tab, setTab] = useState('ideas')
  const [openRecipeId, setOpenRecipeId] = useState(null)

  const tryAutoLogin = useCallback(async () => {
    const url = new URL(window.location.href)
    const codeParam = url.searchParams.get('code')
    if (codeParam) {
      api.setToken(codeParam)
      url.searchParams.delete('code')
      window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)
      try {
        await api.me()
        setAuthState('unlocked')
        return
      } catch {
        api.clearToken()
        setAuthError('That link has an invalid code.')
        setAuthState('locked')
        return
      }
    }
    if (api.hasToken()) {
      try {
        await api.me()
        setAuthState('unlocked')
        return
      } catch {
        api.clearToken()
      }
    }
    setAuthState('locked')
  }, [])

  useEffect(() => {
    tryAutoLogin()
  }, [tryAutoLogin])

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthError('Session expired. Enter your code again.')
      setAuthState('locked')
    }
    window.addEventListener('two-pans:unauthorized', onUnauthorized)
    return () => window.removeEventListener('two-pans:unauthorized', onUnauthorized)
  }, [])

  if (authState !== 'unlocked') {
    return (
      <AuthGate
        checking={authState === 'checking'}
        error={authError}
        onUnlocked={() => {
          setAuthError(null)
          setAuthState('unlocked')
        }}
      />
    )
  }

  return (
    <DataProvider>
      <div className="h-[100dvh] bg-cream flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'ideas' && <IdeasTab onOpenRecipe={setOpenRecipeId} />}
          {tab === 'week' && <WeekTab onOpenRecipe={setOpenRecipeId} />}
          {tab === 'chat' && <ChatTab onOpenRecipe={setOpenRecipeId} />}
          {tab === 'history' && <HistoryTab onOpenRecipe={setOpenRecipeId} />}
          {tab === 'prefs' && <PrefsTab />}
        </div>
        <TabBar active={tab} onChange={setTab} tabs={TABS} />
        {openRecipeId && <RecipeDetail recipeId={openRecipeId} onClose={() => setOpenRecipeId(null)} />}
      </div>
    </DataProvider>
  )
}
