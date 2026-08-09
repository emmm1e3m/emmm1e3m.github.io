import { fireEvent, render, screen } from '@testing-library/react'

import { TitleScreen } from './TitleScreen'

function props(onStart = vi.fn()) {
  return {
    loading: false,
    available: true,
    error: null,
    importPreview: null,
    cachedPreview: null,
    debugUnlocked: false,
    onStart,
    onContinueCached: vi.fn(),
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

    fireEvent.click(screen.getByRole('button', { name: '新存档' }))
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
    fireEvent.click(screen.getByRole('button', { name: '新存档' }))

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
    expect(screen.queryByText('正在向门外张望')).not.toBeInTheDocument()
  })

  it('稳定显示三个入口，并只在缓存存在时允许继续', () => {
    const onContinueCached = vi.fn()
    const { rerender } = render(<TitleScreen {...props()} onContinueCached={onContinueCached} />)

    expect(screen.getByRole('button', { name: '新存档' })).toBeVisible()
    expect(screen.getByRole('button', { name: '从缓存存档继续' })).toBeDisabled()
    expect(screen.getByLabelText('加载本地存档')).toBeEnabled()
    expect(screen.getByText('这个浏览器里还没有缓存存档')).toBeVisible()

    rerender(
      <TitleScreen
        {...props()}
        onContinueCached={onContinueCached}
        cachedPreview={{
          updatedAt: 1_000,
          gameVersion: '0.4.0-demo.1',
          apples: 20,
          collectionCount: 3,
          activityLabel: '在铲铲饼屋休息',
          debug: false,
          displayName: '小饼干',
          companionDays: 2,
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '从缓存存档继续' }))
    expect(onContinueCached).toHaveBeenCalledOnce()
    expect(screen.getByRole('region', { name: '缓存存档摘要' })).toHaveTextContent('20🍎')
  })

  it('使用本地圆形头像链接到指定微博主页', () => {
    render(<TitleScreen {...props()} />)

    expect(screen.getByRole('link', { name: '打开微博主页 7878664767' })).toHaveAttribute(
      'href',
      'https://www.weibo.com/u/7878664767',
    )
    expect(screen.getByRole('link', { name: '打开微博主页 7760819929' })).toHaveAttribute(
      'href',
      'https://weibo.com/7760819929',
    )
  })
})
