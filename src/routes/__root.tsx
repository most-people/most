import '~/styles/globals.css'
import '~/styles/app.css'
import '~/styles/note.css'
import '~/styles/marketing.css'
import '~/styles/download.css'
import '~/styles/portal.css'
import '~/styles/profile.css'
import '~/styles/admin.css'
import '~/styles/chat.css'
import '~/styles/ping.css'
import '~/styles/web3.css'
import '~/styles/zhajinhua.css'
import '~/styles/cid.css'
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

import { ErrorBoundary } from '~/features/system/ErrorBoundary'
import NotFoundPage from '~/features/system/NotFoundPage'
import AppGlobals from '~/components/AppGlobals'
import { GlobalVoiceRoomProvider } from '~/features/chat/GlobalVoiceRoom'
import { I18nProvider, translateMessage } from '~/lib/i18n'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#5e6ad2' },
      { title: 'MostBox' },
      {
        name: 'description',
        content: translateMessage('portal.meta.description'),
      },
    ],
    links: [{ rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
  }),
  component: RootRoute,
  notFoundComponent: NotFoundPage,
})

function RootRoute() {
  return (
    <RootDocument>
      <I18nProvider>
        <ErrorBoundary>
          <GlobalVoiceRoomProvider>
            <ClientOnly>
              <AppGlobals />
            </ClientOnly>
            <GlobalErrorHandler />
            <Outlet />
          </GlobalVoiceRoomProvider>
        </ErrorBoundary>
      </I18nProvider>
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
                var resolvedTheme = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
                  ? 'dark'
                  : 'light';
                document.documentElement.setAttribute('data-theme', resolvedTheme);
                var locale = localStorage.getItem('mostbox.locale');
                var supportedLocales = ['zh-CN', 'zh-TW', 'en'];
                var normalizedLocale = supportedLocales.indexOf(locale) >= 0 ? locale : 'zh-CN';
                document.documentElement.setAttribute('lang', normalizedLocale);
                document.documentElement.setAttribute('data-locale', normalizedLocale);
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
