import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import realityStyles from './reality.css?raw'
import { WorkPanel } from './WorkPanel'
import type { WorkPanelActions, WorkPanelProps } from './types'

function createActions(): WorkPanelActions {
  return {
    onDurationChange: vi.fn(),
    onPomodoroStart: vi.fn(),
    onPomodoroCancel: vi.fn(),
    onBackgroundChange: vi.fn(),
    onTodoCreate: vi.fn(),
    onTodoUpdate: vi.fn(),
    onTodoCompletionChange: vi.fn(),
    onTodoDelete: vi.fn(),
    onNotificationRequest: vi.fn(),
  }
}

describe('工作面板移动触控', () => {
  it('完成提醒按钮的宽高下限均为 44px', () => {
    expect(realityStyles).toContain(
      '.reality-setting-row .reality-secondary-button {\n  min-width: 44px;\n  min-height: 44px;',
    )
  })
})

function createProps(actions = createActions()): WorkPanelProps {
  return {
    pomodoro: {
      selectedDurationMs: 25 * 60 * 1_000,
      session: null,
      canStart: true,
    },
    unlockedBackgrounds: [
      {
        kind: 'postcard',
        ref: { kind: 'postcard', id: 'postcard-1' },
        id: 'postcard-1',
        title: '海边明信片',
        thumbnailUrl: '/postcard-1.webp',
        aspectRatio: 2 / 3,
      },
      {
        kind: 'postcard',
        ref: { kind: 'postcard', id: 'postcard-2' },
        id: 'postcard-2',
        title: '晚霞明信片',
      },
    ],
    selectedBackground: { kind: 'postcard', id: 'postcard-1' },
    todos: [
      { id: 'todo-1', title: '整理旅行照片', completed: false, dueLabel: '今天' },
      { id: 'todo-2', title: '写一封信', completed: true },
    ],
    notification: { permission: 'default' },
    actions,
  }
}

