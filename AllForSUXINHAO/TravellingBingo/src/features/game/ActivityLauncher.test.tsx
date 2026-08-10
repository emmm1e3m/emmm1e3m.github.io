import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog } from '@/content'
import {
  createInitialGameState,
  reduceGame,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
} from '@/domain'
import type { StreamPlaybackController, VisitorStreamController } from '@/features/reality'

import { ActivityLauncher } from './ActivityLauncher'
import { ContextPanel } from './ContextPanel'
import { ACTIVITY_COPY } from './gameCopy'

const catalog: CollectionCatalog = {
  postcard: ['postcard-test'],
  'million-shot': ['million-shot-test'],
  'site-first': ['site-first-test'],
  siteFirstChronology: ['site-first-test'],
}

const millionShot = {
  id: 'million-shot-test',
  category: 'million-shot',
  title: '测试百万直拍',
} as CollectibleItem

const siteFirst = {
  id: 'site-first-test',
  category: 'site-first',
  title: '测试全站第一',
  metadata: { chronology: 1 },
} as CollectibleItem

const contentCatalog: ContentCatalog = {
  items: [millionShot, siteFirst],
  byId: {
    [millionShot.id]: millionShot,
    [siteFirst.id]: siteFirst,
  },
  categoryCounts: { postcard: 0, 'million-shot': 1, 'site-first': 1 },
  siteFirstChronology: [siteFirst.id],
  friends: [],
  friendById: {},
  videosByBvid: {},
  recordPlayerVideos: [],
  streamVideos: [],
}

function idleStreamPlayback(): StreamPlaybackController {
  return {
    state: {
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
    },
    start: vi.fn(() => ({ ok: true as const, bvid: null, errors: [] as const })),
    resume: vi.fn(() => true),
    stop: vi.fn(),
    getRemainingMs: vi.fn(() => null),
    getStopRemainingMs: vi.fn(() => null),
  }
}

function idleVisitorStreamPlayback(): VisitorStreamController {
  return {
    state: {
      status: 'idle',
      startedAt: null,
      round: 0,
      completedRounds: 0,
      frames: [],
      bvids: [],
      videoIntervalMs: 8_000,
      roundIntervalMs: 310_000,
      message: '游客刷播未运行',
    },
    start: vi.fn(() => true),
    stop: vi.fn(),
    getNextRoundRemainingMs: vi.fn(() => null),
  }
}

function playableGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'lucky-apple-ui-test' })
  return {
    ...game,
    inventory: {
      ...game.inventory,
      'travel-basic': 1,
      'signal-headphones': 1,
      'trend-toolbox': 1,
      'lucky-apple': 2,
    },
    pet: {
      ...game.pet,
      preferences: { travel: true, computer: true, music: true },
      tired: false,
    },
    gameBalance: {
      ...game.gameBalance,
      probabilities: { ...game.gameBalance.probabilities, postcard: 1 },
    },
  }
}

function unwillingGame(withVitalityMagic = false): GameState {
  const game = playableGame()
  return {
    ...game,
    inventory: {
      ...game.inventory,
      'bottled-vitality-magic': withVitalityMagic ? 1 : 0,
    },
    pet: {
      ...game.pet,
      preferences: { ...game.pet.preferences, computer: false },
    },
  }
}

function renderLauncher(
  kind: ActivityKind,
  game: GameState,
  onAction = vi.fn(),
  handlers: { onNeedSupplies?: () => void; onNeedRest?: () => void } = {},
) {
  const onNeedSupplies = handlers.onNeedSupplies ?? vi.fn()
  const onNeedRest = handlers.onNeedRest ?? vi.fn()
  const view = render(
    <ActivityLauncher
      kind={kind}
      game={game}
      catalog={catalog}
      onAction={onAction}
      onNeedSupplies={onNeedSupplies}
      onNeedRest={onNeedRest}
    />,
  )
  return { ...view, onAction, onNeedSupplies, onNeedRest }
}

