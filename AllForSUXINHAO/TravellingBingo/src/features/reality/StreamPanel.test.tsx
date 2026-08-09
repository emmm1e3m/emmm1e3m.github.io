import { fireEvent, render, screen } from '@testing-library/react'

import { STREAM_INSTRUCTION, StreamPanel } from './StreamPanel'
import type { StreamPlaybackState } from './stream/useStreamPlayback'

function playback(overrides: Partial<StreamPlaybackState> = {}): StreamPlaybackState {
  return {
    status: 'idle',
    round: 0,
    mode: null,
    sourceInput: '',
    parsedBvids: [],
    openedCount: 0,
    message: '尚未开始刷播',
    errors: [],
    ...overrides,
  }
}

describe('StreamPanel', () => {
  it('按行转交视频输入与选择的打开方式，并展示精确说明', () => {
    const onStart = vi.fn(() => ({ ok: true as const, bvids: [], errors: [] as const }))
    render(
      <StreamPanel
        now={1_000}
        completedRounds={0}
        recentRounds={[]}
        playback={playback()}
        getRemainingMs={() => null}
        onStart={onStart}
        onResume={() => true}
        onStop={() => undefined}
      />,
    )

    expect(screen.getByText(STREAM_INSTRUCTION)).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: '视频BV号或链接列表' }), {
      target: { value: 'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /新标签页/u }))
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    expect(onStart).toHaveBeenCalledWith(
      'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE',
      'tabs',
    )
  })

  it('权限被拦后锁定原输入与模式，并同时提供继续和取消', () => {
    const onResume = vi.fn(() => true)
    const onStop = vi.fn()
    render(
      <StreamPanel
        now={10_000}
        completedRounds={2}
        recentRounds={[]}
        playback={playback({
          status: 'blocked',
          round: 3,
          mode: 'popup',
          sourceInput: 'BV1xx411c7mD',
          parsedBvids: ['BV1xx411c7mD'],
          message: '弹窗被拦截，请允许本站打开弹窗后点击继续。',
        })}
        getRemainingMs={() => null}
        onStart={() => ({ ok: true, bvids: [], errors: [] })}
        onResume={onResume}
        onStop={onStop}
      />,
    )

    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /弹出窗口/u })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '允许弹窗后继续' }))
    fireEvent.click(screen.getByRole('button', { name: '取消刷播' }))
    expect(onResume).toHaveBeenCalledOnce()
    expect(onStop).toHaveBeenCalledOnce()
  })

  it('展示绝对截止时间派生的剩余时间与最近十条轮次记录', () => {
    const recentRounds = Array.from({ length: 10 }, (_, index) => ({
      round: 12 - index,
      completedAt: Date.UTC(2026, 7, 9, 12, 0, index),
    }))
    render(
      <StreamPanel
        now={20_000}
        completedRounds={12}
        recentRounds={recentRounds}
        playback={playback({
          status: 'waiting',
          round: 13,
          mode: 'popup',
          sourceInput: 'BV1xx411c7mD\nBV1yy411c7mE',
          parsedBvids: ['BV1xx411c7mD', 'BV1yy411c7mE'],
          openedCount: 2,
          message: '第 13 轮播放中',
        })}
        getRemainingMs={() => 310_000}
        onStart={() => ({ ok: true, bvids: [], errors: [] })}
        onResume={() => true}
        onStop={() => undefined}
      />,
    )

    expect(screen.getByText('05:10')).toBeVisible()
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.getByText('第 12 轮')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toHaveValue(
      'BV1xx411c7mD\nBV1yy411c7mE',
    )
    expect(screen.getByRole('radio', { name: /弹出窗口/u })).toBeChecked()
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent('本轮播放中第 13 轮播放中')
  })

  it('逐行显示本地解析错误', () => {
    const failedInput = 'https://b23.tv/example'
    const failedPlayback = playback({
      mode: 'tabs',
      sourceInput: failedInput,
      errors: [
        {
          line: 2,
          input: failedInput,
          code: 'short-link',
          message: '第 2 行是短链，无法在本地可靠解析。',
        },
      ],
    })
    const renderPanel = () =>
      render(
        <StreamPanel
          now={0}
          completedRounds={0}
          recentRounds={[]}
          playback={failedPlayback}
          getRemainingMs={() => null}
          onStart={() => ({ ok: false, bvids: [], errors: [] })}
          onResume={() => false}
          onStop={() => undefined}
        />,
      )

    const firstRender = renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('第 2 行是短链，无法在本地可靠解析。')
    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toHaveValue(failedInput)
    expect(screen.getByRole('radio', { name: /新标签页/u })).toBeChecked()

    firstRender.unmount()
    renderPanel()
    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toHaveValue(failedInput)
    expect(screen.getByRole('alert')).toHaveTextContent('第 2 行是短链，无法在本地可靠解析。')
  })
})
