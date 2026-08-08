import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { BilibiliVideo, ContentCatalog } from '@/content'
import { createInitialGameState, type GameState } from '@/domain'

import { ContextPanel } from './ContextPanel'

const recordVideos: readonly BilibiliVideo[] = [
  {
    bvid: 'BV1xx411c7mD',
    title: '第一首测试唱片',
    authorName: '苏新皓',
    authorMid: 1,
    publishedAt: '2026-06-19T12:00:00.000Z',
    durationSeconds: 112,
    coverUrl: 'https://i0.hdslb.com/record-one.jpg',
    sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
    favoriteId: 1,
    favoriteOrder: 1,
  },
  {
    bvid: 'BV1yy411c7mE',
    title: '第二首测试唱片',
    authorName: '苏新皓',
    authorMid: 1,
    publishedAt: '2026-06-20T12:00:00.000Z',
    durationSeconds: 113,
    coverUrl: 'https://i0.hdslb.com/record-two.jpg',
    sourceUrl: 'https://www.bilibili.com/video/BV1yy411c7mE',
    favoriteId: 1,
    favoriteOrder: 2,
  },
]

const contentCatalog: ContentCatalog = {
  items: [],
  byId: {},
  categoryCounts: { postcard: 0, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [],
  friendById: {},
  videosByBvid: Object.fromEntries(recordVideos.map((video) => [video.bvid, video])),
  recordPlayerVideos: recordVideos,
}

function gameWithActiveTravel(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'context-panel-focus' })
  return {
    ...game,
    activeActivity: {
      runId: 'active-travel',
      kind: 'travel',
      startedAt: 1_000,
      endsAt: 113_000,
      rewardSeed: 'context-panel-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    },
  }
}

const commonProps = {
  catalog: contentCatalog,
  now: 2_000,
  onNavigate: vi.fn(),
  onClose: vi.fn(),
  onAction: vi.fn(),
  onBackup: vi.fn(),
  onTaskEvent: vi.fn(),
}

describe('ContextPanel 无障碍交互', () => {
  it('取消确认出现时聚焦安全按钮，关闭后把焦点还给触发器', async () => {
    render(<ContextPanel {...commonProps} panel="activity" game={gameWithActiveTravel()} />)

    const trigger = screen.getByRole('button', { name: '取消这次活动' })
    trigger.focus()
    fireEvent.click(trigger)

    const safeButton = screen.getByRole('button', { name: '继续活动' })
    await waitFor(() => expect(safeButton).toHaveFocus())
    expect(document.body).not.toHaveFocus()

    fireEvent.click(safeButton)

    const restoredTrigger = screen.getByRole('button', { name: '取消这次活动' })
    await waitFor(() => expect(restoredTrigger).toHaveFocus())
    expect(document.body).not.toHaveFocus()
  })

  it('唱片列表使用原生列表项包裹仍保持按钮语义', () => {
    render(
      <ContextPanel
        {...commonProps}
        panel="record-player"
        game={createInitialGameState({ now: 1_000, seed: 'record-list-semantics' })}
      />,
    )

    const list = screen.getByRole('list', { name: '唱片列表' })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(recordVideos.length)
    expect(items.every((item) => item.tagName === 'LI')).toBe(true)
    expect(within(items[0]!).getByRole('button', { name: /第一首测试唱片/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(items[1]!).getByRole('button', { name: /第二首测试唱片/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('唱片只在主动打开播放器时派发所选曲目的 BV', () => {
    const onTaskEvent = vi.fn()
    render(
      <ContextPanel
        {...commonProps}
        panel="record-player"
        game={createInitialGameState({ now: 1_000, seed: 'record-player-bvid' })}
        onTaskEvent={onTaskEvent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /第二首测试唱片/u }))
    expect(onTaskEvent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '打开播放器' }))
    expect(onTaskEvent).toHaveBeenCalledOnce()
    expect(onTaskEvent).toHaveBeenCalledWith({
      type: 'record-player-opened',
      bvid: recordVideos[1]!.bvid,
    })

    const iframe = screen.getByTitle('第二首测试唱片播放器')
    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onTaskEvent).toHaveBeenCalledOnce()
  })
})
