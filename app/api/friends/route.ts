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
