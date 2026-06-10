export const FPS_OPTIONS = [24, 25, 30]

export function pad(v) {
  return String(Math.floor(v)).padStart(2, '0')
}

export function msToTC(ms, fps) {
  const totalSec = ms / 1000
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  const f = Math.floor((totalSec % 1) * fps)
  return [h, m, s, f].map(pad).join(':')
}

export function parseTCtoMs(tc, fps) {
  const m = tc.match(/^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, h, mn, s, f] = m.map(Number)
  return ((h * 3600 + mn * 60 + s) * 1000) + Math.round((f / fps) * 1000)
}

export class TimecodeEngine {
  constructor() {
    this.fps = 25
    this.mode = 'session'   // 'session' | 'tod' | 'atem-live'
    this.sessionStartWall = null
    this.todOffsetMs = 0
    this.atemLiveRef = null // { tcMs, receivedAt } — voor geëxtrapoleerde ATEM TC
  }

  setMode(mode) {
    this.mode = mode
  }

  startSession(wallClockStartMs) {
    // wallClockStartMs = Date.now() op het moment van sessie aanmaken
    // Sla op als offset t.o.v. nu zodat elapsed berekend kan worden
    this.sessionStartWall = wallClockStartMs ?? Date.now()
  }

  syncTOD(tc) {
    const ms = parseTCtoMs(tc, this.fps)
    if (ms === null) return false
    const now = new Date()
    const todayMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
    this.todOffsetMs = ms - todayMs
    return true
  }

  receiveAtemTC(tc, receivedAt) {
    const ms = parseTCtoMs(tc, this.fps)
    if (ms === null) return
    this.atemLiveRef = { tcMs: ms, receivedAt }
  }

  getTC() {
    switch (this.mode) {
      case 'session':
        if (!this.sessionStartWall) return '00:00:00:00'
        return msToTC(Date.now() - this.sessionStartWall, this.fps)
      case 'tod':
        return this._todTC()
      case 'atem-live':
        return this._atemLiveTC()
      default:
        return '00:00:00:00'
    }
  }

  _todTC() {
    const now = new Date()
    const todayMs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
    return msToTC(todayMs + this.todOffsetMs, this.fps)
  }

  _atemLiveTC() {
    if (!this.atemLiveRef) return this._todTC()
    const elapsed = Date.now() - this.atemLiveRef.receivedAt
    return msToTC(this.atemLiveRef.tcMs + elapsed, this.fps)
  }

  getElapsedSec() {
    if (!this.sessionStartWall) return 0
    return (Date.now() - this.sessionStartWall) / 1000
  }
}