describe('活动场景标题', () => {
  it('旅行面板只保留面板标题与活动名，不再重复“门口计划”', () => {
    render(
      <ContextPanel
        panel="travel"
        game={playableGame()}
        catalog={contentCatalog}
        now={1_000}
        onNavigate={vi.fn()}
        onAction={vi.fn()}
        onBackup={vi.fn()}
        onTaskEvent={vi.fn()}
        streamPlayback={idleStreamPlayback()}
        visitorStreamPlayback={idleVisitorStreamPlayback()}
        streamVideoIntervalMs={8_000}
        onStreamVideoIntervalChange={vi.fn()}
        streamRoundDurationSeconds={310}
        onStreamRoundDurationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '出去旅行' })).toBeInTheDocument()
    expect(screen.queryByText('门口计划')).not.toBeInTheDocument()
    expect(screen.queryByText('门口的旅行计划')).not.toBeInTheDocument()
    expect(screen.queryByText('准备好再出门')).not.toBeInTheDocument()
  })
})

describe('活动入口反馈', () => {
  it('库存不足时只显示简短的补充物品文案', () => {
    const game = playableGame()
    const onNeedSupplies = vi.fn()
    renderLauncher(
      'stream',
      {
        ...game,
        inventory: { ...game.inventory, 'signal-headphones': 0 },
      },
      vi.fn(),
      { onNeedSupplies },
    )

    const replenishButton = screen.getByRole('button', { name: '补充信号耳机' })
    expect(screen.queryByText(/为冰箱/u)).not.toBeInTheDocument()
    fireEvent.click(replenishButton)
    expect(onNeedSupplies).toHaveBeenCalledOnce()
  })

  it('没有活力魔法时，灰态按钮只播报拒绝提示，由独立按钮前往床铺', () => {
    const onNeedRest = vi.fn()
    const { onAction } = renderLauncher('stream', unwillingGame(), vi.fn(), { onNeedRest })
    const launchButton = screen.getByRole('button', { name: '问问饼狗要不要认真刷播' })

    expect(launchButton).not.toHaveAttribute('aria-disabled')
    expect(launchButton).toBeEnabled()
    expect(launchButton).toHaveAccessibleDescription(/饼狗今天不想坐在电脑前/u)
    fireEvent.click(launchButton)

    expect(onAction).not.toHaveBeenCalled()
    expect(onNeedRest).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: '确认认真刷播' })).not.toBeInTheDocument()
    const firstAlert = screen.getByRole('alert')
    expect(firstAlert).toHaveTextContent('饼狗今天不想坐在电脑前，可以休息后再问问。')
    fireEvent.click(launchButton)
    expect(screen.getByRole('alert')).not.toBe(firstAlert)
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '去床铺休息' }))
    expect(onNeedRest).toHaveBeenCalledOnce()
  })

  it('有活力魔法时先询问使用，确认后仍需再次明确启动活动', async () => {
    const game = unwillingGame(true)
    const onAction = vi.fn()
    const onNeedRest = vi.fn()
    const { rerender } = renderLauncher('stream', game, onAction, { onNeedRest })
    let launchButton = screen.getByRole('button', { name: '问问饼狗要不要认真刷播' })

    expect(launchButton).not.toHaveAttribute('aria-disabled')
    expect(launchButton).toBeEnabled()
    expect(launchButton).toHaveAccessibleDescription(/冰箱里有活力魔法/u)
    fireEvent.click(launchButton)

    const vitalityConfirm = screen.getByRole('group', { name: '确认使用活力魔法' })
    const cancelVitality = screen.getByRole('button', { name: '先不使用' })
    expect(onAction).not.toHaveBeenCalled()
    await waitFor(() => expect(cancelVitality).toHaveFocus())

    fireEvent.keyDown(vitalityConfirm, { key: 'Escape' })
    launchButton = screen.getByRole('button', { name: '问问饼狗要不要认真刷播' })
    await waitFor(() => expect(launchButton).toHaveFocus())
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.click(launchButton)
    fireEvent.click(screen.getByRole('button', { name: '使用活力魔法' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenLastCalledWith({
      type: 'magic/vitality-use',
      now: expect.any(Number),
    })
    expect(onNeedRest).not.toHaveBeenCalled()
    launchButton = screen.getByRole('button', { name: '问问饼狗要不要认真刷播' })
    await waitFor(() => expect(launchButton).toHaveFocus())

    const vitalityAction = onAction.mock.calls[0]?.[0] as GameAction
    const vitalityTransition = reduceGame(game, vitalityAction, catalog)
    expect(vitalityTransition.ok).toBe(true)
    if (!vitalityTransition.ok) throw new Error(vitalityTransition.error.message)
    const energizedGame = vitalityTransition.state
    rerender(
      <ActivityLauncher
        kind="stream"
        game={energizedGame}
        catalog={catalog}
        onAction={onAction}
        onNeedSupplies={vi.fn()}
        onNeedRest={onNeedRest}
      />,
    )

    launchButton = screen.getByRole('button', { name: '准备认真刷播' })
    expect(onAction).toHaveBeenCalledTimes(1)
    fireEvent.click(launchButton)
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group', { name: '确认认真刷播' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(onAction).toHaveBeenCalledTimes(2)
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'activity/start', kind: 'stream' }),
    )
  })

  it('灰态房间热点的一次性 token 会直接打开活力确认，Escape 后不重复消费', async () => {
    const game = unwillingGame(true)
    const onAction = vi.fn()
    const onHandled = vi.fn()
    const props = {
      kind: 'stream' as const,
      game,
      catalog,
      onAction,
      onNeedSupplies: vi.fn(),
      onNeedRest: vi.fn(),
      vitalityPromptRequestToken: 41,
      onVitalityPromptRequestHandled: onHandled,
    }
    const { rerender } = render(<ActivityLauncher {...props} />)

    const confirmation = await screen.findByRole('group', { name: '确认使用活力魔法' })
    await waitFor(() => expect(screen.getByRole('button', { name: '先不使用' })).toHaveFocus())
    expect(onHandled).toHaveBeenCalledOnce()
    expect(onHandled).toHaveBeenCalledWith(41)
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.keyDown(confirmation, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '问问饼狗要不要认真刷播' })).toHaveFocus(),
    )
    rerender(<ActivityLauncher {...props} />)
    expect(screen.queryByRole('group', { name: '确认使用活力魔法' })).not.toBeInTheDocument()
    expect(onHandled).toHaveBeenCalledOnce()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('灰态房间热点在没有活力魔法时立即播报拒绝，且绝不派发活动动作', async () => {
    const onAction = vi.fn()
    const onHandled = vi.fn()
    render(
      <ActivityLauncher
        kind="stream"
        game={unwillingGame()}
        catalog={catalog}
        onAction={onAction}
        onNeedSupplies={vi.fn()}
        onNeedRest={vi.fn()}
        vitalityPromptRequestToken={42}
        onVitalityPromptRequestHandled={onHandled}
      />,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('饼狗今天不想坐在电脑前，可以休息后再问问。')
    await waitFor(() => expect(alert.closest('article')).toHaveFocus())
    expect(onHandled).toHaveBeenCalledWith(42)
    expect(onAction).not.toHaveBeenCalled()
  })
})

