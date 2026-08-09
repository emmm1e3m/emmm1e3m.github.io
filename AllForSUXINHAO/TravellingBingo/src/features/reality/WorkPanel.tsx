import { useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '@/components/useModalFocus'
import { MascotSprite } from '@/components/MascotSprite'

import type { RealityNotificationPermission, RealityTodoView, WorkPanelProps } from './types'
import './reality.css'

const NOTIFICATION_LABELS: Readonly<Record<RealityNotificationPermission, string>> = {
  default: '提醒尚未开启',
  granted: '页面保持打开时，完成提醒已开启',
  denied: '提醒已被浏览器关闭',
  unsupported: '当前浏览器不支持提醒',
}

interface TodoDeleteDialogProps {
  todo: RealityTodoView
  onCancel: () => void
  onConfirm: () => void
  returnFocus: () => HTMLElement | null
}

function TodoDeleteDialog({ todo, onCancel, onConfirm, returnFocus }: TodoDeleteDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(true, onCancel, {
    initialFocus: cancelRef,
    returnFocus,
  })

  return createPortal(
    <div className="reality-dialog-backdrop reality-dialog-backdrop--v4" data-modal-backdrop>
      <div
        ref={dialogRef}
        className="reality-dialog reality-delete-dialog"
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
            ref={cancelRef}
            className="reality-secondary-button"
            type="button"
            onClick={onCancel}
          >
            先不删除
          </button>
          <button className="reality-danger-button" type="button" onClick={onConfirm}>
            确认删除
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface PomodoroConfirmDialogProps {
  mode: 'start' | 'cancel'
  durationLabel?: string
  onCancel: () => void
  onConfirm: () => void
  returnFocus: () => HTMLElement | null
}

function PomodoroConfirmDialog({
  mode,
  durationLabel,
  onCancel,
  onConfirm,
  returnFocus,
}: PomodoroConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const safeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLDivElement>(true, onCancel, {
    initialFocus: safeButtonRef,
    returnFocus,
  })
  const starting = mode === 'start'

  return createPortal(
    <div className="reality-dialog-backdrop reality-dialog-backdrop--v4" data-modal-backdrop>
      <div
        ref={dialogRef}
        className="reality-dialog reality-pomodoro-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <span className="reality-dialog__symbol" aria-hidden="true">
          {starting ? '🍎' : '↩️'}
        </span>
        <h2 id={titleId}>{starting ? '确认开始苹果钟？' : '确认取消苹果钟？'}</h2>
        <p id={descriptionId}>
          {starting
            ? `和饼狗一起专注${durationLabel ? ` ${durationLabel}` : '这一段时间'}吗？开始后仍可用房间左下角的 ↩️ 中途取消。`
            : '取消后不会计入相伴的下一天，这一次已经经过的计时也不会保留。'}
        </p>
        <div className="reality-dialog__actions">
          <button
            ref={safeButtonRef}
            className="reality-secondary-button"
            type="button"
            onClick={onCancel}
          >
            {starting ? '再想想' : '继续专注'}
          </button>
          <button
            className={starting ? 'reality-primary-button' : 'reality-danger-button'}
            type="button"
            onClick={onConfirm}
          >
            {starting ? '确认开始' : '确认取消'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function WorkPanel({
  pomodoro,
  unlockedBackgrounds,
  selectedBackgroundId,
  todos,
  actions,
  notification,
  cancelRequestToken,
  onCancelRequestHandled,
  className = '',
}: WorkPanelProps) {
  const headingId = useId()
  const newTodoInputRef = useRef<HTMLInputElement>(null)
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null)
  const startTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelTriggerRef = useRef<HTMLButtonElement>(null)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [pendingDeleteTodo, setPendingDeleteTodo] = useState<RealityTodoView | null>(null)
  const [pendingStartDurationMs, setPendingStartDurationMs] = useState<number | null>(null)
  const [pendingCancelSessionId, setPendingCancelSessionId] = useState<string | null>(null)

  const notificationLabel = notification
    ? (notification.statusLabel ?? NOTIFICATION_LABELS[notification.permission])
    : null
  const selectedBackground =
    unlockedBackgrounds.find((background) => background.id === selectedBackgroundId) ?? null
  const timerRunning = pomodoro.session?.status === 'running'
  const externalCancelSessionId =
    cancelRequestToken !== null &&
    cancelRequestToken !== undefined &&
    pomodoro.session?.status === 'running'
      ? pomodoro.session.sessionId
      : null
  const cancelSessionId =
    pomodoro.session?.status === 'running' &&
    (pendingCancelSessionId === pomodoro.session.sessionId ||
      externalCancelSessionId === pomodoro.session.sessionId)
      ? pomodoro.session.sessionId
      : null
  const selectedDurationLabel =
    pomodoro.durationOptions.find((option) => option.durationMs === pendingStartDurationMs)
      ?.label ?? undefined

  function closeCancelConfirmation() {
    setPendingCancelSessionId(null)
    if (
      externalCancelSessionId !== null &&
      cancelRequestToken !== null &&
      cancelRequestToken !== undefined
    ) {
      onCancelRequestHandled?.(cancelRequestToken)
    }
  }

  function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newTodoTitle.trim()
    if (!title) return
    actions.onTodoCreate(title)
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
    actions.onTodoUpdate(todoId, { title })
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
    actions.onTodoDelete(todoId)
  }

  return (
    <section
      className={`reality-panel reality-work-panel ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="reality-panel__heading">
        <div>
          <span className="reality-eyebrow">一楼电脑 · 工作</span>
          <h2 id={headingId}>苹果钟与待办</h2>
        </div>
        <span className="reality-panel__mark" aria-hidden="true">
          ◷
        </span>
      </div>
      <p className="reality-panel__intro">
        选一张喜欢的明信片，让饼狗陪你专注一会儿，再把今天的小事一件件完成。
      </p>

      <section
        className={`reality-work-card reality-timer-card ${
          selectedBackground?.thumbnailUrl ? 'has-postcard-background' : ''
        }`.trim()}
        aria-labelledby={`${headingId}-timer`}
        data-background-id={selectedBackground?.id ?? 'plain'}
      >
        {selectedBackground?.thumbnailUrl && (
          <img
            className="reality-timer-card__background"
            src={selectedBackground.thumbnailUrl}
            alt=""
          />
        )}
        <span className="reality-timer-card__shade" aria-hidden="true" />

        <div className="reality-work-card__heading">
          <div>
            <span className="reality-card-index">01</span>
            <h3 id={`${headingId}-timer`}>选择苹果钟时长</h3>
          </div>
          <div className="reality-timer-card__badges">
            {selectedBackground && (
              <span className="reality-background-status">背景 · {selectedBackground.title}</span>
            )}
            {pomodoro.session && (
              <span className="reality-session-status" role="status">
                {pomodoro.session.statusLabel}
              </span>
            )}
          </div>
        </div>

        {pomodoro.durationOptions.length > 0 ? (
          <div className="reality-choice-grid" role="group" aria-label="苹果钟时长">
            {pomodoro.durationOptions.map((option) => {
              const selected = option.durationMs === pomodoro.selectedDurationMs
              return (
                <button
                  key={option.durationMs}
                  className="reality-choice-button"
                  type="button"
                  aria-pressed={selected}
                  disabled={pomodoro.session?.status === 'running'}
                  onClick={() => actions.onDurationChange(option.durationMs)}
                >
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="reality-empty" role="status">
            还没有可用的苹果钟时长。
          </p>
        )}

        {pomodoro.session?.remainingLabel && (
          <p className="reality-timer-readout" aria-live="polite">
            <span>当前进度</span>
            <strong>{pomodoro.session.remainingLabel}</strong>
          </p>
        )}

        <div className="reality-action-row">
          <button
            ref={startTriggerRef}
            className="reality-primary-button"
            type="button"
            disabled={
              pomodoro.canStart === false ||
              pomodoro.durationOptions.length === 0 ||
              pomodoro.session?.status === 'running'
            }
            onClick={() => {
              setPendingCancelSessionId(null)
              setPendingStartDurationMs(pomodoro.selectedDurationMs)
            }}
          >
            开始苹果钟
          </button>
          {pomodoro.session?.status === 'running' && actions.onPomodoroCancel && (
            <button
              ref={cancelTriggerRef}
              className="reality-secondary-button"
              type="button"
              onClick={() => {
                setPendingStartDurationMs(null)
                setPendingCancelSessionId(pomodoro.session!.sessionId)
              }}
            >
              取消本次计时
            </button>
          )}
        </div>

        {notification && (
          <div className="reality-notification-note">
            <span>{notificationLabel}</span>
            {notification.permission === 'default' && actions.onNotificationRequest && (
              <button type="button" onClick={actions.onNotificationRequest}>
                开启完成提醒
              </button>
            )}
          </div>
        )}

        <div className="reality-timer-companion">
          <MascotSprite
            pose={timerRunning ? 'sit' : 'idle'}
            className="reality-timer-companion__mascot"
            label={timerRunning ? '正在陪你专注的饼狗' : '准备陪你专注的饼狗'}
          />
          <p>
            <strong>{timerRunning ? '饼狗正在陪你' : '饼狗准备好啦'}</strong>
            <span>
              {timerRunning
                ? '先专心完成眼前这一小段吧。'
                : selectedBackground
                  ? `已经铺好“${selectedBackground.title}”，随时可以开始。`
                  : '选一张明信片，或者就在默认纸张上开始。'}
            </span>
          </p>
        </div>
      </section>

      <section className="reality-work-card" aria-labelledby={`${headingId}-background`}>
        <div className="reality-work-card__heading">
          <div>
            <span className="reality-card-index">02</span>
            <h3 id={`${headingId}-background`}>明信片背景</h3>
          </div>
          <span className="reality-unlocked-count">已解锁 {unlockedBackgrounds.length}</span>
        </div>
        <div className="reality-postcard-grid" role="group" aria-label="苹果钟明信片背景">
          <button
            className="reality-postcard-option reality-postcard-option--plain"
            type="button"
            aria-pressed={selectedBackgroundId === null}
            onClick={() => actions.onBackgroundChange(null)}
          >
            <span aria-hidden="true">白纸</span>
            <strong>默认纸张</strong>
          </button>
          {unlockedBackgrounds.map((background) => (
            <button
              key={background.id}
              className="reality-postcard-option"
              type="button"
              aria-pressed={background.id === selectedBackgroundId}
              onClick={() => actions.onBackgroundChange(background.id)}
            >
              {background.thumbnailUrl ? (
                <img src={background.thumbnailUrl} alt="" />
              ) : (
                <span className="reality-postcard-option__placeholder" aria-hidden="true">
                  明信片
                </span>
              )}
              <strong>{background.title}</strong>
              {background.description && <small>{background.description}</small>}
            </button>
          ))}
        </div>
      </section>

      <section className="reality-work-card" aria-labelledby={`${headingId}-todos`}>
        <div className="reality-work-card__heading">
          <div>
            <span className="reality-card-index">03</span>
            <h3 id={`${headingId}-todos`}>待办清单</h3>
          </div>
          <span className="reality-unlocked-count">{todos.length} 项</span>
        </div>

        <form className="reality-todo-create" onSubmit={createTodo}>
          <label htmlFor={`${headingId}-new-todo`}>新待办</label>
          <div>
            <input
              ref={newTodoInputRef}
              id={`${headingId}-new-todo`}
              value={newTodoTitle}
              placeholder="写下一件要做的事"
              autoComplete="off"
              onChange={(event) => setNewTodoTitle(event.target.value)}
            />
            <button type="submit" disabled={!newTodoTitle.trim()}>
              添加
            </button>
          </div>
        </form>

        {todos.length > 0 ? (
          <ul className="reality-todo-list" aria-label="现实生活待办">
            {todos.map((todo) => (
              <li key={todo.id} className={todo.completed ? 'is-complete' : ''}>
                {editingTodoId === todo.id ? (
                  <form
                    className="reality-todo-edit"
                    aria-label={`编辑待办：${todo.title}`}
                    onSubmit={(event) => updateTodo(event, todo.id)}
                  >
                    <label className="visually-hidden" htmlFor={`${headingId}-edit-${todo.id}`}>
                      待办标题
                    </label>
                    <input
                      id={`${headingId}-edit-${todo.id}`}
                      value={editTitle}
                      autoComplete="off"
                      autoFocus
                      onChange={(event) => setEditTitle(event.target.value)}
                    />
                    <div>
                      <button type="submit" disabled={!editTitle.trim()}>
                        保存
                      </button>
                      <button
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
                          actions.onTodoCompletionChange(todo.id, event.target.checked)
                        }
                      />
                      <span aria-hidden="true">✓</span>
                    </label>
                    <div className="reality-todo-copy">
                      <strong>{todo.title}</strong>
                      {todo.dueLabel && <small>{todo.dueLabel}</small>}
                    </div>
                    <div className="reality-todo-actions">
                      <button type="button" onClick={() => startEditing(todo)}>
                        编辑
                      </button>
                      <button
                        className="is-danger"
                        type="button"
                        onClick={(event) => askToDelete(todo, event.currentTarget)}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="reality-empty" role="status">
            暂时没有待办，写下一件小事吧。
          </p>
        )}
      </section>

      {pendingDeleteTodo && (
        <TodoDeleteDialog
          todo={pendingDeleteTodo}
          returnFocus={() => deleteReturnFocusRef.current}
          onCancel={() => setPendingDeleteTodo(null)}
          onConfirm={confirmDelete}
        />
      )}
      {pendingStartDurationMs !== null && (
        <PomodoroConfirmDialog
          mode="start"
          durationLabel={selectedDurationLabel}
          returnFocus={() => startTriggerRef.current}
          onCancel={() => setPendingStartDurationMs(null)}
          onConfirm={() => {
            const durationMs = pendingStartDurationMs
            setPendingStartDurationMs(null)
            actions.onPomodoroStart(durationMs)
          }}
        />
      )}
      {cancelSessionId !== null && (
        <PomodoroConfirmDialog
          mode="cancel"
          returnFocus={() => cancelTriggerRef.current}
          onCancel={closeCancelConfirmation}
          onConfirm={() => {
            closeCancelConfirmation()
            actions.onPomodoroCancel?.(cancelSessionId)
          }}
        />
      )}
    </section>
  )
}
