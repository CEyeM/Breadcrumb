import { supabase } from './supabase.js'
import { TimecodeEngine, FPS_OPTIONS, parseTCtoMs } from './timecode.js'
import { CameraManager } from './camera.js'

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
            <button class="tc-mode-btn" id="mode-tod" onclick="setTcMode('tod')">SYNC</button>
            <button class="tc-mode-btn" id="mode-atem-live" onclick="openAtemBridge()">
              <span class="atem-dot" id="atem-dot"></span>ATEM LIVE
            </button>
            <button class="btn btn-ghost btn-sm" id="sync-btn" onclick="openSync()" style="display:none">⟲ Sync</button>
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
              <button class="btn btn-ghost btn-sm" onclick="exportCSV()" id="export-btn" disabled>↓ Export CSV</button>
              <button class="btn btn-ghost btn-sm" onclick="exportTXT()" id="export-txt-btn" disabled>↓ Export TXT</button>
              <button class="btn btn-danger btn-sm" onclick="clearLog()" id="clear-btn" disabled>Wis</button>
            </div>
          </div>

          <div id="log-entries">
            <div class="log-empty" id="log-empty">
              <div style="font-size:22px;opacity:0.3">◈</div>
              <div>Nog geen notities</div>
              <div style="opacity:0.5">Typ hieronder en druk Enter</div>
            </div>
          </div>

          <div class="input-area">
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
        <p>Vul de bridge-naam in die je in de Breadcrumb Bridge app hebt gekozen. Het ATEM IP-adres stel je in de bridge app zelf in.</p>
        <div class="field">
          <label>Bridge naam <span style="font-size:10px;opacity:0.5">(zelfde als in de bridge app)</span></label>
          <input type="text" id="atem-bridge-name" placeholder="bijv. jeffrey-studio" />
        </div>
        <button class="btn btn-primary" id="atem-connect-btn" onclick="connectAtem()" style="width:100%;justify-content:center">
          Verbinden
        </button>

        <div id="atem-command-block" style="display:none;margin-top:20px">
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
            <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">Bridge op je Mac</div>
            <button onclick="startBridge()"
               style="display:inline-block;background:var(--accent);color:#000;font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 16px;border-radius:6px;border:none;cursor:pointer;letter-spacing:0.04em">
              ▶ Start Bridge
            </button>
            <div id="bridge-download-hint" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
              <p style="font-family:var(--mono);font-size:11px;color:var(--text);margin:0 0 10px">
                Nog geen bridge geïnstalleerd? Download hem hier:
              </p>
              <div style="display:flex;gap:8px">
                <a href="https://github.com/CEyeM/Breadcrumb/releases/latest/download/Breadcrumb-Bridge-arm64.zip"
                   onclick="showBridgeOsHint('mac')"
                   style="flex:1;text-align:center;background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 12px;border-radius:6px;text-decoration:none;letter-spacing:0.04em">
                   Mac
                </a>
                <a href="https://github.com/CEyeM/Breadcrumb/releases/latest/download/Breadcrumb-Bridge-windows.zip"
                   onclick="showBridgeOsHint('win')"
                   style="flex:1;text-align:center;background:var(--surface);color:var(--text);border:1px solid var(--border);font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 12px;border-radius:6px;text-decoration:none;letter-spacing:0.04em">
                  ⊞ Windows
                </a>
              </div>
              <div id="bridge-os-hint-mac" style="display:none;font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px">
                Unzip → sleep naar Programma's → eerste keer: rechtermuisknop → Open
              </div>
              <div id="bridge-os-hint-win" style="display:none;font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:8px">
                Unzip → dubbelklik Breadcrumb Bridge.exe → vul IP en naam in het venster in
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
  `

  // ── State ─────────────────────────────────────────────────────────
  const tc = new TimecodeEngine()
  tc.fps = session.fps
  tc.startSession(new Date(session.created_at).getTime())

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

  // ── Clock loop ────────────────────────────────────────────────────
  function tick() {
    const tcStr = tc.getTC()
    document.getElementById('master-clock').textContent = tcStr
    document.getElementById('tc-overlay').textContent = 'TC  ' + tcStr
    rafId = requestAnimationFrame(tick)
  }
  tick()

  // ── TC mode ───────────────────────────────────────────────────────
  window.resetTimer = () => {
    tc.startSession(Date.now())
  }

  window.setTcMode = (mode) => {
    tc.setMode(mode)
    ;['session','tod','atem-live'].forEach(m => {
      document.getElementById(`mode-${m}`)?.classList.toggle('active', m === mode)
    })
    document.getElementById('sync-btn').style.display = mode === 'tod' ? 'inline-flex' : 'none'
  }

  // ── ATEM Bridge modal ─────────────────────────────────────────────
  let lastAtemReceived = 0

  window.openAtemBridge = () => {
    document.getElementById('atem-modal').style.display = 'flex'
    const savedName = localStorage.getItem('atem-bridge-name')
    if (savedName) {
      document.getElementById('atem-bridge-name').value = savedName
      showAtemInfo()
    }
    document.getElementById('atem-bridge-name').focus()
  }

  window.closeAtemBridge = () => {
    document.getElementById('atem-modal').style.display = 'none'
  }

  window.connectAtem = () => {
    const name = document.getElementById('atem-bridge-name').value.trim()
    if (!name) return
    localStorage.setItem('atem-bridge-name', name)
    showAtemInfo()
    // Herstart kanaal met nieuwe bridge naam
    supabase.removeChannel(atemChannel)
    atemChannel = createAtemChannel(name)
    window.setTcMode('atem-live')
  }

  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)

  function showAtemInfo() {
    document.getElementById('atem-command-block').style.display = 'block'
    document.getElementById('atem-connect-btn').textContent = 'Opnieuw verbinden'
    // Toon de instructies voor het eigen systeem alvast
    window.showBridgeOsHint(isMac ? 'mac' : 'win')
  }

  window.startBridge = () => {
    if (!isMac) {
      // Windows: geen URL scheme — gebruiker start de .exe handmatig
      window.showBridgeOsHint('win')
      return
    }
    // Open de bridge app via het breadcrumb:// URL scheme
    location.href = 'breadcrumb://start'
  }

  window.showBridgeOsHint = (os) => {
    document.getElementById('bridge-os-hint-mac').style.display = os === 'mac' ? 'block' : 'none'
    document.getElementById('bridge-os-hint-win').style.display = os === 'win' ? 'block' : 'none'
  }

  function updateAtemDot() {
    const age = Date.now() - lastAtemReceived
    const connected = lastAtemReceived > 0 && age < 3000
    const dot = document.getElementById('atem-dot')
    const modalDot = document.getElementById('atem-status-dot')
    const modalLabel = document.getElementById('atem-status-label')
    if (dot) dot.style.background = connected ? 'var(--green)' : 'transparent'
    if (modalDot) modalDot.classList.toggle('connected', connected)
    if (modalLabel) modalLabel.textContent = connected
      ? `Actief — TC ontvangen`
      : lastAtemReceived > 0 ? 'Verbinding verbroken' : 'Wachten op bridge…'
  }

  window.openSync = () => {
    document.getElementById('sync-modal').style.display = 'flex'
    document.getElementById('sync-tc').value = tc.getTC()
    document.getElementById('sync-tc').focus()
    document.getElementById('sync-tc').select()
  }

  window.closeSync = () => {
    document.getElementById('sync-modal').style.display = 'none'
  }

  window.applySync = () => {
    const raw = document.getElementById('sync-tc').value.trim()
    const ok = tc.syncTOD(raw)
    if (!ok) {
      document.getElementById('sync-tc').classList.add('error')
      return
    }
    window.closeSync()
  }

  document.getElementById('sync-tc')?.addEventListener('input', () => {
    document.getElementById('sync-tc').classList.remove('error')
  })
  document.getElementById('sync-tc')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.applySync()
  })

  // ── FPS cycle ─────────────────────────────────────────────────────
  window.cycleFps = () => {
    const idx = FPS_OPTIONS.indexOf(tc.fps)
    tc.fps = FPS_OPTIONS[(idx + 1) % FPS_OPTIONS.length]
    document.getElementById('fps-label').textContent = tc.fps + ' fps'
  }

  // ── Logging ───────────────────────────────────────────────────────
  window.logNote = async () => {
    const input = document.getElementById('note-input')
    const text = input.value.trim()
    if (!text) return

    const timecode = tc.getTC()
    const elapsed_s = parseFloat(tc.getElapsedSec().toFixed(3))
    const wall_time = new Date().toISOString()

    const { data, error } = await supabase
      .from('log_entries')
      .insert({ session_id: sessionId, timecode, elapsed_s, note: text, wall_time })
      .select()
      .single()

    if (error) {
      console.error('Log error:', error)
      return
    }

    // Direct tonen — Realtime is alleen voor andere apparaten
    renderEntry(data)
    input.value = ''
    autoResize(input)
  }

  window.handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      window.logNote()
    }
  }

  window.autoResize = (el) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }

  function renderEntry(entry, prepend = false) {
    const container = document.getElementById('log-entries')
    document.getElementById('log-empty')?.remove()

    const el = document.createElement('div')
    el.className = 'log-entry'
    el.dataset.id = entry.id
    el.innerHTML = `
      <div class="entry-tc">${entry.timecode}</div>
      <div class="entry-text">${escHtml(entry.note)}</div>
      <button class="entry-delete" onclick="deleteEntry('${entry.id}')" title="Verwijder">×</button>
    `
    if (prepend) {
      container.prepend(el)
    } else {
      container.appendChild(el)
      container.scrollTop = container.scrollHeight
    }
    entries.push(entry)
    document.getElementById('entry-count').textContent = entries.length
    updateExportBtns()
  }

  window.deleteEntry = async (id) => {
    if (!confirm('Notitie verwijderen?')) return
    const { error } = await supabase.from('log_entries').delete().eq('id', id)
    if (error) { console.error('Delete error:', error); return }

    entries = entries.filter(e => e.id !== id)
    document.querySelector(`.log-entry[data-id="${id}"]`)?.remove()
    document.getElementById('entry-count').textContent = entries.length
    if (!entries.length) {
      document.getElementById('log-entries').innerHTML = `
        <div class="log-empty" id="log-empty">
          <div style="font-size:22px;opacity:0.3">◈</div>
          <div>Nog geen notities</div>
          <div style="opacity:0.5">Typ hieronder en druk Enter</div>
        </div>`
    }
    updateExportBtns()
  }

  window.clearLog = async () => {
    if (!entries.length) return
    if (!confirm('Alle notities wissen?')) return
    await supabase.from('log_entries').delete().eq('session_id', sessionId)
  }

  function updateExportBtns() {
    const has = entries.length > 0
    document.getElementById('export-btn').disabled = !has
    document.getElementById('export-txt-btn').disabled = !has
    document.getElementById('clear-btn').disabled = !has
  }

  // ── Export ────────────────────────────────────────────────────────
  window.exportCSV = () => {
    const header = 'Timecode,Elapsed (s),Notitie,Tijdstip\n'
    const rows = entries.map(e =>
      `"${e.timecode}","${e.elapsed_s}","${e.note.replace(/"/g,'""')}","${e.wall_time}"`
    ).join('\n')
    const meta = `# Sessie: ${session.name}\n# Operator: ${session.operator}\n# Datum: ${new Date().toLocaleDateString('nl-NL')}\n\n`
    download(meta + header + rows, `${slug(session.name)}-log.csv`, 'text/csv')
  }

  window.exportTXT = () => {
    const lines = [
      `SESSIE: ${session.name}`,
      `OPERATOR: ${session.operator || '—'}`,
      `DATUM: ${new Date().toLocaleDateString('nl-NL')}  ${new Date().toLocaleTimeString('nl-NL')}`,
      '─'.repeat(48),
      '',
      ...entries.map(e => `[${e.timecode}]  ${e.note}`),
      '',
      '─'.repeat(48),
      `Totaal: ${entries.length} notitie(s)`
    ]
    download(lines.join('\n'), `${slug(session.name)}-log.txt`, 'text/plain')
  }

  // ── Realtime subscription ─────────────────────────────────────────
  const rtDot = document.getElementById('rt-dot')
  const rtLabel = document.getElementById('rt-label')

  const channel = supabase
    .channel(`session-${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'log_entries'
    }, ({ new: entry }) => {
      if (entry.session_id !== sessionId) return
      if (entries.find(e => e.id === entry.id)) return
      renderEntry(entry)
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'log_entries'
    }, ({ old: entry }) => {
      if (!entries.find(e => e.id === entry.id)) return
      entries = entries.filter(e => e.id !== entry.id)
      document.querySelector(`.log-entry[data-id="${entry.id}"]`)?.remove()
      document.getElementById('entry-count').textContent = entries.length
      if (!entries.length) {
        document.getElementById('log-entries').innerHTML = `
          <div class="log-empty" id="log-empty">
            <div style="font-size:22px;opacity:0.3">◈</div>
            <div>Nog geen notities</div>
            <div style="opacity:0.5">Typ hieronder en druk Enter</div>
          </div>
        `
      }
      updateExportBtns()
    })
    .subscribe((status) => {
      const connected = status === 'SUBSCRIBED'
      rtDot.classList.toggle('connected', connected)
      rtLabel.textContent = connected ? 'LIVE' : 'SYNC'
    })

  // ATEM Live TC broadcast — kanaal per bridge naam
  function createAtemChannel(name) {
    const channelName = name ? `atem-tc-${name}` : 'atem-tc'
    return supabase
      .channel(channelName)
      .on('broadcast', { event: 'timecode' }, ({ payload }) => {
        tc.receiveAtemTC(payload.tc, payload.ts)
        lastAtemReceived = Date.now()
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

  if (existingEntries?.length) {
    existingEntries.forEach(e => renderEntry(e))
  }

  // ── Camera device list ─────────────────────────────────────────────
  // Vraag kort toestemming om device-labels te kunnen tonen, stop dan meteen
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop())
        return camera.populateDevices()
      })
      .catch(() => camera.populateDevices()) // geen toestemming: toon generieke namen
    navigator.mediaDevices.addEventListener('devicechange', () => camera.populateDevices())
  }

  // ── Focus ─────────────────────────────────────────────────────────
  document.getElementById('note-input').focus()

  // ── Cleanup on navigate away ──────────────────────────────────────
  const atemDotInterval = setInterval(updateAtemDot, 500)

  // Enter key in bridge naam veld
  document.getElementById('atem-bridge-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.connectAtem()
  })

  window._loggerCleanup = () => {
    cancelAnimationFrame(rafId)
    clearInterval(atemDotInterval)
    camera.stop()
    supabase.removeChannel(channel)
    supabase.removeChannel(atemChannel)
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

function slug(s) {
  return s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')
}
