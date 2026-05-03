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
