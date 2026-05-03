# Online Multiplayer GeoGuesser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-file GeoGuesser HTML into a full-stack Next.js app with online multiplayer, room codes, and a friend list backed by MongoDB, deployable to Vercel.

**Architecture:** Next.js 14 App Router with API routes for the backend. MongoDB stores users (username + friends) and rooms (game state). Real-time sync via 2-second client polling — no WebSockets needed for a turn-based game. Both players guess simultaneously per round; room status drives the UI state machine (waiting → playing → results → finished).

**Tech Stack:** Next.js 14, TypeScript, MongoDB native driver, Google Maps JS API (client-side), CSS Modules via globals.css, Vercel deployment.

---

## File Map

```
app/
├── layout.tsx                        # Root layout, meta tags
├── globals.css                       # All styles (dark theme, CSS vars)
├── page.tsx                          # Landing — enter username
├── lobby/page.tsx                    # Create room / join room / friends
└── room/[code]/page.tsx             # Game room (all states)
app/api/
├── users/route.ts                    # POST — upsert username
├── users/[username]/route.ts         # GET — user + friends with online status
├── friends/route.ts                  # POST add / DELETE remove friend
├── rooms/route.ts                    # POST — create room
└── rooms/[code]/
    ├── route.ts                      # GET — poll room state
    ├── join/route.ts                 # POST — guest joins room
    ├── guess/route.ts                # POST — submit guess
    └── next/route.ts                 # POST — host advances round
lib/
├── mongodb.ts                        # DB connection singleton
├── models.ts                         # TypeScript interfaces
├── spots.ts                          # SPOTS data from original HTML
└── scoring.ts                        # haversine + calcScore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `next.config.js`
- Create: `tsconfig.json`
- Create: `.env.local`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "zgeoguessr",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "mongodb": "^6.6.2"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create .env.local**

```
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIzaSyDqqoVANWr0IiHsosuPV42BUdSWoyhqHzA
```

- [ ] **Step 5: Create .env.example** (safe to commit)

```
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/?retryWrites=true&w=majority
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your_google_maps_api_key
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

---

## Task 2: Core Libraries

**Files:**
- Create: `lib/mongodb.ts`
- Create: `lib/models.ts`
- Create: `lib/spots.ts`
- Create: `lib/scoring.ts`

- [ ] **Step 1: Create lib/mongodb.ts**

```typescript
import { MongoClient, Db } from 'mongodb'

const uri = process.env.MONGODB_URI!
if (!uri) throw new Error('MONGODB_URI is not set')

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>
}

let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = new MongoClient(uri).connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  clientPromise = new MongoClient(uri).connect()
}

export default clientPromise

export async function getDb(): Promise<Db> {
  const c = await clientPromise
  return c.db('geoguessr')
}
```

- [ ] **Step 2: Create lib/models.ts**

```typescript
export type Difficulty = 'easy' | 'medium' | 'hard'
export type RoomStatus = 'waiting' | 'playing' | 'results' | 'finished'

export interface Spot {
  lat: number
  lng: number
  label: string
  flag: string
}

export interface GuessResult {
  lat: number
  lng: number
  dist: number
  pts: number
}

export interface Room {
  code: string
  host: string
  guest: string | null
  status: RoomStatus
  diff: Difficulty
  totalRounds: number
  currentRound: number
  rounds: Spot[]
  guesses: Array<Record<string, GuessResult>>
  scores: Record<string, number>
  createdAt: Date
  updatedAt: Date
}

export interface User {
  username: string
  friends: string[]
  lastSeen: Date
}
```

- [ ] **Step 3: Create lib/spots.ts**

