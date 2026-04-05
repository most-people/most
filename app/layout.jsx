import { ErrorBoundary } from './error-boundary'
import '../public/app.css'

export const metadata = {
  title: 'MostBox 文件管理',
  description: 'MostBox P2P 文件管理',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" data-theme="light">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ErrorBoundary>
          <GlobalErrorHandler />
          {children}
        </ErrorBoundary>
      </body>
    </html>
  )
}

function GlobalErrorHandler() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          window.onerror = function(message, source, lineno, colno, error) {
            console.error('[Global Error]', { message, source, lineno, colno, error });
          };
          window.onunhandledrejection = function(event) {
            console.error('[Unhandled Promise Rejection]', event.reason);
          };
        `,
      }}
    />
  )
}
