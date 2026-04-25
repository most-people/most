import AppProvider from '~/app/app/AppProvider'
import '~/styles/lottery.css'

export default function LotteryLayout({ children }) {
  return <AppProvider>{children}</AppProvider>
}
