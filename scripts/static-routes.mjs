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
]

export function getStaticOutputFile(route) {
  if (route === '/') return 'index.html'
  return `${route.replace(/^\/|\/$/g, '')}/index.html`
}

export const requiredStaticEntries = requiredStaticRoutes.map(route => ({
  route,
  file: getStaticOutputFile(route),
}))
