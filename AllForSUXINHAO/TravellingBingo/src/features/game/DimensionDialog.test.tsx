import { fireEvent, render, screen } from '@testing-library/react'

import { DimensionDialog } from './DimensionDialog'
import gameV4Styles from './game-v4.css?raw'

describe('DimensionDialog', () => {
  it('进入现实维度前说明可以进行真正的刷播和冲热', () => {
    render(<DimensionDialog mode="confirm-enter" onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '进入现实维度？' })).toHaveTextContent(
      '也可以进行真正的刷播和冲热',
    )
    expect(screen.queryByText(/也可以查看刷播与冲热/u)).not.toBeInTheDocument()
  })

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

  it('冲热的电脑端提示不暴露设备检测细节', () => {
    render(<DimensionDialog mode="trend-pc-required" onCancel={vi.fn()} onConfirm={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: '冲热请使用电脑端' })
    expect(dialog).toHaveTextContent('可以先使用刷播，或为工作与学习计时')
    expect(dialog).not.toHaveTextContent('鼠标')
    expect(dialog).not.toHaveTextContent('触控板')
    expect(dialog).not.toHaveTextContent('指针')
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
    expect(gameV4Styles).toMatch(/\.dimension-dialog-backdrop\s*\{[^}]*z-index:\s*190;/su)
    expect(gameV4Styles).toMatch(/\.dimension-transition\s*\{[^}]*z-index:\s*190;/su)
  })

  it('桌面并排和窄屏堆叠时都为操作按钮保留间距', () => {
    expect(gameV4Styles).toMatch(
      /\.dimension-dialog \.dialog-actions\s*\{[^}]*display:\s*flex;[^}]*gap:\s*clamp\(/su,
    )
    expect(gameV4Styles).toMatch(
      /@media \(max-width: 420px\)[\s\S]*?\.dimension-dialog \.dialog-actions\s*\{[^}]*flex-direction:\s*column;/u,
    )
  })
})
