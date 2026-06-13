import { supabase } from './supabase.js'
import { TimecodeEngine, FPS_OPTIONS } from './timecode.js'
import { CameraManager } from './camera.js'
import {
  bufferEntry, markSynced, removePending, clearPendingBuffer,
  getUnsynced, syncPending, showToast
} from './offline.js'
import { TAGS, TAG_SHORTCUTS, SHORTCUT_TO_TAG } from './tags.js'

export async function renderLogger(sessionId, user) {
  // ── Load session ──────────────────────────────────────────────────
  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (error || !session) {
    document.getElementById('app').innerHTML = `
      <div style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:var(--muted);font-family:var(--mono);font-size:12px">
        <div>Sessie niet gevonden</div>
        <button class="btn btn-ghost" onclick="location.hash=''">← Terug</button>
      </div>
    `
    return
  }

  // ── Render HTML ───────────────────────────────────────────────────
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="logger-screen">
      <header>
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn btn-ghost btn-sm" onclick="location.hash=''" title="Terug naar sessies">←</button>
          <img src="/logo.svg" alt="Breadcrumb" style="height:32px">
        </div>

        <div class="clock-block">
          <div class="master-clock" id="master-clock">00:00:00:00</div>
          <div class="tc-mode-row">
            <div style="display:flex;flex-direction:column;gap:2px">
              <button class="tc-mode-btn active" id="mode-session" onclick="setTcMode('session')">SESSIE</button>
              <button class="tc-mode-btn" onclick="resetTimer()">RESET</button>
            </div>
            <button class="tc-mode-btn" id="mode-tod" onclick="activateSync()">SYNC</button>
            <button class="tc-mode-btn" id="mode-atem-live" onclick="openAtemBridge()">
              <span class="atem-dot" id="atem-dot"></span>ATEM LIVE
            </button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:16px">
          <div class="rt-indicator">
            <div class="rt-dot" id="rt-dot"></div>
            <span id="rt-label">SYNC</span>
          </div>
          <div class="rec-indicator">
            <div class="rec-dot active" id="rec-dot"></div>
            <span>REC</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="openShortcuts()" title="Toetsenbord shortcuts (?)">?</button>
        </div>
      </header>

      <div class="logger-main">
        <!-- CAMERA -->
        <div class="camera-panel">
          <div class="camera-wrap" id="camera-wrap">
            <video id="webcam" autoplay muted playsinline style="display:none"></video>
            <div class="camera-overlay"></div>
            <div class="no-cam" id="no-cam">
              <svg class="cam-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="12" width="36" height="26" rx="3"/>
                <path d="M38 20l8-6v20l-8-6V20z"/>
                <circle cx="20" cy="25" r="7"/>
              </svg>
              <span>Camera niet actief</span>
              <span>Klik op "Camera aan"</span>
            </div>
          </div>
          <div class="tc-bar" id="tc-overlay">TC  00:00:00:00</div>
          <div class="cam-controls">
            <button class="btn btn-ghost" id="cam-btn" onclick="camera.toggle()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              Camera aan
            </button>
            <select id="cam-select" onchange="camera.switchTo(this.value)" title="Kies camera"></select>
            <button class="btn btn-ghost btn-sm" id="fps-btn" onclick="cycleFps()" title="Wissel framerate">
              <span id="fps-label">${session.fps} fps</span>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="camera.toggleMirror()" title="Spiegelen">↔</button>
            <span style="flex:1"></span>
            <span class="status-text" id="cam-status">—</span>
          </div>
        </div>

        <!-- LOG -->
        <div class="log-panel">
          <div class="log-header">
            <span class="log-title" id="log-session-title">${escHtml(session.name).toUpperCase()}</span>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="entry-count" id="entry-count">0</span>
              <button class="btn btn-ghost btn-sm" onclick="openExportModal()" id="export-btn" disabled>↓ Export</button>
              <button class="btn btn-danger btn-sm" onclick="clearLog()" id="clear-btn" disabled>Wis</button>
            </div>
          </div>

          <div class="filter-bar" id="filter-bar"></div>

          <div id="pending-banner" style="display:none"></div>

          <div id="log-entries">
            <div class="log-empty" id="log-empty">
              <div style="font-size:22px;opacity:0.3">◈</div>
              <div>Nog geen notities</div>
              <div style="opacity:0.5">Typ hieronder en druk Enter</div>
            </div>
          </div>

          <div class="input-area">
            <div class="tag-row" id="tag-row"></div>
            <div class="input-row">
              <textarea
                id="note-input"
                placeholder="Notitie…  (Enter = opslaan)"
                rows="1"
                onkeydown="handleKey(event)"
                oninput="autoResize(this)"
              ></textarea>
              <button class="btn btn-primary" id="log-btn" onclick="logNote()" title="Opslaan (Enter)">Log</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- SYNC MODAL -->
    <div class="modal-overlay" id="sync-modal" style="display:none">
      <div class="modal">
        <h2>SYNC OP BLACKMAGIC</h2>
        <p>Lees de huidige timecode van je Blackmagic af en typ die hieronder in.</p>
        <div class="field">
          <label>Camera timecode (HH:MM:SS:FF)</label>
          <input type="text" id="sync-tc" placeholder="14:32:09:12" maxlength="11" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeSync()" style="flex:1">Annuleer</button>
          <button class="btn btn-primary" onclick="applySync()" style="flex:1">Sync</button>
        </div>
      </div>
    </div>

    <!-- ATEM BRIDGE MODAL -->
    <div class="modal-overlay" id="atem-modal" style="display:none">
      <div class="modal">
        <h2>ATEM LIVE BRIDGE</h2>
        <p>Vul de bridge-naam in die je in de Breadcrumb Bridge app hebt gekozen.</p>
        <div class="field">
          <label>Bridge naam</label>
          <input type="text" id="atem-bridge-name" placeholder="bijv. jeffrey-studio" />
        </div>
        <button class="btn btn-primary" id="atem-connect-btn" onclick="connectAtem()" style="width:100%;justify-content:center">
          Verbinden
        </button>
        <div id="atem-command-block" style="display:none;margin-top:20px">
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">Bridge op je computer</div>
            <button onclick="startBridge()" style="display:inline-block;background:var(--accent);color:#000;font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 16px;border-radius:6px;border:none;cursor:pointer;letter-spacing:0.04em">▶ Start Bridge</button>
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <button onclick="toggleBridgeHelp()" id="bridge-help-btn" style="background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:var(--mono);font-size:11px;padding:8px 16px;border-radius:6px;cursor:pointer;letter-spacing:0.04em">? Installatie-uitleg</button>
              <div id="bridge-help" style="display:none;margin-top:12px">
                <div style="display:flex;gap:8px;margin-bottom:10px">
                  <button id="bridge-os-mac" onclick="selectBridgeOs('mac')" style="flex:1;background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 12px;border-radius:6px;cursor:pointer">Mac</button>
                  <button id="bridge-os-win" onclick="selectBridgeOs('win')" style="flex:1;background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 12px;border-radius:6px;cursor:pointer">⊞ Windows</button>
                </div>
                <ol id="bridge-os-hint-mac" style="display:none;margin:0;padding-left:18px;font-family:var(--mono);font-size:11px;color:var(--text);line-height:2">
                  <li><a href="https://github.com/CEyeM/Breadcrumb/releases/latest/download/Breadcrumb-Bridge-arm64.zip" style="color:var(--accent)">↓ Download de bridge voor Mac</a></li>
                  <li>Unzip en sleep de app naar Programma's</li>
                  <li>Open de app en vul je ATEM IP en bridge naam in</li>
                  <li style="color:var(--muted)">Waarschuwing van macOS? Rechtermuisknop → Open</li>
                </ol>
                <ol id="bridge-os-hint-win" style="display:none;margin:0;padding-left:18px;font-family:var(--mono);font-size:11px;color:var(--text);line-height:2">
                  <li><a href="https://github.com/CEyeM/Breadcrumb/releases/latest/download/Breadcrumb-Bridge-windows.zip" style="color:var(--accent)">↓ Download de bridge voor Windows</a></li>
                  <li>Unzip en dubbelklik Breadcrumb Bridge.exe</li>
                  <li>Vul in het venster je ATEM IP en bridge naam in</li>
                </ol>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:14px">
            <div class="rt-dot" id="atem-status-dot"></div>
            <span id="atem-status-label" style="font-family:var(--mono);font-size:11px;color:var(--muted)">Wachten op bridge…</span>
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px">
          <button class="btn btn-ghost" onclick="closeAtemBridge()" style="flex:1">Sluiten</button>
        </div>
      </div>
    </div>

    <!-- EXPORT MODAL -->
    <div class="modal-overlay" id="export-modal" style="display:none">
      <div class="modal">
        <h2>EXPORT</h2>
        <p>Filter op categorie (niets geselecteerd = alles exporteren):</p>
        <div class="export-tag-grid" id="export-tag-grid"></div>
        <div class="modal-footer" style="margin-top:20px">
          <button class="btn btn-ghost" onclick="closeExportModal()" style="flex:1">Annuleer</button>
          <button class="btn btn-ghost" onclick="doExport('txt')" style="flex:1">↓ TXT</button>
          <button class="btn btn-primary" onclick="doExport('csv')" style="flex:1">↓ CSV</button>
        </div>
      </div>
    </div>

    <!-- SHORTCUTS MODAL -->
    <div class="modal-overlay" id="shortcuts-modal" style="display:none">
      <div class="modal">
        <h2>TOETSENBORD SHORTCUTS</h2>
        <div class="shortcuts-grid">
          <span class="shortcuts-key">Spatie</span><span class="shortcuts-desc">Focus notitie-invoer</span>
          <span class="shortcuts-key">Enter</span><span class="shortcuts-desc">Notitie opslaan</span>
          <span class="shortcuts-key">Shift+Enter</span><span class="shortcuts-desc">Nieuwe regel in notitie</span>
          <span class="shortcuts-key">Escape</span><span class="shortcuts-desc">Sluit venster / annuleer</span>
          <span class="shortcuts-key">?</span><span class="shortcuts-desc">Toon dit scherm</span>
          <span class="shortcuts-key" style="grid-column:1/-1;color:var(--muted);background:none;border:none;padding:4px 0 0;font-size:10px;letter-spacing:0.1em">CATEGORIEËN</span>
          <span class="shortcuts-key">G</span><span class="shortcuts-desc">Goede take</span>
          <span class="shortcuts-key">F</span><span class="shortcuts-desc">Fout</span>
          <span class="shortcuts-key">B</span><span class="shortcuts-desc">B-roll</span>
          <span class="shortcuts-key">A</span><span class="shortcuts-desc">Geluid issue</span>
        </div>
        <div class="modal-footer" style="margin-top:20px">
          <button class="btn btn-ghost" onclick="closeShortcuts()" style="flex:1">Sluiten</button>
        </div>
      </div>
    </div>
  `

  // ── State ─────────────────────────────────────────────────────────
  const tc = new TimecodeEngine()
  tc.fps = session.fps
  tc.startSession(new Date(session.timer_started_at ?? session.created_at).getTime())

  window.camera = new CameraManager({
    onStatus: (s) => {
      const el = document.getElementById('cam-status')
      if (!el) return
      if (s === 'live') el.innerHTML = '<span class="ok">● Live</span>'
      else if (s === 'error') el.innerHTML = '<span class="err">Toegang geweigerd</span>'
      else el.textContent = '—'
    }
  })

  let entries = []
  let rafId = null
  let bridgeStatus = null
  let selectedTags = []
  let activeFilters = new Set()
  let exportTagFilter = new Set()

  // ── Clock loop ────────────────────────────────────────────────────
  function tick() {
    const tcStr = tc.getTC()
    document.getElementById('master-clock').textContent = tcStr
    document.getElementById('tc-overlay').textContent = 'TC  ' + tcStr
    rafId = requestAnimationFrame(tick)
  }
  tick()

  // ── TC mode ───────────────────────────────────────────────────────
  window.resetTimer = async () => {
    const startedAt = new Date()
    tc.startSession(startedAt.getTime())
    const { error } = await supabase
      .from('sessions')
      .update({ timer_started_at: startedAt.toISOString() })
      .eq('id', sessionId)
    if (error) console.error('Reset sync error:', error)
  }

  window.setTcMode = (mode) => {
    tc.setMode(mode)
    sessionStorage.setItem(`tc-mode-${sessionId}`, mode)
    ;['session','tod','atem-live'].forEach(m => {
      document.getElementById(`mode-${m}`)?.classList.toggle('active', m === mode)
    })
  }

  window.activateSync = () => { window.setTcMode('tod'); window.openSync() }

  // ── ATEM ─────────────────────────────────────────────────────────
  let lastAtemReceived = 0

  window.openAtemBridge = () => {
    document.getElementById('atem-modal').style.display = 'flex'
    const savedName = localStorage.getItem('atem-bridge-name')
    if (savedName) { document.getElementById('atem-bridge-name').value = savedName; showAtemInfo() }
    document.getElementById('atem-bridge-name').focus()
  }
  window.closeAtemBridge = () => { document.getElementById('atem-modal').style.display = 'none' }

  window.connectAtem = () => {
    const name = document.getElementById('atem-bridge-name').value.trim()
    if (!name) return
    localStorage.setItem('atem-bridge-name', name)
    showAtemInfo()
    supabase.removeChannel(atemChannel)
    atemChannel = createAtemChannel(name)
    window.setTcMode('atem-live')
  }

  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)

  function showAtemInfo() {
    document.getElementById('atem-command-block').style.display = 'block'
    document.getElementById('atem-connect-btn').textContent = 'Opnieuw verbinden'
  }

  window.startBridge = () => {
    if (!isMac) { document.getElementById('bridge-help').style.display = 'block'; window.selectBridgeOs('win'); return }
    location.href = 'breadcrumb://start'
  }
  window.toggleBridgeHelp = () => {
    const help = document.getElementById('bridge-help')
    const isOpen = help.style.display !== 'none'
    help.style.display = isOpen ? 'none' : 'block'
    if (!isOpen) window.selectBridgeOs(isMac ? 'mac' : 'win')
  }
  window.selectBridgeOs = (os) => {
    for (const o of ['mac','win']) {
      document.getElementById(`bridge-os-hint-${o}`).style.display = o === os ? 'block' : 'none'
      const btn = document.getElementById(`bridge-os-${o}`)
      btn.style.background = o === os ? 'var(--accent)' : 'var(--surface)'
      btn.style.color = o === os ? '#000' : 'var(--text)'
    }
  }

  function updateAtemDot() {
    const age = Date.now() - lastAtemReceived
    const tcActive = lastAtemReceived > 0 && age < 3000
    const dot = document.getElementById('atem-dot')
    const modalDot = document.getElementById('atem-status-dot')
    const modalLabel = document.getElementById('atem-status-label')
    let color, label
    if (tcActive)                           { color = 'var(--green)'; label = 'Actief — TC ontvangen' }
    else if (bridgeStatus === 'reconnecting'){ color = '#f97316';      label = 'Bridge verbindt opnieuw…' }
    else if (bridgeStatus === 'connected')  { color = 'var(--accent)'; label = 'Bridge verbonden — wacht op TC' }
    else if (lastAtemReceived > 0)          { color = 'var(--red)';   label = 'Verbinding verbroken' }
    else                                    { color = 'transparent';  label = 'Wachten op bridge…' }
    if (dot) dot.style.background = color
    if (modalDot) modalDot.style.background = color
    if (modalLabel) modalLabel.textContent = label
  }

  window.openSync = () => {
    document.getElementById('sync-modal').style.display = 'flex'
    document.getElementById('sync-tc').value = tc.getTC()
    document.getElementById('sync-tc').focus()
    document.getElementById('sync-tc').select()
  }
  window.closeSync = () => { document.getElementById('sync-modal').style.display = 'none' }
  window.applySync = () => {
    const raw = document.getElementById('sync-tc').value.trim()
    if (!tc.syncTOD(raw)) { document.getElementById('sync-tc').classList.add('error'); return }
    window.closeSync()
  }
  document.getElementById('sync-tc')?.addEventListener('input', () =>
    document.getElementById('sync-tc').classList.remove('error'))
  document.getElementById('sync-tc')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.applySync()
  })

  // ── Shortcuts modal ───────────────────────────────────────────────
  window.openShortcuts  = () => { document.getElementById('shortcuts-modal').style.display = 'flex' }
  window.closeShortcuts = () => { document.getElementById('shortcuts-modal').style.display = 'none' }

  // ── Tags: input-rij ───────────────────────────────────────────────
  function renderTagInputRow() {
    const row = document.getElementById('tag-row')
    if (!row) return
    row.innerHTML = Object.entries(TAGS).map(([key, tag]) => {
      const sc = TAG_SHORTCUTS[key]
      return `<button class="tag-input-btn" id="tag-input-${key}" onclick="toggleInputTag('${key}')"
        style="--tag-color:${tag.color}" title="${tag.label} (${sc})">${tag.label}</button>`
    }).join('')
  }

  window.toggleInputTag = (key) => {
    const idx = selectedTags.indexOf(key)
    if (idx >= 0) selectedTags.splice(idx, 1)
    else selectedTags.push(key)
    document.getElementById(`tag-input-${key}`)?.classList.toggle('active', selectedTags.includes(key))
  }

  renderTagInputRow()

  // ── Tags: filter-balk ─────────────────────────────────────────────
  function renderFilterBar() {
    const bar = document.getElementById('filter-bar')
    if (!bar) return
    bar.innerHTML =
      `<span class="filter-label">Filter:</span>` +
      Object.entries(TAGS).map(([key, tag]) =>
        `<button class="filter-btn" id="filter-btn-${key}" onclick="toggleFilter('${key}')"
          style="--tag-color:${tag.color}">${tag.label}</button>`
      ).join('') +
      `<button class="filter-btn filter-btn-all active" id="filter-btn-all" onclick="clearFilters()">Alles</button>`
  }

  window.toggleFilter = (key) => {
    if (activeFilters.has(key)) activeFilters.delete(key)
    else activeFilters.add(key)
    document.getElementById(`filter-btn-${key}`)?.classList.toggle('active', activeFilters.has(key))
    document.getElementById('filter-btn-all')?.classList.toggle('active', activeFilters.size === 0)
    applyFilter()
  }

  window.clearFilters = () => {
    activeFilters.clear()
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
    document.getElementById('filter-btn-all')?.classList.add('active')
    applyFilter()
  }

  function applyFilter() {
    document.querySelectorAll('.log-entry').forEach(el => {
      if (activeFilters.size === 0) { el.style.display = ''; return }
      const entry = entries.find(e => e.id === el.dataset.id)
      const tags = entry?.tags || []
      el.style.display = [...activeFilters].some(f => tags.includes(f)) ? '' : 'none'
    })
    const visible = activeFilters.size === 0
      ? entries.length
      : entries.filter(e => [...activeFilters].some(f => (e.tags||[]).includes(f))).length
    document.getElementById('entry-count').textContent =
      activeFilters.size > 0 ? `${visible}/${entries.length}` : entries.length
  }

  renderFilterBar()

  // ── Keyboard shortcuts ────────────────────────────────────────────
  function handleGlobalKey(e) {
    const tag = document.activeElement?.tagName
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable

    if (e.key === 'Escape') {
      if (document.getElementById('sync-modal')?.style.display     !== 'none') { window.closeSync();        return }
      if (document.getElementById('atem-modal')?.style.display     !== 'none') { window.closeAtemBridge();  return }
      if (document.getElementById('export-modal')?.style.display   !== 'none') { closeExportModal();        return }
      if (document.getElementById('shortcuts-modal')?.style.display !== 'none') { window.closeShortcuts();  return }
      return
    }

    if (inInput) return

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault()
      document.getElementById('note-input')?.focus()
      return
    }
    if (e.key === '?') { window.openShortcuts(); return }

    const tagKey = SHORTCUT_TO_TAG[e.key.toLowerCase()]
    if (tagKey) {
      window.toggleInputTag(tagKey)
      document.getElementById('note-input')?.focus()
    }
  }
  window.addEventListener('keydown', handleGlobalKey)

  // ── FPS ───────────────────────────────────────────────────────────
  window.cycleFps = async () => {
    const idx = FPS_OPTIONS.indexOf(tc.fps)
    tc.fps = FPS_OPTIONS[(idx + 1) % FPS_OPTIONS.length]
    document.getElementById('fps-label').textContent = tc.fps + ' fps'
    const { error } = await supabase.from('sessions').update({ fps: tc.fps }).eq('id', sessionId)
    if (error) console.error('FPS sync error:', error)
  }

  // ── Pending banner ────────────────────────────────────────────────
  function updatePendingBanner() {
    const banner = document.getElementById('pending-banner')
    if (!banner) return
    const count = getUnsynced(sessionId).length
    if (!count) { banner.style.display = 'none'; return }
    banner.style.display = 'block'
    banner.textContent = `${count} notitie${count !== 1 ? 's' : ''} niet gesynchroniseerd — wordt automatisch verzonden`
  }

  // ── Tag helpers ───────────────────────────────────────────────────
  function renderTagBadges(tags) {
    if (!tags?.length) return ''
    return tags.map(key => {
      const t = TAGS[key]
      if (!t) return ''
      return `<span class="tag-badge" style="color:${t.color};border-color:${t.color}60;background:${t.color}18">${t.label}</span>`
    }).join('')
  }

  // ── Logging ───────────────────────────────────────────────────────
  window.logNote = async () => {
    const input = document.getElementById('note-input')
    const text = input.value.trim()
    if (!text) return

    const id = crypto.randomUUID()
    const timecode  = tc.getTC()
    const elapsed_s = parseFloat(tc.getElapsedSec().toFixed(3))
    const wall_time = new Date().toISOString()
    const tags      = [...selectedTags]
    const entryData = { id, session_id: sessionId, timecode, elapsed_s, note: text, wall_time, tags }

    bufferEntry(sessionId, { ...entryData, localId: id, synced: false })

    input.value = ''
    autoResize(input)
    // Reset selected tags
    selectedTags = []
    document.querySelectorAll('.tag-input-btn.active').forEach(b => b.classList.remove('active'))

    renderEntry({ ...entryData, pending: true })
    updatePendingBanner()

    const { error } = await supabase
      .from('log_entries')
      .upsert(entryData, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      console.error('[log] Opslaan mislukt:', error, entryData)
      showToast('Opslaan mislukt — wordt opnieuw geprobeerd', 'error')
      return
    }

    markSynced(sessionId, id)
    document.querySelector(`.log-entry[data-id="${id}"]`)?.classList.remove('pending')
    updatePendingBanner()
  }

  window.handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.logNote() }
  }

  window.autoResize = (el) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }

  function renderEntry(entry, prepend = false) {
    const container = document.getElementById('log-entries')
    document.getElementById('log-empty')?.remove()

    const tags = Array.isArray(entry.tags) ? entry.tags : []
    const tagsHtml = tags.length
      ? `<div class="entry-tags">${renderTagBadges(tags)}</div>`
      : ''

    const el = document.createElement('div')
    el.className = `log-entry${entry.pending ? ' pending' : ''}`
    el.dataset.id = entry.id
    el.innerHTML = `
      <div class="entry-tc">${entry.timecode}</div>
      <div class="entry-body">${tagsHtml}<div class="entry-text">${escHtml(entry.note)}</div></div>
      <button class="entry-delete" onclick="deleteEntry('${entry.id}')" title="Verwijder">×</button>
    `

    if (prepend) container.prepend(el)
    else { container.appendChild(el); container.scrollTop = container.scrollHeight }

    entries.push({ ...entry, tags })

    // Verberg als actieve filter dit niet matcht
    if (activeFilters.size > 0 && !tags.some(t => activeFilters.has(t))) {
      el.style.display = 'none'
    }

    applyFilter()
    updateExportBtns()
  }

  window.deleteEntry = async (id) => {
    if (!confirm('Notitie verwijderen?')) return
    const isPending = document.querySelector(`.log-entry[data-id="${id}"]`)?.classList.contains('pending')
    if (isPending) {
      removePending(sessionId, id)
    } else {
      const { error } = await supabase.from('log_entries').delete().eq('id', id)
      if (error) { console.error('Delete error:', error); showToast('Verwijderen mislukt', 'error'); return }
    }
    entries = entries.filter(e => e.id !== id)
    document.querySelector(`.log-entry[data-id="${id}"]`)?.remove()
    if (!entries.length) showEmptyState()
    applyFilter()
    updateExportBtns()
    updatePendingBanner()
  }

  window.clearLog = async () => {
    if (!entries.length) return
    if (!confirm('Alle notities wissen?')) return
    const { error } = await supabase.from('log_entries').delete().eq('session_id', sessionId)
    if (error) { console.error('Clear error:', error); showToast('Wissen mislukt', 'error'); return }
    clearPendingBuffer(sessionId)
    entries = []
    showEmptyState()
    activeFilters.clear()
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
    document.getElementById('filter-btn-all')?.classList.add('active')
    updateExportBtns()
    updatePendingBanner()
  }

  function showEmptyState() {
    document.getElementById('log-entries').innerHTML = `
      <div class="log-empty" id="log-empty">
        <div style="font-size:22px;opacity:0.3">◈</div>
        <div>Nog geen notities</div>
        <div style="opacity:0.5">Typ hieronder en druk Enter</div>
      </div>`
    document.getElementById('entry-count').textContent = '0'
  }

  function updateExportBtns() {
    const has = entries.length > 0
    document.getElementById('export-btn').disabled = !has
    document.getElementById('clear-btn').disabled = !has
  }

  // ── Export modal ──────────────────────────────────────────────────
  window.openExportModal = () => {
    exportTagFilter.clear()
    const grid = document.getElementById('export-tag-grid')
    grid.innerHTML = Object.entries(TAGS).map(([key, tag]) =>
      `<button class="export-tag-btn" id="exp-tag-${key}" onclick="toggleExportTag('${key}')"
        style="--tag-color:${tag.color}">${tag.label}</button>`
    ).join('')
    document.getElementById('export-modal').style.display = 'flex'
  }

  function closeExportModal() {
    document.getElementById('export-modal').style.display = 'none'
  }
  window.closeExportModal = closeExportModal

  window.toggleExportTag = (key) => {
    if (exportTagFilter.has(key)) exportTagFilter.delete(key)
    else exportTagFilter.add(key)
    document.getElementById(`exp-tag-${key}`)?.classList.toggle('active', exportTagFilter.has(key))
  }

  window.doExport = (type) => {
    const filter = [...exportTagFilter]
    const data = filter.length
      ? entries.filter(e => filter.some(f => (e.tags||[]).includes(f)))
      : entries
    if (type === 'csv') exportCSVData(data)
    else exportTXTData(data)
    closeExportModal()
  }

  function tagLabels(tags) {
    return (tags||[]).map(k => TAGS[k]?.label || k).join(', ')
  }

  function exportCSVData(data) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Sessie', session.name],
      ['Operator', session.operator || '—'],
      ['Datum', new Date().toLocaleDateString('nl-NL')],
      [],
      ['Timecode', 'Categorieën', 'Notitie', 'Tijdstip'],
      ...data.map(e => [
        e.timecode,
        tagLabels(e.tags),
        e.note,
        new Date(e.wall_time).toLocaleTimeString('nl-NL')
      ])
    ]
    const csv = lines.map(row => row.map(esc).join(';')).join('\r\n')
    download('﻿' + csv, `${slug(session.name)}-log.csv`, 'text/csv;charset=utf-8')
  }

  function exportTXTData(data) {
    const lines = [
      `SESSIE: ${session.name}`,
      `OPERATOR: ${session.operator || '—'}`,
      `DATUM: ${new Date().toLocaleDateString('nl-NL')}  ${new Date().toLocaleTimeString('nl-NL')}`,
      '─'.repeat(48),
      '',
      ...data.map(e => {
        const cats = tagLabels(e.tags)
        return `[${e.timecode}]${cats ? `  [${cats}]` : ''}  ${e.note}`
      }),
      '',
      '─'.repeat(48),
      `Totaal: ${data.length} notitie(s)`
    ]
    download(lines.join('\n'), `${slug(session.name)}-log.txt`, 'text/plain')
  }

  // ── Realtime ──────────────────────────────────────────────────────
  const rtDot   = document.getElementById('rt-dot')
  const rtLabel = document.getElementById('rt-label')

  const channel = supabase
    .channel(`session-${sessionId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'log_entries' },
      ({ new: entry }) => {
        if (entry.session_id !== sessionId) return
        if (entries.find(e => e.id === entry.id)) return
        renderEntry(entry)
      })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'log_entries' },
      ({ old: entry }) => {
        if (!entries.find(e => e.id === entry.id)) return
        entries = entries.filter(e => e.id !== entry.id)
        document.querySelector(`.log-entry[data-id="${entry.id}"]`)?.remove()
        if (!entries.length) showEmptyState()
        applyFilter()
        updateExportBtns()
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' },
      ({ new: s }) => {
        if (s.id !== sessionId) return
        if (s.timer_started_at) tc.startSession(new Date(s.timer_started_at).getTime())
        if (s.fps && s.fps !== tc.fps) {
          tc.fps = s.fps
          const lbl = document.getElementById('fps-label')
          if (lbl) lbl.textContent = s.fps + ' fps'
        }
      })
    .subscribe((status) => {
      const connected = status === 'SUBSCRIBED'
      rtDot.classList.toggle('connected', connected)
      rtLabel.textContent = connected ? 'LIVE' : 'SYNC'
    })

  // ── ATEM channel ──────────────────────────────────────────────────
  function createAtemChannel(name) {
    const channelName = name ? `atem-tc-${name}` : 'atem-tc'
    return supabase.channel(channelName)
      .on('broadcast', { event: 'timecode' }, ({ payload }) => {
        tc.receiveAtemTC(payload.tc, payload.ts)
        lastAtemReceived = Date.now()
      })
      .on('broadcast', { event: 'bridge-status' }, ({ payload }) => {
        bridgeStatus = payload.status
        updateAtemDot()
      })
      .subscribe()
  }

  const savedBridgeName = localStorage.getItem('atem-bridge-name')
  let atemChannel = createAtemChannel(savedBridgeName)

  // ── Load existing entries ─────────────────────────────────────────
  const { data: existingEntries } = await supabase
    .from('log_entries')
    .select('*')
    .eq('session_id', sessionId)
    .order('wall_time', { ascending: true })

  if (existingEntries?.length) existingEntries.forEach(e => renderEntry(e))

  // ── Offline pending ───────────────────────────────────────────────
  const unsynced = getUnsynced(sessionId)
  if (unsynced.length) {
    const existingIds = new Set((existingEntries||[]).map(e => e.id))
    unsynced.forEach(e => {
      if (!existingIds.has(e.id)) {
        const { localId, synced: _s, ...display } = e
        renderEntry({ ...display, pending: true })
      }
    })
    updatePendingBanner()
    syncPending(sessionId, supabase).then(count => {
      if (count > 0) {
        unsynced.forEach(e => document.querySelector(`.log-entry[data-id="${e.id}"]`)?.classList.remove('pending'))
        updatePendingBanner()
        showToast(`${count} notitie${count !== 1 ? 's' : ''} gesynchroniseerd`, 'success')
      }
    })
  }

  window.addEventListener('online', onOnline)
  function onOnline() {
    syncPending(sessionId, supabase).then(count => {
      if (!count) return
      getUnsynced(sessionId).forEach(e =>
        document.querySelector(`.log-entry[data-id="${e.id}"]`)?.classList.remove('pending'))
      updatePendingBanner()
      showToast(`${count} notitie${count !== 1 ? 's' : ''} gesynchroniseerd`, 'success')
    })
  }

  // ── Camera ────────────────────────────────────────────────────────
  let onDeviceChange = null
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => { stream.getTracks().forEach(t => t.stop()); return camera.populateDevices() })
      .catch(() => camera.populateDevices())
    onDeviceChange = () => camera.populateDevices()
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
  }

  // ── Restore TC mode ───────────────────────────────────────────────
  const savedMode = sessionStorage.getItem(`tc-mode-${sessionId}`)
  if (savedMode && savedMode !== 'session') window.setTcMode(savedMode)

  document.getElementById('note-input').focus()

  const atemDotInterval = setInterval(updateAtemDot, 500)

  document.getElementById('atem-bridge-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.connectAtem()
  })

  // ── Cleanup ───────────────────────────────────────────────────────
  window._loggerCleanup = () => {
    cancelAnimationFrame(rafId)
    clearInterval(atemDotInterval)
    camera.stop()
    if (onDeviceChange) navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
    window.removeEventListener('keydown', handleGlobalKey)
    window.removeEventListener('online', onOnline)
    supabase.removeChannel(channel)
    supabase.removeChannel(atemChannel)
    sessionStorage.removeItem(`tc-mode-${sessionId}`)
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function slug(s) {
  const base = s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
  return base || 'sessie'
}
