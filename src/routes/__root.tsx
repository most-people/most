import '~/app/globals.css'
import '~/styles/app.css'
import '~/styles/note.css'
import '~/styles/marketing.css'
import '~/styles/download.css'
import '~/styles/portal.css'
import '~/styles/admin.css'
import '~/styles/chat.css'
import '~/styles/demo.css'
import '~/styles/ping.css'
import '~/styles/web3.css'
import '~/styles/zhajinhua.css'
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

import type { ReactNode } from 'react'
import {
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import { ErrorBoundary } from '~/app/error-boundary'
import NotFoundPage from '~/app/not-found'
import AppGlobals from '~/components/AppGlobals'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#5e6ad2' },
      { title: 'MostBox' },
      { name: 'description', content: 'P2P 文件分享，无需注册' },
    ],
    links: [{ rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
  }),
  component: RootRoute,
  notFoundComponent: NotFoundPage,
})

function RootRoute() {
  return (
    <RootDocument>
      <ErrorBoundary>
        <ClientOnly>
          <AppGlobals />
        </ClientOnly>
        <GlobalErrorHandler />
        <Outlet />
      </ErrorBoundary>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <HeadContent />
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
        {children}
        <Scripts />
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
