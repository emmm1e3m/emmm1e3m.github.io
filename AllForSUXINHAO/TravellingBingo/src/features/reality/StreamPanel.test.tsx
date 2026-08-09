import { fireEvent, render, screen } from '@testing-library/react'

import { STREAM_INSTRUCTION, StreamPanel } from './StreamPanel'
import type { StreamPlaybackState } from './stream/useStreamPlayback'

function playback(overrides: Partial<StreamPlaybackState> = {}): StreamPlaybackState {
  return {
    status: 'idle',
    round: 0,
    sessionRoundsCompleted: 0,
    openDelayMs: 8_000,
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

const commonProps = {
  now: 1_000,
  completedRounds: 0,
  recentSessions: [],
  getRemainingMs: () => null,
  getStopRemainingMs: () => null,
  onResume: () => true,
  onStop: () => undefined,
} as const

describe('StreamPanel', () => {
  it('转交视频、模式、打开间隔与定时停止，并展示两条提示', () => {
    const onStart = vi.fn(() => ({ ok: true as const, bvids: [], errors: [] as const }))
    render(<StreamPanel {...commonProps} playback={playback()} onStart={onStart} />)

    expect(screen.getByText(STREAM_INSTRUCTION)).toHaveTextContent(
      '如果设备或者网络较为卡顿，可以适当增加时长以便加载',
    )
    expect(screen.getByText(STREAM_INSTRUCTION)).toHaveTextContent(
      '登录时尽量不要连续刷播超过5小时以避免黑号',
    )
    fireEvent.change(screen.getByRole('textbox', { name: '视频BV号或链接列表' }), {
      target: { value: 'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /新标签页/u }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '打开间隔（秒）' }), {
      target: { value: '12' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '定时停止（小时）' }), {
      target: { value: '4.5' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    expect(onStart).toHaveBeenCalledWith(
      'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE',
      'tabs',
      { openDelayMs: 12_000, stopAfterMs: 16_200_000 },
    )
  })

  it('留空或 0 表示不限时，无效范围会明确阻止启动', () => {
    const onStart = vi.fn(() => ({ ok: true as const, bvids: [], errors: [] as const }))
    render(<StreamPanel {...commonProps} playback={playback()} onStart={onStart} />)

    fireEvent.change(screen.getByRole('textbox', { name: '视频BV号或链接列表' }), {
      target: { value: 'BV1xx411c7mD' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))
    expect(onStart).toHaveBeenLastCalledWith('BV1xx411c7mD', 'popup', {
      openDelayMs: 8_000,
      stopAfterMs: null,
    })

    fireEvent.change(screen.getByRole('spinbutton', { name: '定时停止（小时）' }), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: '打开间隔（秒）' }), {
      target: { value: '61' },
    })
    expect(screen.getByRole('button', { name: '开始刷播' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('1–60 秒')
  })

  it('切走再返回时从运行态恢复本次快照，并锁定定时设置', () => {
    const onResume = vi.fn(() => true)
    const onStop = vi.fn()
    const firstMount = render(
      <StreamPanel
        {...commonProps}
        playback={playback()}
        onStart={() => ({ ok: true, bvids: [], errors: [] })}
      />,
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: '打开间隔（秒）' }), {
      target: { value: '3' },
    })
    firstMount.unmount()

    render(
      <StreamPanel
        {...commonProps}
        now={10_000}
        completedRounds={2}
        playback={playback({
          status: 'blocked',
          round: 3,
          openDelayMs: 12_000,
          stopAfterMs: 16_200_000,
          mode: 'popup',
          sourceInput: 'BV1xx411c7mD',
          parsedBvids: ['BV1xx411c7mD'],
          message: '弹窗被拦截，请允许本站打开弹窗后点击继续。',
        })}
        getStopRemainingMs={() => 3_600_000}
        onStart={() => ({ ok: true, bvids: [], errors: [] })}
        onResume={onResume}
        onStop={onStop}
      />,
    )

    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /弹出窗口/u })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '打开间隔（秒）' })).toHaveValue(12)
    expect(screen.getByRole('spinbutton', { name: '打开间隔（秒）' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '定时停止（小时）' })).toHaveValue(4.5)
    expect(screen.getByText('01:00:00')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '允许弹窗后继续' }))
    fireEvent.click(screen.getByRole('button', { name: '取消刷播' }))
    expect(onResume).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('最近记录按一次任务展示起止、结果与其中的多轮', () => {
    const recentSessions = [
      {
        sessionId: 'stream-2',
        startedAt: Date.UTC(2026, 7, 9, 12, 0),
        endedAt: Date.UTC(2026, 7, 9, 13, 0),
        roundsCompleted: 6,
        outcome: 'completed' as const,
      },
      {
        sessionId: 'stream-1',
        startedAt: Date.UTC(2026, 7, 8, 12, 0),
        endedAt: Date.UTC(2026, 7, 8, 12, 20),
        roundsCompleted: 2,
        outcome: 'stopped' as const,
      },
    ]
    render(
      <StreamPanel
        {...commonProps}
        completedRounds={8}
        recentSessions={recentSessions}
        playback={playback({
          status: 'waiting',
          round: 9,
          sessionRoundsCompleted: 1,
          parsedBvids: ['BV1xx411c7mD'],
          openedCount: 1,
          message: '第 9 轮播放中',
        })}
        getRemainingMs={() => 310_000}
        onStart={() => ({ ok: true, bvids: [], errors: [] })}
      />,
    )

    expect(screen.getByText('05:10')).toBeVisible()
    expect(screen.getByText('不限时')).toBeVisible()
    expect(screen.getByText('按时完成 · 6 轮')).toBeVisible()
    expect(screen.getByText('已停止 · 2 轮')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText(/第 8 轮/u)).not.toBeInTheDocument()
  })
})
