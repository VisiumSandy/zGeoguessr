import { MongoClient, Db } from 'mongodb'

const uri = process.env.MONGODB_URI!
if (!uri) throw new Error('MONGODB_URI is not set')

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>
}

let clientPromise: Promise<MongoClient>

if (process.env.NODE_ENV === 'development') {
  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = new MongoClient(uri).connect()
  }
  clientPromise = globalWithMongo._mongoClientPromise
} else {
  clientPromise = new MongoClient(uri).connect()
}

export default clientPromise

export async function getDb(): Promise<Db> {
  const c = await clientPromise
  return c.db('geoguessr')
}
