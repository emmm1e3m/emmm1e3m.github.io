import { fireEvent, render, screen } from '@testing-library/react'

import { TitleScreen } from './TitleScreen'

function props(onStart = vi.fn()) {
  return {
    loading: false,
    available: true,
    error: null,
    importPreview: null,
    debugUnlocked: false,
    onStart,
    onFile: vi.fn(),
    onConfirmImport: vi.fn(),
    onCancelImport: vi.fn(),
    onRetryCatalog: vi.fn(),
    onTitleActivate: vi.fn(),
    updateCheckStatus: 'idle' as const,
    onCheckForUpdates: vi.fn(),
  }
}

describe('TitleScreen 新游戏称呼', () => {
  it('拒绝空白称呼并标记输入错误', () => {
    const onStart = vi.fn()
    render(<TitleScreen {...props(onStart)} />)

    fireEvent.click(screen.getByRole('button', { name: '开始新旅程' }))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '想让饼狗怎么称呼你？' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('去掉首尾空格后把称呼交给新游戏入口', () => {
    const onStart = vi.fn()
    render(<TitleScreen {...props(onStart)} />)

    fireEvent.change(screen.getByRole('textbox', { name: '想让饼狗怎么称呼你？' }), {
      target: { value: '  小饼干  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始新旅程' }))

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('小饼干')
  })

  it('进入游戏前可以显式检查新布置并展示真实进行中状态', () => {
    const onCheckForUpdates = vi.fn()
    const { rerender } = render(<TitleScreen {...props()} onCheckForUpdates={onCheckForUpdates} />)

    fireEvent.click(screen.getByRole('button', { name: '检查新布置' }))
    expect(onCheckForUpdates).toHaveBeenCalledOnce()

    rerender(
      <TitleScreen
        {...props()}
        updateCheckStatus="checking"
        onCheckForUpdates={onCheckForUpdates}
      />,
    )
    expect(screen.getByRole('button', { name: '正在检查新布置…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('正在向门外张望')
  })
})
