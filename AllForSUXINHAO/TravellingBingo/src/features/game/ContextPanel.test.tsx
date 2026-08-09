import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { BilibiliVideo, ContentCatalog } from '@/content'
import { createInitialGameState, type GameAction, type GameState } from '@/domain'
import { BilibiliPlayerProvider, PersistentPlayerDock } from '@/features/player'
import type { StreamPlaybackController } from '@/features/reality'

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

function gameWithSpeedMagic(): GameState {
  const game = gameWithActiveTravel()
  return {
    ...game,
    inventory: { ...game.inventory, 'bottled-speed-magic': 1 },
  }
}

function gameWithReluctantComputer(withVitalityMagic = true): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'context-panel-vitality' })
  return {
    ...game,
    inventory: {
      ...game.inventory,
      'signal-headphones': 1,
      'trend-toolbox': 1,
      'bottled-vitality-magic': withVitalityMagic ? 1 : 0,
    },
    pet: {
      ...game.pet,
      tired: false,
      preferences: { travel: true, computer: false, music: true },
    },
  }
}

function gameInReality(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'context-panel-reality' })
  return {
    ...game,
    world: 'reality',
    reality: {
      ...game.reality,
      activeStay: { stayId: 'reality-stay-test', enteredAt: 1_000 },
    },
  }
}

