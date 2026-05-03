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
  if (room.host !== username) return NextResponse.json({ error: 'Seul le host peut avancer' }, { status: 403 })
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
