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
      favoriteId: 3682220021,
      selfTestBvid: 'BV1xx411c7mD',
    })
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

  it('只接收当前同源窗口的状态，并把整轮与任务各记录一次', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T08:00:00Z'))
    const handle = fakeWindow()
    const otherHandle = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(handle)
    const onRoundCompleted = vi.fn()
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onRoundCompleted, onSessionEnded }))

    act(() => {
      result.current.start('', { favoriteId: 3682220021, stopAfterMs: null })
    })
    const sessionId = result.current.state.sessionId!

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: otherHandle,
          data: playerEvent(sessionId, {
            event: 'status',
            status: 'waiting',
            round: 99,
            openedCount: 6,
            totalCount: 6,
            nextRoundAt: Date.now() + 310_000,
            message: '伪造状态',
          }),
        }),
      )
    })
    expect(result.current.state.round).toBe(0)

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
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      round: 1,
      openedCount: 6,
      totalCount: 6,
    })

    const completedAt = Date.now() + 310_000
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, { event: 'round-completed', round: 1, completedAt }),
        }),
      )
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: handle,
          data: playerEvent(sessionId, {
            event: 'ended',
            endedAt: completedAt,
            roundsCompleted: 1,
            outcome: 'completed',
          }),
        }),
      )
    })

    expect(onRoundCompleted).toHaveBeenCalledTimes(1)
    expect(onSessionEnded).toHaveBeenCalledTimes(1)
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId, roundsCompleted: 1, outcome: 'completed' }),
    )
    expect(result.current.state.status).toBe('completed')
  })

  it('停止时向当前窗口发出同源命令并关闭页面', () => {
    const handle = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(handle)
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onSessionEnded }))

    act(() => result.current.start('', { favoriteId: 3986840044, stopAfterMs: null }))
    const sessionId = result.current.state.sessionId
    act(() => result.current.stop())

    expect(handle.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'stop', sessionId }),
      window.location.origin,
    )
    expect(handle.close).toHaveBeenCalledTimes(1)
    expect(onSessionEnded).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'stopped' }))
  })
})
