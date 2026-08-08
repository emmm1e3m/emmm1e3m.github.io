import { fireEvent, render, screen } from '@testing-library/react'

import { PwaUpdatePrompt } from './PwaUpdatePrompt'

const serviceWorker = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  onNeedReload: undefined as (() => void) | undefined,
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}))

const requestUpdate = vi.fn()
const requestReload = vi.fn()

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onNeedReload?: () => void }) => {
    serviceWorker.onNeedReload ??= options?.onNeedReload
    return {
      offlineReady: [serviceWorker.offlineReady, serviceWorker.setOfflineReady],
      needRefresh: [serviceWorker.needRefresh, serviceWorker.setNeedRefresh],
      updateServiceWorker: serviceWorker.updateServiceWorker,
    }
  },
}))

describe('PwaUpdatePrompt', () => {
  beforeEach(() => {
    serviceWorker.offlineReady = false
    serviceWorker.needRefresh = false
    serviceWorker.onNeedReload = undefined
    serviceWorker.setOfflineReady.mockReset()
    serviceWorker.setNeedRefresh.mockReset()
    serviceWorker.updateServiceWorker.mockReset()
    serviceWorker.updateServiceWorker.mockResolvedValue(undefined)
    requestUpdate.mockReset()
    requestReload.mockReset()
  })

  it('用游戏内语气提示离线准备完成，并可收起提示', () => {
    serviceWorker.offlineReady = true
    render(
      <PwaUpdatePrompt
        hasUnsavedProgress={false}
        onNeedReload={requestReload}
        onRequestUpdate={requestUpdate}
      />,
    )

    const prompt = screen.getByRole('status', { name: '离线行囊收拾好啦' })
    expect(prompt).toHaveAccessibleDescription('暂时没有网络，也能继续陪饼狗待在家里。')
    expect(window.getComputedStyle(prompt).pointerEvents).toBe('none')

    const dismiss = screen.getByRole('button', { name: '收好啦' })
    expect(window.getComputedStyle(dismiss).pointerEvents).toBe('auto')
    fireEvent.click(dismiss)

    expect(serviceWorker.setOfflineReady).toHaveBeenCalledWith(false)
    expect(serviceWorker.setNeedRefresh).toHaveBeenCalledWith(false)
  })

  it('把安装动作交给上层保护，不自行触发页面更新', async () => {
    serviceWorker.needRefresh = true
    let installUpdate: (() => Promise<void>) | undefined
    requestUpdate.mockImplementation((install: () => Promise<void>) => {
      installUpdate = install
    })
    render(
      <PwaUpdatePrompt
        hasUnsavedProgress={false}
        onNeedReload={requestReload}
        onRequestUpdate={requestUpdate}
      />,
    )

    const prompt = screen.getByRole('status', { name: '饼屋换上新布置啦' })
    expect(prompt).toHaveAccessibleDescription('打开新布置后，饼狗会在原地等你。')
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    expect(requestUpdate).toHaveBeenCalledOnce()
    expect(serviceWorker.updateServiceWorker).not.toHaveBeenCalled()
    await installUpdate?.()
    expect(serviceWorker.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: '晚点再看' })).toBeVisible()
  })

  it('有未保存进度时明确提示先保存', () => {
    serviceWorker.needRefresh = true
    render(
      <PwaUpdatePrompt
        hasUnsavedProgress
        onNeedReload={requestReload}
        onRequestUpdate={requestUpdate}
      />,
    )

    const prompt = screen.getByRole('status', { name: '饼屋换上新布置啦' })
    expect(prompt).toHaveAccessibleDescription('先保存好这次旅程，再打开新布置。')
    fireEvent.click(screen.getByRole('button', { name: '保存后更新' }))

    expect(requestUpdate).toHaveBeenCalledOnce()
    expect(serviceWorker.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('没有状态变化时不占据页面', () => {
    const { container } = render(
      <PwaUpdatePrompt
        hasUnsavedProgress={false}
        onNeedReload={requestReload}
        onRequestUpdate={requestUpdate}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('接管 controlling 回调，并始终转交给最新的 App 保护函数', () => {
    const firstReloadRequest = vi.fn()
    const latestReloadRequest = vi.fn()
    const { rerender } = render(
      <PwaUpdatePrompt
        hasUnsavedProgress={false}
        onNeedReload={firstReloadRequest}
        onRequestUpdate={requestUpdate}
      />,
    )

    rerender(
      <PwaUpdatePrompt
        hasUnsavedProgress
        onNeedReload={latestReloadRequest}
        onRequestUpdate={requestUpdate}
      />,
    )
    serviceWorker.onNeedReload?.()

    expect(firstReloadRequest).not.toHaveBeenCalled()
    expect(latestReloadRequest).toHaveBeenCalledOnce()
  })

  it('controlling 后再次点击更新会重试受保护刷新，不再调用已失效的 waiting 更新', () => {
    serviceWorker.needRefresh = true
    render(
      <PwaUpdatePrompt
        hasUnsavedProgress
        onNeedReload={requestReload}
        onRequestUpdate={requestUpdate}
      />,
    )

    serviceWorker.onNeedReload?.()
    expect(requestReload).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '保存后更新' }))

    expect(requestReload).toHaveBeenCalledTimes(2)
    expect(requestUpdate).not.toHaveBeenCalled()
    expect(serviceWorker.updateServiceWorker).not.toHaveBeenCalled()
  })
})
