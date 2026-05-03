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
