export const TAGS = {
  good:  { label: 'Goede take',   color: '#22c55e' },
  bad:   { label: 'Fout',         color: '#ef4444' },
  broll: { label: 'B-roll',       color: '#3b82f6' },
  audio: { label: 'Geluid issue', color: '#f59e0b' },
}

// Toetsenbord shortcuts (alleen actief buiten tekstvelden)
export const TAG_SHORTCUTS = {
  good:  'G',
  bad:   'F',
  broll: 'B',
  audio: 'A',
}

// Omgekeerde lookup: 'g' -> 'good'
export const SHORTCUT_TO_TAG = Object.fromEntries(
  Object.entries(TAG_SHORTCUTS).map(([key, sc]) => [sc.toLowerCase(), key])
)