function idleStreamPlayback(): StreamPlaybackController {
  return {
    state: {
      status: 'idle',
      round: 0,
      mode: null,
      sourceInput: '',
      parsedBvids: [],
      openedCount: 0,
      message: '尚未开始刷播',
      errors: [],
    },
    start: vi.fn(() => ({ ok: true as const, bvids: [], errors: [] as const })),
    resume: vi.fn(() => true),
    stop: vi.fn(),
    getRemainingMs: vi.fn(() => null),
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
  streamPlayback: idleStreamPlayback(),
  streamRoundDurationSeconds: 310,
  onStreamRoundDurationChange: vi.fn(),
}

function PlayerHarness({ children }: { children: ReactNode }) {
  const game = createInitialGameState({ now: 1_000, seed: 'player-harness' })
  return (
    <BilibiliPlayerProvider
      state={game.musicPlayer}
      onAction={() => undefined}
      tracks={recordVideos}
    >
      {children}
      <PersistentPlayerDock />
    </BilibiliPlayerProvider>
  )
}

function ControlledPlayerHarness({
  game,
  children,
  onAction = () => undefined,
}: {
  game: GameState
  children: ReactNode
  onAction?: (action: Extract<GameAction, { type: `music/${string}` }>) => void
}) {
  return (
    <BilibiliPlayerProvider state={game.musicPlayer} onAction={onAction} tracks={recordVideos}>
      {children}
      <PersistentPlayerDock />
    </BilibiliPlayerProvider>
  )
}

describe('ContextPanel 信息栏交互', () => {
  it('PanelHeader 保持左侧标签，并且不再重复提供收起信息栏按钮', () => {
    render(
      <ContextPanel
        {...commonProps}
        panel="status"
        game={createInitialGameState({ now: 1_000, seed: 'panel-header' })}
      />,
    )

    expect(screen.getByText('铲铲饼屋')).toHaveClass('paper-tag')
    expect(screen.queryByRole('button', { name: '收起信息栏' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /和饼狗一起玩吧/u })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '饼狗今天的心情' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '和饼狗一起做三件小事' })).toBeInTheDocument()
  })

  it('活动中的待机信息页提示点击饼狗查看进度', () => {
    render(<ContextPanel {...commonProps} panel="status" game={gameWithActiveTravel()} />)

    expect(screen.getByText(/点击饼狗可以查看进度/u)).toBeInTheDocument()
    expect(screen.queryByText(/点顶栏可以查看进度/u)).not.toBeInTheDocument()
  })

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

  it('消费 RoomScene 外部取消请求并回执 token', async () => {
    const onCancelRequestHandled = vi.fn()
    render(
      <ContextPanel
        {...commonProps}
        panel="activity"
        game={gameWithActiveTravel()}
        cancelRequestToken={7}
        onCancelRequestHandled={onCancelRequestHandled}
      />,
    )

    const safeButton = await screen.findByRole('button', { name: '继续活动' })
    await waitFor(() => expect(safeButton).toHaveFocus())
    expect(onCancelRequestHandled).toHaveBeenCalledOnce()
    expect(onCancelRequestHandled).toHaveBeenCalledWith(7)
  })

  it('电脑灰态热点只打开一份共享活力确认，不替用户猜选刷播或冲热', async () => {
    const onAction = vi.fn()
    const onHandled = vi.fn()
    const request = {
      token: 17,
      panel: 'computer' as const,
      kind: null,
      interest: 'computer' as const,
    }
    const props = {
      ...commonProps,
      panel: 'computer' as const,
      game: gameWithReluctantComputer(),
      onAction,
      vitalityPromptRequest: request,
      onVitalityPromptRequestHandled: onHandled,
    }
    const { rerender } = render(<ContextPanel {...props} />)

    expect(screen.queryByText('认真刷播和全力冲热共享同一份“电脑”意愿。')).not.toBeInTheDocument()
    expect(await screen.findAllByRole('group', { name: '确认使用活力魔法' })).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('button', { name: '先不使用' })).toHaveFocus())
    expect(onHandled).toHaveBeenCalledOnce()
    expect(onHandled).toHaveBeenCalledWith(17)
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByLabelText('使用活力魔法'), { key: 'Escape' })
    await waitFor(() => expect(screen.getByLabelText('使用活力魔法')).toHaveFocus())
    rerender(<ContextPanel {...props} />)
    expect(screen.queryByRole('group', { name: '确认使用活力魔法' })).not.toBeInTheDocument()
    expect(onHandled).toHaveBeenCalledOnce()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('共享活力确认只派发魔法动作，没有魔法时则立即拒绝且不开始活动', async () => {
    const onAction = vi.fn()
    const { rerender } = render(
      <ContextPanel
        {...commonProps}
        panel="computer"
        game={gameWithReluctantComputer()}
        onAction={onAction}
        vitalityPromptRequest={{ token: 18, panel: 'computer', kind: null, interest: 'computer' }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '使用活力魔法' }))
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({ type: 'magic/vitality-use', now: expect.any(Number) })
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'activity/start' }))

    onAction.mockClear()
    rerender(
      <ContextPanel
        {...commonProps}
        panel="computer"
        game={gameWithReluctantComputer(false)}
        onAction={onAction}
        vitalityPromptRequest={{ token: 19, panel: 'computer', kind: null, interest: 'computer' }}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('冰箱里还没有瓶装活力魔法')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('速度魔法必须二次确认后才派发当前 run 的使用动作', async () => {
    const onAction = vi.fn()
    render(
      <ContextPanel
        {...commonProps}
        panel="activity"
        game={gameWithSpeedMagic()}
        onAction={onAction}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '使用速度魔法' }))
    expect(onAction).not.toHaveBeenCalled()

    const safeButton = screen.getByRole('button', { name: '继续等待' })
    await waitFor(() => expect(safeButton).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: '确认使用' }))

    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({
      type: 'magic/speed-use',
      runId: 'active-travel',
      now: expect.any(Number),
    })
  })

  it('活动中没有速度魔法时不展示零库存魔法卡', () => {
    render(<ContextPanel {...commonProps} panel="activity" game={gameWithActiveTravel()} />)

    expect(screen.queryByText('瓶装速度魔法')).not.toBeInTheDocument()
    expect(screen.queryByText('冰箱里还没有速度魔法')).not.toBeInTheDocument()
  })

  it('冰箱展示两种魔法道具 emoji，标题不再重复“为冰箱”', () => {
    const game = createInitialGameState({ now: 1_000, seed: 'fridge-magic-items' })
    const { rerender } = render(<ContextPanel {...commonProps} panel="fridge" game={game} />)

    expect(screen.getByRole('heading', { name: '补充道具' })).toBeInTheDocument()
    expect(screen.queryByText(/为冰箱/u)).not.toBeInTheDocument()
    const speedCard = screen.getByText('瓶装速度魔法').closest('article')
    const vitalityCard = screen.getByText('瓶装活力魔法').closest('article')
    expect(speedCard).toHaveTextContent('⚡')
    expect(vitalityCard).toHaveTextContent('✨')
    expect(speedCard).not.toHaveTextContent(/现有\s*0\s*份/u)
    expect(vitalityCard).not.toHaveTextContent(/现有\s*0\s*份/u)

    rerender(
      <ContextPanel
        {...commonProps}
        panel="fridge"
        game={{
          ...game,
          inventory: {
            ...game.inventory,
            'bottled-speed-magic': 2,
            'bottled-vitality-magic': 1,
          },
        }}
      />,
    )
    expect(screen.getByText('瓶装速度魔法').closest('article')).toHaveTextContent(/现有\s*2\s*份/u)
    expect(screen.getByText('瓶装活力魔法').closest('article')).toHaveTextContent(/现有\s*1\s*份/u)
  })

  it('旅行面板移除重复的外层旅行和门口文案', () => {
    render(
      <ContextPanel
        {...commonProps}
        panel="travel"
        game={createInitialGameState({ now: 1_000, seed: 'travel-copy' })}
      />,
    )

    expect(screen.getByText('行前准备')).toBeInTheDocument()
    expect(screen.queryByText('门口的旅行计划')).not.toBeInTheDocument()
    expect(screen.queryByText('准备好再出门')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '出去旅行' })).toBeInTheDocument()
  })

  it('唱片列表使用原生列表项，并通过持久 controller 主动请求曲目', () => {
    const onTaskEvent = vi.fn()
    render(
      <PlayerHarness>
        <ContextPanel
          {...commonProps}
          panel="record-player"
          game={createInitialGameState({ now: 1_000, seed: 'record-list-semantics' })}
          onTaskEvent={onTaskEvent}
        />
      </PlayerHarness>,
    )

    const list = screen.getByRole('list', { name: '全站第一曲目' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(recordVideos.length)
    expect(items.every((item) => item.tagName === 'LI')).toBe(true)

    const first = within(items[0]!).getByRole('button', { name: /第一首测试唱片/u })
    const second = within(items[1]!).getByRole('button', { name: /第二首测试唱片/u })
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(second)
    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(onTaskEvent).toHaveBeenCalledOnce()
    expect(onTaskEvent).toHaveBeenCalledWith({
      type: 'record-player-opened',
      bvid: recordVideos[1]!.bvid,
    })

    const iframe = screen.getByTitle('Bilibili 外链播放器：第二首测试唱片')
    expect(screen.getAllByTestId('persistent-bilibili-player')).toHaveLength(1)
    fireEvent.load(iframe)
    fireEvent.error(iframe)
    fireEvent.abort(iframe)
    expect(onTaskEvent).toHaveBeenCalledOnce()
  })

  it('唱片选中态跟随受控领域状态，不依赖旧 iframe 请求', () => {
    const baseGame = createInitialGameState({ now: 1_000, seed: 'controlled-record-selection' })
    const game: GameState = {
      ...baseGame,
      musicPlayer: {
        ...baseGame.musicPlayer,
        currentBvid: recordVideos[1]!.bvid,
        currentIndex: 1,
      },
    }

    render(
      <ControlledPlayerHarness game={game}>
        <ContextPanel {...commonProps} panel="record-player" game={game} />
      </ControlledPlayerHarness>,
    )

    expect(screen.getByRole('button', { name: /第一首测试唱片/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /第二首测试唱片/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('唱片机只展示唯一的全站第一曲库，不再提供自定义 BV 或播放列表入口', () => {
    const game = createInitialGameState({ now: 1_000, seed: 'single-record-library' })
    render(
      <ControlledPlayerHarness game={game}>
        <ContextPanel {...commonProps} panel="record-player" game={game} />
      </ControlledPlayerHarness>,
    )

    expect(screen.getByRole('heading', { name: '放点音乐' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: '为房间添加一点音乐' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '八首全站第一' })).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('现实刷播、冲热和工作入口直接展示各自内容，不再嵌套 Dashboard 标签页', () => {
    const onNavigate = vi.fn()
    const dataGame = gameInReality()
    const streamPlayback = idleStreamPlayback()
    const { container, rerender } = render(
      <ContextPanel
        {...commonProps}
        panel="reality-stream"
        game={dataGame}
        onNavigate={onNavigate}
        streamPlayback={streamPlayback}
      />,
    )

    expect(screen.getByRole('heading', { name: '视频刷播' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(container.querySelector('.context-panel__topline')).not.toBeInTheDocument()

    rerender(
      <ContextPanel
        {...commonProps}
        panel="reality-trend"
        game={dataGame}
        onNavigate={onNavigate}
        streamPlayback={streamPlayback}
      />,
    )
    expect(screen.getByRole('heading', { name: '冲热刷播，奖品多多' })).toBeInTheDocument()

    rerender(
      <ContextPanel
        {...commonProps}
        panel="reality-work"
        game={dataGame}
        onNavigate={onNavigate}
        streamPlayback={streamPlayback}
      />,
    )
    expect(screen.getByRole('heading', { name: '苹果钟与待办' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(container.querySelector('.context-panel__topline')).toHaveTextContent('工作')
    expect(container.querySelector('.context-panel__topline')).not.toHaveTextContent('一楼电脑')
    expect(container.querySelector('.reality-panel__mark')).toBeNull()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('工作面板只转交通知请求、苹果钟和待办领域动作', () => {
    const onAction = vi.fn()
    const onRequestNotificationPermission = vi.fn()
    render(
      <ContextPanel
        {...commonProps}
        panel="reality-work"
        game={gameInReality()}
        onAction={onAction}
        notificationPermission="default"
        onRequestNotificationPermission={onRequestNotificationPermission}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '开启提醒' }))
    expect(onRequestNotificationPermission).toHaveBeenCalledOnce()

    expect(screen.queryByRole('button', { name: /^5 分钟/u })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^90 分钟/u }))
    fireEvent.click(screen.getByRole('button', { name: '开始苹果钟' }))
    expect(onAction).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'pomodoro/start' }))
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'pomodoro/start',
      durationMs: 90 * 60_000,
      now: expect.any(Number),
    })

    fireEvent.change(screen.getByLabelText('新待办'), { target: { value: '整理材料' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'todo/create',
      todoId: expect.any(String),
      title: '整理材料',
      now: expect.any(Number),
    })
  })
})
