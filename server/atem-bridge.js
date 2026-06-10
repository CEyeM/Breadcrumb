// Laad Supabase credentials uit de parent .env (de frontend .env)
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const { Atem } = require('atem-connection')
const { createClient } = require('@supabase/supabase-js')

// ATEM IP als argument: node atem-bridge.js 192.168.1.100
const ATEM_IP = process.argv[2]
if (!ATEM_IP) {
  console.error('Gebruik: node atem-bridge.js <ATEM-IP>')
  console.error('Voorbeeld: node atem-bridge.js 192.168.1.100')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('VITE_SUPABASE_URL of VITE_SUPABASE_ANON_KEY ontbreekt in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const channel = supabase.channel('atem-tc', {
  config: { broadcast: { self: false } }
})

channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') console.log('[supabase] Realtime channel actief')
})

const atem = new Atem()
let lastSentAt = 0
const MIN_INTERVAL_MS = 100

atem.on('connected', () => console.log(`[atem] Verbonden met ${ATEM_IP}`))

atem.on('disconnected', () => {
  console.log('[atem] Verbinding verbroken — opnieuw proberen over 5s...')
  setTimeout(() => atem.connect(ATEM_IP), 5000)
})

atem.on('stateChanged', (state, pathToChange) => {
  const hasTC = pathToChange.some(p => p.toLowerCase().includes('timecode'))
  if (!hasTC) return

  const now = Date.now()
  if (now - lastSentAt < MIN_INTERVAL_MS) return
  lastSentAt = now

  const tc = state.timecode
  if (!tc) return

  const tcStr = formatTC(tc)
  channel.send({ type: 'broadcast', event: 'timecode', payload: { tc: tcStr, ts: now } })
  process.stdout.write(`\r[atem] TC: ${tcStr}   `)
})

atem.on('error', (e) => console.error('[atem] Fout:', e))

console.log(`[atem] Verbinden met ${ATEM_IP}...`)
atem.connect(ATEM_IP)
