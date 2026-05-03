import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const { username } = await req.json()
  const db = await getDb()
  const room = await db.collection('rooms').findOne({ code: params.code.toUpperCase() })

  if (!room) return NextResponse.json({ error: 'Room introuvable' }, { status: 404 })
  if (room.status !== 'waiting') return NextResponse.json({ error: 'La partie a déjà commencé' }, { status: 400 })
  if (room.host === username) return NextResponse.json({ error: 'Tu es déjà dans cette room' }, { status: 400 })
  if (room.guest) return NextResponse.json({ error: 'La room est pleine' }, { status: 400 })

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
