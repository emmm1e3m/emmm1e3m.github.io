import { fireEvent, render, screen, within } from '@testing-library/react'

import { StreamPanel, STREAM_INSTRUCTION, type StreamPanelProps } from './StreamPanel'

function playback(overrides: Partial<StreamPanelProps['playback']> = {}) {
  return {
    status: 'idle' as const,
    sessionId: null,
    startedAt: null,
    favoriteId: 3682220021 as const,
    selfTestBvid: null,
    stopAfterMs: null,
    round: 0,
    sessionRoundsCompleted: 0,
    openedCount: 0,
    totalCount: 0,
    nextRoundAt: null,
    message: '尚未开始刷播',
    errors: [],
    ...overrides,
  }
}

function renderPanel(overrides: Partial<StreamPanelProps> = {}) {
  const props: StreamPanelProps = {
    completedRounds: 2,
    recentSessions: [],
    standaloneHistory: [],
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
    expect(screen.getByText('移动端使用前请先用自测视频测试。')).toBeVisible()
    expect(screen.getByRole('radio', { name: '刷播' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '测试' })).not.toBeChecked()
    expect(screen.queryByText(/维度穿透|游客刷播|打开方式|视频间隔/u)).not.toBeInTheDocument()
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

  it('合并存档与独立页最近记录并按任务去重', () => {
    renderPanel({
      recentSessions: [
        {
          sessionId: 'same',
          startedAt: 100,
          endedAt: 200,
          roundsCompleted: 2,
          outcome: 'completed',
        },
      ],
      standaloneHistory: [
        {
          sessionId: 'same',
          startedAt: 100,
          endedAt: 200,
          roundsCompleted: 2,
          outcome: 'completed',
        },
        {
          sessionId: 'standalone',
          startedAt: 300,
          endedAt: 400,
          roundsCompleted: 1,
          outcome: 'stopped',
        },
      ],
    })

    const history = screen.getByRole('heading', { name: '最近任务' }).closest('section')!
    expect(within(history).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('按时完成 · 2 轮')).toBeVisible()
    expect(screen.getByText('已停止 · 1 轮')).toBeVisible()
  })

  it('运行时只有停止入口，并展示独立页回传的绝对下一轮时间', () => {
    const { props } = renderPanel({
      playback: playback({
        status: 'waiting',
        round: 3,
        openedCount: 5,
        totalCount: 6,
        nextRoundAt: new Date('2026-08-11T08:20:30Z').getTime(),
        message: '第 3 轮运行中',
      }),
    })

    expect(screen.getByRole('button', { name: '停止刷播' })).toBeVisible()
    expect(screen.getByText('5 / 6')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '停止刷播' }))
    expect(props.onStop).toHaveBeenCalledTimes(1)
  })
})
