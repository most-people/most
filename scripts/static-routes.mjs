export const requiredStaticRoutes = [
  '/',
  '/about/',
  '/admin/',
  '/app/',
  '/chat/',
  '/chat/join/',
  '/chat/join/demo/',
  '/download/',
  '/friend/',
  '/game/',
  '/game/gandengyan/',
  '/game/zhajinhua/',
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
