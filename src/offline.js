const STORAGE_KEY = (sessionId) => `breadcrumb_pending_${sessionId}`

function loadBuffer(sessionId) {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(sessionId)) || '[]') }
  catch { return [] }
}

function saveBuffer(sessionId, entries) {
  try { localStorage.setItem(STORAGE_KEY(sessionId), JSON.stringify(entries)) }
  catch (e) { console.warn('[offline] localStorage vol:', e) }
}

export function bufferEntry(sessionId, entry) {
  saveBuffer(sessionId, [...loadBuffer(sessionId), entry])
}

export function markSynced(sessionId, localId) {
  const buf = loadBuffer(sessionId).map(e =>
    e.localId === localId ? { ...e, synced: true } : e
  )
  const unsynced = buf.filter(e => !e.synced)
  const done     = buf.filter(e => e.synced).slice(-50)
  saveBuffer(sessionId, [...unsynced, ...done])
}

export function removePending(sessionId, localId) {
  saveBuffer(sessionId, loadBuffer(sessionId).filter(e => e.localId !== localId))
}

export function updateBuffered(sessionId, id, patch) {
  let changed = false
  const next = loadBuffer(sessionId).map(e => {
    if (e.localId === id || e.id === id) { changed = true; return { ...e, ...patch } }
    return e
  })
  if (changed) saveBuffer(sessionId, next)
}

export function clearPendingBuffer(sessionId) {
  localStorage.removeItem(STORAGE_KEY(sessionId))
}

export function getUnsynced(sessionId) {
  return loadBuffer(sessionId).filter(e => !e.synced)
}

export async function syncPending(sessionId, supabase) {
  const pending = getUnsynced(sessionId)
  if (!pending.length) return 0

  let count = 0
  for (const entry of pending) {
    const { localId, synced: _s, pending: _p, ...data } = entry
    try {
      const { error } = await supabase
        .from('log_entries')
        .upsert(data, { onConflict: 'id', ignoreDuplicates: true })
      if (!error) { markSynced(sessionId, localId); count++ }
    } catch {}
  }
  return count
}

export async function safeSupabaseCall(fn, { onError, context = '' } = {}) {
  try {
    const result = await fn()
    if (result?.error) throw result.error
    return result
  } catch (err) {
    console.error(`[Breadcrumb] Fout${context ? ` bij ${context}` : ''}:`, err)
    if (onError) onError(err)
    else showToast('Verbindingsfout — probeer opnieuw', 'error')
    return { data: null, error: err }
  }
}

// ── Toast ──────────────────────────────────────────────────────────
let _toastRoot = null

function getToastRoot() {
  if (_toastRoot && document.body.contains(_toastRoot)) return _toastRoot
  _toastRoot = document.createElement('div')
  _toastRoot.id = 'bc-toasts'
  document.body.appendChild(_toastRoot)
  return _toastRoot
}

export function showToast(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = `bc-toast bc-toast-${type}`
  el.textContent = msg
  getToastRoot().appendChild(el)
  requestAnimationFrame(() => el.classList.add('bc-toast-visible'))
  setTimeout(() => {
    el.classList.remove('bc-toast-visible')
    setTimeout(() => el.remove(), 300)
  }, 3500)
}
