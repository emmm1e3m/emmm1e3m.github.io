import { fireEvent, render, screen } from '@testing-library/react'

import { DimensionDialog } from './DimensionDialog'
import gameV4Styles from './game-v4.css?raw'

describe('DimensionDialog', () => {
  it('从现实维度返回时同时提供取消和确认操作', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<DimensionDialog mode="confirm-leave" onCancel={onCancel} onConfirm={onConfirm} />)

    expect(screen.getByRole('dialog', { name: '回到饼屋？' })).toHaveTextContent(
      '结算这次现实维度带回的苹果',
    )
    fireEvent.click(screen.getByRole('button', { name: '先不切换' }))
    fireEvent.click(screen.getByRole('button', { name: '回到饼屋' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('非 PC 恢复现实存档时仍要求显式返回，不能取消', () => {
    render(<DimensionDialog mode="return-required" onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '先回到饼屋' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '先不切换' })).not.toBeInTheDocument()
  })

  it('使用清晰不透明卡片，并为进出维度定义成对过场', () => {
    expect(gameV4Styles).toMatch(
      /\.dimension-dialog\s*\{[^}]*border:\s*2px solid #8b6155;[^}]*background:\s*#fffaf2;[^}]*box-shadow:/su,
    )
    expect(gameV4Styles).toContain('@keyframes dimension-scene-out')
    expect(gameV4Styles).toContain('@keyframes dimension-scene-in')
    expect(gameV4Styles).toContain('.dimension-transition--out')
    expect(gameV4Styles).toContain('.dimension-transition--in')
  })
})
