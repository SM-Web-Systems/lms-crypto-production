import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './lib/webPush'
import { rememberJoinToken } from './utils/pendingJoin'

// Keep an emailed invitation link until the learner has signed in (sign-up goes through AmmaWallet).
rememberJoinToken()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Web Push only (no offline caching). Safe to register on every load.
void registerServiceWorker()
