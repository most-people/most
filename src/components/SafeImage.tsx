import type { ImgHTMLAttributes, SyntheticEvent } from 'react'
import { useEffect, useState } from 'react'

const FALLBACK_BROKEN_IMAGE_SRC = '/avatars/fallback-broken.svg'

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string
}

export function SafeImage({
  alt = '',
  className = '',
  crossOrigin,
  fallbackLabel = '',
  onError,
  onLoad,
  referrerPolicy = 'no-referrer',
  src,
  ...props
}: SafeImageProps) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_BROKEN_IMAGE_SRC)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setImageSrc(src || FALLBACK_BROKEN_IMAGE_SRC)
    setIsLoaded(false)
  }, [src])

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (imageSrc === FALLBACK_BROKEN_IMAGE_SRC) {
      return
    }

    setImageSrc(FALLBACK_BROKEN_IMAGE_SRC)
    setIsLoaded(false)
    onError?.(event)
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    setIsLoaded(true)

    if (imageSrc === FALLBACK_BROKEN_IMAGE_SRC) {
      return
    }

    onLoad?.(event)
  }

  const isShowingFallback = imageSrc === FALLBACK_BROKEN_IMAGE_SRC
  const accessibleLabel = isShowingFallback ? alt || fallbackLabel : ''
  const rootClassName = [
    'safe-image',
    isShowingFallback ? 'is-broken' : '',
    isLoaded ? '' : 'is-loading',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={rootClassName}
      role={accessibleLabel ? 'img' : undefined}
      aria-label={accessibleLabel || undefined}
      aria-hidden={accessibleLabel ? undefined : true}
    >
      <img
        {...props}
        src={imageSrc}
        alt={alt}
        crossOrigin={crossOrigin}
        referrerPolicy={referrerPolicy}
        onError={handleError}
        onLoad={handleLoad}
      />
    </span>
  )
}