```typescript
import type { Difficulty, Spot } from './models'

export const SPOTS: Record<Difficulty, Spot[]> = {
  easy: [
    { lat: 48.8584,  lng: 2.2945,   label: 'Paris, France',           flag: '🇫🇷' },
    { lat: 51.5007,  lng: -0.1246,  label: 'Londres, Royaume-Uni',    flag: '🇬🇧' },
    { lat: 41.8902,  lng: 12.4922,  label: 'Rome, Italie',            flag: '🇮🇹' },
    { lat: 40.7580,  lng: -73.9855, label: 'New York, États-Unis',    flag: '🇺🇸' },
    { lat: 35.6762,  lng: 139.6503, label: 'Tokyo, Japon',            flag: '🇯🇵' },
    { lat: -33.8688, lng: 151.2093, label: 'Sydney, Australie',       flag: '🇦🇺' },
    { lat: 48.2082,  lng: 16.3738,  label: 'Vienne, Autriche',        flag: '🇦🇹' },
    { lat: 55.7558,  lng: 37.6173,  label: 'Moscou, Russie',          flag: '🇷🇺' },
    { lat: 25.2048,  lng: 55.2708,  label: 'Dubaï, Émirats arabes',   flag: '🇦🇪' },
    { lat: -22.9068, lng: -43.1729, label: 'Rio de Janeiro, Brésil',  flag: '🇧🇷' },
    { lat: 37.9715,  lng: 23.7267,  label: 'Athènes, Grèce',          flag: '🇬🇷' },
    { lat: 41.3851,  lng: 2.1734,   label: 'Barcelone, Espagne',      flag: '🇪🇸' },
  ],
  medium: [
    { lat: 44.4268,  lng: 26.1025,  label: 'Bucarest, Roumanie',      flag: '🇷🇴' },
    { lat: 59.4370,  lng: 24.7536,  label: 'Tallinn, Estonie',        flag: '🇪🇪' },
    { lat: 33.8869,  lng: 9.5375,   label: 'Tunisie centrale',        flag: '🇹🇳' },
    { lat: -13.1631, lng: -72.5449, label: 'Machu Picchu, Pérou',     flag: '🇵🇪' },
    { lat: 27.1751,  lng: 78.0421,  label: 'Agra, Inde',              flag: '🇮🇳' },
    { lat: -4.4419,  lng: 15.2663,  label: 'Kinshasa, RDC',           flag: '🇨🇩' },
    { lat: 9.0579,   lng: 7.4951,   label: 'Abuja, Nigeria',          flag: '🇳🇬' },
    { lat: -17.7333, lng: 168.3219, label: 'Vanuatu, Pacifique',      flag: '🇻🇺' },
    { lat: 47.8864,  lng: 106.9057, label: 'Oulan-Bator, Mongolie',   flag: '🇲🇳' },
    { lat: 15.5527,  lng: 32.5324,  label: 'Khartoum, Soudan',        flag: '🇸🇩' },
    { lat: -8.8390,  lng: 13.2894,  label: 'Luanda, Angola',          flag: '🇦🇴' },
    { lat: 12.3714,  lng: -1.5197,  label: 'Ouagadougou, Burkina',    flag: '🇧🇫' },
    { lat: 64.1355,  lng: -21.8954, label: 'Reykjavik, Islande',      flag: '🇮🇸' },
    { lat: -25.2744, lng: 133.7751, label: 'Outback, Australie',      flag: '🇦🇺' },
  ],
  hard: [
    { lat: 60.1695,  lng: 24.9354,  label: 'Route côtière, Finlande',      flag: '🇫🇮' },
    { lat: -34.6037, lng: -58.3816, label: 'Suburb Buenos Aires',           flag: '🇦🇷' },
    { lat: 43.2965,  lng: 5.3698,   label: 'Zone industrielle Marseille',   flag: '🇫🇷' },
    { lat: 50.4501,  lng: 30.5234,  label: 'Quartier résidentiel Kyiv',     flag: '🇺🇦' },
    { lat: 6.3702,   lng: 2.3912,   label: 'Route rurale Bénin',            flag: '🇧🇯' },
    { lat: -15.7942, lng: -47.8822, label: 'Banlieue Brasilia',             flag: '🇧🇷' },
    { lat: 37.5326,  lng: 127.0246, label: 'Suburb Seoul',                  flag: '🇰🇷' },
    { lat: 39.9042,  lng: 116.4074, label: 'Périphérie Pékin',              flag: '🇨🇳' },
    { lat: 55.9533,  lng: -3.1883,  label: 'Quartier Edinburgh',            flag: '🇬🇧' },
    { lat: -1.2867,  lng: 36.8219,  label: 'Route Kenya',                   flag: '🇰🇪' },
    { lat: 28.6448,  lng: 77.2167,  label: 'Rue New Delhi',                 flag: '🇮🇳' },
    { lat: 14.6928,  lng: -17.4467, label: 'Quartier Dakar',                flag: '🇸🇳' },
    { lat: 53.9006,  lng: 27.5590,  label: 'Route Biélorussie',             flag: '🇧🇾' },
    { lat: -33.4489, lng: -70.6693, label: 'Banlieue Santiago',             flag: '🇨🇱' },
    { lat: 45.4642,  lng: 9.1900,   label: 'Périphérie Milan',              flag: '🇮🇹' },
    { lat: 23.1291,  lng: 113.2644, label: 'Rue Guangzhou',                 flag: '🇨🇳' },
    { lat: 19.0760,  lng: 72.8777,  label: 'Quartier Mumbai',               flag: '🇮🇳' },
    { lat: -26.2041, lng: 28.0473,  label: 'Suburb Johannesburg',           flag: '🇿🇦' },
    { lat: 41.0082,  lng: 28.9784,  label: 'Rue Istanbul',                  flag: '🇹🇷' },
    { lat: 60.3913,  lng: 5.3221,   label: 'Route Norvège',                 flag: '🇳🇴' },
  ],
}
```

- [ ] **Step 4: Create lib/scoring.ts**

```typescript
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function calcScore(dist: number): number {
  if (dist < 0.5) return 5000
  return Math.max(0, Math.round(5000 * Math.exp(-dist / 2000)))
}
```

---

## Task 3: Layout + Global Styles

