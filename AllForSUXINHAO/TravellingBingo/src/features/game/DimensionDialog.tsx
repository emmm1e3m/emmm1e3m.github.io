import { useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'

export type DimensionDialogMode = 'confirm-enter' | 'confirm-leave' | 'trend-pc-required'

interface DimensionDialogProps {
  mode: DimensionDialogMode
  onCancel: () => void
  onConfirm: () => void
}

const DIALOG_COPY: Record<
  DimensionDialogMode,
  { title: string; description: string; confirmLabel: string }
> = {
  'confirm-enter': {
    title: '进入现实维度？',
    description:
      '这里可以安排待办、使用完整的工作与休息苹果钟，也可以进行真正的刷播和冲热。返回饼屋时会结算这次带回的苹果。',
    confirmLabel: '进入现实维度',
  },
  'confirm-leave': {
    title: '回到饼屋？',
    description: '回到饼屋后会结算这次现实维度带回的苹果，再继续陪饼狗旅行。',
    confirmLabel: '回到饼屋',
  },
  'trend-pc-required': {
    title: '冲热请使用电脑端',
    description: '冲热功能目前只在电脑端开放，可以先使用刷播，或为工作与学习计时。',
    confirmLabel: '知道了',
  },
}

export function DimensionDialog({ mode, onCancel, onConfirm }: DimensionDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(true, onCancel, {
    initialFocus: confirmRef,
  })
  const copy = DIALOG_COPY[mode]

  return (
    <div
      className="modal-backdrop dimension-dialog-backdrop"
      role="presentation"
      onMouseDown={onCancel}
    >
      <div
        ref={dialogRef}
        className="paper-dialog dimension-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dimension-dialog-title"
        aria-describedby="dimension-dialog-description"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="paper-tag">维度切换</span>
        <h2 id="dimension-dialog-title">{copy.title}</h2>
        <p id="dimension-dialog-description">{copy.description}</p>
        <div className="dialog-actions">
          {(mode === 'confirm-enter' || mode === 'confirm-leave') && (
            <button className="paper-button" type="button" onClick={onCancel}>
              先不切换
            </button>
          )}
          <button
            ref={confirmRef}
            className="paper-button paper-button--primary"
            type="button"
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
