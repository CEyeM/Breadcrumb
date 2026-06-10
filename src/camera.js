export class CameraManager {
  constructor({ onStatus }) {
    this.stream = null
    this.active = false
    this.mirrored = false
    this.onStatus = onStatus
  }

  async toggle() {
    this.active ? this.stop() : await this.start()
  }

  async start(deviceId) {
    try {
      const constraints = {
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      }
      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId }
      } else {
        constraints.video.facingMode = 'user'
      }
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      const video = document.getElementById('webcam')
      video.srcObject = this.stream
      video.style.display = 'block'
      document.getElementById('no-cam').style.display = 'none'
      this.active = true
      this.applyMirror()
      this.onStatus('live')
      await this.populateDevices()
      this._updateBtn()
    } catch (e) {
      this.onStatus('error')
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = null
    }
    const video = document.getElementById('webcam')
    video.srcObject = null
    video.style.display = 'none'
    document.getElementById('no-cam').style.display = 'flex'
    this.active = false
    this.onStatus('off')
    this._updateBtn()
  }

  async switchTo(deviceId) {
    if (this.active) {
      this.stop()
      await this.start(deviceId)
    }
  }

  toggleMirror() {
    this.mirrored = !this.mirrored
    this.applyMirror()
  }

  applyMirror() {
    const video = document.getElementById('webcam')
    if (video) video.style.transform = this.mirrored ? 'scaleX(-1)' : 'none'
  }

  async populateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices.filter(d => d.kind === 'videoinput')
      const sel = document.getElementById('cam-select')
      if (!sel) return
      const current = sel.value
      sel.innerHTML = ''
      if (!cams.length) {
        sel.innerHTML = '<option value="">Geen camera</option>'
        return
      }
      cams.forEach((cam, i) => {
        const opt = document.createElement('option')
        opt.value = cam.deviceId
        opt.textContent = cam.label || `Camera ${i + 1}`
        sel.appendChild(opt)
      })
      if (current) sel.value = current
    } catch (e) {}
  }

  _updateBtn() {
    const btn = document.getElementById('cam-btn')
    if (!btn) return
    if (this.active) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/><line x1="1" y1="1" x2="23" y2="23" stroke-width="2"/></svg> Camera uit`
    } else {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> Camera aan`
    }
  }
}
