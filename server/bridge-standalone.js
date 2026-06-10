const { Atem } = require('atem-connection')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const os = require('os')

// Supabase credentials (anon/publishable key — veilig om in te embedden)
const SUPABASE_URL = 'https://aaklxfglfeublhrgmlbj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Tnvx5IGShAXuPzSh4E4bpA_SF5hlFoG'

// Config uit ~/.config/breadcrumb/bridge.json (aangemaakt door de launcher)
const CONFIG_FILE = path.join(os.homedir(), '.config', 'breadcrumb', 'bridge.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch { return null }
}

const config = loadConfig()
let ATEM_IP = process.argv[2] || config?.ip
let BRIDGE_NAME = process.argv[3] || config?.name

main()

async function main() {
  // Interactief (Windows .exe dubbelklik, of terminal): vraag IP en naam,
  // met de vorige waarden als standaard. Op macOS regelt de launcher dit.
  if (process.stdin.isTTY && !process.argv[2]) {
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const ask = (q) => new Promise(res => rl.question(q, res))

    console.log('=== Breadcrumb Bridge ===\n')
    const ipAnswer = await ask(`ATEM IP-adres${ATEM_IP ? ` [${ATEM_IP}]` : ''}: `)
    ATEM_IP = ipAnswer.trim() || ATEM_IP
    const nameAnswer = await ask(`Bridge naam${BRIDGE_NAME ? ` [${BRIDGE_NAME}]` : ' (bijv. jeffrey-studio)'}: `)
    BRIDGE_NAME = nameAnswer.trim() || BRIDGE_NAME
    rl.close()

    if (ATEM_IP && BRIDGE_NAME) {
      fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ip: ATEM_IP, name: BRIDGE_NAME }) + '\n')
    }
  }

  if (!ATEM_IP) {
    console.error('Geen ATEM IP geconfigureerd. Open de Breadcrumb Bridge app opnieuw.')
    process.exit(1)
  }
  if (!BRIDGE_NAME) BRIDGE_NAME = 'default'

  startBridge()
}

function startBridge() {
const CHANNEL_NAME = `atem-tc-${BRIDGE_NAME}`
console.log(`[bridge] IP=${ATEM_IP}  kanaal=${CHANNEL_NAME}`)

// ws meegeven: de ingebakken Node runtime heeft geen native WebSocket
const ws = require('ws')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { transport: ws } })
const rtChannel = supabase.channel(CHANNEL_NAME, { config: { broadcast: { self: false } } })

rtChannel.subscribe((status) => {
  if (status === 'SUBSCRIBED') console.log(`[supabase] Actief: ${CHANNEL_NAME}`)
})

const atem = new Atem()
let lastSentAt = 0

atem.on('connected', () => console.log(`[atem] Verbonden met ${ATEM_IP}`))
atem.on('disconnected', () => {
  console.log('[atem] Verbinding verbroken — opnieuw over 5s...')
  setTimeout(() => atem.connect(ATEM_IP), 5000)
})

atem.on('stateChanged', (state, pathToChange) => {
  const hasTC = pathToChange.some(p => p.toLowerCase().includes('timecode'))
  if (!hasTC) return
  const now = Date.now()
  if (now - lastSentAt < 100) return
  lastSentAt = now
  const tc = state.timecode
  if (!tc) return
  const tcStr = formatTC(tc)
  rtChannel.send({ type: 'broadcast', event: 'timecode', payload: { tc: tcStr, ts: now } })
  process.stdout.write(`\r[TC] ${tcStr}   `)
})

atem.on('error', e => console.error('[atem] Fout:', e))

console.log(`[atem] Verbinden met ${ATEM_IP}...`)
atem.connect(ATEM_IP)
}

function formatTC(tc) {
  const pad = n => String(n).padStart(2, '0')
  if (Array.isArray(tc) || tc instanceof Uint8Array) {
    return `${pad(tc[0])}:${pad(tc[1])}:${pad(tc[2])}:${pad(tc[3])}`
  }
  return `${pad(tc.hours)}:${pad(tc.minutes)}:${pad(tc.seconds)}:${pad(tc.frames)}`
}
