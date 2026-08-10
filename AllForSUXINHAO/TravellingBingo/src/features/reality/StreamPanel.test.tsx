import { fireEvent, render, screen } from '@testing-library/react'

import {
  STREAM_INSTRUCTION,
  VISITOR_STREAM_INSTRUCTION,
  StreamPanel,
  type StreamPanelProps,
} from './StreamPanel'
import type { StreamPlaybackState } from './stream/useStreamPlayback'
import type { VisitorStreamState } from './stream/useVisitorStreamPlayback'

function playback(overrides: Partial<StreamPlaybackState> = {}): StreamPlaybackState {
  return {
    status: 'idle',
    round: 0,
    sessionRoundsCompleted: 0,
    openDelayMs: 8_000,
    roundDurationMs: 310_000,
    stopAfterMs: null,
    mode: null,
    sourceInput: '',
    parsedBvids: [],
    openedCount: 0,
    message: '尚未开始刷播',
    errors: [],
    ...overrides,
  }
}

function visitor(overrides: Partial<VisitorStreamState> = {}): VisitorStreamState {
  return {
    status: 'idle',
    startedAt: null,
    round: 0,
    completedRounds: 0,
    frames: [],
    bvids: [],
    videoIntervalMs: 8_000,
    roundIntervalMs: 310_000,
    message: '游客刷播未运行',
    ...overrides,
  }
}

function props(overrides: Partial<StreamPanelProps> = {}): StreamPanelProps {
  return {
    now: 1_000,
    completedRounds: 0,
    recentSessions: [],
    staticVideoCount: 3,
    selfTestBvid: null,
    dimensionPenetrationEnabled: false,
    videoIntervalMs: 8_000,
    roundIntervalMs: 310_000,
    playback: playback(),
    visitorPlayback: visitor(),
    getRemainingMs: () => null,
    getStopRemainingMs: () => null,
    onStart: vi.fn(() => ({ ok: true as const, bvid: null, errors: [] as const })),
    onResume: vi.fn(() => true),
    onStop: vi.fn(),
    onSelfTestBvidChange: vi.fn(),
    onDimensionPenetrationChange: vi.fn(),
    onVideoIntervalChange: vi.fn(),
    ...overrides,
  }
}