**Files:**
- Create: `app/layout.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Create app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GeoGuessr — Multijoueur',
  description: 'Joue à GeoGuessr en ligne avec tes amis',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Create app/globals.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --green: #4caf50; --green-d: #388e3c;
  --blue: #64b5f6; --yellow: #ffd54f; --red: #ef5350;
  --p1: #42a5f5; --p2: #ef5350;
  --bg: #111827; --bg2: #1f2937; --bg3: #374151;
  --text: #f9fafb; --muted: #9ca3af; --border: rgba(255,255,255,0.1);
}

html, body {
  width: 100%; height: 100%;
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: var(--bg); color: var(--text); overflow: hidden;
}

/* ══ LOADING ══ */
.loading {
  position: fixed; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 16px;
  background: var(--bg); color: var(--muted);
}
.spinner {
  width: 36px; height: 36px; border: 3px solid var(--border);
  border-top-color: var(--blue); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ══ SETUP / LANDING ══ */
.setup-screen {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 30% 40%, #0f2027 0%, #111827 70%);
  overflow-y: auto;
}
.setup-card {
  background: var(--bg2); border-radius: 24px; padding: 44px;
  max-width: 440px; width: 94%; border: 1px solid var(--border); text-align: center;
}
.globe { font-size: 72px; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
.setup-card h1 { font-size: 42px; font-weight: 900; letter-spacing: -2px; margin: 12px 0 4px; }
.setup-card h1 span { color: var(--blue); }
.tagline { color: var(--muted); font-size: 14px; margin-bottom: 28px; }
.field { text-align: left; margin-bottom: 16px; }
.field label { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); display: block; margin-bottom: 8px; }
.error-msg { color: var(--red); font-size: 13px; margin-bottom: 12px; }

/* ══ LOBBY ══ */
.lobby-screen {
  position: fixed; inset: 0; overflow-y: auto;
  background: radial-gradient(ellipse at 30% 40%, #0f2027 0%, #111827 70%);
  display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px;
}
.lobby-card {
  background: var(--bg2); border-radius: 24px; padding: 36px;
  max-width: 680px; width: 100%; border: 1px solid var(--border);
}
.lobby-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px;
}
.lobby-header h1 { font-size: 28px; font-weight: 900; letter-spacing: -1px; }
.lobby-header h1 span { color: var(--blue); }
.username-badge {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg3); border-radius: 20px; padding: 8px 14px;
  font-size: 14px; font-weight: 600;
}
.online-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--green); flex-shrink: 0;
}
.online-dot.inactive { background: var(--muted); }
.online-dot.active { background: var(--green); }
.btn-logout {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 18px; line-height: 1; padding: 0 0 0 4px;
}
.btn-logout:hover { color: var(--text); }
.lobby-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
@media (max-width: 560px) { .lobby-grid { grid-template-columns: 1fr; } }
.lobby-section {
  background: var(--bg3); border-radius: 16px; padding: 20px; border: 1px solid var(--border);
}
.lobby-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
.section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--muted); display: block; margin-bottom: 8px; margin-top: 12px;
}
.section-label:first-of-type { margin-top: 0; }
.friends-section { margin-top: 0; grid-column: 1 / -1; }
.join-row { display: flex; gap: 8px; }
.btn-join {
  background: var(--blue); color: #111; border: none; border-radius: 8px;
  padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-join:hover { filter: brightness(1.1); }
.friends-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.friend-row {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg); border-radius: 8px; padding: 10px 12px;
}
.friend-name { flex: 1; font-size: 14px; font-weight: 600; }
.friend-status { font-size: 12px; color: var(--muted); }
.btn-remove {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 18px; line-height: 1;
}
.btn-remove:hover { color: var(--red); }
.muted-small { font-size: 13px; color: var(--muted); text-align: center; padding: 12px 0; }

/* ══ SHARED INPUTS & BUTTONS ══ */
.player-input {
  flex: 1; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 14px;
  outline: none; transition: border 0.2s; width: 100%;
}
.player-input:focus { border-color: var(--blue); }
.btn-play {
  width: 100%; padding: 16px; background: var(--green); color: #fff; border: none;
  border-radius: 12px; font-size: 18px; font-weight: 800; cursor: pointer;
  transition: all 0.2s; margin-top: 16px;
}
.btn-play:hover:not(:disabled) { background: var(--green-d); transform: scale(1.02); }
.btn-play:disabled { opacity: 0.6; cursor: not-allowed; }
.diff-row { display: flex; gap: 8px; flex-wrap: wrap; }
.rounds-row { display: flex; gap: 8px; margin-top: 8px; }
.diff-btn {
  flex: 1; padding: 9px 6px; border-radius: 8px; border: 2px solid transparent;
  background: var(--bg); color: var(--text); cursor: pointer; font-size: 12px;
  font-weight: 600; transition: all 0.2s; text-align: center;
}
.diff-btn:hover { border-color: var(--yellow); }
.diff-btn.active { border-color: var(--yellow); background: rgba(255,213,79,.1); color: var(--yellow); }

/* ══ WAITING SCREEN ══ */
.waiting-screen {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at 30% 40%, #0f2027 0%, #111827 70%);
}
.waiting-card {
  background: var(--bg2); border-radius: 24px; padding: 44px;
  max-width: 420px; width: 94%; border: 1px solid var(--border); text-align: center;
}
.waiting-card .globe-anim { font-size: 64px; animation: float 3s ease-in-out infinite; }
.waiting-card h1 { font-size: 24px; font-weight: 800; margin: 16px 0 8px; }
.waiting-card .muted { color: var(--muted); font-size: 14px; margin-bottom: 24px; }
.code-display {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  background: var(--bg3); border-radius: 14px; padding: 16px 20px; margin-bottom: 16px;
}
.code-text { font-size: 32px; font-weight: 900; letter-spacing: 6px; color: var(--blue); font-family: monospace; }
.copy-btn {
  background: var(--blue); color: #111; border: none; border-radius: 8px;
  padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer;
}
.copy-btn:hover { filter: brightness(1.1); }
.config-info {
  display: flex; gap: 12px; justify-content: center; font-size: 13px;
  color: var(--muted); margin-bottom: 24px;
}
.config-info span {
  background: var(--bg3); border-radius: 6px; padding: 4px 10px;
}
.btn-leave {
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  border-radius: 10px; padding: 10px 20px; cursor: pointer; font-size: 14px;
}
.btn-leave:hover { color: var(--text); border-color: var(--text); }

/* ══ GAME SCREEN ══ */
.game-screen { position: relative; width: 100%; height: 100vh; }
.sv-container { position: absolute; inset: 0; }

.player-banner {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  z-index: 30; display: flex; align-items: center;
  background: rgba(0,0,0,.82); backdrop-filter: blur(14px);
  border-radius: 40px; border: 1px solid var(--border); overflow: hidden;
}
.hud-cell {
  padding: 10px 20px; display: flex; flex-direction: column; align-items: center;
  border-right: 1px solid var(--border);
}
.hud-cell:last-child { border-right: none; }
.hud-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 2px; }
.hud-val { font-size: 16px; font-weight: 700; }
.timer { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.timer.warn { color: var(--red); animation: blink 0.5s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.scores-panel {
  position: absolute; top: 14px; right: 14px; z-index: 30;
  background: rgba(0,0,0,.78); backdrop-filter: blur(12px);
  border-radius: 14px; border: 1px solid var(--border); padding: 12px 16px; min-width: 160px;
}
.score-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.score-row .sname { font-size: 13px; font-weight: 600; }
.score-row .spts { font-size: 14px; font-weight: 800; }

.opponent-status {
  position: absolute; bottom: 280px; right: 14px; z-index: 30;
  background: rgba(0,0,0,.78); backdrop-filter: blur(12px);
  border-radius: 10px; border: 1px solid var(--border);
  padding: 8px 14px; font-size: 13px; color: var(--muted);
}
.opponent-status.guessed { color: var(--green); border-color: var(--green); }

.map-panel {
  position: absolute; bottom: 0; right: 0; z-index: 20;
  display: flex; flex-direction: column;
  transition: width 0.3s cubic-bezier(.4,0,.2,1);
}
.map-panel.sm { width: 300px; }
.map-panel.lg { width: 520px; }
.map-wrapper {
  border-radius: 14px 14px 0 0; overflow: hidden; position: relative;
  border: 2px solid rgba(255,255,255,.18); border-bottom: none;
  box-shadow: 0 -6px 40px rgba(0,0,0,.7);
  transition: height 0.3s cubic-bezier(.4,0,.2,1);
}
.map-panel.sm .map-wrapper { height: 200px; }
.map-panel.lg .map-wrapper { height: 360px; }
.minimap { width: 100%; height: 100%; }
.map-top { position: absolute; top: 8px; right: 8px; z-index: 5; }
.map-btn {
  background: rgba(0,0,0,.75); border: 1px solid rgba(255,255,255,.2);
  color: #fff; padding: 5px 10px; border-radius: 7px; cursor: pointer; font-size: 13px;
}
.map-btn:hover { background: rgba(255,255,255,.2); }
.map-hint { position: absolute; bottom: 8px; left: 10px; font-size: 11px; color: rgba(255,255,255,.4); pointer-events: none; }
.guess-btn {
  width: 100%; padding: 15px; border: none; cursor: pointer;
  color: #fff; font-size: 16px; font-weight: 700;
  border-radius: 0 0 14px 14px; transition: background 0.2s, transform 0.1s;
}
.guess-btn:hover:not(:disabled) { filter: brightness(1.1); }
.guess-btn:disabled { background: #2a2a3a !important; color: #555; cursor: not-allowed; }

/* ══ RESULTS SCREEN ══ */
.results-screen {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,.88); display: flex; align-items: center; justify-content: center;
  animation: fadein 0.3s;
}
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
.result-card {
  background: var(--bg2); border-radius: 20px; padding: 32px;
  max-width: 700px; width: 96%; border: 1px solid var(--border);
  max-height: 92vh; overflow-y: auto; animation: slideup 0.3s;
}
@keyframes slideup { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.round-label { font-size: 13px; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); margin-bottom: 6px; }
.place-name { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.players-results { display: grid; gap: 12px; margin-bottom: 20px; }
.player-result {
  background: rgba(255,255,255,.05); border-radius: 12px; padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border: 2px solid transparent;
}
.pr-name { font-size: 15px; font-weight: 700; }
.pr-dist { font-size: 13px; color: var(--muted); }
.pr-pts { font-size: 22px; font-weight: 800; }
.res-map-wrap { width: 100%; height: 220px; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
.legend { display: flex; gap: 20px; flex-wrap: wrap; justify-content: center; font-size: 12px; color: var(--muted); margin-bottom: 20px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.btn-next {
  width: 100%; padding: 14px; background: #5c6bc0; color: #fff; border: none;
  border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer;
}
.btn-next:hover { background: #3f51b5; }
.waiting-host { text-align: center; color: var(--muted); font-size: 14px; padding: 14px; }

/* ══ END SCREEN ══ */
.end-screen {
  position: fixed; inset: 0; z-index: 110;
  background: rgba(0,0,0,.95); display: flex; align-items: center; justify-content: center;
  animation: fadein 0.3s;
}
.end-card {
  background: var(--bg2); border-radius: 20px; padding: 44px;
  max-width: 480px; width: 96%; border: 1px solid var(--border);
  text-align: center; max-height: 92vh; overflow-y: auto;
  animation: slideup 0.4s;
}
.trophy { font-size: 56px; margin-bottom: 12px; }
.end-card h1 { font-size: 28px; font-weight: 900; margin-bottom: 4px; }
.final-scores { margin: 24px 0; text-align: left; }
.final-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,.07); font-size: 15px;
}
.final-row.first .pts { color: var(--yellow); }
.final-row .pts { font-size: 20px; font-weight: 800; }
.btn-primary {
  background: var(--green); color: #fff; border: none; padding: 14px 32px;
  border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px;
}
.btn-primary:hover { background: var(--green-d); }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 2px; }
```

