import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { StreamPlayerApp } from './StreamPlayerApp'

const FAVORITE_TEXT = 'BV1xx411c7mD\nBV1Q541167Qg\n'

describe('StreamPlayerApp', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/stream-player.html')
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

    expect(screen.getByRole('heading', { level: 1, name: '刷播播放器' })).toBeVisible()
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
    expect(screen.getByRole('radio', { name: '刷播' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
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

  it('标题五击后才出现 DEBUG 密码，且只接受精确密码', () => {
    render(<StreamPlayerApp />)
    const title = screen.getByRole('heading', { level: 1, name: '刷播播放器' })
    for (let count = 0; count < 5; count += 1) fireEvent.click(title)

    const password = screen.getByLabelText('DEBUG密码')
    fireEvent.change(password, { target: { value: 'SUperView' } })
    fireEvent.click(screen.getByRole('button', { name: '解锁DEBUG' }))

    expect(screen.getByRole('checkbox', { name: '显示播放器' })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: '轮次间隔（秒）' })).toHaveValue(310)
  })
})
