import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { bindQueueEvents } from './store/queue'
import { bindErrorEvents } from './store/errors'
import { bindConsoleEvents } from './store/console'
import { bindSettingsEvents } from './store/settings'
import { bindDepsEvents } from './store/deps'
import { bindPlaylistEvents } from './store/playlist'
import { startSession } from './store/session'
import './styles.css'

// Assinaturas de eventos do main → stores (uma vez, fora do ciclo de render do React).
bindQueueEvents()
bindErrorEvents()
bindConsoleEvents()
bindSettingsEvents()
bindDepsEvents()
bindPlaylistEvents()
// reabre de onde parou: última playlist, ordenação, filtros, seleção (store/session.ts)
startSession()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
