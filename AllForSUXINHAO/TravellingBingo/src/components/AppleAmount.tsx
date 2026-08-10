interface AppleAmountProps {
  value: number
  prefix?: string
  className?: string
}

export function AppleAmount({ value, prefix = '', className }: AppleAmountProps) {
  const classes = ['apple-amount', className].filter(Boolean).join(' ')
  const label = `${prefix}${value}🍎`

  return (
    <span className={classes} aria-label={label}>
      <span className="apple-amount__number" aria-hidden="true">
        {prefix}
        {value}
      </span>
      <span aria-hidden="true">🍎</span>
    </span>
  )
}