describe('StreamPanel', () => {
  it('只接收一个可选自测 BV，并把共享间隔与登录设置交给控制器', () => {
    const onStart = vi.fn(() => ({ ok: true as const, bvid: 'BV1xx411c7mD', errors: [] as const }))
    const onSelfTestBvidChange = vi.fn()
    const onVideoIntervalChange = vi.fn()
    render(<StreamPanel {...props({ onStart, onSelfTestBvidChange, onVideoIntervalChange })} />)

    expect(screen.getByText(STREAM_INSTRUCTION)).toHaveTextContent(
      '可以适当增加时长以使视频完全加载',
    )
    expect(screen.getByText(STREAM_INSTRUCTION)).not.toHaveTextContent('按设置的间隔依次打开')
    expect(screen.getByText(VISITOR_STREAM_INSTRUCTION)).toBeVisible()
    expect(screen.getByText(/收藏夹快照中有 3 个视频/u)).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '自测视频BV号' }), {
      target: { value: 'BV1xx411c7mD' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /新标签页/u }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '视频间隔（秒）' }), {
      target: { value: '12' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '定时停止（小时）' }), {
      target: { value: '4.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始登录刷播' }))

    expect(onSelfTestBvidChange).toHaveBeenCalledWith('BV1xx411c7mD')
    expect(onVideoIntervalChange).toHaveBeenCalledWith(12_000)
    expect(onStart).toHaveBeenCalledWith('BV1xx411c7mD', 'tabs', {
      openDelayMs: 12_000,
      stopAfterMs: 16_200_000,
    })
  })

  it('留空使用静态快照；链接、多行与无效范围会明确阻止启动', () => {
    const onStart = vi.fn(() => ({ ok: true as const, bvid: null, errors: [] as const }))
    render(<StreamPanel {...props({ onStart })} />)

    fireEvent.click(screen.getByRole('button', { name: '开始登录刷播' }))
    expect(onStart).toHaveBeenCalledWith('', 'popup', {
      openDelayMs: 8_000,
      stopAfterMs: null,
    })

    fireEvent.change(screen.getByRole('textbox', { name: '自测视频BV号' }), {
      target: { value: 'https://www.bilibili.com/video/BV1xx411c7mD/' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('一个完整的 BV 号')
    expect(screen.getByRole('button', { name: '开始登录刷播' })).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox', { name: '自测视频BV号' }), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '视频间隔（秒）' }), {
      target: { value: '61' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('1–60 秒')
    expect(screen.getByRole('button', { name: '开始登录刷播' })).toBeDisabled()
  })

  it('自测 BV 输入一旦完整有效就立即持久化，未失焦卸载后仍能恢复', () => {
    const onSelfTestBvidChange = vi.fn()
    const firstMount = render(
      <StreamPanel {...props({ onSelfTestBvidChange, selfTestBvid: null })} />,
    )
    const input = screen.getByRole('textbox', { name: '自测视频BV号' })
    fireEvent.change(input, { target: { value: 'BV1xx411c7mD' } })
    expect(onSelfTestBvidChange).toHaveBeenCalledWith('BV1xx411c7mD')

    firstMount.unmount()
    render(<StreamPanel {...props({ selfTestBvid: 'BV1xx411c7mD' })} />)
    expect(screen.getByRole('textbox', { name: '自测视频BV号' })).toHaveValue('BV1xx411c7mD')
  })

  it('登录刷播占用时锁定本次设置，但仍允许先开启维度穿透等待接棒', () => {
    const onDimensionPenetrationChange = vi.fn()
    render(
      <StreamPanel
        {...props({
          selfTestBvid: 'BV1xx411c7mD',
          playback: playback({
            status: 'blocked',
            round: 3,
            openDelayMs: 12_000,
            stopAfterMs: 16_200_000,
            mode: 'popup',
            sourceInput: 'BV1xx411c7mD',
            parsedBvids: ['BV1xx411c7mD'],
            message: '弹窗被拦截。',
          }),
          getStopRemainingMs: () => 3_600_000,
          onDimensionPenetrationChange,
        })}
      />,
    )

    expect(screen.getByRole('textbox', { name: '自测视频BV号' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '视频间隔（秒）' })).toBeDisabled()
    const penetration = screen.getByRole('checkbox', { name: /维度穿透/u })
    expect(penetration).toBeEnabled()
    fireEvent.click(penetration)
    expect(onDimensionPenetrationChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('01:00:00')).toBeVisible()
  })

  it('展示游客运行时间与轮次，同时保留一次任务一条的登录历史', () => {
    render(
      <StreamPanel
        {...props({
          now: 126_000,
          completedRounds: 8,
          visitorPlayback: visitor({
            status: 'waiting',
            startedAt: 1_000,
            round: 4,
            completedRounds: 3,
            bvids: ['BV1At3j6EE6w', 'BV1mkuN6HEFC'],
            message: '游客刷播第 4 轮运行中',
          }),
          recentSessions: [
            {
              sessionId: 'stream-2',
              startedAt: Date.UTC(2026, 7, 9, 12, 0),
              endedAt: Date.UTC(2026, 7, 9, 13, 0),
              roundsCompleted: 6,
              outcome: 'completed',
            },
          ],
        })}
      />,
    )

    expect(screen.getByLabelText('刷播状态')).toHaveTextContent('游客刷播运行中')
    expect(screen.getByLabelText('刷播状态')).toHaveTextContent('游客运行时间02:05')
    expect(screen.getByLabelText('刷播状态')).toHaveTextContent('游客轮次4')
    expect(screen.getByText('按时完成 · 6 轮')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('DEBUG 修改轮次间隔时区分本轮快照与下一轮设置', () => {
    render(
      <StreamPanel
        {...props({
          roundIntervalMs: 2_000,
          visitorPlayback: visitor({
            status: 'waiting',
            startedAt: 1_000,
            round: 1,
            roundIntervalMs: 5_000,
          }),
        })}
      />,
    )

    expect(screen.getByText(/本轮轮次间隔为 5 秒，下一轮为 2 秒/u)).toBeVisible()
  })
})
