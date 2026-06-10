import { supabase } from './supabase.js'

export function renderAuth() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <img src="/logo.svg" alt="Breadcrumb" style="height:48px;margin-bottom:8px">
        <div class="auth-subtitle">Timecode logger voor Blackmagic-workflows</div>

        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login" onclick="switchTab('login')">INLOGGEN</button>
          <button class="auth-tab" id="tab-register" onclick="switchTab('register')">ACCOUNT AANMAKEN</button>
        </div>

        <div class="auth-error" id="auth-error"></div>

        <div class="field">
          <label>E-mailadres</label>
          <input type="email" id="auth-email" placeholder="jij@voorbeeld.nl" autocomplete="email" />
        </div>
        <div class="field">
          <label>Wachtwoord</label>
          <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password" />
        </div>

        <button class="btn btn-primary" id="auth-submit" style="width:100%;justify-content:center" onclick="submitAuth()">
          Inloggen
        </button>
      </div>
    </div>
  `

  window.switchTab = (tab) => {
    document.getElementById('tab-login').classList.toggle('active', tab === 'login')
    document.getElementById('tab-register').classList.toggle('active', tab === 'register')
    document.getElementById('auth-submit').textContent = tab === 'login' ? 'Inloggen' : 'Account aanmaken'
    window._authTab = tab
    document.getElementById('auth-error').textContent = ''
  }

  window._authTab = 'login'

  window.submitAuth = async () => {
    const email = document.getElementById('auth-email').value.trim()
    const password = document.getElementById('auth-password').value
    const errEl = document.getElementById('auth-error')
    const btn = document.getElementById('auth-submit')

    if (!email || !password) {
      errEl.textContent = 'Vul e-mail en wachtwoord in.'
      return
    }

    btn.disabled = true
    btn.textContent = 'Even wachten…'
    errEl.textContent = ''

    let result
    if (window._authTab === 'login') {
      result = await supabase.auth.signInWithPassword({ email, password })
    } else {
      result = await supabase.auth.signUp({ email, password })
    }

    if (result.error) {
      errEl.textContent = translateError(result.error.message)
      btn.disabled = false
      btn.textContent = window._authTab === 'login' ? 'Inloggen' : 'Account aanmaken'
    }
    // onAuthStateChange in main.js handelt de redirect af
  }

  // Enter key
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') window.submitAuth()
  })
  document.getElementById('auth-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-password').focus()
  })

  document.getElementById('auth-email').focus()
}

function translateError(msg) {
  if (msg.includes('Invalid login')) return 'E-mail of wachtwoord klopt niet.'
  if (msg.includes('Email not confirmed')) return 'Bevestig eerst je e-mailadres (check je inbox).'
  if (msg.includes('already registered')) return 'Dit e-mailadres is al in gebruik.'
  if (msg.includes('Password should be')) return 'Wachtwoord moet minimaal 6 tekens zijn.'
  return msg
}
