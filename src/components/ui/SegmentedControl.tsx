import type { ReactNode } from 'react'

export interface SegmentedControlOption<TValue extends string | number> {
  value: TValue
  label: ReactNode
  ariaLabel?: string
  title?: string
  disabled?: boolean
}

export interface SegmentedControlProps<TValue extends string | number> {
  options: readonly SegmentedControlOption<TValue>[]
  value: TValue
  onChange: (value: TValue) => void
  ariaLabel: string
  className?: string
  optionClassName?: string
  size?: 'default' | 'compact'
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SegmentedControl<TValue extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  optionClassName,
  size = 'default',
}: SegmentedControlProps<TValue>) {
  return (
    <div
      className={cx(
        'ui-segmented-control',
        size === 'compact' && 'is-compact',
        className
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(option => {
        const isActive = option.value === value

        return (
          <button
            key={String(option.value)}
            type="button"
            className={cx(
              'ui-segmented-option',
              isActive && 'is-active',
              optionClassName
            )}
            aria-pressed={isActive}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            onClick={() => {
              if (!isActive) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
