import {
  Link as RouterLink,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import {
  forwardRef,
  useMemo,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  replace?: boolean
  scroll?: boolean
  prefetch?: boolean | 'auto' | null
  children?: ReactNode
}

function isExternalHref(href: string) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith('#')
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, prefetch: _prefetch, scroll: _scroll, ...props },
  ref
) {
  if (isExternalHref(href)) {
    return <a ref={ref} href={href} {...props} />
  }

  return (
    <RouterLink
      ref={ref}
      to={href}
      replace={replace}
      preload={false}
      {...props}
    />
  )
})

export default Link

export function usePathname() {
  return useLocation({ select: location => location.pathname })
}

export function useSearchParams() {
  const location = useLocation()
  const search = (location as { searchStr?: string }).searchStr

  return useMemo(() => {
    if (typeof search === 'string') {
      return new URLSearchParams(search)
    }
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search)
    }
    return new URLSearchParams()
  }, [location.href, search])
}

export function useRouter() {
  const navigate = useNavigate()

  return useMemo(
    () => ({
      push: (href: string) => navigate({ to: href }),
      replace: (href: string) => navigate({ to: href, replace: true }),
      back: () => {
        if (window.history.length > 1) {
          window.history.back()
          return
        }
        navigate({ to: '/' })
      },
    }),
    [navigate]
  )
}
