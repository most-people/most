import { ChevronDown } from 'lucide-react'

export interface SelectControlOption<TValue extends string | number> {
  value: TValue
  label: string
  disabled?: boolean
}

export interface SelectControlProps<TValue extends string | number> {
  options: readonly SelectControlOption<TValue>[]
  value: TValue
  onChange: (value: TValue) => void
  ariaLabel: string
  className?: string
  size?: 'default' | 'compact'
  disabled?: boolean
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function SelectControl<TValue extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'default',
  disabled = false,
}: SelectControlProps<TValue>) {
  return (
    <span
      className={cx(
        'ui-select-field',
        size === 'compact' && 'is-compact',
        disabled && 'is-disabled',
        className
      )}
    >
      <select
        className="ui-select-control"
        value={String(value)}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={event => {
          const nextValue = options.find(
            option => String(option.value) === event.currentTarget.value
          )?.value
          if (nextValue !== undefined) onChange(nextValue)
        }}
      >
        {options.map(option => (
          <option
            key={String(option.value)}
            value={String(option.value)}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="ui-select-icon" size={14} aria-hidden="true" />
    </span>
  )
}
