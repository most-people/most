export const requiredStaticRoutes = [
  '/',
  '/about/',
  '/admin/',
  '/app/',
  '/file/',
  '/chat/',
  '/chat/join/',
  '/chat/join/demo/',
  '/download/',
  '/docs/',
  '/docs/mcp/',
  '/docs/api/',
  '/feature/',
  '/note/',
  '/ping/',
  '/profile/',
  '/web3/',
]

export function getStaticOutputFile(route) {
  if (route === '/') return 'index.html'
  return `${route.replace(/^\/|\/$/g, '')}/index.html`
}

export const requiredStaticEntries = requiredStaticRoutes.map(route => ({
  route,
  file: getStaticOutputFile(route),
}))
