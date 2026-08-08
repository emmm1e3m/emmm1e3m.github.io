import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import type { BilibiliVideo, CollectibleItem, ContentCatalog } from '@/content'
import { createInitialGameState, type GameState } from '@/domain'

import { STAGE_TEST_URL } from './gameCopy'
import { GameHome, type PanelId } from './GameHome'

const postcard = {
  id: 'postcard-2025-01-0001',
  category: 'postcard',
  title: '测试明信片',
  alt: '测试明信片照片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/test.webp',
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/postcard' },
} as unknown as CollectibleItem

const catalog: ContentCatalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [],
  friendById: {},
  videosByBvid: {},
  recordPlayerVideos: [],
}

const albumVideo: BilibiliVideo = {
  bvid: 'BV1videoBridge',
  title: '收藏播放器桥接测试',
  authorName: '苏新皓',
  authorMid: 1,
  publishedAt: '2026-06-19T12:00:00.000Z',
  durationSeconds: 112,
  coverUrl: 'https://i0.hdslb.com/video-bridge.jpg',
  sourceUrl: 'https://www.bilibili.com/video/BV1videoBridge',
  favoriteId: 1,
  favoriteOrder: 1,
}

const videoCollectible = {
  ...postcard,
  id: 'million-shot-video-bridge',
  category: 'million-shot',
  title: '带视频的收藏',
  metadata: { sequence: 1, video: albumVideo },
} as CollectibleItem

const videoCatalog: ContentCatalog = {
  items: [videoCollectible],
  byId: { [videoCollectible.id]: videoCollectible },
  categoryCounts: { postcard: 0, 'million-shot': 1, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [],
  friendById: {},
  videosByBvid: { [albumVideo.bvid]: albumVideo },
  recordPlayerVideos: [],
}

function collectedGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'album-modal-test', debug: false })
  return {
    ...game,
    collections: {
      [postcard.id]: {
        id: postcard.id,
        firstObtainedAt: 1_000,
        duplicateCount: 0,
      },
    },
  }
}

function videoCollectedGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'video-bridge-test' })
  return {
    ...game,
    collections: {
      [videoCollectible.id]: {
        id: videoCollectible.id,
        firstObtainedAt: 1_000,
        duplicateCount: 0,
      },
    },
  }
}

function GameHarness() {
  const [panel, setPanel] = useState<PanelId | null>('status')
  return (
    <GameHome
      game={collectedGame()}
      catalog={catalog}
      now={1_000}
      panel={panel}
      dirty
      reward={null}
      onPanel={setPanel}
      onAction={vi.fn()}
      onExit={vi.fn()}
      onBackup={vi.fn()}
      onDismissReward={vi.fn()}
    />
  )
}

function RoomPanelHarness() {
  const [panel, setPanel] = useState<PanelId | null>(null)
  return (
    <GameHome
      game={collectedGame()}
      catalog={catalog}
      now={1_000}
      panel={panel}
      dirty={false}
      reward={null}
      onPanel={setPanel}
      onAction={vi.fn()}
      onExit={vi.fn()}
      onBackup={vi.fn()}
      onDismissReward={vi.fn()}
    />
  )
}

function activeGame(kind: 'music' | 'rest'): GameState {
  const game = collectedGame()
  return {
    ...game,
    activeActivity: {
      runId: `${kind}-run`,
      kind,
      startedAt: 1_000,
      endsAt: 113_000,
      rewardSeed: `${kind}-reward`,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: null,
      usedLuckyApple: false,
    },
  }
}

async function openAlbum() {
  const opener = screen.getAllByRole('button', { name: '打开收藏墙' })[0]
  opener.focus()
  fireEvent.click(opener)
  const dialog = await screen.findByRole('dialog', { name: '饼狗的收藏墙' })
  const close = within(dialog).getByRole('button', { name: '关闭收藏墙' })
  await waitFor(() => expect(close).toHaveFocus())
  return { opener, dialog, close }
}

