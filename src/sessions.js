import { supabase } from './supabase.js'

export async function renderSessions(user) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="sessions-screen">
      <div class="sessions-header">
        <img src="/logo.svg" alt="Breadcrumb" style="height:32px">
        <div class="user-info">
          <span>${user.email}</span>
          <button class="btn btn-ghost btn-sm" onclick="logout()">Uitloggen</button>
        </div>
      </div>

      <div class="sessions-body">
        <div class="sessions-top">
          <span class="sessions-title">Sessies</span>
          <button class="btn btn-primary" onclick="openNewSessionModal()">+ Nieuwe sessie</button>
        </div>
        <div class="sessions-list" id="sessions-list">
          <div class="sessions-empty">Laden…</div>
        </div>
      </div>
    </div>

    <!-- Nieuwe sessie modal -->
    <div class="modal-overlay" id="new-session-modal" style="display:none">
      <div class="modal">
        <h2>NIEUWE SESSIE</h2>
        <div class="field">
          <label>Sessienaam</label>
          <input type="text" id="new-session-name" placeholder="bijv. Opname dag 1" />
        </div>
        <div class="field">
          <label>Operator</label>
          <input type="text" id="new-session-operator" placeholder="bijv. Jeffrey" />
        </div>
        <div class="field">
          <label>Framerate</label>
          <select id="new-session-fps" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;padding:9px 12px;outline:none;cursor:pointer">
            <option value="24">24 fps</option>
            <option value="25" selected>25 fps</option>
            <option value="30">30 fps</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeNewSessionModal()" style="flex:1">Annuleer</button>
          <button class="btn btn-primary" onclick="createSession()" style="flex:1" id="create-session-btn">Aanmaken</button>
        </div>
      </div>
    </div>
  `

  window.logout = async () => {
    await supabase.auth.signOut()
  }

  window.openNewSessionModal = () => {
    document.getElementById('new-session-modal').style.display = 'flex'
    document.getElementById('new-session-name').focus()
  }

  window.closeNewSessionModal = () => {
    document.getElementById('new-session-modal').style.display = 'none'
  }

  window.createSession = async () => {
    const name = document.getElementById('new-session-name').value.trim() || 'Sessie'
    const operator = document.getElementById('new-session-operator').value.trim()
    const fps = parseInt(document.getElementById('new-session-fps').value)
    const btn = document.getElementById('create-session-btn')
    btn.disabled = true

    const { data, error } = await supabase
      .from('sessions')
      .insert({ name, operator, fps, user_id: user.id })
      .select()
      .single()

    if (error) {
      btn.disabled = false
      alert('Fout bij aanmaken: ' + error.message)
      return
    }

    location.hash = `#/session/${data.id}`
  }

  window.renameSession = async (ev, id) => {
    ev.stopPropagation()
    const s = _sessions.find(x => x.id === id)
    const name = prompt('Nieuwe naam voor de sessie:', s?.name ?? '')
    if (!name || !name.trim() || name.trim() === s?.name) return
    const { error } = await supabase.from('sessions').update({ name: name.trim() }).eq('id', id)
    if (error) { alert('Hernoemen mislukt: ' + error.message); return }
    await loadSessions(user.id)
  }

  window.deleteSession = async (ev, id) => {
    ev.stopPropagation()
    const s = _sessions.find(x => x.id === id)
    if (!confirm(`Sessie "${s?.name ?? ''}" en alle bijbehorende notities verwijderen?`)) return
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) { alert('Verwijderen mislukt: ' + error.message); return }
    await loadSessions(user.id)
  }

  // Enter key in modal
  setTimeout(() => {
    document.getElementById('new-session-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('new-session-operator').focus()
    })
    document.getElementById('new-session-operator')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') window.createSession()
    })
  }, 0)

  await loadSessions(user.id)
}

let _sessions = []

async function loadSessions(userId) {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*, log_entries(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const list = document.getElementById('sessions-list')
  if (!list) return

  _sessions = sessions ?? []

  if (error || !sessions?.length) {
    list.innerHTML = `
      <div class="sessions-empty">
        <div>Nog geen sessies</div>
        <div style="opacity:0.5;margin-top:4px">Klik op "Nieuwe sessie" om te beginnen</div>
      </div>
    `
    return
  }

  list.innerHTML = sessions.map(s => {
    const count = s.log_entries?.[0]?.count ?? 0
    const date = new Date(s.created_at).toLocaleDateString('nl-NL', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    return `
      <div class="session-card" onclick="location.hash='#/session/${s.id}'">
        <div class="session-card-left">
          <div class="session-card-name">${escHtml(s.name)}</div>
          <div class="session-card-meta">
            <span>${date}</span>
            ${s.operator ? `<span>· ${escHtml(s.operator)}</span>` : ''}
            <span>· ${s.fps} fps</span>
          </div>
        </div>
        <div class="session-card-right">
          <span class="entry-badge">${count} notities</span>
          <button class="card-action" onclick="renameSession(event, '${s.id}')" title="Hernoem sessie">✎</button>
          <button class="card-action card-action-danger" onclick="deleteSession(event, '${s.id}')" title="Verwijder sessie">×</button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9,18 15,12 9,6"/></svg>
        </div>
      </div>
    `
  }).join('')
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
