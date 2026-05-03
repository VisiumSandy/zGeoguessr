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
