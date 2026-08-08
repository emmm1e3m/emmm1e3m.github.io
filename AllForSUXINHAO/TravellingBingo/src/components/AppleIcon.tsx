interface AppleIconProps {
  className?: string
}

export function AppleIcon({ className }: AppleIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17 9c.3-3.6 2.1-5.8 5.7-6.7.1 3.8-2 6.2-5.7 6.7Z" fill="var(--leaf)" />
      <path
        d="M16 10.5c-4.4-4.1-12-1.7-12 6.6 0 7.6 5.4 12.2 10.1 10.1 1.2-.5 2.6-.5 3.8 0C22.6 29.3 28 24.7 28 17.1c0-8.3-7.6-10.7-12-6.6Z"
        fill="var(--apple)"
        stroke="var(--outline)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M15.8 10.3c-.2-2.2-1.2-3.6-3.1-4.4" stroke="var(--outline)" strokeWidth="2" />
      <path
        d="M9.1 15.2c.5-1.6 1.7-2.6 3.4-2.8"
        stroke="#fff"
        strokeOpacity=".65"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
