import { useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'
import type { WorldDimension } from '@/domain'

interface HelpDialogProps {
  open: boolean
  world?: WorldDimension
  onClose: () => void
}

export function HelpDialog({ open, world = 'game', onClose }: HelpDialogProps) {
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
        <span className="paper-tag help-dialog__tag">铲铲饼屋的小纸条</span>
        <h2 id="help-title">{world === 'reality' ? '把现实里的事慢慢做好' : '怎么陪饼狗玩'}</h2>
        {world === 'reality' ? (
          <div className="help-dialog__sections">
            <section>
              <h3>数据与工作</h3>
              <p>既可以刷播与冲热，也可以为工作与学习计时。</p>
            </section>
            <section>
              <h3>完整苹果钟</h3>
              <p>每轮先专注工作，再按时休息。工作和休息都结束后，才算完成一轮陪伴。</p>
            </section>
            <section>
              <h3>🍎结算</h3>
              <p>
                每10分钟可以积攒1🍎。回到饼屋时，请确认现实里的事情是否认真完成。认真完成会带回全部苹果，否则只带回一半。
              </p>
            </section>
          </div>
        ) : (
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
              <h3>收藏记忆</h3>
              <p>完成任务会得到🍎；🍎可以向冰箱中补充道具。和饼狗留下的记忆会被保存在收藏墙。</p>
            </section>
          </div>
        )}
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
