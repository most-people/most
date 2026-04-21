interface LogoIconProps {
  size?: number
}

export function LogoIcon({ size = 24 }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="2"
        y="2"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.4"
      />
      <rect
        x="14"
        y="2"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.7"
      />
      <rect
        x="2"
        y="14"
        width="8"
        height="8"
        rx="2"
        fill="var(--accent)"
        opacity="0.7"
      />
      <rect x="14" y="14" width="8" height="8" rx="2" fill="var(--accent)" />
    </svg>
  )
}
