import { act, render, waitFor } from '@testing-library/react'

import { useScreenWakeLock } from './useScreenWakeLock'

const MOBILE_PRIMARY_INPUT_QUERY = '(hover: none) and (pointer: coarse)'

function Harness({ enabled = true }: { enabled?: boolean }) {
  useScreenWakeLock(enabled)
  return <main>铲铲饼屋</main>
}

function createSentinel() {
  let released = false
  const sentinel = {
    get released() {
      return released
    },
    release: vi.fn(async () => {
      released = true
    }),
  }
  return sentinel as unknown as WakeLockSentinel
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
}

function setMobilePrimaryInput(matches: boolean) {
  const matchMedia = vi.fn((query: string) => {
    return {
      matches: query === MOBILE_PRIMARY_INPUT_QUERY && matches,
    } as MediaQueryList
  })
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  })
  return matchMedia
}

describe('屏幕常亮', () => {
  const originalWakeLock = navigator.wakeLock
  const originalVisibility = document.visibilityState
  const originalMatchMedia = globalThis.matchMedia

  beforeEach(() => {
    setVisibility('visible')
    setMobilePrimaryInput(true)
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: originalWakeLock,
    })
    setVisibility(originalVisibility)
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
  })

  it('游戏运行且页面可见时请求 screen 常亮', async () => {
    const sentinel = createSentinel()
    const request = vi.fn(async () => sentinel)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    render(<Harness />)

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
    expect(sentinel.release).not.toHaveBeenCalled()
  })

  it('仅用 hover none 与 pointer coarse 判断移动主输入能力', async () => {
    const matchMedia = setMobilePrimaryInput(true)
    const request = vi.fn(async () => createSentinel())
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    render(<Harness />)

    await waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(matchMedia).toHaveBeenCalledWith(MOBILE_PRIMARY_INPUT_QUERY)
  })

  it('细指针主输入设备不请求常亮', () => {
    setMobilePrimaryInput(false)
    const request = vi.fn(async () => createSentinel())
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    render(<Harness />)

    expect(request).not.toHaveBeenCalled()
  })

  it('缺少 matchMedia 时保守地不请求常亮', () => {
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: undefined,
    })
    const request = vi.fn(async () => createSentinel())
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    render(<Harness />)

    expect(request).not.toHaveBeenCalled()
  })

  it('浏览器拒绝常亮请求时不影响游戏', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('Not allowed', 'NotAllowedError')
    })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    const view = render(<Harness />)

    await waitFor(() => expect(request).toHaveBeenCalledOnce())
    expect(view.getByText('铲铲饼屋')).toBeInTheDocument()
  })

  it('页面隐藏时释放，恢复可见后重新请求', async () => {
    const first = createSentinel()
    const second = createSentinel()
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    render(<Harness />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))

    setVisibility('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(first.release).toHaveBeenCalledOnce())

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(second.release).not.toHaveBeenCalled()
  })

  it('离开游戏或卸载时释放已经取得的常亮锁', async () => {
    const leavingSentinel = createSentinel()
    const unmountingSentinel = createSentinel()
    const request = vi
      .fn()
      .mockResolvedValueOnce(leavingSentinel)
      .mockResolvedValueOnce(unmountingSentinel)
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    const view = render(<Harness />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    view.rerender(<Harness enabled={false} />)
    await waitFor(() => expect(leavingSentinel.release).toHaveBeenCalledOnce())

    view.rerender(<Harness />)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    view.unmount()
    await waitFor(() => expect(unmountingSentinel.release).toHaveBeenCalledOnce())
  })
})