---

## Task 4: API — Users

**Files:**
- Create: `app/api/users/route.ts`
- Create: `app/api/users/[username]/route.ts`

- [ ] **Step 1: Create app/api/users/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(req: NextRequest) {
  const { username } = await req.json()
  if (
    !username ||
    typeof username !== 'string' ||
    username.length < 2 ||
    username.length > 20
  ) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 })
  }
  const db = await getDb()
  await db.collection('users').updateOne(
    { username },
    { $set: { username, lastSeen: new Date() }, $setOnInsert: { friends: [] } },
    { upsert: true }
  )
  return NextResponse.json({ username })
}
```

- [ ] **Step 2: Create app/api/users/[username]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(
  _req: NextRequest,
  { params }: { params: { username: string } }
) {
  const db = await getDb()
  const user = await db.collection('users').findOne({ username: params.username })
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.collection('users').updateOne(
    { username: params.username },
    { $set: { lastSeen: new Date() } }
  )

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const friendDocs = await db
    .collection('users')
    .find({ username: { $in: user.friends || [] } })
    .toArray()

  const friends = friendDocs.map((f) => ({
    username: f.username,
    online: f.lastSeen > fiveMinAgo,
  }))

  return NextResponse.json({ username: user.username, friends })
}
```

---

## Task 5: API — Friends

**Files:**
- Create: `app/api/friends/route.ts`

