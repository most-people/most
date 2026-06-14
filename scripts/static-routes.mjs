export const requiredStaticRoutes = [
  '/',
  '/admin/',
  '/app/',
  '/chat/',
  '/chat/join/',
  '/demo/',
  '/download/',
  '/game/',
  '/game/gandengyan/',
  '/game/zhajinhua/',
  '/note/',
  '/ping/',
  '/web3/',
  '/web3/ed25519/',
  '/web3/tools/',
]

export function getStaticOutputFile(route) {
  if (route === '/') return 'index.html'
  return `${route.replace(/^\/|\/$/g, '')}/index.html`
}

export const requiredStaticEntries = requiredStaticRoutes.map(route => ({
  route,
  file: getStaticOutputFile(route),
}))
