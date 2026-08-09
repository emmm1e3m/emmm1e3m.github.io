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
const requestAutomaticBackup = vi.fn()

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
    requestAutomaticBackup.mockReset()
  })

  it('用游戏内语气提示离线准备完成，并可收起提示', () => {
    serviceWorker.offlineReady = true
    render(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
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
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )

    const prompt = screen.getByRole('status', { name: '铲铲饼屋有新布置啦' })
    expect(prompt).toHaveAccessibleDescription('打开新布置前会自动备份，饼狗会在原地等你。')
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    expect(requestUpdate).toHaveBeenCalledOnce()
    expect(requestAutomaticBackup).toHaveBeenCalledOnce()
    expect(serviceWorker.updateServiceWorker).not.toHaveBeenCalled()
    await installUpdate?.()
    expect(serviceWorker.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: '晚点再看' })).toBeVisible()
  })

  it('没有状态变化时不占据页面', () => {
    const { container } = render(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
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
        onNeedReload={firstReloadRequest}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )

    rerender(
      <PwaUpdatePrompt
        onNeedReload={latestReloadRequest}
        onUpdateAvailable={requestAutomaticBackup}
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
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )

    serviceWorker.onNeedReload?.()
    expect(requestReload).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    expect(requestReload).toHaveBeenCalledTimes(2)
    expect(requestUpdate).not.toHaveBeenCalled()
    expect(serviceWorker.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('同一次 needRefresh 只自动请求一次备份，下一次更新可重新请求', () => {
    serviceWorker.needRefresh = true
    const { rerender } = render(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )

    rerender(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )
    expect(requestAutomaticBackup).toHaveBeenCalledOnce()

    serviceWorker.needRefresh = false
    rerender(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )
    serviceWorker.needRefresh = true
    rerender(
      <PwaUpdatePrompt
        onNeedReload={requestReload}
        onUpdateAvailable={requestAutomaticBackup}
        onRequestUpdate={requestUpdate}
      />,
    )

    expect(requestAutomaticBackup).toHaveBeenCalledTimes(2)
  })
})
