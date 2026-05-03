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
