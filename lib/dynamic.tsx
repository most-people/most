import {
  Suspense,
  forwardRef,
  lazy,
  type ComponentType,
  type ReactNode,
} from 'react'

type DynamicOptions = {
  ssr?: boolean
  loading?: () => ReactNode
}

type Loader<TProps> = () => Promise<
  ComponentType<TProps> | { default: ComponentType<TProps> }
>

export default function dynamic<TProps>(
  loader: Loader<TProps>,
  options: DynamicOptions = {}
) {
  const LazyComponent = lazy(async () => {
    const loaded = await loader()
    return 'default' in loaded ? loaded : { default: loaded }
  })

  return forwardRef<unknown, TProps>(function DynamicComponent(props, ref) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        <LazyComponent {...props} ref={ref} />
      </Suspense>
    )
  })
}
