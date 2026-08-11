import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { STREAM_PLAYER_DEBUG_ENABLED_KEY, StreamPlayerApp } from './StreamPlayerApp'
import { STREAM_PLAYER_HISTORY_KEY } from './history'

const FAVORITE_TEXT = 'BV1xx411c7mD\nBV1Q541167Qg\n'

describe('StreamPlayerApp', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/stream-player.html')
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
    localStorage.clear()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('无参数直达时可以在页内配置并手动开始', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => FAVORITE_TEXT,
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StreamPlayerApp />)

    expect(screen.getByText('SUperView')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: '在线刷播工具' })).toBeVisible()
    expect(screen.getByText('移动端离开刷播页面可能会导致刷播暂停。')).toBeVisible()
    expect(screen.getByText('请在网页版哔哩哔哩设置‘自动开播’和‘播完暂停’。')).toBeVisible()
    expect(
      screen.getByText(
        '在新设备/浏览器上请先检查：若登录，历史记录里出现刷播视频为成功；若未登录，自测视频播放量增加为成功。',
      ),
    ).toBeVisible()
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: '刷播' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: '测试' }))
    fireEvent.change(screen.getByRole('textbox', { name: '自测视频BV号或链接' }), {
      target: { value: 'https://www.bilibili.com/video/BV1mK4y1C7Bz/' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '定时停止（小时）' }), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    await waitFor(() => expect(screen.getAllByTitle(/刷播视频$/u)).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestUrl = fetchMock.mock.calls[0]?.[0]
    expect(requestUrl).toBeInstanceOf(URL)
    expect(String(requestUrl)).toBe(`${window.location.origin}/favourites/3986840044.txt`)
    fireEvent.click(screen.getByRole('button', { name: '停止刷播' }))
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    expect(localStorage.getItem('travelling-bingo:stream-player-history:v1')).not.toBeNull()
    expect(screen.getByRole('radio', { name: '刷播' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('首屏读取历史被浏览器拒绝时仍可正常打开', () => {
    const originalGetItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === STREAM_PLAYER_HISTORY_KEY) {
        throw new DOMException('Blocked', 'SecurityError')
      }
      return originalGetItem.call(this, key)
    })

    expect(() => render(<StreamPlayerApp />)).not.toThrow()
    expect(screen.getByRole('heading', { level: 1, name: '在线刷播工具' })).toBeVisible()
    expect(screen.getByText('还没有刷播记录。')).toBeVisible()
  })

  it('保活音频覆盖独立页的完整生命周期', () => {
    const { unmount } = render(<StreamPlayerApp />)

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    unmount()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
  })

  it('自动播放被拒绝后，会在首个键盘手势恢复保活音频且不轮询', async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(new Error('autoplay blocked'))
      .mockResolvedValueOnce()
    render(<StreamPlayerApp />)

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(document, { key: 'Enter' })
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2))
    fireEvent.pointerDown(document)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  })

  it('autostart=1 会直接读取同源 TXT 并创建第一个 iframe', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&sessionId=e2e-session&autostart=1',
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => FAVORITE_TEXT,
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StreamPlayerApp />)

    await waitFor(() => expect(screen.getAllByTitle(/刷播视频$/u)).toHaveLength(1))
    expect(screen.queryByRole('button', { name: '开始刷播' })).not.toBeInTheDocument()
  })

  it('收藏夹读取失败时不会向主游戏误报开始', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&sessionId=failed-session&autostart=1',
    )
    const opener = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('收藏夹读取失败')))

    render(<StreamPlayerApp />)

    expect(await screen.findByText('刷播未能启动')).toBeVisible()
    expect(screen.getByText('收藏夹读取失败')).toBeVisible()
    expect(opener.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'started' }),
      expect.any(String),
    )
  })

  it('收藏夹仍在加载时接收主页停止，会中止请求、记录0轮并阻止迟到启动', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&sessionId=loading-session&autostart=1',
    )
    const opener = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    let resolveFetch!: (response: { ok: boolean; text: () => Promise<string> }) => void
    const delayedResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return delayedResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StreamPlayerApp />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: opener,
        data: {
          type: 'travelling-bingo:stream-player',
          version: 1,
          sessionId: 'loading-session',
          event: 'stop',
        },
      }),
    )

    await waitFor(() => expect(screen.getByText('刷播已停止')).toBeVisible())
    expect(requestInit.signal?.aborted).toBe(true)
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled()
    expect(opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'loading-session',
        event: 'ended',
        outcome: 'stopped',
      }),
      window.location.origin,
    )
    const loadingHistory = JSON.parse(
      localStorage.getItem('travelling-bingo:stream-player-history:v1')!,
    )
    expect(loadingHistory).toEqual([
      expect.objectContaining({
        roundsCompleted: 0,
        outcome: 'stopped',
      }),
    ])
    expect(loadingHistory[0].sessionId).not.toBe('loading-session')

    await act(async () => {
      resolveFetch({ ok: true, text: async () => 'BV1xx411c7mD\n' })
      await delayedResponse
      await Promise.resolve()
    })
    expect(screen.queryAllByTitle(/刷播视频$/u)).toHaveLength(0)
    expect(screen.getByText('刷播已停止')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByTitle(/刷播视频$/u)).toHaveLength(1))
  })

  it('同一窗口的消息通道保持稳定，每次重启使用独立的历史 runId', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&sessionId=stable-channel',
    )
    const opener = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    render(<StreamPlayerApp />)

    for (let run = 1; run <= 2; run += 1) {
      fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
      await waitFor(() => expect(screen.getAllByTitle(/刷播视频$/u)).toHaveLength(1))
      fireEvent.click(screen.getByRole('button', { name: '停止刷播' }))
      expect(screen.getByText('刷播已停止')).toBeVisible()
    }

    const startedMessages = vi
      .mocked(opener.postMessage)
      .mock.calls.map(([message]) => message)
      .filter(
        (message): message is { sessionId: string; event: 'started'; dateKey: string } =>
          typeof message === 'object' &&
          message !== null &&
          (message as { event?: unknown }).event === 'started',
      )
    expect(startedMessages).toHaveLength(2)
    expect(startedMessages).toEqual([
      expect.objectContaining({
        sessionId: 'stable-channel',
        dateKey: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      }),
      expect.objectContaining({
        sessionId: 'stable-channel',
        dateKey: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      }),
    ])

    const history = JSON.parse(localStorage.getItem(STREAM_PLAYER_HISTORY_KEY)!)
    expect(history).toHaveLength(2)
    expect(new Set(history.map((item: { sessionId: string }) => item.sessionId)).size).toBe(2)
    expect(
      history.every((item: { sessionId: string }) => item.sessionId !== 'stable-channel'),
    ).toBe(true)
  })

  it('定时时长折算为0毫秒时不创建播放器，也不报告 started', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&stopHours=0.0000000001&sessionId=tiny-duration&autostart=1',
    )
    const opener = { postMessage: vi.fn() } as unknown as Window
    Object.defineProperty(window, 'opener', { configurable: true, value: opener })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )

    render(<StreamPlayerApp />)

    expect(await screen.findByText('定时刷播已完成')).toBeVisible()
    expect(screen.queryAllByTitle(/刷播视频$/u)).toHaveLength(0)
    expect(opener.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'started' }),
      expect.any(String),
    )
    expect(opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'tiny-duration',
        event: 'ended',
        outcome: 'completed',
      }),
      window.location.origin,
    )
  })

  it('页面正常关闭时同步停止运行任务，并按当前完整轮次只保存一次', async () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    render(<StreamPlayerApp />)

    fireEvent.change(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' }), {
      target: { value: '0.2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到当前轮' }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    const secondRound = await screen.findByText('第 2 轮已全部打开')
    act(() => window.dispatchEvent(new Event('pagehide')))
    window.dispatchEvent(new Event('pagehide'))

    expect(screen.getByText('刷播已停止')).toBeVisible()
    expect(JSON.parse(localStorage.getItem('travelling-bingo:stream-player-history:v1')!)).toEqual([
      expect.objectContaining({
        roundsCompleted: Number(secondRound.getAttribute('data-round')) - 1,
        outcome: 'stopped',
      }),
    ])
  })

  it('每个完整轮次都覆盖同一条进行中记录，正常停止再覆盖为最终状态', async () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    render(<StreamPlayerApp />)

    fireEvent.change(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' }), {
      target: { value: '0.2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到当前轮' }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    for (const currentRound of [2, 3, 4]) {
      await screen.findByText(`第 ${currentRound} 轮已全部打开`)
      expect(
        JSON.parse(localStorage.getItem('travelling-bingo:stream-player-history:v1')!),
      ).toEqual([
        expect.objectContaining({
          roundsCompleted: currentRound - 1,
          outcome: 'running',
        }),
      ])
      expect(screen.getByText(`进行中 · 已保存到 ${currentRound - 1} 轮`)).toBeVisible()
    }

    fireEvent.click(screen.getByRole('button', { name: '停止刷播' }))
    expect(JSON.parse(localStorage.getItem('travelling-bingo:stream-player-history:v1')!)).toEqual([
      expect.objectContaining({ roundsCompleted: 3, outcome: 'stopped' }),
    ])
  })

  it('checkpoint 写入失败时提示但不中断后续轮次', async () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STREAM_PLAYER_HISTORY_KEY) {
        throw new DOMException('Full', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })
    render(<StreamPlayerApp />)

    fireEvent.change(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' }), {
      target: { value: '0.2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到当前轮' }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    await screen.findByText('第 2 轮已全部打开')
    expect(screen.getByRole('status')).toHaveTextContent('本机未能保存刷播记录，刷播仍会继续。')
    await screen.findByText('第 3 轮已全部打开')
  })

  it('没有 pagehide 时重载仍能看到上一完整轮的 checkpoint', async () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    const firstView = render(<StreamPlayerApp />)

    fireEvent.change(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' }), {
      target: { value: '0.2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到当前轮' }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    await screen.findByText('第 2 轮已全部打开')
    firstView.unmount()

    render(<StreamPlayerApp />)
    expect(screen.getByText('进行中 · 已保存到 1 轮')).toBeVisible()
    expect(JSON.parse(localStorage.getItem('travelling-bingo:stream-player-history:v1')!)).toEqual([
      expect.objectContaining({ roundsCompleted: 1, outcome: 'running' }),
    ])
  })

  it('收藏夹仍在加载时关闭页面，会同步中止并只保存一条0轮记录', async () => {
    window.history.replaceState(
      {},
      '',
      '/stream-player.html?favoriteId=3682220021&sessionId=pagehide-loading&autostart=1',
    )
    let resolveFetch!: (response: { ok: boolean; text: () => Promise<string> }) => void
    const delayedResponse = new Promise<{ ok: boolean; text: () => Promise<string> }>((resolve) => {
      resolveFetch = resolve
    })
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input
      void init
      return delayedResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StreamPlayerApp />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    act(() => window.dispatchEvent(new Event('pagehide')))
    window.dispatchEvent(new Event('pagehide'))

    expect(requestInit.signal?.aborted).toBe(true)
    const pagehideHistory = JSON.parse(
      localStorage.getItem('travelling-bingo:stream-player-history:v1')!,
    )
    expect(pagehideHistory).toEqual([
      expect.objectContaining({
        roundsCompleted: 0,
        outcome: 'stopped',
      }),
    ])
    expect(pagehideHistory[0].sessionId).not.toBe('pagehide-loading')

    await act(async () => {
      resolveFetch({ ok: true, text: async () => 'BV1xx411c7mD\n' })
      await delayedResponse
      await Promise.resolve()
    })
    expect(screen.queryAllByTitle(/刷播视频$/u)).toHaveLength(0)
  })

  it('DEBUG 解锁状态会持久化，并可关闭后重新要求密码', () => {
    render(<StreamPlayerApp />)
    const title = screen.getByRole('heading', { level: 1, name: '在线刷播工具' })
    for (let count = 0; count < 5; count += 1) fireEvent.click(title)

    const password = screen.getByLabelText('DEBUG密码')
    fireEvent.change(password, { target: { value: 'SUperView' } })
    fireEvent.click(screen.getByRole('button', { name: '解锁DEBUG' }))

    expect(screen.getByRole('checkbox', { name: '显示播放器' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' })).toHaveValue(310)
    expect(localStorage.getItem(STREAM_PLAYER_DEBUG_ENABLED_KEY)).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: '关闭DEBUG' }))
    expect(screen.queryByRole('checkbox', { name: '显示播放器' })).not.toBeInTheDocument()
    expect(localStorage.getItem(STREAM_PLAYER_DEBUG_ENABLED_KEY)).toBeNull()

    for (let count = 0; count < 5; count += 1) fireEvent.click(title)
    expect(screen.getByLabelText('DEBUG密码')).toBeVisible()
  })

  it('已保存的 DEBUG 解锁状态会在再次打开页面时恢复', () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    render(<StreamPlayerApp />)

    expect(screen.getByRole('checkbox', { name: '显示播放器' })).toBeVisible()
    expect(screen.queryByLabelText('DEBUG密码')).not.toBeInTheDocument()
  })

  it('空闲时设置的 DEBUG 轮次间隔会用于下次启动', async () => {
    localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'BV1xx411c7mD\n' }),
    )
    render(<StreamPlayerApp />)

    fireEvent.change(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' }), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: '应用到当前轮' }))
    expect(screen.getByText('轮次间隔已设为 1 秒，下次启动生效。')).toBeVisible()

    const startedAt = Date.now()
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    const status = await screen.findByText('第 1 轮已全部打开')
    const nextRoundAt = Number(status.getAttribute('data-next-round-at'))
    expect(nextRoundAt).toBeGreaterThanOrEqual(startedAt + 900)
    expect(nextRoundAt).toBeLessThanOrEqual(Date.now() + 1_100)
  })
})
