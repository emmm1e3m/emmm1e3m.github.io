import { fireEvent, render, screen } from '@testing-library/react'

import { PwaUpdatePrompt } from './PwaUpdatePrompt'

const serviceWorker = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [serviceWorker.offlineReady, serviceWorker.setOfflineReady],
    needRefresh: [serviceWorker.needRefresh, serviceWorker.setNeedRefresh],
    updateServiceWorker: serviceWorker.updateServiceWorker,
  }),
}))

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    serviceWorker.offlineReady = false
    serviceWorker.needRefresh = false
    serviceWorker.setOfflineReady.mockReset()
    serviceWorker.setNeedRefresh.mockReset()
    serviceWorker.updateServiceWorker.mockReset()
  })

  it('用游戏内语气提示离线准备完成，并可收起提示', () => {
    serviceWorker.offlineReady = true
    render(<PwaUpdatePrompt />)

    const prompt = screen.getByRole('status', { name: '离线行囊收拾好啦' })
    expect(prompt).toHaveAccessibleDescription('暂时没有网络，也能继续陪饼狗待在家里。')
    expect(window.getComputedStyle(prompt).pointerEvents).toBe('none')

    const dismiss = screen.getByRole('button', { name: '收好啦' })
    expect(window.getComputedStyle(dismiss).pointerEvents).toBe('auto')
    fireEvent.click(dismiss)

    expect(serviceWorker.setOfflineReady).toHaveBeenCalledWith(false)
    expect(serviceWorker.setNeedRefresh).toHaveBeenCalledWith(false)
  })

  it('用可见文字按钮打开新布置', () => {
    serviceWorker.needRefresh = true
    render(<PwaUpdatePrompt />)

    const prompt = screen.getByRole('status', { name: '饼屋换上新布置啦' })
    expect(prompt).toHaveAccessibleDescription('打开新布置后，饼狗会在原地等你。')
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    expect(serviceWorker.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: '晚点再看' })).toBeVisible()
  })

  it('没有状态变化时不占据页面', () => {
    const { container } = render(<PwaUpdatePrompt />)
    expect(container).toBeEmptyDOMElement()
  })
})
