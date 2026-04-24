import './globals.css'
import '../styles/app.css'
import { ErrorBoundary } from './error-boundary'
import { PwaInstallPrompt } from '../components/PwaInstallPrompt'

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#5e6ad2" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/pwa-512x512.png" />
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.mostInstallPromptEvent = null;
              window.addEventListener('beforeinstallprompt', function(event) {
                event.preventDefault();
                window.mostInstallPromptEvent = event;
              });
            `,
          }}
        />
      </head>
      <body>
        <ErrorBoundary>
          <GlobalErrorHandler />
          {children}
          <PwaInstallPrompt />
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
