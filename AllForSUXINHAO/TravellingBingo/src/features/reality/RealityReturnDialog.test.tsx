import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RealityReturnDialog } from './RealityReturnDialog'

describe('RealityReturnDialog', () => {
  it('只读取完整奖励并派发认真或不认真决定', async () => {
    const onDecision = vi.fn()
    render(<RealityReturnDialog open fullRewardApples={12} onDecision={onDecision} />)

    expect(screen.getByText(/这段时间一共攒下/u)).toHaveTextContent('12🍎')
    expect(screen.getByText(/如果没有认真完成/u)).toHaveTextContent('只把一半带回家')
    expect(screen.queryByText(/游戏规则|App|domain|API|占位符/u)).not.toBeInTheDocument()
    const safeButton = screen.getByRole('button', { name: '没有🥺' })
    await waitFor(() => expect(safeButton).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: '是的🥰' }))
    expect(onDecision).toHaveBeenLastCalledWith('serious')

    fireEvent.click(safeButton)
    expect(onDecision).toHaveBeenLastCalledWith('not-serious')
  })

  it('关闭时不保留弹窗，Escape 仅调用传入的关闭动作', async () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <RealityReturnDialog
        open={false}
        fullRewardApples={8}
        onDecision={vi.fn()}
        onDismiss={onDismiss}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(
      <RealityReturnDialog open fullRewardApples={8} onDecision={vi.fn()} onDismiss={onDismiss} />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '没有🥺' })).toHaveFocus())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
