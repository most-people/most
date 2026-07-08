import type { ImgHTMLAttributes, SyntheticEvent } from 'react'

export const DEFAULT_IMAGE_FALLBACK = '/avatars/fallback-broken.svg'

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string
}

export function SafeImage({
  fallbackSrc = DEFAULT_IMAGE_FALLBACK,
  onError,
  ...props
}: SafeImageProps) {
  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    onError?.(event)
    if (event.defaultPrevented) return

    const image = event.currentTarget
    if (
      image.getAttribute('src') === fallbackSrc ||
      image.src.endsWith(fallbackSrc)
    ) {
      return
    }

    image.src = fallbackSrc
  }

  return <img {...props} onError={handleError} />
}
