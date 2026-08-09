import { useId, useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'

import type { RealityReturnDialogProps } from './types'
import './reality.css'

export function RealityReturnDialog({
  open,
  fullRewardApples,
  onDecision,
  onDismiss,
  returnFocus,
}: RealityReturnDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const safeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(open, onDismiss, {
    initialFocus: safeButtonRef,
    returnFocus: returnFocus ?? undefined,
  })

  if (!open) return null

  return (
    <div className="reality-dialog-backdrop" data-modal-backdrop>
      <div
        ref={dialogRef}
        className="reality-dialog reality-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <span className="reality-dialog__symbol" aria-hidden="true">
          🚪
        </span>
        <span className="reality-eyebrow">欢迎回来</span>
        <h2 id={titleId}>现实里的事情认真完成了吗？</h2>
        <p id={descriptionId}>
          这段时间一共攒下 <strong>{fullRewardApples}🍎</strong>
          。请如实告诉饼狗；如果没有认真完成，饼狗会只把一半带回家。
        </p>
        <div className="reality-dialog__actions reality-return-dialog__actions">
          <button
            className="reality-primary-button"
            type="button"
            onClick={() => onDecision('serious')}
          >
            是的🥰
          </button>
          <button
            ref={safeButtonRef}
            className="reality-secondary-button"
            type="button"
            onClick={() => onDecision('not-serious')}
          >
            没有🥺
          </button>
        </div>
      </div>
    </div>
  )
}
