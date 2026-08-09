import { fireEvent, render, screen, within } from '@testing-library/react'

import { createInitialGameState } from '@/domain'

import { DebugPanel } from './DebugPanel'

describe('DebugPanel', () => {
  it('把 V4 默认活动时长显示为沉浸式的一分十二秒', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-duration', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
      />,
    )

    const defaultDuration = screen.getByRole('button', { name: '1 分 12 秒' })
    expect(defaultDuration).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '112 秒' })).not.toBeInTheDocument()

    fireEvent.click(defaultDuration)
    expect(onAction).toHaveBeenCalledWith({ type: 'debug/duration-set', durationMs: 72_000 })
  })

  it('通过两步文字按钮只派发领域全收集动作', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-collect-all', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '一键全收集' }))
    expect(onAction).not.toHaveBeenCalled()

    const confirmation = screen.getByRole('group', { name: '确认一键全收集' })
    expect(within(confirmation).getByText('确认把全部收藏和好朋友加入调试档？')).toBeVisible()
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认全收集' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      type: 'debug/collect-all',
      now: expect.any(Number),
    })
  })

  it('通过二次确认只派发领域撤销全部收集动作', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-clear-all', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '一键撤销全部收集' }))
    expect(onAction).not.toHaveBeenCalled()

    const confirmation = screen.getByRole('group', { name: '确认一键撤销全部收集' })
    expect(within(confirmation).getByText('确认清空全部收藏和好朋友记录？')).toBeVisible()
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认撤销' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      type: 'debug/clear-all',
      now: expect.any(Number),
    })
  })
})
