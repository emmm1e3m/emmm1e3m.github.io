import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { WardrobePhoto } from '@/domain'

import realityStyles from './reality.css?raw'
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
      kind: 'postcard',
      ref: { kind: 'postcard', id: 'postcard-1' },
      id: 'postcard-1',
      title: '海边明信片',
      thumbnailUrl: '/postcard-thumb.webp',
      fullUrl: '/postcard-full.webp',
    },
    todos: [
      { id: 'todo-1', title: '整理桌面', completed: false },
      { id: 'todo-2', title: '写一封信', completed: true },
    ],
    musicStarter: (
      <button className="reality-secondary-button" type="button">
        打开唱片机
      </button>
    ),
    onTodoCreate: vi.fn(),
    onTodoUpdate: vi.fn(),
    onTodoCompletionChange: vi.fn(),
    onTodoDelete: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
}

describe('PomodoroFocusOverlay', () => {
  it('把明信片、饼狗、待办和音乐入口放在同一个全屏焦点分支', async () => {
    const props = createProps()
    const { container } = render(<PomodoroFocusOverlay {...props} />)

    const dialog = screen.getByRole('dialog', { name: '和饼狗一起专注' })
    const playerButton = screen.getByRole('button', { name: '打开唱片机' })
    expect(playerButton).toHaveClass('reality-secondary-button')
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
    expect(
      dialog.closest('[data-modal-backdrop]')?.querySelector('.pomodoro-focus__wash'),
    ).toBeNull()
    expect(realityStyles).not.toContain('.pomodoro-focus__wash')
    await waitFor(() => expect(dialog.querySelector('.pomodoro-focus__info')).toHaveFocus())
  })

  it('把保存的合拍按同一几何作为装饰背景，交互层与播放器保持可操作', async () => {
    const photo: WardrobePhoto = {
      photoId: 'photo-focus',
      postcardId: 'postcard-1',
      participants: [],
      decorations: [],
      createdAt: 1_755_000_000_000,
    }
    render(
      <PomodoroFocusOverlay
        {...createProps({
          background: {
            kind: 'wardrobe-photo',
            ref: { kind: 'wardrobe-photo', id: photo.photoId },
            id: photo.photoId,
            title: '奇迹合拍 · 8月11日',
            description: '保存的合拍',
            aspectRatio: 16 / 9,
            photo,
            thumbnailPostcard: {
              url: '/postcard-thumb.webp',
              width: 480,
              height: 270,
            },
            fullPostcard: {
              url: '/postcard-full.webp',
              width: 960,
              height: 540,
            },
          },
        })}
      />,
    )

    const backdrop = document.querySelector<HTMLElement>('[data-modal-backdrop]')
    const composition = backdrop?.querySelector<HTMLElement>('[data-photo-id="photo-focus"]')
    const playerButton = screen.getByRole('button', { name: '打开唱片机' })

    expect(backdrop).toHaveAttribute('data-background-id', 'wardrobe-photo:photo-focus')
    expect(composition).toHaveClass('photo-composition--cover')
    expect(composition).toHaveAttribute('aria-hidden', 'true')
    expect(composition).toHaveAttribute('inert')
    expect(composition?.querySelector('.photo-composition__canvas')).not.toBeNull()
    expect(playerButton.closest('[inert]')).toBeNull()
    expect(playerButton.closest('[aria-hidden="true"]')).toBeNull()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
  })

  it('待办勾选只转交给上层，并在播放器展开时收缩信息卡', () => {
    const props = createProps({ playerExpanded: true })
    render(<PomodoroFocusOverlay {...props} />)

    expect(document.querySelector('.pomodoro-focus__info')).toHaveClass('is-compact')
    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：整理桌面' }))
    expect(props.onTodoCompletionChange).toHaveBeenCalledWith('todo-1', true)
  })

  it('在全屏层内新增、修改和删除待办，并保持删除确认的安全焦点', async () => {
    const props = createProps()
    render(<PomodoroFocusOverlay {...props} />)

    const createInput = screen.getByLabelText('新待办')
    fireEvent.change(createInput, { target: { value: '  整理笔记  ' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(props.onTodoCreate).toHaveBeenCalledWith('整理笔记')

    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!)
    const editInput = screen.getByLabelText('待办标题')
    expect(editInput).toHaveFocus()
    fireEvent.change(editInput, { target: { value: '整理全部笔记' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(props.onTodoUpdate).toHaveBeenCalledWith('todo-1', { title: '整理全部笔记' })

    const deleteButton = screen.getAllByRole('button', { name: '删除' })[0]!
    deleteButton.focus()
    fireEvent.click(deleteButton)
    expect(props.onTodoDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: '先不删除' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '先不删除' }))
    await waitFor(() => expect(deleteButton).toHaveFocus())

    fireEvent.click(deleteButton)
    await waitFor(() => expect(screen.getByRole('button', { name: '先不删除' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(props.onTodoDelete).toHaveBeenCalledWith('todo-1')
    await waitFor(() => expect(createInput).toHaveFocus())
  })

  it('看电脑饼狗使用房间同档尺寸，只在独立安全区缓慢移动', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    render(<PomodoroFocusOverlay {...createProps()} />)

    const mascot = screen.getByRole('img', { name: '正在看电脑陪伴你的饼狗' })
    const actor = mascot.parentElement
    expect(mascot).toHaveClass('mascot-sprite--stream')
    expect(mascot).not.toHaveClass('mascot-sprite--sleep')
    expect(actor).toHaveStyle({
      '--pomodoro-mascot-x': '50%',
      '--pomodoro-mascot-y': '50%',
      '--pomodoro-mascot-duration': '10000ms',
    })
    expect(actor?.parentElement).toHaveClass('pomodoro-focus__scene')
    expect(realityStyles).toContain('width: clamp(96px, 12.2%, 124px);')
  })

  it('系统要求减少动态效果时固定看电脑饼狗并禁用位移过渡', async () => {
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }))

    render(<PomodoroFocusOverlay {...createProps()} />)

    const scene = document.querySelector('.pomodoro-focus__scene')
    const actor = screen.getByRole('img', {
      name: '正在看电脑陪伴你的饼狗',
    }).parentElement
    await waitFor(() => expect(scene).toHaveAttribute('data-reduced-motion', 'true'))
    expect(actor).toHaveStyle({
      '--pomodoro-mascot-x': '50%',
      '--pomodoro-mascot-y': '56%',
      '--pomodoro-mascot-duration': '0ms',
    })
    expect(realityStyles).toMatch(/\.pomodoro-focus__mascot\s*\{\s*transition: none !important;/u)
    vi.unstubAllGlobals()
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

    fireEvent.click(screen.getByRole('button', { name: '取消计时' }))
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
    const cancelTimer = screen.getByRole('button', { name: '取消本次计时' })
    expect(cancelTimer).toHaveClass('reality-danger-button')
    fireEvent.click(cancelTimer)
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
