import { fireEvent, render, screen } from '@testing-library/react'

import { StreamPanel, STREAM_INSTRUCTION, type StreamPanelProps } from './StreamPanel'

function playback(overrides: Partial<StreamPanelProps['playback']> = {}) {
  return {
    status: 'idle' as const,
    stopAfterMs: null,
    message: '尚未开始刷播',
    errors: [],
    ...overrides,
  }
}

function renderPanel(overrides: Partial<StreamPanelProps> = {}) {
  const props: StreamPanelProps = {
    selfTestBvid: null,
    favoriteId: 3682220021,
    playback: playback(),
    onStart: vi.fn(() => ({ ok: true as const, bvid: null, errors: [] as const })),
    onStop: vi.fn(),
    onSelfTestBvidChange: vi.fn(),
    onFavoriteChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<StreamPanel {...props} />), props }
}

describe('StreamPanel', () => {
  it('只展示单窗口刷播配置与移动端提醒', () => {
    renderPanel()

    expect(screen.getByText(STREAM_INSTRUCTION)).toBeVisible()
    expect(screen.getByText('会使用当前浏览器账号，登录时每天不要超过5小时。')).toBeVisible()
    expect(
      screen.getByText(
        '刷播会在单独页面运行，请允许本站弹出窗口；启动刷播窗口后，返回游戏维度也可以继续。',
      ),
    ).toBeVisible()
    expect(screen.getByText('移动端离开刷播页面可能会导致刷播暂停。')).toBeVisible()
    expect(screen.getByText('请在网页版哔哩哔哩设置‘自动开播’和‘播完暂停’。')).toBeVisible()
    expect(
      screen.getByText(
        '静默播放功能在某些条件下可能失效，因此请务必检查轮次和自测视频涨幅的关系。',
      ),
    ).toBeVisible()
    expect(screen.queryByText(/在新设备\/浏览器上请先检查/u)).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '刷播' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '测试' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '静默播放' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '新标签页' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '弹出窗口' })).not.toBeChecked()
    expect(screen.queryByText(/维度穿透|游客刷播|视频间隔/u)).not.toBeInTheDocument()
  })

  it('有效自测视频输入立即持久化，并把收藏夹与定时停止传给独立页', () => {
    const { props } = renderPanel()
    const input = screen.getByRole('textbox', { name: '自测视频BV号或链接' })

    fireEvent.change(input, { target: { value: 'BV1xx411c7mD' } })
    expect(props.onSelfTestBvidChange).toHaveBeenCalledWith('BV1xx411c7mD')
    fireEvent.change(screen.getByRole('spinbutton', { name: '定时停止（小时）' }), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    expect(props.onStart).toHaveBeenCalledWith('BV1xx411c7mD', {
      favoriteId: 3682220021,
      stopAfterMs: 18_000_000,
      playbackMode: 'silent',
    })
  })

  it('把选中的完整视频打开方式传给独立页', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByRole('radio', { name: '新标签页' }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    expect(props.onStart).toHaveBeenCalledWith('', {
      favoriteId: 3682220021,
      stopAfterMs: null,
      playbackMode: 'tab',
    })
  })

  it('收藏夹改变时立即写入存档', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByRole('radio', { name: '测试' }))
    expect(props.onFavoriteChange).toHaveBeenCalledWith(3986840044)
  })

  it('拒绝多个视频或非B站链接，且不启动', () => {
    const { props } = renderPanel()
    fireEvent.change(screen.getByRole('textbox', { name: '自测视频BV号或链接' }), {
      target: { value: 'BV1xx411c7mD\nBV1B7411m7LV' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('一个 BV 号或完整的哔哩哔哩视频链接')
    expect(screen.getByRole('button', { name: '开始刷播' })).toBeDisabled()
    expect(props.onStart).not.toHaveBeenCalled()
  })

  it('主游戏不展示轮次与最近记录，运行时只保留停止入口', () => {
    const { props } = renderPanel({
      playback: playback({
        status: 'waiting',
        message: '刷播窗口正在运行',
      }),
    })

    expect(screen.getByRole('button', { name: '停止刷播' })).toBeVisible()
    expect(screen.queryByText('累计完成轮次')).not.toBeInTheDocument()
    expect(screen.queryByText('最近任务')).not.toBeInTheDocument()
    expect(screen.queryByText('5 / 6')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '停止刷播' }))
    expect(props.onStop).toHaveBeenCalledTimes(1)
  })

  it('停止中保持配置锁定，并禁用重复停止请求', () => {
    const { props } = renderPanel({
      playback: playback({
        status: 'stopping',
        message: '正在停止刷播',
      }),
    })

    const stopButton = screen.getByRole('button', { name: '正在停止刷播' })
    expect(stopButton).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '自测视频BV号或链接' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '定时停止（小时）' })).toBeDisabled()
    fireEvent.click(stopButton)
    expect(props.onStop).not.toHaveBeenCalled()
  })
})
