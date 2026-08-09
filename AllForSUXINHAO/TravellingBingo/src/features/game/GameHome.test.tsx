import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import type { BilibiliVideo, CollectibleItem, ContentCatalog } from '@/content'
import { createInitialGameState, type GameState } from '@/domain'

import { ACTIVITY_COPY, STAGE_TEST_URL } from './gameCopy'
import { GameHome, type PanelId } from './GameHome'
import { ROOM_AREAS, ROOM_CANVAS } from './roomConfig'

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
  bvid: 'BV1ABCdef234',
  title: '收藏播放器桥接测试',
  authorName: '苏新皓',
  authorMid: 1,
  publishedAt: '2026-06-19T12:00:00.000Z',
  durationSeconds: 112,
  coverUrl: 'https://i0.hdslb.com/video-bridge.jpg',
  sourceUrl: 'https://www.bilibili.com/video/BV1ABCdef234',
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

function RoomPanelHarness({ game = collectedGame() }: { game?: GameState }) {
  const [panel, setPanel] = useState<PanelId | null>(null)
  return (
    <GameHome
      game={game}
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

function RealityStreamHarness() {
  const [panel, setPanel] = useState<PanelId | null>('reality-stream')
  const base = createInitialGameState({ now: 1_000, seed: 'reality-stream-stability' })
  const game: GameState = {
    ...base,
    world: 'reality',
    reality: {
      ...base.reality,
      activeStay: { stayId: 'reality-stream-stay', enteredAt: 1_000 },
    },
  }
  return (
    <GameHome
      game={game}
      catalog={catalog}
      now={2_000}
      panel={panel}
      dirty={false}
      reward={null}
      onPanel={setPanel}
      onAction={vi.fn()}
      onExit={vi.fn()}
      onBackup={vi.fn()}
      onDismissReward={vi.fn()}
      canEnterReality={() => true}
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
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '测试明信片' })).not.toBeInTheDocument(),
    )
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

  it('收藏播放器桥接事件携带收藏 ID 与 BV，且跨面板、维度过场和苹果钟保持同一 iframe', async () => {
    const onAction = vi.fn()
    const commonProps = {
      catalog: videoCatalog,
      now: 1_000,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction,
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      canEnterReality: () => true,
    } as const
    const { rerender } = render(
      <GameHome {...commonProps} game={videoCollectedGame()} panel="album" />,
    )

    fireEvent.click(screen.getByRole('button', { name: /带视频的收藏/u }))

    const detail = screen.getByRole('dialog', { name: '带视频的收藏' })
    const dock = screen.getByTestId('persistent-bilibili-player')
    const iframe = screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    expect(detail).not.toContainElement(dock)
    expect(dock.closest('[inert]')).toBeNull()

    iframe.focus()
    fireEvent.keyDown(iframe, { key: 'Tab' })
    expect(within(detail).getByRole('button', { name: '关闭详情' })).toHaveFocus()

    expect(onAction).toHaveBeenCalledWith({
      type: 'task/event',
      event: {
        type: 'collection-player-opened',
        collectionId: videoCollectible.id,
        bvid: albumVideo.bvid,
      },
      now: expect.any(Number),
    })

    fireEvent.click(within(detail).getByRole('button', { name: '关闭详情' }))
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).toBe(iframe)

    rerender(<GameHome {...commonProps} game={videoCollectedGame()} panel={null} />)
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).toBe(iframe)

    fireEvent.click(screen.getByRole('button', { name: '切换到现实生活维度' }))
    fireEvent.click(screen.getByRole('button', { name: '进入现实维度' }))
    expect(dock).toHaveAttribute('aria-hidden', 'true')
    expect(dock).toHaveAttribute('data-interaction-state', 'disabled')
    expect(iframe).toHaveAttribute('tabindex', '-1')
    for (const control of within(dock).getAllByRole('button', { hidden: true })) {
      expect(control).toBeDisabled()
    }
    expect(screen.getByRole('status', { name: '正在进入现实维度' })).toBeInTheDocument()

    await waitFor(
      () => {
        expect(screen.queryByRole('status', { name: '正在进入现实维度' })).not.toBeInTheDocument()
      },
      { timeout: 1_000 },
    )
    expect(dock).not.toHaveAttribute('aria-hidden')
    expect(dock).toHaveAttribute('data-interaction-state', 'enabled')
    expect(iframe).not.toHaveAttribute('tabindex')
    for (const control of within(dock).getAllByRole('button')) {
      expect(control).toBeEnabled()
    }
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).toBe(iframe)

    rerender(<GameHome {...commonProps} game={videoCollectedGame()} panel="record-player" />)
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).toBe(iframe)

    const focusBase = videoCollectedGame()
    const focusGame: GameState = {
      ...focusBase,
      world: 'reality',
      reality: {
        ...focusBase.reality,
        activeStay: { stayId: 'player-focus-stay', enteredAt: 1_000 },
        pomodoro: {
          ...focusBase.reality.pomodoro,
          session: {
            sessionId: 'player-focus-session',
            status: 'focus',
            startedAt: 1_000,
            focusEndsAt: 1_501_000,
            cycleEndsAt: 1_801_000,
            focusDurationMs: 25 * 60_000,
            breakDurationMs: 5 * 60_000,
            completedAt: null,
            focusNotificationIssuedAt: null,
            completionNotificationIssuedAt: null,
            todoId: null,
            postcardId: null,
          },
        },
      },
    }
    rerender(<GameHome {...commonProps} game={focusGame} panel={null} />)

    expect(screen.getByRole('dialog', { name: '和饼狗一起专注' })).toBeInTheDocument()
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).toBe(iframe)
    expect(iframe).not.toHaveAttribute('inert')
    expect(dock.closest('[inert]')).toBeNull()
  })
})

