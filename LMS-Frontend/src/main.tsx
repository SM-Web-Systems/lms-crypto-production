import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './lib/webPush'
import { rememberJoinToken } from './utils/pendingJoin'

// After a deploy, a page still running the previous build asks for chunks that no longer exist.
// Reload once to pick up the new index.html; the stamp stops a reload loop if the chunk is really missing.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'lms_chunk_reload_at'
  let last = 0
  try { last = Number(sessionStorage.getItem(key)) || 0 } catch { /* storage unavailable */ }
  if (Date.now() - last < 60_000) return
  try { sessionStorage.setItem(key, String(Date.now())) } catch { /* storage unavailable */ }
  event.preventDefault()
  window.location.reload()
})

// Keep an emailed invitation link until the learner has signed in (sign-up goes through AmmaWallet).
rememberJoinToken()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Web Push only (no offline caching). Safe to register on every load.
void registerServiceWorker()
