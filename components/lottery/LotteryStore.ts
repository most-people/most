import { create } from 'zustand'
import { LOTTERY_CONFIG, getRoundEndTime } from './lottery.config'

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

export const useLotteryStore = create<LotteryState>(set => ({
  currentRound: LOTTERY_CONFIG.initialRound,
  status: 'buying',
  endTime: getRoundEndTime(),
  totalTickets: 0,
  prizePool: 0,
  myRounds: [],
  history: [],
  walletAddress: null,
  usdtBalance: 0,
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