describe('WorkPanel', () => {
  it('依次展示设置提醒、待办和明信片入口，开始按钮直接位于设置区', () => {
    const { container } = render(<WorkPanel {...createProps()} />)

    expect(
      within(container)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['设置苹果钟与提醒', '待办清单', '陪伴背景'])
    const settings = screen.getByRole('region', { name: '设置苹果钟与提醒' })
    expect(settings).toContainElement(screen.getByRole('button', { name: '开始苹果钟' }))
    expect(screen.queryByText('准备开始')).not.toBeInTheDocument()
    expect(screen.queryByText('04')).not.toBeInTheDocument()
    expect(container.querySelector('.reality-panel__mark')).toBeNull()
  })

  it('用按钮选择时长和已解锁背景，所有改变只交给 actions', () => {
    const actions = createActions()
    const props = createProps(actions)
    const { container } = render(<WorkPanel {...props} />)

    expect(
      screen.getByText(
        '选一张喜欢的明信片或奇迹合拍，让饼狗陪你专注一会儿，再把今天的小事一件件完成。',
      ),
    ).toBeVisible()
    const selectedDuration = screen.getByRole('button', { name: /25 分钟/u })
    expect(selectedDuration).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /50 分钟/u }))
    expect(actions.onDurationChange).toHaveBeenCalledWith(50 * 60 * 1_000)

    fireEvent.click(screen.getByRole('button', { name: '选择陪伴背景' }))
    fireEvent.click(screen.getByRole('radio', { name: /晚霞明信片/u }))
    expect(actions.onBackgroundChange).toHaveBeenCalledWith({
      kind: 'postcard',
      id: 'postcard-2',
    })

    fireEvent.click(screen.getByRole('button', { name: '选择陪伴背景' }))
    fireEvent.click(screen.getByRole('radio', { name: /默认纸张/u }))
    expect(actions.onBackgroundChange).toHaveBeenCalledWith(null)

    expect(container.querySelector('select')).toBeNull()
  })

  it('开始苹果钟前二次确认，安全按钮先获焦且 Escape 恢复触发按钮', async () => {
    const actions = createActions()
    const { container } = render(<WorkPanel {...createProps(actions)} />)
    // 复现信息栏滚动后，内容切换动画留下 transform containing block 的环境。
    container.style.transform = 'translateY(-320px)'

    const startButton = screen.getByRole('button', { name: '开始苹果钟' })
    startButton.focus()
    fireEvent.click(startButton)

    const dialog = screen.getByRole('alertdialog', { name: '确认开始苹果钟？' })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(dialog.parentElement).toHaveClass('reality-dialog-backdrop--v4')
    expect(container).not.toContainElement(dialog)
    const safeButton = screen.getByRole('button', { name: '再想想' })
    await waitFor(() => expect(safeButton).toHaveFocus())
    expect(actions.onPomodoroStart).not.toHaveBeenCalled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(startButton).toHaveFocus())

    fireEvent.click(startButton)
    await waitFor(() => expect(screen.getByRole('button', { name: '再想想' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(actions.onPomodoroStart).toHaveBeenCalledWith(25 * 60 * 1_000)
  })

  it('在入口卡片预览当前明信片，并在默认纸张与图片背景间切换', () => {
    const props = createProps()
    const { container, rerender } = render(<WorkPanel {...props} selectedBackground={null} />)
    const preview = container.querySelector('.reality-postcard-picker__preview')

    expect(preview).toHaveAttribute('data-background-id', 'plain')
    expect(screen.getAllByText('默认纸张').length).toBeGreaterThan(0)

    rerender(<WorkPanel {...props} selectedBackground={{ kind: 'postcard', id: 'postcard-1' }} />)

    const background = container.querySelector<HTMLImageElement>(
      '.reality-postcard-picker__preview img',
    )
    expect(preview).toHaveAttribute('data-background-id', 'postcard-1')
    expect(background).toHaveAttribute('src', '/postcard-1.webp')
    expect(preview).toHaveStyle({ '--postcard-preview-width': '112px' })
    expect(screen.getByText('背景 · 海边明信片')).toBeVisible()
  })

  it('计时中锁定设置与明信片，二次确认后才取消且明确不计下一天', async () => {
    const actions = createActions()
    const props = createProps(actions)
    render(
      <WorkPanel
        {...props}
        pomodoro={{
          ...props.pomodoro,
          canStart: false,
          session: {
            sessionId: 'pomodoro-running',
            status: 'focus',
            statusLabel: '专注中',
            remainingLabel: '12:34',
          },
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('专注中')
    expect(screen.getByRole('button', { name: '开始苹果钟' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '选择陪伴背景' })).toBeDisabled()

    const cancelTimer = screen.getByRole('button', { name: '取消本次计时' })
    expect(cancelTimer).toHaveClass('reality-danger-button')
    fireEvent.click(cancelTimer)
    expect(actions.onPomodoroCancel).not.toHaveBeenCalled()
    expect(
      screen.getByRole('alertdialog', { name: '确认取消苹果钟？' }).parentElement?.parentElement,
    ).toBe(document.body)
    expect(screen.getByText(/不会计入相伴的下一天/u)).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: '继续专注' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '取消计时' }))
    expect(actions.onPomodoroCancel).toHaveBeenCalledWith('pomodoro-running')
  })

  it('消费房间发出的苹果钟取消请求一次，并打开同一确认框', async () => {
    const actions = createActions()
    const onCancelRequestHandled = vi.fn()
    const props = createProps(actions)
    render(
      <WorkPanel
        {...props}
        pomodoro={{
          ...props.pomodoro,
          canStart: false,
          session: {
            sessionId: 'pomodoro-room-cancel',
            status: 'focus',
            statusLabel: '专注中',
          },
        }}
        cancelRequestToken={3}
        onCancelRequestHandled={onCancelRequestHandled}
      />,
    )

    expect(await screen.findByRole('alertdialog', { name: '确认取消苹果钟？' })).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: '继续专注' })).toHaveFocus())
    expect(onCancelRequestHandled).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续专注' }))
    expect(onCancelRequestHandled).toHaveBeenCalledTimes(1)
    expect(onCancelRequestHandled).toHaveBeenCalledWith(3)
    expect(actions.onPomodoroCancel).not.toHaveBeenCalled()
  })

  it('通知按钮只调用 App 传入的请求回调', () => {
    const actions = createActions()
    render(<WorkPanel {...createProps(actions)} />)

    fireEvent.click(screen.getByRole('button', { name: '开启提醒' }))

    expect(actions.onNotificationRequest).toHaveBeenCalledOnce()
  })

  it('明确提醒依赖页面保持打开', () => {
    const actions = createActions()
    render(<WorkPanel {...createProps(actions)} notification={{ permission: 'granted' }} />)

    expect(screen.getByText('页面保持打开时提醒 · 已开启')).toBeVisible()
  })

  it('把待办新增、编辑和完成状态变更交给对应 action', () => {
    const actions = createActions()
    render(<WorkPanel {...createProps(actions)} />)

    fireEvent.change(screen.getByLabelText('新待办'), { target: { value: '  收拾桌面  ' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByRole('button', { name: '添加' })).toHaveClass('reality-secondary-button')
    expect(actions.onTodoCreate).toHaveBeenCalledWith('收拾桌面')

    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!)
    const editInput = screen.getByLabelText('待办标题')
    expect(editInput).toHaveFocus()
    fireEvent.change(editInput, { target: { value: '整理全部旅行照片' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(actions.onTodoUpdate).toHaveBeenCalledWith('todo-1', {
      title: '整理全部旅行照片',
    })

    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：整理旅行照片' }))
    expect(actions.onTodoCompletionChange).toHaveBeenCalledWith('todo-1', true)
  })

  it('删除前弹出确认，安全按钮获得焦点，取消后把焦点还给删除按钮', async () => {
    const actions = createActions()
    render(<WorkPanel {...createProps(actions)} />)

    const deleteButton = screen.getAllByRole('button', { name: '删除' })[0]!
    deleteButton.focus()
    fireEvent.click(deleteButton)

    const cancelButton = screen.getByRole('button', { name: '先不删除' })
    expect(screen.getByRole('alertdialog').parentElement?.parentElement).toBe(document.body)
    await waitFor(() => expect(cancelButton).toHaveFocus())
    expect(actions.onTodoDelete).not.toHaveBeenCalled()

    fireEvent.click(cancelButton)
    await waitFor(() => expect(deleteButton).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('确认删除后才派发 action，并把焦点移到可继续新增的位置', async () => {
    const actions = createActions()
    render(<WorkPanel {...createProps(actions)} />)

    fireEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!)
    await waitFor(() => expect(screen.getByRole('button', { name: '先不删除' })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    expect(actions.onTodoDelete).toHaveBeenCalledWith('todo-1')
    await waitFor(() => expect(screen.getByLabelText('新待办')).toHaveFocus())
  })
})
