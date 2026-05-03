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
  const bothGuessed =
    updated!.host && updated!.guest && cg[updated!.host] && cg[updated!.guest]

  if (bothGuessed) {
    await db.collection('rooms').updateOne(
      { code: params.code.toUpperCase() },
      { $set: { status: 'results', updatedAt: new Date() } }
    )
  }

  return NextResponse.json({ dist, pts })
}
