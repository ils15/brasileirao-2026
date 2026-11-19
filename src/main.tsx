import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './AppErrorBoundary'
import './styles.css'

const PRELOAD_RETRY_KEY = 'br2026-preload-retry'

/**
 * Um deploy no meio da sessão invalida os chunks das abas lazy. A primeira
 * falha tenta um reload único (o HTML novo aponta para os chunks novos);
 * na segunda, o erro segue para o AppErrorBoundary em vez de virar tela branca.
 * O guarda em sessionStorage impede loop infinito de reload.
 */
function shouldRetryPreload(): boolean {
  try {
    if (window.sessionStorage.getItem(PRELOAD_RETRY_KEY)) return false
    window.sessionStorage.setItem(PRELOAD_RETRY_KEY, '1')
    return true
  } catch {
    // Storage bloqueado: não arrisca reload em loop; o boundary assume.
    return false
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (shouldRetryPreload()) window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
