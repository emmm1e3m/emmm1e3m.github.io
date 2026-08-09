import { useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(open, onClose, { initialFocus: closeRef })

  if (!open) return null

  return (
    <div className="modal-backdrop help-backdrop" role="presentation" onMouseDown={onClose}>
      <article
        ref={dialogRef}
        className="help-dialog help-dialog--v4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="paper-tag help-dialog__tag">
          <span aria-hidden="true">ℹ️</span>
          铲铲饼屋的小纸条
        </span>
        <h2 id="help-title">怎么陪饼狗玩</h2>
        <div className="help-dialog__sections">
          <section>
            <h3>在房间里</h3>
            <p>点设施，饼狗就会走过去。点房间空白处可以查看当前任务和饼狗的兴趣。</p>
          </section>
          <section>
            <h3>做一件事</h3>
            <p>旅行、刷播、冲热、弹琴和睡觉都需要一点时间。饼狗不想做时，也可以先问问它。</p>
            <p>中途取消不会增加天数，带出的补给也不会退回。</p>
          </section>
          <section>
            <h3>🍎与回忆</h3>
            <p>完成小事会得到🍎；🍎可以拿来补充冰箱。新的回忆和朋友会自己找到收藏墙里的位置。</p>
          </section>
        </div>
        <button
          ref={closeRef}
          className="paper-button paper-button--primary"
          type="button"
          onClick={onClose}
        >
          知道啦
        </button>
      </article>
    </div>
  )
}
