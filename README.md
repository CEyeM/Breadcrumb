# LiveLog — Timecode Logger

Webgebaseerde logger voor Blackmagic-workflows. Typ notities naast een live camerafeed; elke notitie krijgt automatisch de timecode van dat moment. Sessies worden opgeslagen in Supabase, meerdere tabs/devices werken realtime samen.

## Stack

| Laag | Tech |
|------|------|
| Frontend | Vite + vanilla JS |
| Auth + DB | Supabase (PostgreSQL + RLS) |
| Realtime | Supabase Realtime (Postgres changes) |
| ATEM bridge | Lokale Node.js server (`server/`) |

## Opzetten

### 1. Supabase project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een nieuw project.
2. Ga naar **SQL Editor** en voer `supabase/schema.sql` uit.
3. Ga naar **Database → Replication** en zet Realtime aan voor de tabel `log_entries` (INSERT + DELETE).
4. Kopieer je **Project URL** en **anon key** uit Settings → API.

### 2. Frontend

```bash
cd /pad/naar/livelog
cp .env.example .env
# Vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in in .env

npm install
npm run dev
```

Open http://localhost:5173 — maak een account aan en start een sessie.

### 3. ATEM bridge (optioneel — alleen voor echte ATEM-timecode)

De bridge draait lokaal op dezelfde machine of een machine in hetzelfde netwerk als de ATEM.

```bash
cd server
cp .env.example .env
# Vul SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en ATEM_IP in

npm install
npm start
```

Schakel daarna in de logger de modus **ATEM LIVE** in. De timecode van de ATEM verschijnt dan live in de browser via Supabase Realtime broadcast.

> **Let op:** gebruik de `service_role` key (niet de anon key) in de server `.env` — de bridge schrijft buiten RLS.

## Timecode-modi

| Modus | Bron | Gebruik |
|-------|------|---------|
| SESSIE | `performance.now()` vanaf sessionstart | Altijd beschikbaar |
| ATEM | Systeemklok — zelfde bron als ATEM time-of-day | Als jouw pc de ATEM-klok heeft geset |
| SYNC | Systeemklok met handmatige offset | Als je op een andere pc draait |
| ATEM LIVE | Echte ATEM-timecode via bridge | Vereist `server/` te draaien |

## Productie deployen

```bash
npm run build   # genereert dist/
```

Deploy `dist/` op Vercel, Netlify of elke statische host. De ATEM bridge draait altijd lokaal (die heeft netwerktoegang tot de ATEM nodig).

## Projectstructuur

```
livelog/
├── index.html              Vite entry point
├── src/
│   ├── main.js             Router
│   ├── style.css           Alle stijlen
│   ├── supabase.js         Supabase client
│   ├── auth.js             Login/registratie scherm
│   ├── sessions.js         Sessie-overzicht
│   ├── logger.js           Hoofdlogger (camera, TC, log, realtime)
│   ├── timecode.js         Timecode engine (alle modi)
│   └── camera.js           Camera management
├── server/
│   ├── atem-bridge.js      ATEM → Supabase Realtime
│   └── package.json
├── supabase/
│   └── schema.sql          Database schema + RLS
├── .env.example
└── package.json
```