describe('幸运苹果活动边界', () => {
  it('旅行本来就会带回回忆时禁用幸运苹果，并以普通方式开始', () => {
    const { onAction } = renderLauncher('travel', playableGame())
    const luckyButton = screen.getByRole('button', { name: /带上幸运苹果/u })

    expect(luckyButton).toBeDisabled()
    expect(luckyButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('note')).toHaveTextContent('这次的回忆已经稳稳在路上了')
    expect(screen.queryByText(/100%/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '准备出去旅行' }))
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activity/start',
        kind: 'travel',
        useLuckyApple: false,
      }),
    )
  })

  it('对应分类收齐后禁用幸运苹果并说明把它留给下一次惊喜', () => {
    const game = playableGame()
    renderLauncher('stream', {
      ...game,
      collections: {
        'million-shot-test': {
          id: 'million-shot-test',
          firstObtainedAt: 1_000,
          duplicateCount: 0,
        },
      },
    })

    expect(screen.getByRole('button', { name: /带上幸运苹果/u })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(
      '这一类回忆已经收齐啦，把幸运苹果留给下一次惊喜吧。',
    )
  })

  it('对应收藏概率为 0% 时禁用幸运苹果并说明这次不会发现收藏', () => {
    const game = playableGame()
    renderLauncher('stream', {
      ...game,
      gameBalance: {
        ...game.gameBalance,
        probabilities: { ...game.gameBalance.probabilities, millionShot: 0 },
      },
    })

    expect(screen.getByRole('button', { name: /带上幸运苹果/u })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('这次不会发现收藏，幸运苹果留到下次吧。')
  })

  it('仍有新收藏时可以带上，并在活动开始时提交统一领域参数', () => {
    const { onAction } = renderLauncher('stream', playableGame())
    const luckyButton = screen.getByRole('button', { name: /带上幸运苹果/u })

    expect(luckyButton).toBeEnabled()
    fireEvent.click(luckyButton)
    expect(luckyButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '准备认真刷播' }))
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activity/start',
        kind: 'stream',
        useLuckyApple: true,
      }),
    )
  })

  it('收藏状态改变使幸运苹果失效时立即清掉已选状态', async () => {
    const game = playableGame()
    const onAction = vi.fn()
    const { rerender } = renderLauncher('stream', game, onAction)
    fireEvent.click(screen.getByRole('button', { name: /带上幸运苹果/u }))

    rerender(
      <ActivityLauncher
        kind="stream"
        game={{
          ...game,
          collections: {
            'million-shot-test': {
              id: 'million-shot-test',
              firstObtainedAt: 2_000,
              duplicateCount: 0,
            },
          },
        }}
        catalog={catalog}
        onAction={onAction}
        onNeedSupplies={vi.fn()}
        onNeedRest={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /带上幸运苹果/u })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '准备认真刷播' }))
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'activity/start', useLuckyApple: false }),
    )
  })
})

