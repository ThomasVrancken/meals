import axios from 'axios'

const API_BASE = '/api'
export const TOKEN_STORAGE_KEY = 'two_pans_token'
const API_CACHE_NAME = 'two-pans-api-v1' // must match public/sw.js

// AI calls (generate, ai-edit, chat) can legitimately take 10-60s server
// side, so the client timeout is generous (2 min) rather than the default.
const LONG_TIMEOUT = 120000
const DEFAULT_TIMEOUT = 15000

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
    return this.client.post('/recipes/generate', { count, hint }, { timeout: LONG_TIMEOUT })
  }

  updateRecipe(id, patch) {
    return this.client.patch(`/recipes/${id}`, patch)
  }

  aiEditRecipe(id, { instruction, asVariation = false }) {
    return this.client.post(`/recipes/${id}/ai-edit`, { instruction, asVariation }, { timeout: LONG_TIMEOUT })
  }

  chatRecipe(id, { message, history } = {}) {
    return this.client.post(`/recipes/${id}/chat`, { message, history }, { timeout: LONG_TIMEOUT })
  }

  cookRecipe(id, { rating, note, cookedAt } = {}) {
    return this.client.post(`/recipes/${id}/cooked`, { rating, note, cookedAt })
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
    return this.client.post('/chat', { message }, { timeout: LONG_TIMEOUT })
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
