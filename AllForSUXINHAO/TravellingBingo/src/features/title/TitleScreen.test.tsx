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

const cachedPreview = {
  updatedAt: 1_000,
  gameVersion: '0.5.0-demo.1',
  apples: 20,
  collectionCount: 3,
  activityLabel: '在铲铲饼屋休息',
  debug: false,
  displayName: '小饼干',
  companionDays: 2,
}

describe('TitleScreen 新游戏称呼', () => {
  it('拒绝空白称呼并标记输入错误', () => {
    const onStart = vi.fn()
    render(<TitleScreen {...props(onStart)} />)

    expect(screen.queryByText('想让饼狗怎么称呼你？')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '全新旅程' }))
    const nameInput = screen.getByRole('textbox', { name: '如何称呼你？' })
    expect(nameInput).toHaveAttribute('placeholder', '如何称呼你？')
    expect(screen.queryByText('如何称呼你？')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始全新旅程' }))
    expect(onStart).not.toHaveBeenCalled()
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
  })

  it('去掉首尾空格后把称呼交给新游戏入口', () => {
    const onStart = vi.fn()
    render(<TitleScreen {...props(onStart)} />)

    fireEvent.click(screen.getByRole('button', { name: '全新旅程' }))
    fireEvent.change(screen.getByRole('textbox', { name: '如何称呼你？' }), {
      target: { value: '  小饼干  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始全新旅程' }))

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith('小饼干')
  })

  it('进入游戏前可以显式检查更新并展示真实进行中状态', () => {
    const onCheckForUpdates = vi.fn()
    const { rerender } = render(<TitleScreen {...props()} onCheckForUpdates={onCheckForUpdates} />)

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    expect(onCheckForUpdates).toHaveBeenCalledOnce()

    rerender(
      <TitleScreen
        {...props()}
        updateCheckStatus="checking"
        onCheckForUpdates={onCheckForUpdates}
      />,
    )
    expect(screen.getByRole('button', { name: '正在检查更新…' })).toBeDisabled()
    expect(screen.queryByText('正在向门外张望')).not.toBeInTheDocument()
  })

  it('无缓存显示两个入口且高亮全新旅程，有缓存时依次显示继续、全新旅程和本地存档', () => {
    const onContinueCached = vi.fn()
    const { rerender } = render(<TitleScreen {...props()} onContinueCached={onContinueCached} />)

    const entries = screen.getByRole('navigation', { name: '存档入口' })
    expect(
      [...entries.querySelectorAll<HTMLElement>('.landing-button')].map((entry) =>
        entry.textContent?.trim(),
      ),
    ).toEqual(['全新旅程', '本地存档'])
    expect(screen.getByRole('button', { name: '全新旅程' })).toHaveClass('landing-button--primary')
    expect(screen.queryByRole('button', { name: '继续' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('本地存档')).toBeEnabled()
    expect(screen.getByText('这个浏览器里还没有缓存存档')).toBeVisible()

    rerender(
      <TitleScreen
        {...props()}
        onContinueCached={onContinueCached}
        cachedPreview={cachedPreview}
      />,
    )
    expect(
      [...entries.querySelectorAll<HTMLElement>('.landing-button')].map((entry) =>
        entry.textContent?.trim(),
      ),
    ).toEqual(['继续', '全新旅程', '本地存档'])
    expect(screen.getByRole('button', { name: '继续' })).toHaveClass('landing-button--primary')
    expect(screen.getByRole('button', { name: '全新旅程' })).toHaveClass('landing-button--quiet')
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(onContinueCached).toHaveBeenCalledOnce()
    expect(screen.getByRole('region', { name: '缓存存档摘要' })).toHaveTextContent('20🍎')
  })

  it('有缓存时在全新旅程弹窗中明确先下载旧档，并在同一流程填写称呼', () => {
    const onStart = vi.fn()
    render(<TitleScreen {...props(onStart)} cachedPreview={cachedPreview} />)

    fireEvent.click(screen.getByRole('button', { name: '全新旅程' }))
    const dialog = screen.getByRole('dialog', { name: '开启一段全新的旅程' })
    expect(dialog).toHaveTextContent('先下载当前浏览器缓存中的存档')
    const nameInput = screen.getByRole('textbox', { name: '如何称呼你？' })
    fireEvent.change(nameInput, { target: { value: '新朋友' } })
    fireEvent.click(screen.getByRole('button', { name: '下载存档并开始' }))

    expect(onStart).toHaveBeenCalledWith('新朋友')
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
