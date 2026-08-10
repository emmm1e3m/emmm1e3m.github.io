import { fireEvent, render, screen, within } from '@testing-library/react'

import { createInitialGameState } from '@/domain'

import { DebugPanel } from './DebugPanel'

describe('DebugPanel', () => {
  it('把 V4 默认活动时长显示为十秒', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-duration', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={vi.fn()}
      />,
    )

    const defaultDuration = screen.getByRole('button', { name: '10 秒' })
    expect(defaultDuration).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '112 秒' })).not.toBeInTheDocument()
    const addApples = screen.getByRole('button', { name: '增加 20🍎' })
    expect(addApples).toHaveTextContent('增加 20🍎')
    expect(addApples.querySelector('.apple-amount__number')).toHaveTextContent('20')

    fireEvent.click(defaultDuration)
    expect(onAction).toHaveBeenCalledWith({ type: 'debug/duration-set', durationMs: 10_000 })
  })

  it('通过两步文字按钮只派发领域全收集动作', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-collect-all', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={vi.fn()}
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

  it('通过二次确认只派发领域清空收集动作', () => {
    const onAction = vi.fn()

    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-clear-all', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '清空收集' }))
    expect(onAction).not.toHaveBeenCalled()

    const confirmation = screen.getByRole('group', { name: '确认清空收集' })
    expect(within(confirmation).getByText('确认清空全部收藏和好朋友记录？')).toBeVisible()
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认清空' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      type: 'debug/clear-all',
      now: expect.any(Number),
    })
  })

  it('刷播轮次时长只通过运行时回调应用，并限制为 1 到 3600 秒整数', () => {
    const onAction = vi.fn()
    const onStreamRoundDurationChange = vi.fn()
    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'debug-stream', debug: true })}
        onAction={onAction}
        onBackup={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={onStreamRoundDurationChange}
      />,
    )

    const input = screen.getByRole('spinbutton', { name: '刷播轮次时长（秒）' })
    const apply = screen.getByRole('button', { name: '应用刷播时长' })
    expect(input).toHaveValue(310)
    expect(screen.getByText(/当前为 310 秒/u)).toBeVisible()

    fireEvent.change(input, { target: { value: '2' } })
    expect(onStreamRoundDurationChange).not.toHaveBeenCalled()
    fireEvent.click(apply)
    expect(onStreamRoundDurationChange).toHaveBeenCalledWith(2)
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '0' } })
    expect(apply).toBeDisabled()
    fireEvent.change(input, { target: { value: '1.5' } })
    expect(apply).toBeDisabled()
    fireEvent.change(input, { target: { value: '3601' } })
    expect(apply).toBeDisabled()
  })

  it('非调试存档不显示调试控件', () => {
    render(
      <DebugPanel
        game={createInitialGameState({ now: 1_000, seed: 'non-debug-stream', debug: false })}
        onAction={vi.fn()}
        onBackup={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('heading', { name: '调试房间规则' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '刷播轮次时长（秒）' })).not.toBeInTheDocument()
  })
})
