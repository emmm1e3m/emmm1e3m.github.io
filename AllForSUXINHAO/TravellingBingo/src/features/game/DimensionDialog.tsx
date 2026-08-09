import { useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'

export type DimensionDialogMode =
  'confirm-enter' | 'confirm-leave' | 'pc-required' | 'return-required'

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
      '这里可以安排待办、使用完整的工作与休息苹果钟，也可以查看刷播与冲热。返回饼屋时会结算这次带回的苹果。',
    confirmLabel: '进入现实维度',
  },
  'confirm-leave': {
    title: '回到饼屋？',
    description: '回到饼屋后会结算这次现实维度带回的苹果，再继续陪饼狗旅行。',
    confirmLabel: '回到饼屋',
  },
  'pc-required': {
    title: '请使用电脑浏览器',
    description: '现实维度只在具备鼠标或触控板的电脑浏览器中开放。',
    confirmLabel: '知道了',
  },
  'return-required': {
    title: '先回到饼屋',
    description: '这个存档停在现实维度。当前浏览器不支持继续，请先返回饼屋并完成结算。',
    confirmLabel: '返回饼屋',
  },
}

export function DimensionDialog({ mode, onCancel, onConfirm }: DimensionDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dismissible = mode !== 'return-required'
  const dialogRef = useModalFocus<HTMLDivElement>(true, dismissible ? onCancel : undefined, {
    initialFocus: confirmRef,
  })
  const copy = DIALOG_COPY[mode]

  return (
    <div
      className="modal-backdrop dimension-dialog-backdrop"
      role="presentation"
      onMouseDown={dismissible ? onCancel : undefined}
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