describe('活动二次确认与焦点', () => {
  it.each(['travel', 'stream', 'trend', 'music', 'rest'] as const)(
    '%s 必须确认后才开始，Escape 取消并把焦点还给启动按钮',
    async (kind) => {
      const { onAction } = renderLauncher(kind, playableGame())
      const copy = ACTIVITY_COPY[kind]
      let launchButton = screen.getByRole('button', { name: `准备${copy.name}` })

      fireEvent.click(launchButton)
      expect(onAction).not.toHaveBeenCalled()

      const confirmation = screen.getByRole('group', { name: `确认${copy.name}` })
      const cancelButton = screen.getByRole('button', { name: '再想想' })
      await waitFor(() => expect(cancelButton).toHaveFocus())
      expect(document.body).not.toHaveFocus()

      fireEvent.keyDown(confirmation, { key: 'Escape' })
      launchButton = screen.getByRole('button', { name: `准备${copy.name}` })
      await waitFor(() => expect(launchButton).toHaveFocus())
      expect(onAction).not.toHaveBeenCalled()

      fireEvent.click(launchButton)
      fireEvent.click(screen.getByRole('button', { name: '确认开始' }))

      expect(onAction).toHaveBeenCalledOnce()
      const action = onAction.mock.calls[0]?.[0]
      expect(action).toEqual(
        expect.objectContaining({ type: 'activity/start', kind, useLuckyApple: false }),
      )
      expect(action).not.toHaveProperty('debugDurationMs')
      launchButton = screen.getByRole('button', { name: `准备${copy.name}` })
      await waitFor(() => expect(launchButton).toHaveFocus())
    },
  )
})

describe('活动面板目录复用', () => {
  afterEach(() => vi.useRealTimers())

  it('每秒更新时间后仍保留当前幸运苹果选择', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const game = playableGame()
    const commonProps = {
      panel: 'computer' as const,
      game,
      catalog: contentCatalog,
      onNavigate: vi.fn(),
      onAction: vi.fn(),
      onBackup: vi.fn(),
      onTaskEvent: vi.fn(),
      onClose: vi.fn(),
      streamPlayback: idleStreamPlayback(),
      visitorStreamPlayback: idleVisitorStreamPlayback(),
      streamVideoIntervalMs: 8_000,
      onStreamVideoIntervalChange: vi.fn(),
      streamRoundDurationSeconds: 310,
      onStreamRoundDurationChange: vi.fn(),
    }
    const { rerender } = render(<ContextPanel {...commonProps} now={Date.now()} />)
    const luckyButton = screen.getAllByRole('button', { name: /带上幸运苹果/u })[0]

    fireEvent.click(luckyButton)
    expect(luckyButton).toHaveAttribute('aria-pressed', 'true')

    vi.advanceTimersByTime(1_000)
    rerender(<ContextPanel {...commonProps} now={Date.now()} />)

    expect(screen.getAllByRole('button', { name: /幸运苹果/u })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
