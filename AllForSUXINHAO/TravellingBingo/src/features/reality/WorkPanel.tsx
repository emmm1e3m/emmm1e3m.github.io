import { useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '@/components/useModalFocus'
import { POMODORO_PRESETS } from '@/domain'

import type { RealityNotificationPermission, RealityTodoView, WorkPanelProps } from './types'
import { findPomodoroBackgroundOption } from './realityViewModel'
import { PostcardPicker } from './PostcardPicker'
import './reality.css'

const NOTIFICATION_LABELS: Readonly<Record<RealityNotificationPermission, string>> = {
  default: '未开启',
  granted: '已开启',
  denied: '浏览器已关闭',
  unsupported: '当前浏览器不支持',
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
            ? `和饼狗一起完成${durationLabel ? ` ${durationLabel}` : '这一轮专注与休息'}吗？专注结束后会进入休息，完成整轮才会记为相伴的下一天。`
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
            {starting ? '确认开始' : '取消计时'}
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
  selectedBackground,
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
  const selectedBackgroundOption = findPomodoroBackgroundOption(
    unlockedBackgrounds,
    selectedBackground,
  )
  const selectedPreset = POMODORO_PRESETS.find(
    (preset) => preset.focusDurationMs === pomodoro.selectedDurationMs,
  )
  const timerRunning =
    pomodoro.session !== null &&
    pomodoro.session !== undefined &&
    pomodoro.session.status !== 'completed'
  const externalCancelSessionId =
    cancelRequestToken !== null &&
    cancelRequestToken !== undefined &&
    pomodoro.session !== null &&
    pomodoro.session !== undefined &&
    pomodoro.session.status !== 'completed'
      ? pomodoro.session.sessionId
      : null
  const cancelSessionId =
    pomodoro.session !== null &&
    pomodoro.session !== undefined &&
    pomodoro.session.status !== 'completed' &&
    (pendingCancelSessionId === pomodoro.session.sessionId ||
      externalCancelSessionId === pomodoro.session.sessionId)
      ? pomodoro.session.sessionId
      : null
  const pendingPreset = POMODORO_PRESETS.find(
    (preset) => preset.focusDurationMs === pendingStartDurationMs,
  )
  const selectedDurationLabel = pendingPreset
    ? `${pendingPreset.label}专注 + ${Math.round(pendingPreset.breakDurationMs / 60_000)} 分钟休息`
    : undefined

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
        <h2 id={headingId}>苹果钟与待办</h2>
      </div>
      <p className="reality-panel__intro">
        选一张喜欢的明信片或奇迹合拍，让饼狗陪你专注一会儿，再把今天的小事一件件完成。
      </p>

      <section className="reality-work-card" aria-labelledby={`${headingId}-timer`}>
        <div className="reality-work-card__heading">
          <div>
            <span className="reality-card-index">01</span>
            <h3 id={`${headingId}-timer`}>设置苹果钟与提醒</h3>
          </div>
          {pomodoro.session && (
            <span className="reality-session-status" role="status">
              {pomodoro.session.statusLabel}
            </span>
          )}
        </div>

        <p className="reality-pomodoro-explanation">
          每轮先专注，再休息。完成两个阶段后，才会记为和饼狗相伴的下一天。
        </p>

        <div className="reality-choice-grid" role="group" aria-label="苹果钟时长">
          {POMODORO_PRESETS.map((preset) => {
            const selected = preset.focusDurationMs === pomodoro.selectedDurationMs
            return (
              <button
                key={preset.id}
                className="reality-choice-button"
                type="button"
                aria-pressed={selected}
                disabled={timerRunning}
                onClick={() => actions.onDurationChange(preset.focusDurationMs)}
              >
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </button>
            )
          })}
        </div>

        {notification && (
          <div className="reality-setting-row">
            <div>
              <strong>阶段完成提醒</strong>
              <span>页面保持打开时提醒 · {notificationLabel}</span>
            </div>
            {notification.permission === 'default' && actions.onNotificationRequest && (
              <button
                className="reality-secondary-button"
                type="button"
                onClick={actions.onNotificationRequest}
              >
                开启提醒
              </button>
            )}
          </div>
        )}

        <div className="reality-start-summary" aria-label="本轮苹果钟设置">
          <span>
            专注 {selectedPreset?.label ?? '未选择'} · 休息{' '}
            {selectedPreset ? `${Math.round(selectedPreset.breakDurationMs / 60_000)} 分钟` : '—'}
          </span>
          <span>背景 · {selectedBackgroundOption?.title ?? '默认纸张'}</span>
        </div>

        <div className="reality-action-row reality-action-row--timer">
          <button
            ref={startTriggerRef}
            className="reality-primary-button"
            type="button"
            disabled={pomodoro.canStart === false || selectedPreset === undefined || timerRunning}
            onClick={() => {
              setPendingCancelSessionId(null)
              setPendingStartDurationMs(pomodoro.selectedDurationMs)
            }}
          >
            开始苹果钟
          </button>
          {timerRunning && actions.onPomodoroCancel && (
            <button
              ref={cancelTriggerRef}
              className="reality-danger-button"
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
      </section>

      <section className="reality-work-card" aria-labelledby={`${headingId}-todos`}>
        <div className="reality-work-card__heading">
          <div>
            <span className="reality-card-index">02</span>
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
            <button
              className="reality-secondary-button"
              type="submit"
              disabled={!newTodoTitle.trim()}
            >
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

      <PostcardPicker
        options={unlockedBackgrounds}
        selected={selectedBackground}
        onChange={actions.onBackgroundChange}
        disabled={timerRunning}
      />

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
