import axios from 'axios'

const API_BASE = '/api'
export const TOKEN_STORAGE_KEY = 'two_pans_token'
const API_CACHE_NAME = 'two-pans-api-v1' // must match public/sw.js

// AI calls (generate, ai-edit, chat) can take 60s+ server side, but iOS
// WebKit drops any request with no response after ~60s. So they run as server
// jobs (`Prefer: respond-async` -> 202 {jobId}) that we poll with short
// requests until done, giving up after LONG_TIMEOUT.
const LONG_TIMEOUT = 180000
const DEFAULT_TIMEOUT = 15000
const POLL_INTERVAL = 2000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class ApiService {
  constructor() {
    this.client = axios.create({ baseURL: API_BASE, timeout: DEFAULT_TIMEOUT })

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY)
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })

    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        const status = error.response?.status
        if (status === 401) {
          localStorage.removeItem(TOKEN_STORAGE_KEY)
          this.clearApiCache()
          window.dispatchEvent(new CustomEvent('two-pans:unauthorized'))
        }
        const message = error.response?.data?.error || error.message || 'Something went wrong'
        const wrapped = new Error(message)
        wrapped.status = status
        throw wrapped
      }
    )
  }

  setToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    this.clearApiCache()
  }

  clearToken() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    this.clearApiCache()
  }

  hasToken() {
    return Boolean(localStorage.getItem(TOKEN_STORAGE_KEY))
  }

  async clearApiCache() {
    if (typeof caches === 'undefined') return
    try {
      await caches.delete(API_CACHE_NAME)
    } catch {
      // ignore
    }
  }

  // POST a long AI call as a server job and poll until it finishes.
  async postLong(url, body) {
    const started = await this.client.post(url, body, { headers: { Prefer: 'respond-async' } })
    if (!started?.jobId) return started // server answered synchronously
    const deadline = Date.now() + LONG_TIMEOUT
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL)
      let job
      try {
        job = await this.client.get(`/jobs/${started.jobId}`)
      } catch (err) {
        // A dropped poll (flaky mobile network, phone briefly asleep) is not
        // fatal: the job keeps running server side, so just poll again.
        if (!err.status || err.status >= 500) continue
        throw err
      }
      if (job.status === 'done') return job.result
      if (job.status === 'error') {
        const failed = new Error(job.error || 'Something went wrong')
        failed.status = job.httpStatus
        throw failed
      }
    }
    throw new Error('This is taking unusually long. Check back in a minute.')
  }

  // Auth check
  me() {
    return this.client.get('/me')
  }

  // Recipes
  getRecipes(status = 'all') {
    return this.client.get('/recipes', { params: { status } })
  }

  getRecipe(id) {
    return this.client.get(`/recipes/${id}`)
  }

  generateRecipes({ count = 5, hint } = {}) {
    return this.postLong('/recipes/generate', { count, hint })
  }

  updateRecipe(id, patch) {
    return this.client.patch(`/recipes/${id}`, patch)
  }

  aiEditRecipe(id, { instruction, asVariation = false }) {
    return this.postLong(`/recipes/${id}/ai-edit`, { instruction, asVariation })
  }

  chatRecipe(id, { message, history } = {}) {
    return this.postLong(`/recipes/${id}/chat`, { message, history })
  }

  cookRecipe(id, { rating, note, cookedAt } = {}) {
    return this.client.post(`/recipes/${id}/cooked`, { rating, note, cookedAt })
  }

  setAsideRecipe(id) {
    return this.client.post(`/recipes/${id}/set-aside`)
  }

  clearSuggestions() {
    return this.client.post('/recipes/clear-suggestions')
  }

  // Week
  getWeek() {
    return this.client.get('/week')
  }

  // History
  getHistory() {
    return this.client.get('/history')
  }

  addHistory(entry) {
    return this.client.post('/history', entry)
  }

  updateHistory(id, patch) {
    return this.client.patch(`/history/${id}`, patch)
  }

  deleteHistory(id) {
    return this.client.delete(`/history/${id}`)
  }

  // Preferences
  getPreferences() {
    return this.client.get('/preferences')
  }

  updatePreferences(patch) {
    return this.client.put('/preferences', patch)
  }

  getPreferencesHistory() {
    return this.client.get('/preferences/history')
  }

  // Chat
  getChat() {
    return this.client.get('/chat')
  }

  sendChat(message) {
    return this.postLong('/chat', { message })
  }

  clearChat() {
    return this.client.delete('/chat')
  }

  // Shopping items (manual groceries)
  getShoppingItems() {
    return this.client.get('/shopping-items')
  }

  addShoppingItem({ name, amount } = {}) {
    return this.client.post('/shopping-items', { name, amount })
  }

  updateShoppingItem(id, patch) {
    return this.client.patch(`/shopping-items/${id}`, patch)
  }

  deleteShoppingItem(id) {
    return this.client.delete(`/shopping-items/${id}`)
  }

  clearCheckedShoppingItems() {
    return this.client.post('/shopping-items/clear-checked')
  }
}

export const api = new ApiService()
