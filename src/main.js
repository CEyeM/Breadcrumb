import './style.css'
import { supabase } from './supabase.js'
import { renderAuth } from './auth.js'
import { renderSessions } from './sessions.js'
import { renderLogger } from './logger.js'

let _activeSessionId = null
let _routing = false

function cleanup() {
  if (typeof window._loggerCleanup === 'function') {
    window._loggerCleanup()
    window._loggerCleanup = null
  }
  _activeSessionId = null
}

async function route() {
  if (_routing) return
  _routing = true
  try {
    let user = null
    try {
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise(resolve => setTimeout(() => resolve({ data: { session: null } }), 2500))
      ])
      user = data?.session?.user ?? null
    } catch {
      user = null
    }

    if (!user) {
      cleanup()
      renderAuth()
      return
    }

    const hash = location.hash

    if (hash.startsWith('#/session/')) {
      const sessionId = hash.split('/')[2]
      if (sessionId) {
        if (_activeSessionId === sessionId && document.querySelector('.logger-screen')) {
          return
        }
        cleanup()
        _activeSessionId = sessionId
        await renderLogger(sessionId, user)
        return
      }
    }

    cleanup()
    await renderSessions(user)
  } catch (e) {
    console.error('Route fout:', e)
    document.getElementById('app').innerHTML = `
      <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#e85447;font-family:monospace;font-size:13px;padding:24px;text-align:center">
        <div>Fout bij opstarten</div>
        <div style="color:#6b6b78;font-size:11px">${e.message}</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:8px 16px;background:#e8c547;color:#0e0e10;border:none;border-radius:6px;cursor:pointer;font-size:12px">Herladen</button>
      </div>
    `
  } finally {
    _routing = false
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cleanup()
    renderAuth()
    return
  }
  // Route als er geen actieve werkende logger-pagina is
  if (!_activeSessionId || !document.querySelector('.logger-screen')) {
    route()
  }
})
window.addEventListener('hashchange', () => {
  cleanup()
  route()
})

route()