- [ ] **Step 1: Create app/api/friends/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(req: NextRequest) {
  const { username, friendUsername } = await req.json()
  if (!username || !friendUsername || username === friendUsername) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const db = await getDb()
  const friend = await db.collection('users').findOne({ username: friendUsername })
  if (!friend) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })

  await db.collection('users').updateOne(
    { username },
    { $addToSet: { friends: friendUsername } }
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { username, friendUsername } = await req.json()
  const db = await getDb()
  await db.collection('users').updateOne(
    { username },
    { $pull: { friends: friendUsername } }
  )
  return NextResponse.json({ ok: true })
}
```

---

## Task 6: API — Rooms

**Files:**
- Create: `app/api/rooms/route.ts`
- Create: `app/api/rooms/[code]/route.ts`

- [ ] **Step 1: Create app/api/rooms/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { SPOTS } from '@/lib/spots'
import type { Difficulty, Room } from '@/lib/models'

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const { username, diff = 'medium', totalRounds = 5 } = await req.json()
  if (!username) return NextResponse.json({ error: 'Missing username' }, { status: 400 })

  const db = await getDb()
  let code = generateCode()
  while (await db.collection('rooms').findOne({ code })) {
    code = generateCode()
  }

  const pool = [...SPOTS[diff as Difficulty]].sort(() => Math.random() - 0.5)
  const rounds = pool.slice(0, totalRounds)

  const room: Room = {
    code,
    host: username,
    guest: null,
    status: 'waiting',
    diff: diff as Difficulty,
    totalRounds,
    currentRound: 0,
    rounds,
    guesses: Array.from({ length: totalRounds }, () => ({})),
    scores: { [username]: 0 },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await db.collection('rooms').insertOne(room)
  return NextResponse.json({ code })
}
```

- [ ] **Step 2: Create app/api/rooms/[code]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const db = await getDb()
  const room = await db.collection('rooms').findOne(
    { code: params.code.toUpperCase() },
    { projection: { _id: 0 } }
  )
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  return NextResponse.json(room)
}
```

---

## Task 7: API — Game Actions

**Files:**
- Create: `app/api/rooms/[code]/join/route.ts`
- Create: `app/api/rooms/[code]/guess/route.ts`
- Create: `app/api/rooms/[code]/next/route.ts`

- [ ] **Step 1: Create app/api/rooms/[code]/join/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { username } = await req.json()
  const db = await getDb()
  const room = await db.collection('rooms').findOne({ code: params.code.toUpperCase() })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.status !== 'waiting') return NextResponse.json({ error: 'Room not available' }, { status: 400 })
  if (room.host === username) return NextResponse.json({ error: 'Already in room as host' }, { status: 400 })
  if (room.guest) return NextResponse.json({ error: 'Room is full' }, { status: 400 })

  await db.collection('rooms').updateOne(
    { code: params.code.toUpperCase() },
    {
      $set: {
        guest: username,
        status: 'playing',
        [`scores.${username}`]: 0,
        updatedAt: new Date(),
      },
    }
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create app/api/rooms/[code]/guess/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { haversine, calcScore } from '@/lib/scoring'

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { username, lat, lng } = await req.json()
  const db = await getDb()
  const room = await db.collection('rooms').findOne({ code: params.code.toUpperCase() })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.status !== 'playing') return NextResponse.json({ error: 'Not playing' }, { status: 400 })
  if (room.guesses[room.currentRound]?.[username]) {
    return NextResponse.json({ error: 'Already guessed' }, { status: 400 })
  }

  const spot = room.rounds[room.currentRound]
  const dist = Math.round(haversine(spot.lat, spot.lng, lat, lng))
  const pts = calcScore(dist)

  await db.collection('rooms').updateOne(
    { code: params.code.toUpperCase() },
    {
      $set: {
        [`guesses.${room.currentRound}.${username}`]: { lat, lng, dist, pts },
        [`scores.${username}`]: (room.scores[username] || 0) + pts,
        updatedAt: new Date(),
      },
    }
  )

  const updated = await db.collection('rooms').findOne({ code: params.code.toUpperCase() })
  const cg = updated!.guesses[room.currentRound]
  const bothGuessed = updated!.host && updated!.guest && cg[updated!.host] && cg[updated!.guest]

  if (bothGuessed) {
    await db.collection('rooms').updateOne(
      { code: params.code.toUpperCase() },
      { $set: { status: 'results', updatedAt: new Date() } }
    )
  }

  return NextResponse.json({ dist, pts })
}
```

