export type Difficulty = 'easy' | 'medium' | 'hard'
export type RoomStatus = 'waiting' | 'playing' | 'results' | 'finished'

export interface Spot {
  lat: number
  lng: number
  label: string
  flag: string
}

export interface GuessResult {
  lat: number
  lng: number
  dist: number
  pts: number
}

export interface Room {
  code: string
  host: string
  guest: string | null
  status: RoomStatus
  diff: Difficulty
  totalRounds: number
  currentRound: number
  rounds: Spot[]
  guesses: Array<Record<string, GuessResult>>
  scores: Record<string, number>
  createdAt: Date
  updatedAt: Date
}

export interface User {
  username: string
  friends: string[]
  lastSeen: Date
}
