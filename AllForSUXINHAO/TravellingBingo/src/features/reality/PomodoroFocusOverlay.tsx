import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { MascotSprite } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'
import { PhotoCompositionPreview } from '@/features/wardrobe/PhotoCompositionPreview'

import type { PomodoroFocusOverlayProps, RealityTodoView } from './types'
import './reality.css'

const PLAYER_FOCUS_PEER = '[data-modal-focus-peer="persistent-player"]'

interface CancelDialogProps {
  phaseLabel: string
  onClose: () => void
  onConfirm: () => void
  returnFocus: () => HTMLElement | null
}

interface TodoDeleteDialogProps {
  todo: RealityTodoView
  onClose: () => void
  onConfirm: () => void
  returnFocus: () => HTMLElement | null
}

interface MascotPosition {
  x: number
  y: number
  durationMs: number
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
            取消计时
          </button>
        </div>
      </div>
    </div>
  )
}

function TodoDeleteDialog({ todo, onClose, onConfirm, returnFocus }: TodoDeleteDialogProps) {
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
          🗑️
        </span>
        <h2 id={titleId}>确认删除这条待办？</h2>
        <p id={descriptionId}>“{todo.title}”删除后需要重新创建才能找回。</p>
        <div className="reality-dialog__actions">
          <button
            ref={safeButtonRef}
            className="reality-secondary-button"
            type="button"
            onClick={onClose}
          >
            先不删除
          </button>
          <button className="reality-danger-button" type="button" onClick={onConfirm}>
            确认删除
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
  onTodoCreate,
  onTodoUpdate,
  onTodoCompletionChange,
  onTodoDelete,
  onCancel,
  className = '',
}: PomodoroFocusOverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const infoRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const newTodoInputRef = useRef<HTMLInputElement>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [pendingDeleteTodo, setPendingDeleteTodo] = useState<RealityTodoView | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [mascotPosition, setMascotPosition] = useState<MascotPosition>({
    x: 50,
    y: 56,
    durationMs: 0,
  })
  const phaseLabel = session.status === 'focus' ? '专注' : '休息'
  const dialogRef = useModalFocus<HTMLElement>(true, () => setConfirmingCancel(true), {
    initialFocus: infoRef,
    returnFocus: false,
    focusPeers: [PLAYER_FOCUS_PEER],
  })
  const backgroundUrl =
    background?.kind === 'postcard' ? (background.fullUrl ?? background.thumbnailUrl) : undefined
  const backgroundDataId =
    background === null
      ? 'plain'
      : `${background.kind === 'postcard' ? '' : 'wardrobe-photo:'}${background.id}`

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let moveTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    function clearMoveTimer() {
      if (moveTimer !== null) globalThis.clearTimeout(moveTimer)
      moveTimer = null
    }

    function moveMascot() {
      setMascotPosition({
        x: 30 + Math.random() * 40,
        y: 24 + Math.random() * 52,
        durationMs: 8_000 + Math.round(Math.random() * 4_000),
      })
      moveTimer = globalThis.setTimeout(moveMascot, 12_000 + Math.round(Math.random() * 5_000))
    }

    function syncMotionPreference() {
      clearMoveTimer()
      const prefersReducedMotion = mediaQuery?.matches ?? false
      setReducedMotion(prefersReducedMotion)
      if (prefersReducedMotion) {
        setMascotPosition({ x: 50, y: 56, durationMs: 0 })
      } else {
        moveMascot()
      }
    }

    syncMotionPreference()
    mediaQuery?.addEventListener('change', syncMotionPreference)
    return () => {
      clearMoveTimer()
      mediaQuery?.removeEventListener('change', syncMotionPreference)
    }
  }, [])

  function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newTodoTitle.trim()
    if (!title) return
    onTodoCreate(title)
    setNewTodoTitle('')
  }

  function startEditing(todo: RealityTodoView) {
    setEditingTodoId(todo.id)
    setEditTitle(todo.title)
  }

  function updateTodo(event: FormEvent<HTMLFormElement>, todoId: string) {
    event.preventDefault()
    const title = editTitle.trim()
    if (!title) return
    onTodoUpdate(todoId, { title })
    setEditingTodoId(null)
    setEditTitle('')
  }

  function askToDelete(todo: RealityTodoView, trigger: HTMLButtonElement) {
    deleteReturnFocusRef.current = trigger
    setPendingDeleteTodo(todo)
  }

  function confirmDelete() {
    if (!pendingDeleteTodo) return
    const todoId = pendingDeleteTodo.id
    deleteReturnFocusRef.current = newTodoInputRef.current
    setPendingDeleteTodo(null)
    onTodoDelete(todoId)
  }

  const mascotStyle = {
    '--pomodoro-mascot-x': `${mascotPosition.x}%`,
    '--pomodoro-mascot-y': `${mascotPosition.y}%`,
    '--pomodoro-mascot-duration': `${mascotPosition.durationMs}ms`,
  } as CSSProperties

  return createPortal(
    <div
      className={`pomodoro-focus-backdrop ${className}`.trim()}
      data-modal-backdrop
      data-background-id={backgroundDataId}
    >
      {backgroundUrl && <img className="pomodoro-focus__background" src={backgroundUrl} alt="" />}
      {background?.kind === 'wardrobe-photo' && (
        <PhotoCompositionPreview
          photo={background.photo}
          postcard={background.fullPostcard ?? background.thumbnailPostcard}
          className="pomodoro-focus__background pomodoro-focus__background--photo"
          mode="cover"
          decorative
        />
      )}
      <section
        ref={dialogRef}
        className="pomodoro-focus"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div
          className="pomodoro-focus__scene"
          data-reduced-motion={reducedMotion ? 'true' : 'false'}
        >
          <MascotSprite
            pose="stream"
            className="pomodoro-focus__mascot"
            label="正在看电脑陪伴你的饼狗"
            style={mascotStyle}
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
              className="reality-danger-button pomodoro-focus__cancel"
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

            <form className="pomodoro-focus__todo-create" onSubmit={createTodo}>
              <label className="visually-hidden" htmlFor={`${titleId}-new-todo`}>
                新待办
              </label>
              <input
                ref={newTodoInputRef}
                id={`${titleId}-new-todo`}
                value={newTodoTitle}
                placeholder="随时写下一件待办"
                autoComplete="off"
                onChange={(event) => setNewTodoTitle(event.target.value)}
              />
              <button
                className="reality-secondary-button"
                type="submit"
                disabled={!newTodoTitle.trim()}
              >
                添加
              </button>
            </form>

            {todos.length > 0 ? (
              <ul>
                {todos.map((todo) => (
                  <li key={todo.id} className={todo.completed ? 'is-complete' : ''}>
                    {editingTodoId === todo.id ? (
                      <form
                        className="pomodoro-focus__todo-edit"
                        aria-label={`编辑待办：${todo.title}`}
                        onSubmit={(event) => updateTodo(event, todo.id)}
                      >
                        <label className="visually-hidden" htmlFor={`${titleId}-edit-${todo.id}`}>
                          待办标题
                        </label>
                        <input
                          id={`${titleId}-edit-${todo.id}`}
                          value={editTitle}
                          autoComplete="off"
                          autoFocus
                          onChange={(event) => setEditTitle(event.target.value)}
                        />
                        <div>
                          <button
                            className="reality-primary-button"
                            type="submit"
                            disabled={!editTitle.trim()}
                          >
                            保存
                          </button>
                          <button
                            className="reality-secondary-button"
                            type="button"
                            onClick={() => {
                              setEditingTodoId(null)
                              setEditTitle('')
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <label className="reality-todo-check">
                          <input
                            type="checkbox"
                            checked={todo.completed}
                            aria-label={`${todo.completed ? '标记为未完成' : '标记为已完成'}：${todo.title}`}
                            onChange={(event) =>
                              onTodoCompletionChange(todo.id, event.target.checked)
                            }
                          />
                          <span aria-hidden="true">✓</span>
                        </label>
                        <span className="pomodoro-focus__todo-title">{todo.title}</span>
                        <span className="pomodoro-focus__todo-actions">
                          <button
                            className="reality-secondary-button"
                            type="button"
                            onClick={() => startEditing(todo)}
                          >
                            编辑
                          </button>
                          <button
                            className="reality-danger-button"
                            type="button"
                            onClick={(event) => askToDelete(todo, event.currentTarget)}
                          >
                            删除
                          </button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>这轮没有待办，随时写下一件要做的事吧。</p>
            )}
          </section>

          {musicStarter && (
            <section className="pomodoro-focus__player" aria-label="音乐播放器">
              {musicStarter}
            </section>
          )}
        </div>

        {pendingDeleteTodo && (
          <TodoDeleteDialog
            todo={pendingDeleteTodo}
            returnFocus={() => deleteReturnFocusRef.current}
            onClose={() => setPendingDeleteTodo(null)}
            onConfirm={confirmDelete}
          />
        )}
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
