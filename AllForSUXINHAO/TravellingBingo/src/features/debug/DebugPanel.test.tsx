import { fireEvent, render, screen, within } from '@testing-library/react'

import { createInitialGameState } from '@/domain'

import { DebugPanel } from './DebugPanel'

describe('DebugPanel', () => {
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
    fireEvent.click(within(confirmation).getByRole('button', { name: '确认全收集' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      type: 'debug/collect-all',
      now: expect.any(Number),
    })
  })
})
