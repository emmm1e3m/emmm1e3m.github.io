import { act, renderHook } from '@testing-library/react'

import {
  STREAM_ROUND_DURATION_MS,
  STREAM_TAB_OPEN_DELAY_MS,
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

  it('弹窗模式在同一轮同步打开全部规范 URL，并从实际最后打开时刻计时', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const handles = [fakeWindow(), fakeWindow()]
    const open = vi
      .spyOn(window, 'open')
      .mockImplementationOnce(() => handles[0]!)
      .mockImplementationOnce(() => handles[1]!)
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup')
    })

    expect(open.mock.calls).toEqual([
      [
        'https://www.bilibili.com/video/BV1xx411c7mD/?autoplay=1&t=0',
        '_blank',
        'popup=yes,width=960,height=720',
      ],
      [
        'https://www.bilibili.com/video/BV1B7411m7LV/?autoplay=1&t=0',
        '_blank',
        'popup=yes,width=960,height=720',
      ],
    ])
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      round: 1,
      openedCount: 2,
    })
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('标签页模式每次成功打开后从当前绝对时间重锚 8 秒', () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV\nBV17x411w7KC', 'tabs')
    })
    expect(window.open).toHaveBeenCalledTimes(1)
    expect(result.current.state).toMatchObject({
      status: 'opening',
      openedCount: 1,
    })
    expect(result.current.getRemainingMs()).toBe(STREAM_TAB_OPEN_DELAY_MS)

    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(result.current.getRemainingMs()).toBe(STREAM_TAB_OPEN_DELAY_MS)

    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))
    expect(window.open).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      openedCount: 3,
    })
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('标签计时器到期后只推进一个标签，并重新安排唯一计时器', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result } = renderHook(() => useStreamPlayback())
    act(() => {
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV\nBV17x411w7KC', 'tabs')
    })

    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))

    expect(window.open).toHaveBeenCalledTimes(2)
    expect(result.current.state).toMatchObject({
      status: 'opening',
      openedCount: 2,
    })
    expect(result.current.getRemainingMs()).toBe(STREAM_TAB_OPEN_DELAY_MS)
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(window.open).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('截止前连续恢复事件不推进步骤，且始终只保留一个计时器', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const handles = Array.from({ length: 4 }, () => fakeWindow())
    const open = vi
      .spyOn(window, 'open')
      .mockImplementationOnce(() => handles[0]!)
      .mockImplementationOnce(() => handles[1]!)
      .mockImplementationOnce(() => handles[2]!)
      .mockImplementationOnce(() => handles[3]!)
    const onRoundCompleted = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onRoundCompleted }))

    act(() => result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'tabs'))
    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS - 1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(open).toHaveBeenCalledTimes(1)
    expect(result.current.state.status).toBe('opening')
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1))
    expect(open).toHaveBeenCalledTimes(2)
    expect(result.current.state.status).toBe('waiting')

    act(() => vi.advanceTimersByTime(STREAM_ROUND_DURATION_MS - 1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onRoundCompleted).not.toHaveBeenCalled()
    expect(handles[0]!.close as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
    expect(handles[1]!.close as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(1))
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(3)
    expect(result.current.state).toMatchObject({ status: 'opening', round: 2 })
    expect(vi.getTimerCount()).toBe(1)

    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('重新渲染时按 performance 经过时间刷新剩余时长', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result, rerender } = renderHook(() => useStreamPlayback())

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS)

    act(() => vi.advanceTimersByTime(1_000))
    rerender()
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS - 1_000)

    act(() => vi.advanceTimersByTime(1_000))
    rerender()
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS - 2_000)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('单调时长截止时关闭全部窗口、记录实际完成时刻并只开始一轮', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const handles = [fakeWindow(), fakeWindow(), fakeWindow(), fakeWindow()]
    const open = vi
      .spyOn(window, 'open')
      .mockImplementationOnce(() => handles[0]!)
      .mockImplementationOnce(() => handles[1]!)
      .mockImplementationOnce(() => handles[2]!)
      .mockImplementationOnce(() => handles[3]!)
    const onRoundCompleted = vi.fn()
    const { result } = renderHook(() => useStreamPlayback({ onRoundCompleted }))
    act(() => {
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup')
    })

    act(() => vi.advanceTimersByTime(STREAM_ROUND_DURATION_MS))

    expect(handles[0]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(handles[1]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(onRoundCompleted).toHaveBeenCalledWith({
      completedAt: STREAM_ROUND_DURATION_MS,
    })
    expect(open).toHaveBeenCalledTimes(4)
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      round: 2,
      openedCount: 2,
    })
    expect(result.current.getRemainingMs()).toBe(STREAM_ROUND_DURATION_MS)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('调试时长按轮次快照，标签打开期间更新只影响下一轮', () => {
    vi.useFakeTimers()
    const handles = Array.from({ length: 6 }, () => fakeWindow())
    const open = vi.spyOn(window, 'open')
    handles.forEach((handle) => open.mockImplementationOnce(() => handle))
    const onRoundCompleted = vi.fn()
    const { result, rerender } = renderHook(
      ({ roundDurationMs }) => useStreamPlayback({ roundDurationMs, onRoundCompleted }),
      { initialProps: { roundDurationMs: 1_000 } },
    )

    act(() => result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'tabs'))
    expect(result.current.getRemainingMs()).toBe(STREAM_TAB_OPEN_DELAY_MS)

    rerender({ roundDurationMs: 2_000 })
    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))
    expect(result.current.state).toMatchObject({ status: 'waiting', round: 1 })
    expect(result.current.getRemainingMs()).toBe(1_000)

    act(() => vi.advanceTimersByTime(999))
    expect(onRoundCompleted).not.toHaveBeenCalled()
    expect(result.current.getRemainingMs()).toBe(1)

    act(() => vi.advanceTimersByTime(1))
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(3)
    expect(result.current.state.round).toBe(2)
    expect(result.current.getRemainingMs()).toBe(STREAM_TAB_OPEN_DELAY_MS)

    rerender({ roundDurationMs: 3_000 })
    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))
    expect(result.current.getRemainingMs()).toBe(2_000)

    act(() => vi.advanceTimersByTime(1_999))
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    act(() => vi.advanceTimersByTime(1))
    expect(onRoundCompleted).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledTimes(5)

    act(() => vi.advanceTimersByTime(STREAM_TAB_OPEN_DELAY_MS))
    expect(open).toHaveBeenCalledTimes(6)
    expect(result.current.state).toMatchObject({ status: 'waiting', round: 3 })
    expect(result.current.getRemainingMs()).toBe(3_000)
  })

  it('停止后重新开始使用最新调试时长', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result, rerender } = renderHook(
      ({ roundDurationMs }) => useStreamPlayback({ roundDurationMs }),
      { initialProps: { roundDurationMs: 1_000 } },
    )

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.getRemainingMs()).toBe(1_000)
    act(() => result.current.stop())

    rerender({ roundDurationMs: 3_000 })
    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.getRemainingMs()).toBe(3_000)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('任何窗口被拦截都会关闭本轮句柄，点击继续时从同一轮完整重试', () => {
    vi.useFakeTimers()
    const firstHandle = fakeWindow()
    const resumedHandles = [fakeWindow(), fakeWindow()]
    vi.spyOn(window, 'open')
      .mockImplementationOnce(() => firstHandle)
      .mockImplementationOnce(() => null)
      .mockImplementationOnce(() => resumedHandles[0]!)
      .mockImplementationOnce(() => resumedHandles[1]!)
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      result.current.start('BV1xx411c7mD\nBV1B7411m7LV', 'popup')
    })
    expect(result.current.state).toMatchObject({
      status: 'blocked',
      round: 1,
      openedCount: 0,
    })
    expect(result.current.getRemainingMs()).toBeNull()
    expect(firstHandle.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      expect(result.current.resume()).toBe(true)
    })
    expect(result.current.state).toMatchObject({ status: 'waiting', round: 1, openedCount: 2 })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('解析错误不打开窗口，并把错误放入状态供界面展示', () => {
    const open = vi.spyOn(window, 'open')
    const { result } = renderHook(() => useStreamPlayback())

    act(() => {
      const parseResult = result.current.start('https://b23.tv/short', 'popup')
      expect(parseResult.ok).toBe(false)
    })

    expect(open).not.toHaveBeenCalled()
    expect(result.current.state).toMatchObject({
      status: 'idle',
      round: 0,
      mode: 'popup',
      sourceInput: 'https://b23.tv/short',
      openedCount: 0,
      errors: [{ line: 1, code: 'short-link' }],
    })
  })

  it('新运行从持久完成轮次的下一轮开始，并同步属性的最新值', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const { result, rerender } = renderHook(
      ({ completedRounds }) => useStreamPlayback({ completedRounds }),
      { initialProps: { completedRounds: 7 } },
    )

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.state.round).toBe(8)

    act(() => result.current.stop())
    rerender({ completedRounds: 11 })
    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.state.round).toBe(12)
  })

  it('轮次结束使用更新后的回调', () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    vi.spyOn(window, 'open').mockImplementation(() => fakeWindow())
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()
    const { result, rerender } = renderHook(
      ({ onRoundCompleted }) => useStreamPlayback({ onRoundCompleted }),
      {
        initialProps: {
          onRoundCompleted: firstCallback,
        },
      },
    )

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    rerender({ onRoundCompleted: secondCallback })
    act(() => vi.advanceTimersByTime(STREAM_ROUND_DURATION_MS))

    expect(firstCallback).not.toHaveBeenCalled()
    expect(secondCallback).toHaveBeenCalledWith({ completedAt: 410_000 })
  })

  it('完成回调内停止后不会重开，也不会被陈旧恢复事件唤醒', () => {
    vi.useFakeTimers()
    const handle = fakeWindow()
    const open = vi.spyOn(window, 'open').mockImplementationOnce(() => handle)
    let stop: () => void = () => undefined
    const onRoundCompleted = vi.fn(() => stop())
    const { result } = renderHook(() => useStreamPlayback({ onRoundCompleted }))
    stop = () => result.current.stop()

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    act(() => vi.advanceTimersByTime(STREAM_ROUND_DURATION_MS))
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(handle.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
    expect(result.current.state.status).toBe('stopped')
    expect(vi.getTimerCount()).toBe(0)

    act(() => vi.advanceTimersByTime(STREAM_ROUND_DURATION_MS * 2))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onRoundCompleted).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stop、beforeunload 与卸载都会关闭自开句柄，且控制方法引用稳定', () => {
    vi.useFakeTimers()
    const handles = [fakeWindow(), fakeWindow(), fakeWindow()]
    vi.spyOn(window, 'open')
      .mockImplementationOnce(() => handles[0]!)
      .mockImplementationOnce(() => handles[1]!)
      .mockImplementationOnce(() => handles[2]!)
    const { result, rerender, unmount } = renderHook(
      ({ roundDurationMs }) => useStreamPlayback({ roundDurationMs }),
      { initialProps: { roundDurationMs: STREAM_ROUND_DURATION_MS } },
    )
    const methods = {
      start: result.current.start,
      resume: result.current.resume,
      stop: result.current.stop,
      getRemainingMs: result.current.getRemainingMs,
    }

    rerender({ roundDurationMs: 2_000 })
    expect(result.current.start).toBe(methods.start)
    expect(result.current.resume).toBe(methods.resume)
    expect(result.current.stop).toBe(methods.stop)
    expect(result.current.getRemainingMs).toBe(methods.getRemainingMs)

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    expect(result.current.getRemainingMs()).toBe(2_000)
    act(() => result.current.stop())
    expect(handles[0]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(result.current.state.status).toBe('stopped')

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    act(() => window.dispatchEvent(new Event('beforeunload')))
    expect(handles[1]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()

    act(() => result.current.start('BV1xx411c7mD', 'popup'))
    unmount()
    expect(handles[2]!.close as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
