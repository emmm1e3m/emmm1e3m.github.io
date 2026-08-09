import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { MascotSprite } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'

import type { PomodoroFocusOverlayProps } from './types'
import './reality.css'

const PLAYER_FOCUS_PEER = '[data-modal-focus-peer="persistent-player"]'

interface CancelDialogProps {
  phaseLabel: string
  onClose: () => void
  onConfirm: () => void
  returnFocus: () => HTMLElement | null
}

function formatDuration(durationMs: number) {
  return durationMs % 60_000 === 0
    ? `${durationMs / 60_000} 分钟`
    : `${Math.ceil(durationMs / 1_000)} 秒`
}

function CancelDialog({ phaseLabel, onClose, onConfirm, returnFocus }: CancelDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const safeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(true, onClose, {
    initialFocus: safeButtonRef,
    returnFocus,
  })

  return (
    <div className="pomodoro-focus__confirm-backdrop" data-modal-backdrop>
      <div
        ref={dialogRef}
        className="reality-dialog pomodoro-focus__confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <span className="reality-dialog__symbol" aria-hidden="true">
          ↩️
        </span>
        <h2 id={titleId}>确认取消苹果钟？</h2>
        <p id={descriptionId}>取消后不会完成这一轮，也不会推进相伴天数。</p>
        <div className="reality-dialog__actions">
          <button
            ref={safeButtonRef}
            className="reality-secondary-button"
            type="button"
            onClick={onClose}
          >
            继续{phaseLabel}
          </button>
          <button className="reality-danger-button" type="button" onClick={onConfirm}>
            确认取消
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 苹果钟进行中的全屏空间；持久播放器作为明确 peer 参与焦点圈定。
 */
export function PomodoroFocusOverlay({
  session,
  background,
  todos,
  musicStarter,
  playerExpanded = false,
  onTodoCompletionChange,
  onCancel,
  className = '',
}: PomodoroFocusOverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const infoRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const phaseLabel = session.status === 'focus' ? '专注' : '休息'
  const dialogRef = useModalFocus<HTMLElement>(true, () => setConfirmingCancel(true), {
    initialFocus: infoRef,
    returnFocus: false,
    focusPeers: [PLAYER_FOCUS_PEER],
  })
  const backgroundUrl = background?.fullUrl ?? background?.thumbnailUrl

  return createPortal(
    <div
      className={`pomodoro-focus-backdrop ${className}`.trim()}
      data-modal-backdrop
      data-background-id={background?.id ?? 'plain'}
    >
      {backgroundUrl && <img className="pomodoro-focus__background" src={backgroundUrl} alt="" />}
      <span className="pomodoro-focus__wash" aria-hidden="true" />

      <section
        ref={dialogRef}
        className="pomodoro-focus"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="pomodoro-focus__scene" aria-hidden="true">
          <MascotSprite
            pose={session.status === 'focus' ? 'sit' : 'warm'}
            className="pomodoro-focus__mascot"
          />
        </div>

        <div className="pomodoro-focus__workspace">
          <div
            ref={infoRef}
            className={`pomodoro-focus__info ${playerExpanded ? 'is-compact' : ''}`}
            tabIndex={0}
          >
            <div className="pomodoro-focus__headline">
              <div>
                <span>{phaseLabel}阶段</span>
                <h2 id={titleId}>{session.status === 'focus' ? '和饼狗一起专注' : '休息一下吧'}</h2>
              </div>
              <strong className="pomodoro-focus__countdown" role="timer">
                {session.remainingLabel ?? '计时中'}
              </strong>
            </div>
            <p id={descriptionId} className="pomodoro-focus__description">
              {session.status === 'focus'
                ? session.breakDurationMs > 0
                  ? `专注 ${formatDuration(session.focusDurationMs)}后，会进入 ${formatDuration(session.breakDurationMs)}休息。`
                  : `专注 ${formatDuration(session.focusDurationMs)}后，这一轮会直接完成。`
                : '这一段休息结束后，整轮苹果钟完成，并记为相伴的下一天。'}
            </p>
            <button
              ref={cancelButtonRef}
              className="reality-secondary-button pomodoro-focus__cancel"
              type="button"
              onClick={() => setConfirmingCancel(true)}
            >
              取消本次计时
            </button>
          </div>

          <section className="pomodoro-focus__todos" aria-labelledby={`${titleId}-todos`}>
            <div className="pomodoro-focus__section-heading">
              <h3 id={`${titleId}-todos`}>待办事项</h3>
              <span>
                {todos.filter((todo) => todo.completed).length}/{todos.length}
              </span>
            </div>
            {todos.length > 0 ? (
              <ul>
                {todos.map((todo) => (
                  <li key={todo.id} className={todo.completed ? 'is-complete' : ''}>
                    <label className="reality-todo-check">
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        aria-label={`${todo.completed ? '标记为未完成' : '标记为已完成'}：${todo.title}`}
                        onChange={(event) => onTodoCompletionChange(todo.id, event.target.checked)}
                      />
                      <span aria-hidden="true">✓</span>
                    </label>
                    <span>{todo.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>这轮没有待办，安心完成自己的安排吧。</p>
            )}
          </section>

          {musicStarter && (
            <section className="pomodoro-focus__player" aria-label="音乐播放器">
              {musicStarter}
            </section>
          )}
        </div>

        {confirmingCancel && (
          <CancelDialog
            phaseLabel={phaseLabel}
            returnFocus={() => cancelButtonRef.current}
            onClose={() => setConfirmingCancel(false)}
            onConfirm={() => {
              setConfirmingCancel(false)
              onCancel(session.sessionId)
            }}
          />
        )}
      </section>
    </div>,
    document.body,
  )
}
