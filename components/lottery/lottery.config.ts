export const LOTTERY_CONFIG = {
  roundDurationMs: parseInt(
    process.env.NEXT_PUBLIC_LOTTERY_ROUND_MS || '9000000',
    10
  ),
  initialRound: parseInt(process.env.NEXT_PUBLIC_LOTTERY_INITIAL_ROUND || '1', 10),
  prizeTiers: [
    { rank: 1, label: '一等奖', percentage: 50, emoji: '🥇' },
    { rank: 2, label: '二等奖', percentage: 10, emoji: '🥈' },
    { rank: 3, label: '三等奖', percentage: 5, emoji: '🥉' },
    { rank: 4, label: '参与奖', percentage: 35, emoji: '🎫' },
  ],
  ticketPrice: 1,
  maxTicketsPerRound: 100,
} as const

export function getRoundEndTime() {
  return new Date(Date.now() + LOTTERY_CONFIG.roundDurationMs)
}
