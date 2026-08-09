import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PomodoroFocusOverlay } from './PomodoroFocusOverlay'
import type { PomodoroFocusOverlayProps } from './types'

function createProps(
  overrides: Partial<PomodoroFocusOverlayProps> = {},
): PomodoroFocusOverlayProps {
  return {
    session: {
      sessionId: 'pomodoro-1',
      status: 'focus',
      statusLabel: '专注中',
      remainingLabel: '24:59',
      focusDurationMs: 25 * 60_000,
      breakDurationMs: 5 * 60_000,
    },
    background: {
      id: 'postcard-1',
      title: '海边明信片',
      thumbnailUrl: '/postcard-thumb.webp',
      fullUrl: '/postcard-full.webp',
    },
    todos: [
      { id: 'todo-1', title: '整理桌面', completed: false },
      { id: 'todo-2', title: '写一封信', completed: true },
    ],
    musicStarter: <button type="button">播放全站第一</button>,
    onTodoCompletionChange: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('PomodoroFocusOverlay', () => {
  it('把明信片、饼狗、待办和音乐入口放在同一个全屏焦点分支', async () => {
    const props = createProps()
    const { container } = render(<PomodoroFocusOverlay {...props} />)

    const dialog = screen.getByRole('dialog', { name: '和饼狗一起专注' })
    const playerButton = screen.getByRole('button', { name: '播放全站第一' })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(container).not.toContainElement(dialog)
    expect(dialog).toContainElement(playerButton)
    expect(dialog.closest('[data-background-id]')).toHaveAttribute(
      'data-background-id',
      'postcard-1',
    )
    expect(
      dialog.closest('[data-modal-backdrop]')?.querySelector('.pomodoro-focus__background'),
    ).toHaveAttribute('src', '/postcard-full.webp')
    await waitFor(() => expect(dialog.querySelector('.pomodoro-focus__info')).toHaveFocus())
  })

  it('待办勾选只转交给上层，并在播放器展开时收缩信息卡', () => {
    const props = createProps({ playerExpanded: true })
    render(<PomodoroFocusOverlay {...props} />)

    expect(document.querySelector('.pomodoro-focus__info')).toHaveClass('is-compact')
    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：整理桌面' }))
    expect(props.onTodoCompletionChange).toHaveBeenCalledWith('todo-1', true)
  })

  it('Escape 只打开取消确认，安全按钮先获焦，确认后才派发 sessionId', async () => {
    const props = createProps()
    render(<PomodoroFocusOverlay {...props} />)
    const dialog = screen.getByRole('dialog', { name: '和饼狗一起专注' })

    fireEvent.keyDown(dialog, { key: 'Escape' })
    const alert = screen.getByRole('alertdialog', { name: '确认取消苹果钟？' })
    expect(dialog).toContainElement(alert)
    await waitFor(() => expect(screen.getByRole('button', { name: '继续专注' })).toHaveFocus())
    expect(props.onCancel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认取消' }))
    expect(props.onCancel).toHaveBeenCalledWith('pomodoro-1')
  })

  it('休息阶段使用休息文案与继续休息的安全操作', async () => {
    const props = createProps({
      session: {
        ...createProps().session,
        status: 'break',
        statusLabel: '休息中',
        remainingLabel: '04:59',
      },
    })
    render(<PomodoroFocusOverlay {...props} />)

    expect(screen.getByRole('dialog', { name: '休息一下吧' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '取消本次计时' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '继续休息' })).toHaveFocus())
  })

  it('旧存档的零休息会话说明专注结束后直接完成', () => {
    const props = createProps({
      session: {
        ...createProps().session,
        focusDurationMs: 1_000,
        breakDurationMs: 0,
      },
    })
    render(<PomodoroFocusOverlay {...props} />)

    expect(screen.getByText('专注 1 秒后，这一轮会直接完成。')).toBeVisible()
    expect(screen.queryByText(/0 分钟休息/u)).not.toBeInTheDocument()
  })
})
