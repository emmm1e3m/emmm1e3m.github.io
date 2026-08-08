import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import type { CollectibleItem, ContentCatalog } from '@/content'
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

function GameHarness() {
  const [panel, setPanel] = useState<PanelId>('status')
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

async function openAlbum() {
  const opener = screen.getAllByRole('button', { name: '打开收藏墙' })[0]
  opener.focus()
  fireEvent.click(opener)
  const dialog = await screen.findByRole('dialog', { name: '一路珍藏的风景' })
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
    expect(screen.getByRole('dialog', { name: '一路珍藏的风景' })).toBeInTheDocument()
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

    const dialog = screen.getByRole('dialog', { name: '一路珍藏的风景' })
    expect(within(dialog).getByRole('tab', { name: '明信片' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('tab', { name: '百万直拍' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('尚未获得的百万直拍')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('???')).not.toBeInTheDocument()
  })
})

describe('房间互动', () => {
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

  it('床铺按钮直接让饼狗休息', () => {
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

    fireEvent.click(screen.getByRole('button', { name: '去床边' }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'pet/rest' }))
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
          friendEventId: null,
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
    expect(screen.getAllByRole('slider')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '112 秒' })).toHaveAttribute('aria-pressed', 'true')
  })
})
