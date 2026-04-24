import '~/styles/chat.css'
import AppProvider from '~/app/app/AppProvider'

export const metadata = {
  title: 'MostBox - 频道',
  description: 'MostBox P2P 频道聊天',
}

export default function ChatLayout({ children }) {
  return <AppProvider>{children}</AppProvider>
}
