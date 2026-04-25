import { create } from 'zustand'

export interface Ticket {
  id: string
  roundId: number
  number: string
  status: 'pending' | 'winner' | 'loser'
  prizeTier?: string
  prizeAmount?: number
}

export interface Winner {
  tier: string
  address?: string
  amount: number
  tickets?: number
}

export interface HistoryEntry {
  roundId: number
  date: string
  prizePool: number
  winners: Winner[]
}

interface LotteryState {
  currentRound: number
  status: 'buying' | 'drawing' | 'completed'
  endTime: Date
  totalTickets: number
  prizePool: number
  myTickets: Ticket[]
  history: HistoryEntry[]
  buyTickets: (quantity: number) => void
}

function generateTicketNumber(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function generateMockHistory(): HistoryEntry[] {
  return [
    {
      roundId: 42,
      date: '2026-04-24T20:00:00Z',
      prizePool: 1250,
      winners: [
        { tier: '一等奖', address: '0x1a2b...3c4d', amount: 625 },
        { tier: '二等奖', address: '0x5e6f...7g8h', amount: 125 },
        { tier: '三等奖', address: '0x9i0j...1k2l', amount: 62.5 },
        { tier: '参与奖', amount: 0.35, tickets: 1247 },
      ],
    },
    {
      roundId: 41,
      date: '2026-04-23T20:00:00Z',
      prizePool: 980,
      winners: [
        { tier: '一等奖', address: '0x7q8r...9s0t', amount: 490 },
        { tier: '二等奖', address: '0x1u2v...3w4x', amount: 98 },
        { tier: '三等奖', address: '0x5y6z...7a8b', amount: 49 },
        { tier: '参与奖', amount: 0.35, tickets: 977 },
      ],
    },
    {
      roundId: 40,
      date: '2026-04-22T20:00:00Z',
      prizePool: 1500,
      winners: [
        { tier: '一等奖', address: '0x3g4h...5i6j', amount: 750 },
        { tier: '二等奖', address: '0x7k8l...9m0n', amount: 150 },
        { tier: '三等奖', address: '0x1o2p...3q4r', amount: 75 },
        { tier: '参与奖', amount: 0.35, tickets: 1497 },
      ],
    },
  ]
}

function generateMockTickets(): Ticket[] {
  return [
    { id: 'ticket-001', roundId: 43, number: '123456', status: 'pending' },
    { id: 'ticket-002', roundId: 43, number: '789012', status: 'pending' },
    { id: 'ticket-003', roundId: 43, number: '345678', status: 'pending' },
  ]
}

export const useLotteryStore = create<LotteryState>(set => ({
  currentRound: 43,
  status: 'buying',
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000),
  totalTickets: 1250,
  prizePool: 1250,
  myTickets: generateMockTickets(),
  history: generateMockHistory(),

  buyTickets: (quantity: number) =>
    set(state => {
      const newTickets: Ticket[] = []
      for (let i = 0; i < quantity; i++) {
        newTickets.push({
          id: `ticket-${Date.now()}-${i}`,
          roundId: state.currentRound,
          number: generateTicketNumber(),
          status: 'pending',
        })
      }
      return {
        myTickets: [...state.myTickets, ...newTickets],
        totalTickets: state.totalTickets + quantity,
        prizePool: state.prizePool + quantity,
      }
    }),
}))
