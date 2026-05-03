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
              <p className="muted-small">Aucun ami pour l&apos;instant</p>
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
