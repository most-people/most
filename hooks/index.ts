import {
  useMediaQuery,
  useViewportSize,
  useDisclosure,
  useLocalStorage,
  useClipboard,
  useHotkeys,
  useToggle,
  useWindowEvent,
} from '@mantine/hooks'

export function useIsMobile(breakpoint = 768) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`)
}

export function useIsTablet(breakpoint = 1024) {
  return useMediaQuery(`(max-width: ${breakpoint}px)`)
}

export { useGuardedAction } from '~/hooks/useGuardedAction'

export {
  useMediaQuery,
  useViewportSize,
  useDisclosure,
  useLocalStorage,
  useClipboard,
  useHotkeys,
  useToggle,
  useWindowEvent,
}
