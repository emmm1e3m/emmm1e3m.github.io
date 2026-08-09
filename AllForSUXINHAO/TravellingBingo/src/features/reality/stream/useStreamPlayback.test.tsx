import { act, renderHook } from '@testing-library/react'

import {
  STREAM_OPEN_DELAY_MS,
  STREAM_ROUND_DURATION_MS,
  useStreamPlayback,
} from './useStreamPlayback'

function fakeWindow() {
  return { close: vi.fn() } as unknown as Window
}

describe('useStreamPlayback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    ['popup', 'popup=yes,width=960,height=720'],
    ['tabs', undefined],
  ] as const)('%s 模式都按默认 8 秒依次打开', (mode, features) => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result } = renderHook(() => useStreamPlayback())

    act(() => result.current.start('BV1xx411c7mD\nBV1B7411m7LV\nBV17x411w7KC', mode))

    expect(window.open).toHaveBeenCalledTimes(1)
    expect(window.open).toHaveBeenNthCalledWith(
      1,
      'https://www.bilibili.com/video/BV1xx411c7mD/?autoplay=1&t=0',
      '_blank',
      ...(features === undefined ? [] : [features]),
    )
    expect(result.current.getRemainingMs()).toBe(STREAM_OPEN_DELAY_MS)

    act(() => vi.advanceTimersByTime(STREAM_OPEN_DELAY_MS))
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(result.current.state.status).toBe('opening')

    act(() => vi.advanceTimersByTime(STREAM_OPEN_DELAY_MS))
    expect(window.open).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({ status: 'waiting', openedCount: 3 })
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('自定义打开间隔按会话快照，运行中的属性变化不会改动本次任务', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result, rerender } = renderHook(
      ({ roundDurationMs }) => useStreamPlayback({ roundDurationMs }),
      { initialProps: { roundDurationMs: 1_000 } },
    )

    act(() =>
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup', {
        openDelayMs: 12_000,
      }),
    )
    rerender({ roundDurationMs: 2_000 })
    act(() => vi.advanceTimersByTime(11_999))
    expect(window.open).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(1))
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(result.current.getRemainingMs()).toBe(1_000)

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.state.round).toBe(2)
    expect(window.open).toHaveBeenCalledTimes(3)
    expect(result.current.getRemainingMs()).toBe(12_000)
    act(() => vi.advanceTimersByTime(12_000))
    expect(result.current.getRemainingMs()).toBe(2_000)
  })

  it('每轮只上报进度，手动停止时把多轮汇总成一次会话', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const onRoundCompleted = vi.fn()
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() =>
      useStreamPlayback({
        roundDurationMs: 1_000,
        onRoundCompleted,
        onSessionEnded,
      }),
    )

    act(() => result.current.start('BV1xx411c7mD', 'tabs'))
    act(() => vi.advanceTimersByTime(2_000))
    expect(onRoundCompleted).toHaveBeenCalledTimes(2)
    expect(result.current.state.sessionRoundsCompleted).toBe(2)

    act(() => result.current.stop())
    expect(onSessionEnded).toHaveBeenCalledOnce()
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: 100_000,
        endedAt: 102_000,
        roundsCompleted: 2,
        outcome: 'stopped',
      }),
    )
    const event = onSessionEnded.mock.calls[0]![0]
    expect(
      onRoundCompleted.mock.calls.every(([round]) => round.sessionId === event.sessionId),
    ).toBe(true)
    expect(result.current.state.status).toBe('stopped')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('定时停止按会话总时长完成，0 轮也只记录一次', () => {
    vi.useFakeTimers()
    vi.setSystemTime(200_000)
    const handle = fakeWindow()
    vi.spyOn(window, 'open').mockImplementationOnce(() => handle)
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onSessionEnded }))

    act(() =>
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup', {
        openDelayMs: 8_000,
        stopAfterMs: 5_000,
      }),
    )
    expect(result.current.getStopRemainingMs()).toBe(5_000)
    act(() => vi.advanceTimersByTime(5_000))

    expect(window.open).toHaveBeenCalledOnce()
    expect(handle.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(result.current.state.status).toBe('completed')
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: 200_000,
        endedAt: 205_000,
        roundsCompleted: 0,
        outcome: 'completed',
      }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('定时停止跨多轮时计入截止前完整结束的轮次', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const onRoundCompleted = vi.fn()
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() =>
      useStreamPlayback({ roundDurationMs: 1_000, onRoundCompleted, onSessionEnded }),
    )

    act(() =>
      result.current.start('BV1xx411c7mD', 'tabs', {
        stopAfterMs: 2_500,
      }),
    )
    act(() => vi.advanceTimersByTime(2_500))

    expect(onRoundCompleted).toHaveBeenCalledTimes(2)
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({ roundsCompleted: 2, outcome: 'completed' }),
    )
    expect(window.open).toHaveBeenCalledTimes(3)
    expect(result.current.state.status).toBe('completed')
  })

  it('弹窗拦截期间仍保留定时停止，继续时从本轮完整重试', () => {
    vi.useFakeTimers()
    const resumedHandles = [fakeWindow(), fakeWindow()]
    vi.spyOn(window, 'open')
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => resumedHandles[0]!)
      .mockImplementationOnce(() => resumedHandles[1]!)
    const onSessionEnded = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onSessionEnded }))

    act(() =>
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup', {
        openDelayMs: 1_000,
        stopAfterMs: 5_000,
      }),
    )
    expect(result.current.state.status).toBe('blocked')
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1_000))
    act(() => expect(result.current.resume()).toBe(true))
    expect(result.current.state.status).toBe('opening')
    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.state.status).toBe('waiting')

    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.state.status).toBe('completed')
    expect(onSessionEnded).toHaveBeenCalledWith(
      expect.objectContaining({ roundsCompleted: 0, outcome: 'completed' }),
    )
  })

  it('页面恢复只推进当前到期步骤，并始终只保留一个计时器', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result } = renderHook(() => useStreamPlayback())
    act(() => result.current.start('BV1xx411c7mD\nBV1B7411m7LV\nBV17x411w7KC', 'tabs'))

    act(() => vi.advanceTimersByTime(STREAM_OPEN_DELAY_MS - 1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(window.open).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1))
    expect(window.open).toHaveBeenCalledTimes(2)
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
    })
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('解析错误不打开窗口，范围错误不会被静默改成另一种设置', () => {
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      expect(result.current.start('https://b23.tv/short', 'popup').ok).toBe(false)
    })
    expect(open).not.toHaveBeenCalled()
    expect(result.current.state.errors).toEqual([
      expect.objectContaining({ line: 1, code: 'short-link', message: expect.any(String) }),
    ])

    expect(() => {
      act(() =>
        result.current.start('BV1xx411c7mD', 'tabs', {
          openDelayMs: 61_000,
        }),
      )
    }).toThrow('1–60 秒')
    expect(open).not.toHaveBeenCalled()
  })

  it('停止、beforeunload 与卸载都会关闭仍持有的窗口', () => {
    vi.useFakeTimers()
    const handles = [fakeWindow(), fakeWindow(), fakeWindow()]
    vi.spyOn(window, 'open')
      .mockImplementationOnce(() => handles[0]!)
      .mockImplementationOnce(() => handles[1]!)
      .mockImplementationOnce(() => handles[2]!)
    const { result, unmount } = renderHook(() => useStreamPlayback())

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    act(() => result.current.stop())
    expect(handles[0]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    act(() => window.dispatchEvent(new Event('beforeunload')))
    expect(handles[1]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    unmount()
    expect(handles[2]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
