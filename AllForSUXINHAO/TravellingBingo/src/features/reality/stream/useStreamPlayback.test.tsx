import { act, renderHook } from '@testing-library/react'

import {
  STREAM_POPUP_FEATURES,
  STREAM_POPUP_NAME,
  buildStreamPlayerUrl,
  useStreamPlayback,
} from './useStreamPlayback'

function fakeWindow() {
  const handle = {
    closed: false,
    close: vi.fn(() => {
      handle.closed = true
    }),
    postMessage: vi.fn(),
  }
  return handle as unknown as Window
}

function playerEvent(sessionId: string, event: Record<string, unknown>) {
  return {
    type: 'travelling-bingo:stream-player',
    version: 1,
    sessionId,
    ...event,
  }
}

describe('useStreamPlayback', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('构造同源独立页参数，不复制收藏夹视频列表', () => {
    const url = new URL(
      buildStreamPlayerUrl({
        baseUrl: 'https://example.com/AllForSUXINHAO/TravellingBingo/index.html',
        favoriteId: 3986840044,
        selfTestBvid: 'BV1xx411c7mD',
        stopAfterMs: 5 * 3_600_000,
        sessionId: 'session-1',
      }),
    )

    expect(url.pathname).toBe('/AllForSUXINHAO/TravellingBingo/stream-player.html')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      favoriteId: '3986840044',
      sessionId: 'session-1',
      autostart: '1',
      selfTest: 'BV1xx411c7mD',
      stopHours: '5',
    })
  })

  it('用户点击时同步打开单一竖向窗口', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T08:00:00Z'))
    const handle = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(handle)
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      expect(
        result.current.start('BV1xx411c7mD', {
          favoriteId: 3682220021,
          stopAfterMs: null,
        }),
      ).toMatchObject({ ok: true, bvid: 'BV1xx411c7mD' })
    })

    expect(window.open).toHaveBeenCalledTimes(1)
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('stream-player.html?'),
      STREAM_POPUP_NAME,
      STREAM_POPUP_FEATURES,
    )
    expect(result.current.state).toMatchObject({
      status: 'opening',
      stopAfterMs: null,
    })
    expect(Object.keys(result.current).sort()).toEqual(['start', 'state', 'stop'])
  })

  it('无效输入不会误开页面', () => {
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      expect(
        result.current.start('not-a-video', {
          favoriteId: 3682220021,
          stopAfterMs: null,
        }),
      ).toMatchObject({ ok: false })
    })

    expect(open).not.toHaveBeenCalled()
    expect(result.current.state.errors).toHaveLength(1)
  })

  it('只接收当前同源窗口的最小生命周期状态，忽略轮次消息且不记录统计', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T08:00:00Z'))
    const handle = fakeWindow()
    const otherHandle = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(handle)
    const open = vi.spyOn(window, 'open').mockReturnValue(handle)
    const onStarted = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onStarted }))

    act(() => {
      result.current.start('', { favoriteId: 3682220021, stopAfterMs: null })
    })
    const sessionId = new URL(String(open.mock.calls[0]?.[0])).searchParams.get('sessionId')!
    expect(onStarted).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: otherHandle,
          data: playerEvent(sessionId, { event: 'started', dateKey: '2026-08-11' }),
        }),
      )
    })
    expect(result.current.state.status).toBe('opening')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, {
            event: 'status',
            status: 'waiting',
            round: 1,
            openedCount: 6,
            totalCount: 6,
            nextRoundAt: Date.now() + 310_000,
            message: '第 1 轮运行中',
          }),
        }),
      )
    })
    expect(result.current.state.status).toBe('opening')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'started', dateKey: '2026-08-11' }),
        }),
      )
    })
    expect(result.current.state).toEqual({
      status: 'waiting',
      stopAfterMs: null,
      message: '刷播窗口正在运行',
      errors: [],
    })
    expect(onStarted).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'started', dateKey: '2026-08-11' }),
        }),
      )
    })
    expect(onStarted).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'ended', outcome: 'completed' }),
        }),
      )
    })

    expect(result.current.state.status).toBe('completed')
    expect(handle.close).not.toHaveBeenCalled()
    expect(localStorage.getItem('travelling-bingo:stream-player-history:v1')).toBeNull()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'started', dateKey: '2026-02-30' }),
        }),
      )
    })
    expect(result.current.state.status).toBe('completed')
    expect(onStarted).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'started', dateKey: '2026-08-12' }),
        }),
      )
    })
    expect(result.current.state.status).toBe('waiting')
    expect(onStarted).toHaveBeenNthCalledWith(1, '2026-08-11')
    expect(onStarted).toHaveBeenNthCalledWith(2, '2026-08-12')

    act(() => result.current.stop())
    expect(handle.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'stop', sessionId }),
      window.location.origin,
    )
    expect(result.current.state.message).toBe('正在停止刷播')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'ended', outcome: 'stopped' }),
        }),
      )
    })
    expect(handle.close).toHaveBeenCalledTimes(1)
    expect(result.current.state.status).toBe('stopped')
  })

  it('输入失败与弹窗拦截都不会报告真正开始', () => {
    const onStarted = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = renderHook(() => useStreamPlayback({ onStarted }))

    act(() => {
      result.current.start('not-a-video', { favoriteId: 3682220021, stopAfterMs: null })
      result.current.start('', { favoriteId: 3682220021, stopAfterMs: null })
    })

    expect(result.current.state.status).toBe('blocked')
    expect(onStarted).not.toHaveBeenCalled()
  })

  it('独立页仍在加载时停止，会等待其落盘并确认结束后再关闭页面', () => {
    const handle = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(handle)
    const { result } = renderHook(() => useStreamPlayback())

    act(() => result.current.start('', { favoriteId: 3986840044, stopAfterMs: null }))
    const sessionId = new URL(String(open.mock.calls[0]?.[0])).searchParams.get('sessionId')
    act(() => result.current.stop())

    expect(handle.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'stop', sessionId }),
      window.location.origin,
    )
    expect(handle.close).not.toHaveBeenCalled()
    expect(result.current.state.message).toBe('正在停止刷播')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId!, { event: 'ended', outcome: 'stopped' }),
        }),
      )
    })
    expect(handle.close).toHaveBeenCalledTimes(1)
    expect(result.current.state.status).toBe('stopped')
    expect(localStorage.getItem('travelling-bingo:stream-player-history:v1')).toBeNull()
  })
})
