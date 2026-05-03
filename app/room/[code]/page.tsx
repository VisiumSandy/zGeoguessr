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
    if (!ref.current || typeof window === 'undefined' || !window.google) return
    const spot = room.rounds[room.currentRound]
    ref.current.innerHTML = ''
    const map = new google.maps.Map(ref.current, {
      center: { lat: spot.lat, lng: spot.lng },
      zoom: 2,
      disableDefaultUI: true,
      styles: DARK_STYLE as google.maps.MapTypeStyle[],
    })
    new google.maps.Marker({
      position: { lat: spot.lat, lng: spot.lng },
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: '#4caf50',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2.5,
      },
    })
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: spot.lat, lng: spot.lng })
    const players = [room.host, room.guest].filter(Boolean) as string[]
    players.forEach((p, i) => {
      const g = room.guesses[room.currentRound]?.[p]
      if (!g) return
      new google.maps.Marker({
        position: { lat: g.lat, lng: g.lng },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: COLORS[i],
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: p,
      })
      new google.maps.Polyline({
        path: [{ lat: spot.lat, lng: spot.lng }, { lat: g.lat, lng: g.lng }],
        geodesic: true,
        map,
        strokeColor: COLORS[i],
        strokeOpacity: 0.7,
        strokeWeight: 1.5,
      })
      bounds.extend({ lat: g.lat, lng: g.lng })
    })
    map.fitBounds(bounds, 40)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasGuessedRef = useRef(false)
  const prevRoundRef = useRef(-1)
  const prevStatusRef = useRef('')
  const usernameRef = useRef('')

  useEffect(() => {
    const u = localStorage.getItem('geo_username')
    if (!u) { router.replace('/'); return }
    setUsername(u)
    usernameRef.current = u
  }, [router])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.google) { setMapsLoaded(true); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`
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
      body: JSON.stringify({ username: usernameRef.current, lat, lng }),
    })
  }, [code])

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
          addressControl: false,
          showRoadLabels: false,
          fullscreenControl: false,
          motionTrackingControl: false,
          enableCloseButton: false,
          clickToGo: true,
          panControl: true,
          zoomControl: true,
          linksControl: true,
        })
      }

      if (mapRef.current && window.google) {
        mapRef.current.innerHTML = ''
        markerObj.current = null
        miniMapObj.current = new google.maps.Map(mapRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 1,
          disableDefaultUI: true,
          zoomControl: true,
          styles: DARK_STYLE as google.maps.MapTypeStyle[],
        })
        miniMapObj.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (hasGuessedRef.current || !e.latLng) return
          const lat = e.latLng.lat()
          const lng = e.latLng.lng()
          setGuess({ lat, lng })
          if (markerObj.current) markerObj.current.setMap(null)
          markerObj.current = new google.maps.Marker({
            position: { lat, lng },
            map: miniMapObj.current!,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#42a5f5',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
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

  if (!room || !username) {
    return <div className="loading"><div className="spinner" /><p>Connexion...</p></div>
  }

  if (room.status === 'waiting') {
    return (
      <div className="waiting-screen">
        <div className="waiting-card">
          <div className="globe-anim">🌍</div>
          <h1>En attente d&apos;un adversaire</h1>
          <p className="muted">Partage ce code à ton ami !</p>
          <div className="code-display">
            <span className="code-text">{code}</span>
            <button className="copy-btn" onClick={copyCode}>
              {copied ? '✓ Copié !' : '📋 Copier'}
            </button>
          </div>
          <div className="config-info">
            <span>
              {room.diff === 'easy' ? '🌆 Facile' : room.diff === 'medium' ? '🗺️ Moyen' : '🔥 Difficile'}
            </span>
            <span>{room.totalRounds} rounds</span>
          </div>
          <button className="btn-leave" onClick={() => router.push('/lobby')}>← Quitter</button>
        </div>
      </div>
    )
  }

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
                    <div className="pr-dist">
                      {g ? `${g.dist.toLocaleString('fr-FR')} km` : 'Pas de réponse'}
                    </div>
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
            <p className="waiting-host">En attente de l&apos;hôte...</p>
          )}
        </div>
      </div>
    )
  }

  // PLAYING state
  const opponent = room.host === username ? room.guest : room.host
  const myColor = room.host === username ? COLORS[0] : COLORS[1]
  const cg = room.guesses[room.currentRound] || {}
  const opponentGuessed = opponent ? !!cg[opponent] : false

  return (
    <div className="game-screen">
      <div ref={svRef} style={{ position: 'absolute', inset: 0 }} />

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
            <button
              className="map-btn"
              onClick={() => {
                setMapExpanded((x) => !x)
                setTimeout(() => {
                  if (miniMapObj.current) google.maps.event.trigger(miniMapObj.current, 'resize')
                }, 350)
              }}
            >⛶</button>
          </div>
          {!guess && !hasGuessed && (
            <div className="map-hint">Cliquez pour placer votre pin</div>
          )}
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
