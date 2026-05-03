import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const db = await getDb()
  const room = await db.collection('rooms').findOne(
    { code: params.code.toUpperCase() },
    { projection: { _id: 0 } }
  )
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  return NextResponse.json(room)
}