describe('现实刷播运行时', () => {
  it('切换信息面板时保留正在运行的窗口与轮次状态', async () => {
    const openedWindow = {
      closed: false,
      close: vi.fn(),
      opener: window,
    } as unknown as Window
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(openedWindow)

    const { unmount } = render(<RealityStreamHarness />)
    fireEvent.change(screen.getByRole('textbox', { name: '视频BV号或链接列表' }), {
      target: { value: 'BV1xx411c7mD' },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始刷播' }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledOnce())
    expect(screen.getByText('本轮播放中')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '工作' }))
    expect(screen.getByRole('heading', { name: '苹果钟与待办' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '刷播' }))
    expect(screen.getByText('本轮播放中')).toBeVisible()
    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '视频BV号或链接列表' })).toHaveValue('BV1xx411c7mD')
    expect(openSpy).toHaveBeenCalledOnce()

    unmount()
    expect(openedWindow.close).toHaveBeenCalledOnce()
    openSpy.mockRestore()
  })
})

describe('房间互动', () => {
  it('手动前往左右两侧设施时只在走动期间镜像对应方向', () => {
    vi.useFakeTimers()

    try {
      const { unmount } = render(<RoomPanelHarness />)
      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })

      fireEvent.click(screen.getByRole('button', { name: '去床上' }))
      expect(mascot).toHaveClass('is-walking', 'is-facing-left')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--walk')

      act(() => vi.advanceTimersByTime(619))
      expect(mascot).toHaveClass('is-walking', 'is-facing-left')
      act(() => vi.advanceTimersByTime(1))
      expect(mascot).not.toHaveClass('is-walking', 'is-facing-left')

      fireEvent.click(screen.getByRole('button', { name: '去门口' }))
      expect(mascot).toHaveClass('is-walking')
      expect(mascot).not.toHaveClass('is-facing-left')

      act(() => vi.advanceTimersByTime(620))
      expect(mascot).not.toHaveClass('is-walking', 'is-facing-left')
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('待机漫步后再次前往持久位置相同的设施时仍播放走路动画', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const base = collectedGame()
    const game: GameState = {
      ...base,
      pet: { ...base.pet, location: 'fridge' },
    }

    try {
      const { unmount } = render(<RoomPanelHarness game={game} />)
      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })
      const fridge = ROOM_AREAS.find((area) => area.id === 'fridge')!
      const visibleX = Number.parseFloat(mascot.style.getPropertyValue('--pet-x'))
      const fridgeX = (fridge.petCenter.x / ROOM_CANVAS.width) * 100
      expect(visibleX).not.toBeCloseTo(fridgeX, 5)

      fireEvent.click(screen.getByRole('button', { name: '打开冰箱' }))

      expect(mascot).toHaveClass('is-walking')
      expect(mascot.classList.contains('is-facing-left')).toBe(fridgeX < visibleX)
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--walk')
      act(() => vi.advanceTimersByTime(620))
      expect(mascot).not.toHaveClass('is-walking')
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      randomSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it('待机时始终展示信息栏，设施展开后点房间空白回到任务与兴趣概览', () => {
    render(<RoomPanelHarness />)

    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /和饼狗一起玩吧/u })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看房屋玩法说明' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '去电脑前' }))
    expect(screen.getByRole('complementary')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '回到房间概览' }))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByText('饼狗今天的心情')).toBeInTheDocument()
  })

  it('现实维度没有选中设施时也回退到待机信息页', () => {
    const base = collectedGame()
    render(
      <GameHome
        game={{ ...base, world: 'reality' }}
        catalog={catalog}
        now={1_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={vi.fn()}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
        canEnterReality={() => true}
      />,
    )

    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByText('铲铲饼屋')).toHaveClass('paper-tag')
    expect(screen.getByRole('heading', { name: /和饼狗一起玩吧/u })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: '去床上' }))
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
    expect(purchaseButtons).toHaveLength(7)
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
    expect(screen.queryByText('饼狗出门啦')).not.toBeInTheDocument()
    expect(screen.getAllByText(/旅行中/u).length).toBeGreaterThan(0)
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

  it('休息读条一开始就暗场，饼狗中心落在床面，并提供取消入口', () => {
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
    expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-x'))).toBeCloseTo(
      (225 / 1098) * 100,
      12,
    )
    expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-y'))).toBeCloseTo(
      (300 / 1433) * 100,
      12,
    )
    expect(mascot.querySelector('.mascot-sprite--sleep')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '取消当前活动' }))
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
    const keyboardRows = screen.getAllByRole('group', { name: /^C[3-6] 到 B[3-6] 琴键$/u })
    expect(keyboardRows).toHaveLength(4)
    expect(keyboardRows.flatMap((row) => within(row).getAllByRole('button'))).toHaveLength(48)
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
    expect(screen.getByRole('button', { name: '10 秒' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('V4 壳层接线', () => {
  it('状态条以状态正常为待机文案，并按休息需要与活动阶段派生', () => {
    const base = collectedGame()
    const props = {
      catalog,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
    }
    const { rerender } = render(<GameHome {...props} game={base} now={1_000} />)

    expect(screen.getByRole('status', { name: '饼狗状态' })).toHaveTextContent('状态正常')

    rerender(
      <GameHome {...props} game={{ ...base, pet: { ...base.pet, tired: true } }} now={1_000} />,
    )

    const statusBar = screen.getByRole('status', { name: '饼狗状态' })
    expect(statusBar).toHaveTextContent('今天想先休息')
    expect(statusBar.closest('header')).toHaveClass('game-hud--v4')
    expect(statusBar.parentElement).toHaveClass('game-hud__actions')

    rerender(<GameHome {...props} game={activeGame('music')} now={2_000} />)
    expect(screen.getByRole('status', { name: '饼狗状态' })).toHaveTextContent(
      ACTIVITY_COPY.music.verb,
    )

    rerender(<GameHome {...props} game={activeGame('music')} now={114_000} />)
    expect(screen.getByRole('status', { name: '饼狗状态' })).toHaveTextContent(
      `${ACTIVITY_COPY.music.name}完成了`,
    )
  })

  it('现实停留计时跟随 GameHome 的 now，跨过一小时后切换格式并在回屋后消失', () => {
    const base = collectedGame()
    const realityGame: GameState = {
      ...base,
      world: 'reality',
      reality: {
        ...base.reality,
        activeStay: { stayId: 'game-home-hud-timer', enteredAt: 1_000 },
      },
    }
    const props = {
      catalog,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction: vi.fn(),
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      canEnterReality: () => true,
    }
    const { rerender } = render(<GameHome {...props} game={realityGame} now={62_000} />)

    expect(screen.getByRole('timer', { name: '本次现实停留 01:01' })).toBeInTheDocument()
    rerender(<GameHome {...props} game={realityGame} now={3_662_000} />)
    expect(screen.getByRole('timer', { name: '本次现实停留 01:01:01' })).toBeInTheDocument()
    rerender(<GameHome {...props} game={base} now={3_662_000} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('桌面精细指针环境先介绍现实维度，确认后播放过场再进入', async () => {
    const onAction = vi.fn()
    const game = collectedGame()
    const props = {
      catalog,
      now: 1_000,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction,
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      canEnterReality: () => true,
    }
    render(<GameHome {...props} game={game} />)

    fireEvent.click(screen.getByRole('button', { name: '切换到现实生活维度' }))
    expect(screen.getByRole('dialog', { name: '进入现实维度？' })).toHaveTextContent(
      '完整的工作与休息苹果钟',
    )
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reality/enter' }))

    fireEvent.click(screen.getByRole('button', { name: '进入现实维度' }))
    expect(screen.getByRole('status', { name: '正在进入现实维度' })).toHaveTextContent(
      '去现实维度看看',
    )
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({ type: 'reality/enter', now: expect.any(Number) }),
    )
    expect(props.onPanel).toHaveBeenCalledWith(null)
  })

  it('从现实维度返回饼屋也先确认，可取消或播放过场后返回', async () => {
    const onAction = vi.fn()
    const base = collectedGame()
    const realityGame: GameState = {
      ...base,
      world: 'reality',
      reality: {
        ...base.reality,
        activeStay: { stayId: 'reality-leave-confirmation', enteredAt: 500 },
      },
    }
    render(
      <GameHome
        game={realityGame}
        catalog={catalog}
        now={1_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
        canEnterReality={() => true}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '回到旅行饼狗游戏' }))
    expect(screen.getByRole('dialog', { name: '回到饼屋？' })).toHaveTextContent(
      '结算这次现实维度带回的苹果',
    )
    fireEvent.click(screen.getByRole('button', { name: '先不切换' }))
    expect(screen.queryByRole('dialog', { name: '回到饼屋？' })).not.toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reality/leave' }))

    fireEvent.click(screen.getByRole('button', { name: '回到旅行饼狗游戏' }))
    fireEvent.click(screen.getByRole('button', { name: '回到饼屋' }))
    expect(screen.getByRole('status', { name: '正在回到饼屋' })).toHaveTextContent(
      '回到饼屋继续旅行',
    )
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({ type: 'reality/leave', now: expect.any(Number) }),
    )
  })

  it('非桌面精细指针环境拒绝进入现实维度', () => {
    const onAction = vi.fn()
    render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
        canEnterReality={() => false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '切换到现实生活维度' }))
    expect(screen.getByRole('dialog', { name: '请使用电脑浏览器' })).toHaveTextContent(
      '鼠标或触控板',
    )
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reality/enter' }))

    fireEvent.click(screen.getByRole('button', { name: '知道了' }))
    expect(screen.queryByRole('dialog', { name: '请使用电脑浏览器' })).not.toBeInTheDocument()
  })

  it('确认期间失去桌面精细指针能力时重新拒绝进入', () => {
    const onAction = vi.fn()
    let supported = true
    render(
      <GameHome
        game={collectedGame()}
        catalog={catalog}
        now={1_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={vi.fn()}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
        canEnterReality={() => supported}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '切换到现实生活维度' }))
    supported = false
    fireEvent.click(screen.getByRole('button', { name: '进入现实维度' }))

    expect(screen.getByRole('dialog', { name: '请使用电脑浏览器' })).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reality/enter' }))
  })

  it('非 PC 恢复现实维度存档时要求用户显式返回饼屋', async () => {
    const onAction = vi.fn()
    const onPanel = vi.fn()
    const base = collectedGame()
    const restoredRealityGame: GameState = {
      ...base,
      world: 'reality',
      reality: {
        ...base.reality,
        activeStay: { stayId: 'restored-reality-stay', enteredAt: 500 },
        pomodoro: {
          ...base.reality.pomodoro,
          session: {
            sessionId: 'restored-reality-pomodoro',
            status: 'focus',
            startedAt: 500,
            focusEndsAt: 1_500_500,
            cycleEndsAt: 1_800_500,
            focusDurationMs: 25 * 60_000,
            breakDurationMs: 5 * 60_000,
            completedAt: null,
            focusNotificationIssuedAt: null,
            completionNotificationIssuedAt: null,
            todoId: null,
            postcardId: null,
          },
        },
      },
    }
    render(
      <GameHome
        game={restoredRealityGame}
        catalog={catalog}
        now={1_000}
        panel={null}
        dirty={false}
        reward={null}
        onPanel={onPanel}
        onAction={onAction}
        onExit={vi.fn()}
        onBackup={vi.fn()}
        onDismissReward={vi.fn()}
        canEnterReality={() => false}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '先回到饼屋' })
    const focusDialog = screen.getByRole('dialog', { name: '和饼狗一起专注' })
    const returnButton = screen.getByRole('button', { name: '返回饼屋' })
    expect(dialog).toHaveTextContent('当前浏览器不支持继续')
    expect(focusDialog.closest('[inert]')).not.toBeNull()
    await waitFor(() => expect(returnButton).toHaveFocus())
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'reality/leave' }))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '先回到饼屋' })).toBeInTheDocument()

    fireEvent.click(returnButton)
    expect(screen.getByRole('status', { name: '正在回到饼屋' })).toBeInTheDocument()
    await waitFor(() => {
      expect(onPanel).toHaveBeenCalledWith(null)
      expect(onAction).toHaveBeenCalledWith({ type: 'reality/leave', now: expect.any(Number) })
    })
  })

  it('现实返回后由待结算弹窗确认奖励', () => {
    const onAction = vi.fn()
    const game = collectedGame()
    const props = {
      catalog,
      now: 1_000,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction,
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      canEnterReality: () => true,
    }

    const pendingGame: GameState = {
      ...game,
      reality: {
        ...game.reality,
        pendingSettlement: {
          stayId: 'reality-stay-1',
          enteredAt: 1_000,
          leftAt: 1_201_000,
          fullRewardApples: 2,
        },
      },
    }
    render(<GameHome {...props} game={pendingGame} />)
    fireEvent.click(screen.getByRole('button', { name: '没有🥺' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'reality/settle',
      stayId: 'reality-stay-1',
      decision: 'not-serious',
      now: expect.any(Number),
    })
  })

  it('房间 ↩️ 只消费一次取消请求，先打开二次确认且不会直接终止活动', async () => {
    const onAction = vi.fn()

    function ActiveHarness() {
      const [panel, setPanel] = useState<PanelId | null>(null)
      return (
        <GameHome
          game={activeGame('rest')}
          catalog={catalog}
          now={2_000}
          panel={panel}
          dirty={false}
          reward={null}
          onPanel={setPanel}
          onAction={onAction}
          onExit={vi.fn()}
          onBackup={vi.fn()}
          onDismissReward={vi.fn()}
        />
      )
    }

    render(<ActiveHarness />)
    fireEvent.click(screen.getByRole('button', { name: '取消当前活动' }))
    expect(await screen.findByRole('group', { name: '确认取消活动' })).toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'activity/cancel' }))

    fireEvent.click(screen.getByRole('button', { name: '继续活动' }))
    expect(screen.queryByRole('group', { name: '确认取消活动' })).not.toBeInTheDocument()
  })

  it('苹果钟全屏锁定明信片，并让待办和唯一播放器在专注、休息阶段持续可交互', async () => {
    const base = collectedGame()
    const focusCatalog: ContentCatalog = {
      ...catalog,
      videosByBvid: { [albumVideo.bvid]: albumVideo },
      recordPlayerVideos: [albumVideo],
    }
    const focusGame: GameState = {
      ...base,
      world: 'reality',
      reality: {
        ...base.reality,
        activeStay: { stayId: 'reality-pomodoro-stay', enteredAt: 1_000 },
        todos: {
          'focus-todo': {
            id: 'focus-todo',
            title: '整理材料',
            createdAt: 1_000,
            updatedAt: 1_000,
            dueAt: null,
            completedAt: null,
            notificationIssuedAt: null,
          },
        },
        pomodoro: {
          ...base.reality.pomodoro,
          selectedPostcardId: null,
          session: {
            sessionId: 'pomodoro-room-request',
            status: 'focus',
            startedAt: 1_000,
            focusEndsAt: 1_501_000,
            cycleEndsAt: 1_801_000,
            focusDurationMs: 25 * 60_000,
            breakDurationMs: 5 * 60_000,
            completedAt: null,
            focusNotificationIssuedAt: null,
            completionNotificationIssuedAt: null,
            todoId: null,
            postcardId: postcard.id,
          },
        },
      },
    }
    const onAction = vi.fn()
    const commonFocusProps = {
      catalog: focusCatalog,
      panel: null,
      dirty: false,
      reward: null,
      onPanel: vi.fn(),
      onAction,
      onExit: vi.fn(),
      onBackup: vi.fn(),
      onDismissReward: vi.fn(),
      canEnterReality: () => true,
    } as const
    const { rerender } = render(<GameHome {...commonFocusProps} game={focusGame} now={2_000} />)

    const focusDialog = screen.getByRole('dialog', { name: '和饼狗一起专注' })
    expect(focusDialog.closest('[data-background-id]')).toHaveAttribute(
      'data-background-id',
      postcard.id,
    )
    expect(
      focusDialog.closest('[data-background-id]')?.querySelector('.pomodoro-focus__background'),
    ).toHaveAttribute('src', '/assets/collectibles/postcards/test.webp')
    expect(screen.getByText('24:59')).toBeVisible()
    expect(document.querySelector('.game-layout')).toHaveAttribute('inert')
    expect(focusDialog.querySelector('.pomodoro-focus__info')).not.toHaveClass('is-compact')

    fireEvent.click(screen.getByRole('checkbox', { name: '标记为已完成：整理材料' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'todo/completion-set',
      todoId: 'focus-todo',
      completed: true,
      now: expect.any(Number),
    })

    fireEvent.change(screen.getByLabelText('新待办'), { target: { value: '  写专注记录  ' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'todo/create',
      todoId: expect.any(String),
      title: '写专注记录',
      now: expect.any(Number),
    })

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('待办标题'), { target: { value: '整理全部材料' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'todo/update',
      todoId: 'focus-todo',
      title: '整理全部材料',
      now: expect.any(Number),
    })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '先不删除' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'todo/delete',
      todoId: 'focus-todo',
      now: expect.any(Number),
    })

    fireEvent.click(screen.getByRole('button', { name: '播放全站第一' }))
    const player = await screen.findByRole('complementary', { name: '持久播放器' })
    expect(screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')).not.toHaveAttribute(
      'inert',
    )
    expect(focusDialog).not.toContainElement(player)
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    expect(player.closest('[inert]')).toBeNull()
    expect(focusDialog.querySelector('.pomodoro-focus__info')).toHaveClass('is-compact')

    const focusIframe = screen.getByTitle('Bilibili 外链播放器：收藏播放器桥接测试')
    focusIframe.focus()
    fireEvent.keyDown(focusIframe, { key: 'Tab' })
    expect(focusDialog.querySelector('.pomodoro-focus__info')).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '隐藏画面' }))
    expect(focusDialog.querySelector('.pomodoro-focus__info')).not.toHaveClass('is-compact')

    const breakGame: GameState = {
      ...focusGame,
      reality: {
        ...focusGame.reality,
        pomodoro: {
          ...focusGame.reality.pomodoro,
          session: {
            ...focusGame.reality.pomodoro.session!,
            status: 'break',
            focusNotificationIssuedAt: 1_501_000,
          },
        },
      },
    }
    rerender(<GameHome {...commonFocusProps} game={breakGame} now={1_502_000} />)

    const breakDialog = screen.getByRole('dialog', { name: '休息一下吧' })
    expect(screen.getByText('04:59')).toBeVisible()
    expect(breakDialog).not.toContainElement(
      screen.getByRole('complementary', { name: '持久播放器' }),
    )
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '取消本次计时' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '继续休息' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '确认取消' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'pomodoro/cancel',
      sessionId: 'pomodoro-room-request',
      now: expect.any(Number),
    })
  })

  it('点击灰态电脑热点立即打开唯一的共享活力确认，确认后只使用魔法', async () => {
    const base = collectedGame()
    const game: GameState = {
      ...base,
      inventory: {
        ...base.inventory,
        'signal-headphones': 1,
        'trend-toolbox': 1,
        'bottled-vitality-magic': 1,
      },
      pet: {
        ...base.pet,
        tired: false,
        preferences: { travel: true, computer: false, music: true },
      },
    }
    const onAction = vi.fn()

    function ReluctantComputerHarness() {
      const [panel, setPanel] = useState<PanelId | null>(null)
      return (
        <GameHome
          game={game}
          catalog={catalog}
          now={1_000}
          panel={panel}
          dirty={false}
          reward={null}
          onPanel={setPanel}
          onAction={onAction}
          onExit={vi.fn()}
          onBackup={vi.fn()}
          onDismissReward={vi.fn()}
        />
      )
    }

    render(<ReluctantComputerHarness />)
    fireEvent.click(screen.getByRole('button', { name: '去电脑前' }))

    expect(await screen.findAllByRole('group', { name: '确认使用活力魔法' })).toHaveLength(1)
    expect(screen.queryByText('认真刷播和全力冲热共享同一份“电脑”意愿。')).not.toBeInTheDocument()
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'activity/start' }))

    fireEvent.click(screen.getByRole('button', { name: '使用活力魔法' }))
    expect(onAction).toHaveBeenCalledWith({ type: 'magic/vitality-use', now: expect.any(Number) })
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'activity/start' }))
  })
})
