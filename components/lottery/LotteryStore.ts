import { create } from 'zustand'

export interface RoundParticipation {
  roundId: number
  count: number
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
  totalTickets: number
  winners: Winner[]
  myResult?: 'winner' | 'loser' | 'participation'
  myPrize?: number
}

interface LotteryState {
  currentRound: number
  status: 'buying' | 'drawing' | 'completed'
  endTime: Date
  totalTickets: number
  prizePool: number
  myRounds: RoundParticipation[]
  history: HistoryEntry[]
  walletAddress: string | null
  usdtBalance: number
  isConnected: boolean
  isConnecting: boolean
  connectWallet: () => void
  disconnectWallet: () => void
  buyTickets: (usdtAmount: number) => void
}

function generateMockHistory(): HistoryEntry[] {
  return [
    {
      roundId: 42,
      date: '2026-04-24T20:00:00Z',
      prizePool: 1250,
      totalTickets: 1250,
      winners: [
        { tier: '一等奖', address: '0x1a2b...3c4d', amount: 625 },
        { tier: '二等奖', address: '0x5e6f...7g8h', amount: 125 },
        { tier: '三等奖', address: '0x9i0j...1k2l', amount: 62.5 },
        { tier: '参与奖', amount: 0.35, tickets: 1247 },
      ],
      myResult: 'loser',
      myPrize: 0,
    },
    {
      roundId: 41,
      date: '2026-04-23T20:00:00Z',
      prizePool: 980,
      totalTickets: 980,
      winners: [
        { tier: '一等奖', address: '0x7q8r...9s0t', amount: 490 },
        { tier: '二等奖', address: '0x1u2v...3w4x', amount: 98 },
        { tier: '三等奖', address: '0x5y6z...7a8b', amount: 49 },
        { tier: '参与奖', amount: 0.35, tickets: 977 },
      ],
      myResult: 'participation',
      myPrize: 0.35,
    },
    {
      roundId: 40,
      date: '2026-04-22T20:00:00Z',
      prizePool: 1500,
      totalTickets: 1500,
      winners: [
        { tier: '一等奖', address: '0x3g4h...5i6j', amount: 750 },
        { tier: '二等奖', address: '0x7k8l...9m0n', amount: 150 },
        { tier: '三等奖', address: '0x1o2p...3q4r', amount: 75 },
        { tier: '参与奖', amount: 0.35, tickets: 1497 },
      ],
      myResult: 'winner',
      myPrize: 75,
    },
  ]
}

function generateMockRounds(): RoundParticipation[] {
  return [
    { roundId: 43, count: 5, status: 'pending' },
  ]
}

export const useLotteryStore = create<LotteryState>(set => ({
  currentRound: 43,
  status: 'buying',
  endTime: new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000),
  totalTickets: 1250,
  prizePool: 1250,
  myRounds: generateMockRounds(),
  history: generateMockHistory(),
  walletAddress: null,
  usdtBalance: 45.2,
  isConnected: false,
  isConnecting: false,

  connectWallet: () => {
    set({ isConnecting: true })
    setTimeout(() => {
      set({
        isConnected: true,
        isConnecting: false,
        walletAddress: '0xAbCd...Ef12',
      })
    }, 800)
  },

  disconnectWallet: () =>
    set({
      isConnected: false,
      walletAddress: null,
    }),

  buyTickets: (usdtAmount: number) =>
    set(state => {
      const existing = state.myRounds.find(
        r => r.roundId === state.currentRound
      )
      let newRounds: RoundParticipation[]
      if (existing) {
        newRounds = state.myRounds.map(r =>
          r.roundId === state.currentRound
            ? { ...r, count: r.count + usdtAmount }
            : r
        )
      } else {
        newRounds = [
          ...state.myRounds,
          {
            roundId: state.currentRound,
            count: usdtAmount,
            status: 'pending',
          },
        ]
      }
      return {
        myRounds: newRounds,
        totalTickets: state.totalTickets + usdtAmount,
        prizePool: state.prizePool + usdtAmount,
      }
    }),
}))