- [ ] **Step 3: Create app/api/rooms/[code]/next/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { username } = await req.json()
  const db = await getDb()
  const room = await db.collection('rooms').findOne({ code: params.code.toUpperCase() })

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (room.host !== username) return NextResponse.json({ error: 'Host only' }, { status: 403 })
  if (room.status !== 'results') return NextResponse.json({ error: 'Not in results state' }, { status: 400 })

  const isLast = room.currentRound >= room.totalRounds - 1

  await db.collection('rooms').updateOne(
    { code: params.code.toUpperCase() },
    {
      $set: {
        status: isLast ? 'finished' : 'playing',
        currentRound: isLast ? room.currentRound : room.currentRound + 1,
        updatedAt: new Date(),
      },
    }
  )

  return NextResponse.json({ ok: true })
}
```

---

## Task 8: Landing Page

**Files:**
- Create: `app/page.tsx`

- [ ] **Step 1: Create app/page.tsx**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const saved = localStorage.getItem('geo_username')
    if (saved) router.replace('/lobby')
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const u = username.trim()
    if (u.length < 2 || u.length > 20) {
      setError('Le pseudo doit faire entre 2 et 20 caractères')
      return
    }
    setLoading(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u }),
    })
    if (!res.ok) {
      setError('Erreur serveur, réessaie')
      setLoading(false)
      return
    }
    localStorage.setItem('geo_username', u)
    router.push('/lobby')
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="globe">🌍</div>
        <h1>Geo<span>Guessr</span></h1>
        <p className="tagline">Multijoueur en ligne · Street View · Monde entier</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Ton pseudo</label>
            <input
              className="player-input"
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError('') }}
              placeholder="Entre ton pseudo..."
              maxLength={20}
              autoFocus
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-play" type="submit" disabled={loading}>
            {loading ? 'Connexion...' : '🚀 Jouer !'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

## Task 9: Lobby Page

**Files:**
- Create: `app/lobby/page.tsx`

- [ ] **Step 1: Create app/lobby/page.tsx**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Difficulty = 'easy' | 'medium' | 'hard'

interface Friend {
  username: string
  online: boolean
}

export default function Lobby() {
  const [username, setUsername] = useState('')
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendInput, setFriendInput] = useState('')
  const [friendError, setFriendError] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [diff, setDiff] = useState<Difficulty>('medium')
  const [totalRounds, setTotalRounds] = useState(5)
  const [creating, setCreating] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const u = localStorage.getItem('geo_username')
    if (!u) { router.replace('/'); return }
    setUsername(u)
  }, [router])

  useEffect(() => {
    if (!username) return
    const fetchUser = async () => {
      const res = await fetch(`/api/users/${username}`)
      if (res.ok) {
        const data = await res.json()
        setFriends(data.friends || [])
      }
    }
    fetchUser()
    const id = setInterval(fetchUser, 10_000)
    return () => clearInterval(id)
  }, [username])

  async function addFriend() {
    const f = friendInput.trim()
    if (!f) return
    setFriendError('')
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, friendUsername: f }),
    })
    if (!res.ok) {
      const data = await res.json()
      setFriendError(data.error || 'Erreur')
      return
    }
    setFriendInput('')
    const userRes = await fetch(`/api/users/${username}`)
    if (userRes.ok) setFriends((await userRes.json()).friends || [])
  }

  async function removeFriend(f: string) {
    await fetch('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, friendUsername: f }),
    })
    setFriends((prev) => prev.filter((x) => x.username !== f))
  }

  async function createRoom() {
    setCreating(true)
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, diff, totalRounds }),
    })
    if (!res.ok) { setCreating(false); return }
    const { code } = await res.json()
    router.push(`/room/${code}`)
  }

  async function joinRoom() {
    const c = joinCode.trim().toUpperCase()
    if (!c) return
    setJoinError('')
    const res = await fetch(`/api/rooms/${c}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    if (!res.ok) {
      const data = await res.json()
      setJoinError(data.error || 'Room introuvable')
      return
    }
    router.push(`/room/${c}`)
  }

  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <div className="lobby-header">
          <h1>🌍 Geo<span>Guessr</span></h1>
          <div className="username-badge">
            <span className="online-dot" />
            {username}
            <button
              className="btn-logout"
              onClick={() => { localStorage.removeItem('geo_username'); router.push('/') }}
            >×</button>
          </div>
        </div>

        <div className="lobby-grid">
          <div className="lobby-section">
            <h2>🎮 Créer une partie</h2>
            <span className="section-label">Difficulté</span>
            <div className="diff-row">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`diff-btn ${diff === d ? 'active' : ''}`}
                  onClick={() => setDiff(d)}
                >
                  {d === 'easy' ? '🌆 Facile' : d === 'medium' ? '🗺️ Moyen' : '🔥 Difficile'}
                </button>
              ))}
            </div>
            <span className="section-label">Rounds</span>
            <div className="rounds-row">
              {[3, 5, 8, 10].map((r) => (
                <button
                  key={r}
                  className={`diff-btn ${totalRounds === r ? 'active' : ''}`}
                  onClick={() => setTotalRounds(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <button className="btn-play" onClick={createRoom} disabled={creating}>
              {creating ? 'Création...' : '🚀 Créer la partie'}
            </button>
          </div>

          <div className="lobby-section">
            <h2>🔗 Rejoindre</h2>
            <span className="section-label">Code de la room</span>
            <div className="join-row">
              <input
                className="player-input"
                type="text"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError('') }}
                placeholder="EX: A1B2C3"
                maxLength={8}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              />
              <button className="btn-join" onClick={joinRoom}>→</button>
            </div>
            {joinError && <p className="error-msg" style={{ marginTop: 8 }}>{joinError}</p>}
          </div>
        </div>

        <div className="lobby-section friends-section">
          <h2>👥 Amis</h2>
          <div className="join-row">
            <input
              className="player-input"
              type="text"
              value={friendInput}
              onChange={(e) => { setFriendInput(e.target.value); setFriendError('') }}
              placeholder="Pseudo de ton ami"
              maxLength={20}
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <button className="btn-join" onClick={addFriend}>Ajouter</button>
          </div>
          {friendError && <p className="error-msg" style={{ marginTop: 8 }}>{friendError}</p>}
          <div className="friends-list">
            {friends.length === 0 ? (
              <p className="muted-small">Aucun ami pour l'instant</p>
            ) : (
              friends.map((f) => (
                <div key={f.username} className="friend-row">
                  <span className={`online-dot ${f.online ? 'active' : 'inactive'}`} />
                  <span className="friend-name">{f.username}</span>
                  <span className="friend-status">{f.online ? 'En ligne' : 'Hors ligne'}</span>
                  <button className="btn-remove" onClick={() => removeFriend(f.username)}>×</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## Task 10: Game Room Page

**Files:**
- Create: `app/room/[code]/page.tsx`

- [ ] **Step 1: Create app/room/[code]/page.tsx**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Spot { lat: number; lng: number; label: string; flag: string }
interface GuessResult { lat: number; lng: number; dist: number; pts: number }
interface Room {
  code: string
  host: string
  guest: string | null
  status: 'waiting' | 'playing' | 'results' | 'finished'
  diff: string
  totalRounds: number
  currentRound: number
  rounds: Spot[]
  guesses: Array<Record<string, GuessResult>>
  scores: Record<string, number>
}

const TIMER_DURATION: Record<string, number> = { easy: 150, medium: 120, hard: 90 }
const COLORS = ['#42a5f5', '#ef5350']

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8c9bab' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#394d5e' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#162032' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a5080' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
]

function ResultsMap({ room }: { room: Room }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !window.google) return
    const spot = room.rounds[room.currentRound]
    ref.current.innerHTML = ''
    const map = new google.maps.Map(ref.current, {
      center: { lat: spot.lat, lng: spot.lng },
      zoom: 2,
      disableDefaultUI: true,
      styles: DARK_STYLE as google.maps.MapTypeStyle[],
    })
    new google.maps.Marker({
      position: { lat: spot.lat, lng: spot.lng }, map,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#4caf50', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 },
    })
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: spot.lat, lng: spot.lng })
    const players = [room.host, room.guest].filter(Boolean) as string[]
    players.forEach((p, i) => {
      const g = room.guesses[room.currentRound]?.[p]
      if (!g) return
      new google.maps.Marker({
        position: { lat: g.lat, lng: g.lng }, map,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: COLORS[i], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        title: p,
      })
      new google.maps.Polyline({
        path: [{ lat: spot.lat, lng: spot.lng }, { lat: g.lat, lng: g.lng }],
        geodesic: true, map,
        strokeColor: COLORS[i], strokeOpacity: 0.7, strokeWeight: 1.5,
      })
      bounds.extend({ lat: g.lat, lng: g.lng })
    })
    map.fitBounds(bounds, 40)
  }, [room.currentRound, room.status])

  return <div className="res-map-wrap" ref={ref} />
}

export default function RoomPage() {
  const params = useParams()
  const router = useRouter()
  const code = (params.code as string).toUpperCase()

  const [username, setUsername] = useState('')
  const [room, setRoom] = useState<Room | null>(null)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [guess, setGuess] = useState<{ lat: number; lng: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(120)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [hasGuessed, setHasGuessed] = useState(false)
  const [copied, setCopied] = useState(false)

  const svRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const miniMapObj = useRef<google.maps.Map | null>(null)
  const markerObj = useRef<google.maps.Marker | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const hasGuessedRef = useRef(false)
  const prevRoundRef = useRef(-1)
  const prevStatusRef = useRef('')

  useEffect(() => {
    const u = localStorage.getItem('geo_username')
    if (!u) { router.replace('/'); return }
    setUsername(u)
  }, [router])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google) { setMapsLoaded(true); return }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}`
    script.async = true
    script.onload = () => setMapsLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!username) return
    const poll = async () => {
      const res = await fetch(`/api/rooms/${code}`)
      if (!res.ok) { router.replace('/lobby'); return }
      setRoom(await res.json())
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [username, code, router])

  const submitGuess = useCallback(async (lat: number, lng: number) => {
    if (hasGuessedRef.current) return
    hasGuessedRef.current = true
    setHasGuessed(true)
    if (timerRef.current) clearInterval(timerRef.current)
    await fetch(`/api/rooms/${code}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, lat, lng }),
    })
  }, [code, username])

  useEffect(() => {
    if (!room || !mapsLoaded) return
    const statusChanged = prevStatusRef.current !== room.status
    const roundChanged = prevRoundRef.current !== room.currentRound

    if (room.status === 'playing' && (statusChanged || roundChanged)) {
      hasGuessedRef.current = false
      setHasGuessed(false)
      setGuess(null)
      setMapExpanded(false)

      if (svRef.current && window.google) {
        const spot = room.rounds[room.currentRound]
        svRef.current.innerHTML = ''
        new google.maps.StreetViewPanorama(svRef.current, {
          position: { lat: spot.lat, lng: spot.lng },
          pov: { heading: Math.random() * 360, pitch: 0 },
          zoom: 1,
          addressControl: false, showRoadLabels: false,
          fullscreenControl: false, motionTrackingControl: false,
          enableCloseButton: false, clickToGo: true,
          panControl: true, zoomControl: true, linksControl: true,
        })
      }

      if (mapRef.current && window.google) {
        mapRef.current.innerHTML = ''
        markerObj.current = null
        miniMapObj.current = new google.maps.Map(mapRef.current, {
          center: { lat: 20, lng: 0 }, zoom: 1,
          disableDefaultUI: true, zoomControl: true,
          styles: DARK_STYLE as google.maps.MapTypeStyle[],
        })
        miniMapObj.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (hasGuessedRef.current) return
          const lat = e.latLng!.lat(), lng = e.latLng!.lng()
          setGuess({ lat, lng })
          if (markerObj.current) markerObj.current.setMap(null)
          markerObj.current = new google.maps.Marker({
            position: { lat, lng }, map: miniMapObj.current!,
            icon: {
              path: google.maps.SymbolPath.CIRCLE, scale: 8,
              fillColor: '#42a5f5', fillOpacity: 1,
              strokeColor: '#fff', strokeWeight: 2,
            },
          })
        })
      }

      if (timerRef.current) clearInterval(timerRef.current)
      const duration = TIMER_DURATION[room.diff] || 120
      setTimeLeft(duration)
      let t = duration
      timerRef.current = setInterval(() => {
        t--
        setTimeLeft(t)
        if (t <= 0) {
          clearInterval(timerRef.current!)
          submitGuess((Math.random() - 0.5) * 140, (Math.random() - 0.5) * 320)
        }
      }, 1000)
    }

    prevStatusRef.current = room.status
    prevRoundRef.current = room.currentRound
  }, [room, mapsLoaded, submitGuess])

  async function handleNextRound() {
    await fetch(`/api/rooms/${code}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
  }

  function copyCode() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!room || !username) return (
    <div className="loading"><div className="spinner" /><p>Connexion...</p></div>
  )

  if (room.status === 'waiting') return (
    <div className="waiting-screen">
      <div className="waiting-card">
        <div className="globe-anim">🌍</div>
        <h1>En attente d'un adversaire</h1>
        <p className="muted">Partage ce code à ton ami !</p>
        <div className="code-display">
          <span className="code-text">{code}</span>
          <button className="copy-btn" onClick={copyCode}>
            {copied ? '✓ Copié !' : '📋 Copier'}
          </button>
        </div>
        <div className="config-info">
          <span>{room.diff === 'easy' ? '🌆 Facile' : room.diff === 'medium' ? '🗺️ Moyen' : '🔥 Difficile'}</span>
          <span>{room.totalRounds} rounds</span>
        </div>
        <button className="btn-leave" onClick={() => router.push('/lobby')}>← Quitter</button>
      </div>
    </div>
  )

  if (room.status === 'finished') {
    const players = [room.host, room.guest].filter(Boolean) as string[]
    players.sort((a, b) => (room.scores[b] || 0) - (room.scores[a] || 0))
    const winner = players[0]
    return (
      <div className="end-screen">
        <div className="end-card">
          <div className="trophy">🏆</div>
          <h1>{winner} gagne !</h1>
          <div className="final-scores">
            {players.map((p, i) => (
              <div key={p} className={`final-row ${i === 0 ? 'first' : ''}`}>
                <span style={{ color: p === room.host ? COLORS[0] : COLORS[1] }}>
                  {i === 0 ? '🥇 ' : '🥈 '}{p}{p === username ? ' (toi)' : ''}
                </span>
                <span className="pts">{(room.scores[p] || 0).toLocaleString('fr-FR')} pts</span>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={() => router.push('/lobby')}>← Retour au lobby</button>
        </div>
      </div>
    )
  }

  if (room.status === 'results') {
    const spot = room.rounds[room.currentRound]
    const players = [room.host, room.guest].filter(Boolean) as string[]
    const rg = room.guesses[room.currentRound] || {}
    const isLast = room.currentRound >= room.totalRounds - 1
    return (
      <div className="results-screen">
        <div className="result-card">
          <p className="round-label">Résultat — Round {room.currentRound + 1}/{room.totalRounds}</p>
          <h2 className="place-name">{spot.flag} {spot.label}</h2>
          <div className="players-results">
            {players.map((p, i) => {
              const g = rg[p]
              const pts = g?.pts ?? 0
              return (
                <div key={p} className="player-result" style={{ borderColor: COLORS[i] }}>
                  <div>
                    <div className="pr-name" style={{ color: COLORS[i] }}>
                      {p}{p === username ? ' (toi)' : ''}
                    </div>
                    <div className="pr-dist">{g ? `${g.dist.toLocaleString('fr-FR')} km` : 'Pas de réponse'}</div>
                  </div>
                  <div
                    className="pr-pts"
                    style={{ color: pts >= 4000 ? '#69f0ae' : pts >= 2000 ? '#ffd54f' : '#ef5350' }}
                  >
                    +{pts.toLocaleString('fr-FR')} pts
                  </div>
                </div>
              )
            })}
          </div>
          <ResultsMap room={room} />
          <div className="legend">
            <span><span className="dot" style={{ background: '#4caf50' }} />Vrai lieu</span>
            {players.map((p, i) => (
              <span key={p}><span className="dot" style={{ background: COLORS[i] }} />{p}</span>
            ))}
          </div>
          {room.host === username ? (
            <button className="btn-next" onClick={handleNextRound}>
              {isLast ? '🏆 Résultats finaux' : 'Round suivant →'}
            </button>
          ) : (
            <p className="waiting-host">En attente de l'hôte...</p>
          )}
        </div>
      </div>
    )
  }

  // PLAYING
  const opponent = room.host === username ? room.guest : room.host
  const myColor = room.host === username ? COLORS[0] : COLORS[1]
  const cg = room.guesses[room.currentRound] || {}
  const opponentGuessed = opponent ? !!cg[opponent] : false

  return (
    <div className="game-screen">
      <div className="sv-container" ref={svRef} style={{ position: 'absolute', inset: 0 }} />

      <div className="player-banner">
        <div className="hud-cell">
          <div className="hud-lbl">Joue</div>
          <div className="hud-val" style={{ color: myColor }}>{username}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-lbl">Round</div>
          <div className="hud-val">{room.currentRound + 1}/{room.totalRounds}</div>
        </div>
        <div className="hud-cell">
          <div className="hud-lbl">Temps</div>
          <div className={`timer${timeLeft <= 15 ? ' warn' : ''}`}>{Math.max(0, timeLeft)}</div>
        </div>
      </div>

      {room.guest && (
        <div className="scores-panel">
          {[room.host, room.guest].map((p, i) => (
            <div key={p} className="score-row">
              <span className="sname" style={{ color: COLORS[i] }}>{p}{p === username ? ' ▶' : ''}</span>
              <span className="spts">{(room.scores[p] || 0).toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}

      {opponent && (
        <div className={`opponent-status${opponentGuessed ? ' guessed' : ''}`}>
          {opponentGuessed ? `✓ ${opponent} a deviné !` : `⏳ ${opponent} réfléchit...`}
        </div>
      )}

      <div className={`map-panel ${mapExpanded ? 'lg' : 'sm'}`}>
        <div className="map-wrapper">
          <div className="minimap" ref={mapRef} />
          <div className="map-top">
            <button className="map-btn" onClick={() => {
              setMapExpanded((x) => !x)
              setTimeout(() => {
                if (miniMapObj.current) google.maps.event.trigger(miniMapObj.current, 'resize')
              }, 350)
            }}>⛶</button>
          </div>
          {!guess && !hasGuessed && <div className="map-hint">Cliquez pour placer votre pin</div>}
        </div>
        <button
          className="guess-btn"
          style={{ background: hasGuessed ? '#2a2a3a' : myColor }}
          disabled={!guess || hasGuessed}
          onClick={() => guess && submitGuess(guess.lat, guess.lng)}
        >
          {hasGuessed ? '✓ Deviné ! En attente...' : '📍 Valider ma position'}
        </button>
      </div>
    </div>
  )
}
```

---

## Task 11: Install & Verify

- [ ] **Step 1: Install dependencies**

Run from `C:\Users\sandax\Desktop\dev\zGeoguesser`:
```
npm install
```

Expected: node_modules created, no errors.

- [ ] **Step 2: Fill in .env.local**

Set `MONGODB_URI` to a real MongoDB Atlas connection string (or local mongod URI).

- [ ] **Step 3: Run dev server**

```
npm run dev
```

Expected: `Ready on http://localhost:3000`

- [ ] **Step 4: Smoke test**

1. Open `http://localhost:3000` — enter a username → redirected to /lobby
2. Click "Créer la partie" → redirected to /room/XXXXXX, shows room code
3. Open a second browser tab, enter a different username, go to /lobby
4. Enter the room code → join → both tabs now show the Street View
5. Both players place a pin and click "Valider" → results screen appears on both tabs
6. Host clicks "Round suivant" → next round loads on both tabs

- [ ] **Step 5: Deploy to Vercel**

```
npx vercel --prod
```

Add env vars in Vercel dashboard:
- `MONGODB_URI` — your Atlas connection string
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — your Google Maps API key
