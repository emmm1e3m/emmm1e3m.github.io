import { act, renderHook } from '@testing-library/react'

import { useVisitorStreamPlayback } from './useVisitorStreamPlayback'

const BVIDS = ['BV1At3j6EE6w', 'BV1mkuN6HEFC', 'BV1UZ3D6REhZ'] as const
const KEEP_ORDER_RANDOM = () => 0.999_999

describe('useVisitorStreamPlayback', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('按视频间隔加入 iframe，并把整轮节点保留到轮次结束后统一重建', () => {
    vi.setSystemTime(10_000)
    const { result } = renderHook(() => useVisitorStreamPlayback(KEEP_ORDER_RANDOM))

    act(() => {
      expect(result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 })).toBe(
        true,
      )
    })
    expect(result.current.state).toMatchObject({ status: 'opening', round: 1 })
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual([BVIDS[0]])

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual(BVIDS.slice(0, 2))

    act(() => vi.advanceTimersByTime(1_000))
    expect(result.current.state).toMatchObject({ status: 'waiting', round: 1 })
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual(BVIDS)
    expect(result.current.getNextRoundRemainingMs()).toBe(5_000)
    const firstRoundFrameIds = result.current.state.frames.map((frame) => frame.id)

    act(() => vi.advanceTimersByTime(4_999))
    expect(result.current.state.frames).toHaveLength(3)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state).toMatchObject({
      status: 'opening',
      round: 2,
      completedRounds: 1,
    })
    expect(result.current.getNextRoundRemainingMs()).toBeNull()
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual([BVIDS[0]])
    expect(
      result.current.state.frames.every((frame) => !firstRoundFrameIds.includes(frame.id)),
    ).toBe(true)
  })

  it('相同队列与设置重复启动保持同一会话，改变共享间隔才重新开始', () => {
    vi.setSystemTime(20_000)
    const { result } = renderHook(() => useVisitorStreamPlayback(KEEP_ORDER_RANDOM))

    act(() => result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 }))
    const startedAt = result.current.state.startedAt
    const firstFrame = result.current.state.frames[0]
    act(() => {
      vi.setSystemTime(21_000)
      expect(result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 })).toBe(
        true,
      )
    })
    expect(result.current.state.startedAt).toBe(startedAt)
    expect(result.current.state.frames[0]).toEqual(firstFrame)

    act(() => {
      expect(result.current.start(BVIDS, { videoIntervalMs: 2_000, roundIntervalMs: 5_000 })).toBe(
        true,
      )
    })
    expect(result.current.state.startedAt).toBe(21_000)
    expect(result.current.state.frames).toHaveLength(1)
    expect(result.current.state.videoIntervalMs).toBe(2_000)
  })

  it('当前轮运行中修改轮次间隔只在下一轮采用', () => {
    vi.setSystemTime(30_000)
    const { result } = renderHook(() => useVisitorStreamPlayback(KEEP_ORDER_RANDOM))

    act(() =>
      result.current.start([BVIDS[0]], {
        videoIntervalMs: 1_000,
        roundIntervalMs: 5_000,
      }),
    )
    const startedAt = result.current.state.startedAt
    const firstFrame = result.current.state.frames[0]
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      round: 1,
      roundIntervalMs: 5_000,
    })

    act(() =>
      expect(
        result.current.start([BVIDS[0]], {
          videoIntervalMs: 1_000,
          roundIntervalMs: 2_000,
        }),
      ).toBe(true),
    )
    expect(result.current.state.startedAt).toBe(startedAt)
    expect(result.current.state.round).toBe(1)
    expect(result.current.state.frames[0]).toEqual(firstFrame)
    expect(result.current.state.roundIntervalMs).toBe(5_000)

    act(() => vi.advanceTimersByTime(4_999))
    expect(result.current.state.round).toBe(1)
    expect(result.current.state.frames[0]).toEqual(firstFrame)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state).toMatchObject({
      status: 'waiting',
      round: 2,
      roundIntervalMs: 2_000,
    })
    expect(result.current.state.startedAt).toBe(startedAt)
    expect(result.current.state.frames[0]).not.toEqual(firstFrame)

    act(() => vi.advanceTimersByTime(1_999))
    expect(result.current.state.round).toBe(2)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.state.round).toBe(3)
  })

  it('停止会卸载整轮并清除计时器，非法或空设置不会启动', () => {
    const { result, unmount } = renderHook(() => useVisitorStreamPlayback(KEEP_ORDER_RANDOM))

    act(() => expect(result.current.start([])).toBe(false))
    act(() =>
      expect(result.current.start(BVIDS, { videoIntervalMs: 999, roundIntervalMs: 5_000 })).toBe(
        false,
      ),
    )
    expect(result.current.state.status).toBe('idle')
    expect(vi.getTimerCount()).toBe(0)

    act(() => result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 }))
    expect(vi.getTimerCount()).toBe(1)
    act(() => result.current.stop())
    expect(result.current.state).toMatchObject({ status: 'idle', frames: [], bvids: [] })
    expect(vi.getTimerCount()).toBe(0)

    act(() => result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 }))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('只生成官方 player iframe 地址，不发起收藏夹 API、代理或点击请求', () => {
    const fetchRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const xhrRequest = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined)
    const { result } = renderHook(() => useVisitorStreamPlayback(KEEP_ORDER_RANDOM))

    act(() => result.current.start(BVIDS, { videoIntervalMs: 1_000, roundIntervalMs: 5_000 }))
    const url = new URL(result.current.state.frames[0]!.url)
    expect(url.origin).toBe('https://player.bilibili.com')
    expect(url.searchParams.get('t')).toBe('0')
    expect(url.searchParams.get('muted')).toBe('1')
    expect(fetchRequest).not.toHaveBeenCalled()
    expect(xhrRequest).not.toHaveBeenCalled()
  })

  it('每轮重新打乱收藏夹，但自测视频始终是本轮最后一个', () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.999_999)
      .mockReturnValueOnce(0.999_999)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
    const selfTestBvid = 'BV1xx411c7mD'
    const { result } = renderHook(() => useVisitorStreamPlayback(random))

    act(() =>
      result.current.start(BVIDS, {
        videoIntervalMs: 1_000,
        roundIntervalMs: 1_000,
        selfTestBvid,
      }),
    )
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual([...BVIDS, selfTestBvid])

    act(() => vi.advanceTimersByTime(1_000))
    act(() => vi.advanceTimersByTime(3_000))
    expect(result.current.state.round).toBe(2)
    expect(result.current.state.frames.map((frame) => frame.bvid)).toEqual([
      BVIDS[1],
      BVIDS[2],
      BVIDS[0],
      selfTestBvid,
    ])
  })
})
