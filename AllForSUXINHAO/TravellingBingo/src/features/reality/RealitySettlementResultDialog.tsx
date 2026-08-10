import { useRef } from 'react'

import { AppleAmount } from '@/components/AppleAmount'
import { useModalFocus } from '@/components/useModalFocus'
import type { RealityRewardDecision } from '@/domain'

interface RealitySettlementResultDialogProps {
  decision: RealityRewardDecision
  awardedApples: number
  fullRewardApples: number
  onDismiss: () => void
}

export function RealitySettlementResultDialog({
  decision,
  awardedApples,
  fullRewardApples,
  onDismiss,
}: RealitySettlementResultDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(true, onDismiss, { initialFocus: closeRef })
  const serious = decision === 'serious'

  return (
    <div className="modal-backdrop reality-settlement-result-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="reality-dialog reality-settlement-result"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reality-settlement-result-title"
        tabIndex={-1}
      >
        <span className="paper-tag">现实结算</span>
        <h2 id="reality-settlement-result-title">
          {serious ? '认真完成，全部带回来啦' : '这次先带回一半'}
        </h2>
        <p>
          收好{' '}
          <strong>
            <AppleAmount value={awardedApples} />
          </strong>
          {!serious && fullRewardApples > awardedApples ? (
            <>
              ；认真完成时原本可以带回 <AppleAmount value={fullRewardApples} />。
            </>
          ) : (
            '。'
          )}
        </p>
        <button ref={closeRef} className="reality-primary-button" type="button" onClick={onDismiss}>
          收好啦
        </button>
      </div>
    </div>
  )
}
