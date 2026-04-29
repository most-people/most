import '~/app/globals.css'
import '~/styles/app.css'
import { ErrorBoundary } from '~/app/error-boundary'

export const metadata = {
  title: 'MostBox',
  description: 'P2P 文件分享，无需注册',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#5e6ad2" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
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