describe('收藏墙模态框', () => {
  it('圈定焦点、Escape 关闭并将焦点还给入口', async () => {
    const { container } = render(<GameHarness />)
    const { opener, dialog, close } = await openAlbum()
    const card = within(dialog).getByRole('button', { name: /测试明信片/u })
    const backgroundHeader = container.querySelector('.game-hud')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(backgroundHeader).toHaveAttribute('inert')

    card.focus()
    fireEvent.keyDown(card, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(card).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
    expect(backgroundHeader).not.toHaveAttribute('inert')
  })

  it('详情打开时只圈定最上层焦点，关闭后回到原卡片', async () => {
    render(<GameHarness />)
    const { dialog } = await openAlbum()
    const card = within(dialog).getByRole('button', { name: /测试明信片/u })
    card.focus()
    fireEvent.click(card)

    const detail = await screen.findByRole('dialog', { name: '测试明信片' })
    const detailClose = within(detail).getByRole('button', { name: '关闭详情' })
    const sourceLink = within(detail).getByRole('link', { name: /查看素材来源/u })
    await waitFor(() => expect(detailClose).toHaveFocus())
    expect(dialog.querySelector('.album-header')).toHaveAttribute('inert')

    sourceLink.focus()
    fireEvent.keyDown(sourceLink, { key: 'Tab' })
    expect(detailClose).toHaveFocus()

    fireEvent.keyDown(detail, { key: 'Escape' })
    await waitFor(() => expect(detail).not.toBeInTheDocument())
    await waitFor(() => expect(card).toHaveFocus())
    expect(screen.getByRole('dialog', { name: '饼狗的收藏墙' })).toBeInTheDocument()
  })

  it('只展示已获得的分类和卡片，不渲染灰色待解锁内容', () => {
    const lockedMillion = {
      ...postcard,
      id: 'million-shot-test',
      category: 'million-shot',
      title: '尚未获得的百万直拍',
    } as CollectibleItem
    const expandedCatalog: ContentCatalog = {
      items: [postcard, lockedMillion],
      byId: { [postcard.id]: postcard, [lockedMillion.id]: lockedMillion },
      categoryCounts: { postcard: 1, 'million-shot': 1, 'site-first': 0 },
      siteFirstChronology: [],
      friends: [],
      friendById: {},
      videosByBvid: {},
      recordPlayerVideos: [],
    }
    render(
      <GameHome
        game={collectedGame()}
        catalog={expandedCatalog}
        now={1_000}
        panel="album"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '饼狗的收藏墙' })
    expect(within(dialog).getByRole('tab', { name: '明信片' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('tab', { name: '百万直拍' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('尚未获得的百万直拍')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('???')).not.toBeInTheDocument()
  })

  it('收藏播放器桥接事件同时携带收藏 ID 与 BV', () => {
    const onAction = vi.fn()
    render(
      <GameHome
        game={videoCollectedGame()}
        catalog={videoCatalog}
        now={1_000}
        panel="album"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /带视频的收藏/u }))
    fireEvent.click(screen.getByRole('button', { name: '打开播放器' }))

    expect(onAction).toHaveBeenCalledWith({
      type: 'task/event',
      event: {
        type: 'collection-player-opened',
        collectionId: videoCollectible.id,
        bvid: albumVideo.bvid,
      },
      now: expect.any(Number),
    })
  })
})

describe('房间互动', () => {
  it('待机时铺满房间，设施展开信息栏，点房间空白再收起', () => {
    render(<RoomPanelHarness />)

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看房屋玩法说明' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '去电脑前' }))
    expect(screen.getByRole('complementary')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收起信息栏，查看完整房间' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('房间文字按钮派发原子互动，点击饼狗打开可访问菜单', () => {
    const onAction = vi.fn()
    render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel="status"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '弹弹琴' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'room/interact', area: 'piano' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗想做什么' })).toBeInTheDocument()
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task/event',
        event: { type: 'pet-menu-opened' },
      }),
    )
  })

  it('床铺按钮先移动到床边并打开休息面板', () => {
    const onAction = vi.fn()
    const onPanel = vi.fn()
    render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel="status"
        dirty={false}
        reward={null}
        onPanel={onPanel}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '去床边' }))
    expect(onPanel).toHaveBeenCalledWith('rest')
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'room/interact', area: 'bed' }),
    )
  })

  it('冰箱商品按钮只显示 N🍎，不重复补充文案', () => {
    const { container } = render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel="fridge"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    const purchaseButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.shop-item button'),
    )
    expect(purchaseButtons).toHaveLength(5)
    for (const button of purchaseButtons) expect(button).toHaveTextContent(/^\d+🍎$/u)
  })

  it('旅行期间不渲染饼狗，并隐藏门口活动按钮', () => {
    const base = collectedGame()
    const travelling: GameState = {
      ...base,
      pet: { ...base.pet, location: 'outside' },
      activeActivity: {
        runId: 'travel-run',
        kind: 'travel',
        startedAt: 1_000,
        endsAt: 113_000,
        rewardSeed: 'travel-reward',
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
    render(
      <GameHome
        game={travelling}
        catalog={catalog}
        now={2_000}
        panel="activity"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /饼狗.*行动菜单/u })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '去门口' })).not.toBeInTheDocument()
    expect(screen.getByText('饼狗出门啦')).toBeInTheDocument()
  })

  it('休息成功后重播日夜过场', async () => {
    const props = {
      game: collectedGame(),
      catalog,
      now: 1_000,
      panel: 'status' as const,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
    }
    const { container, rerender } = render(<GameHome {...props} restTransitionKey={0} />)
    rerender(<GameHome {...props} restTransitionKey={1} />)
    await waitFor(() =>
      expect(container.querySelector('.day-night-overlay')).toHaveClass('is-playing'),
    )
  })

  it('只改变饼狗休息次数不会绕过 App 触发日夜过场', () => {
    const game = collectedGame()
    const props = {
      catalog,
      now: 1_000,
      panel: 'status' as const,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
    }
    const { container, rerender } = render(<GameHome {...props} game={game} />)

    rerender(
      <GameHome
        {...props}
        game={{ ...game, pet: { ...game.pet, restCount: game.pet.restCount + 1 } }}
      />,
    )

    expect(container.querySelector('.game-page')).not.toHaveClass('is-sleeping')
    expect(container.querySelector('.day-night-overlay')).not.toHaveClass('is-playing')
  })

  it('移除休息过场键时不会被当作一次成功休息', () => {
    const game = collectedGame()
    const props = {
      game,
      catalog,
      now: 1_000,
      panel: 'status' as const,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
    }
    const { container, rerender } = render(<GameHome {...props} restTransitionKey={0} />)

    rerender(<GameHome {...props} />)

    expect(container.querySelector('.game-page')).not.toHaveClass('is-sleeping')
    expect(container.querySelector('.day-night-overlay')).not.toHaveClass('is-playing')
  })

  it('取消或调试清除休息运行时不播放睡醒过场', () => {
    const props = {
      catalog,
      now: 2_000,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      restTransitionKey: 0,
    }
    const { container, rerender } = render(<GameHome {...props} game={activeGame('rest')} />)

    rerender(<GameHome {...props} game={collectedGame()} />)

    expect(container.querySelector('.game-page')).not.toHaveClass('is-sleeping')
    expect(container.querySelector('.day-night-overlay')).not.toHaveClass('is-playing')
  })

  it('新活动开始会关闭饼狗菜单，领取完成后不会恢复旧菜单', () => {
    const props = {
      catalog,
      now: 2_000,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
    }
    const { rerender } = render(<GameHome {...props} game={collectedGame()} />)
    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗想做什么' })).toBeInTheDocument()

    rerender(<GameHome {...props} game={activeGame('music')} />)
    expect(screen.queryByRole('dialog', { name: '饼狗想做什么' })).not.toBeInTheDocument()

    rerender(<GameHome {...props} game={collectedGame()} />)
    expect(screen.queryByRole('dialog', { name: '饼狗想做什么' })).not.toBeInTheDocument()
  })

  it('休息读条一开始就暗场，饼狗脚底落在床面，并提供返回入口', () => {
    const onPanel = vi.fn()
    const { container } = render(
      <GameHome
        game={activeGame('rest')}
        catalog={catalog}
        now={2_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={onPanel}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    const overlay = container.querySelector<HTMLElement>('.day-night-overlay')
    const mascot = screen.getByRole('button', { name: /正在睡觉中的饼狗/u })
    expect(overlay).toHaveClass('is-resting')
    expect(Number(overlay?.style.getPropertyValue('--rest-darkness'))).toBeGreaterThan(0)
    expect(mascot.style.getPropertyValue('--pet-x')).toBe('27%')
    expect(mascot.style.getPropertyValue('--pet-y')).toBe('30%')
    expect(mascot.querySelector('.mascot-sprite--sleep')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(onPanel).toHaveBeenCalledWith('activity')
  })

  it('弹琴读条中仍显示琴键和房间的弹琴设施', () => {
    render(
      <GameHome
        game={activeGame('music')}
        catalog={catalog}
        now={2_000}
        panel="activity"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '弹弹琴' })).toBeInTheDocument()
    const keyboard = screen.getByRole('group', { name: 'C4 到 B5 的两八度琴键' })
    expect(within(keyboard).getAllByRole('button')).toHaveLength(24)
  })
})

describe('舞台测试与调试控件', () => {
  it('同步打开隔离窗口、导航到舞台测试并记录任务事件且不误报拦截', () => {
    const replace = vi.fn()
    const popup = { opener: globalThis, location: { replace }, close: vi.fn() }
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(popup as unknown as Window)
    const onAction = vi.fn()
    render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel="wardrobe"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '开始舞台测试' }))
    expect(open).toHaveBeenCalledWith(
      '',
      '_blank',
      'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes',
    )
    expect(popup.opener).toBeNull()
    expect(replace).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledWith(STAGE_TEST_URL)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task/event',
        event: { type: 'stage-test-opened' },
      }),
    )
    open.mockRestore()
  })

  it('DEBUG 面板不用原生下拉框并提供四个概率滑杆', () => {
    const game = collectedGame()
    render(
      <GameHome
        game={{ ...game, profile: { ...game.profile, debug: true } }}
        catalog={catalog}
        now={1_000}
        panel="debug"
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
      />,
    )

    expect(document.querySelector('select')).not.toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(5)
    expect(screen.getByRole('button', { name: '112 秒' })).toHaveAttribute('aria-pressed', 'true')
  })
})
