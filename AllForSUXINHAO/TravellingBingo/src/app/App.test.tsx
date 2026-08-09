import { webcrypto } from 'node:crypto'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  gameStateSchema,
  importableGameStateSchema,
  type ImportableGameState,
} from '@/app/gameStateSchema'
import { loadContentCatalog, type CollectibleItem, type ContentCatalog } from '@/content'
import {
  createInitialGameState,
  DEFAULT_GAME_BALANCE,
  migrateGameStateV1,
  migrateGameStateV2ToV3,
  type GameAction,
  type GameState,
  type GameStateV1,
  type GameStateV2,
  type GameStateV3,
} from '@/domain'
import {
  createBrowserGameCache,
  createBingoSave,
  downloadBingoSave,
  importBingoSave,
  readBrowserGameCache,
  writeBrowserGameCache,
  type BingoSaveImportResult,
} from '@/infrastructure/persistence'

import { App } from './App'

const appServiceWorker = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  onNeedReload: undefined as (() => void) | undefined,
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onNeedReload?: () => void }) => {
    appServiceWorker.onNeedReload ??= options?.onNeedReload
    return {
      offlineReady: [appServiceWorker.offlineReady, appServiceWorker.setOfflineReady],
      needRefresh: [appServiceWorker.needRefresh, appServiceWorker.setNeedRefresh],
      updateServiceWorker: appServiceWorker.updateServiceWorker,
    }
  },
}))

/** App 测试只覆盖控制器契约，避免与标题页的视觉文案重复绑定。 */
vi.mock('@/features/title/TitleScreen', () => {
  interface Preview {
    fileName: string
    gameVersion: string
    apples: number
    collectionCount: number
    activityLabel: string
    displayName: string
    companionDays: number
  }

  interface CachedPreview extends Omit<Preview, 'fileName'> {
    updatedAt: number
  }

  interface Props {
    available: boolean
    error: string | null
    importPreview: Preview | null
    cachedPreview: CachedPreview | null
    onStart: (displayName: string) => void
    onContinueCached: () => void
    onFile: (file: File) => void
    onConfirmImport: () => void
    onCancelImport: () => void
    onTitleActivate: () => void
    updateCheckStatus: 'idle' | 'checking' | 'checked' | 'unsupported' | 'error'
    onCheckForUpdates: () => void
  }

  return {
    TitleScreen: ({
      available,
      error,
      importPreview,
      cachedPreview,
      onStart,
      onContinueCached,
      onFile,
      onConfirmImport,
      onCancelImport,
      onTitleActivate,
      updateCheckStatus,
      onCheckForUpdates,
    }: Props) => (
      <main>
        <h1>旅行饼狗</h1>
        <button type="button" disabled={!available} onClick={() => onStart('小饼干')}>
          开始新旅程
        </button>
        <button type="button" disabled={!cachedPreview} onClick={onContinueCached}>
          从缓存存档继续
        </button>
        {cachedPreview && (
          <output data-testid="cached-preview">
            {cachedPreview.displayName} · {cachedPreview.apples}🍎
          </output>
        )}
        <button type="button" aria-label="连续激活五次可打开隐藏门牌" onClick={onTitleActivate}>
          标题
        </button>
        <output data-testid="title-update-status">{updateCheckStatus}</output>
        <button type="button" onClick={onCheckForUpdates}>
          检查更新
        </button>
        <label>
          读取 .bingo 存档
          <input
            aria-label="读取 .bingo 存档"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onFile(file)
            }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {importPreview && (
          <section aria-label="存档摘要">
            <span>{importPreview.fileName}</span>
            <span>{importPreview.gameVersion}</span>
            <span>{importPreview.apples}🍎</span>
            <span>{importPreview.collectionCount} 件</span>
            <span>{importPreview.activityLabel}</span>
            <span>{importPreview.displayName}</span>
            <span>{importPreview.companionDays} 天</span>
            <button type="button" onClick={onConfirmImport}>
              进入这次旅程
            </button>
            <button type="button" onClick={onCancelImport}>
              取消
            </button>
          </section>
        )}
      </main>
    ),
  }
})

/** GameHome 替身暴露原子命令与关键持久状态，不依赖正在重构的房间 DOM。 */
vi.mock('@/features/game/GameHome', () => {
  interface Props {
    game: GameState
    dirty: boolean
    restTransitionKey: number
    realitySettlementResult?: {
      decision: 'serious' | 'not-serious'
      awardedApples: number
      fullRewardApples: number
    } | null
    onAction: (action: GameAction) => void
    onExit: () => void
    onBackup: () => void
    onDismissRealitySettlementResult?: () => void
    notificationPermission: NotificationPermission | 'unsupported'
    onRequestNotificationPermission: () => void
  }

  return {
    GameHome: ({
      game,
      dirty,
      restTransitionKey,
      realitySettlementResult,
      onAction,
      onExit,
      onBackup,
      onDismissRealitySettlementResult,
      notificationPermission,
      onRequestNotificationPermission,
    }: Props) => (
      <main>
        <output data-testid="schema-version">{game.schemaVersion}</output>
        <output data-testid="display-name">{game.profile.displayName}</output>
        <output data-testid="companion-days">{game.profile.companionDays}</output>
        <output data-testid="apple-count">{game.economy.apples}</output>
        <output data-testid="collection-count">{Object.keys(game.collections).length}</output>
        <output data-testid="friend-count">{Object.keys(game.friends).length}</output>
        <output data-testid="rest-transition-key">{restTransitionKey}</output>
        <output data-testid="travel-basic-count">{game.inventory['travel-basic']}</output>
        <output data-testid="activity-duration">{game.gameBalance.activityDurationMs}</output>
        <output data-testid="task-sequence">{game.random.sequences.tasks}</output>
        <output data-testid="task-completed-at">{game.tasks.completedAt ?? 'none'}</output>
        <output data-testid="task-instance-ids">
          {game.tasks.active.map((task) => task.instanceId).join(',')}
        </output>
        <output data-testid="task-progresses">
          {game.tasks.active.map((task) => `${task.progress}/${task.target}`).join(',')}
        </output>
        <output data-testid="dirty-state">{dirty.toString()}</output>
        <output data-testid="active-started-at">{game.activeActivity?.startedAt ?? 'none'}</output>
        <output data-testid="active-ends-at">{game.activeActivity?.endsAt ?? 'none'}</output>
        <output data-testid="world">{game.world}</output>
        <output data-testid="pending-reality-reward">
          {game.reality.pendingSettlement?.fullRewardApples ?? 'none'}
        </output>
        <output data-testid="notification-permission">{notificationPermission}</output>
        {game.profile.debug && <button type="button">DEBUG</button>}
        <button
          type="button"
          onClick={() => {
            onAction({ type: 'debug/apples-adjust', delta: 1 })
            onAction({ type: 'debug/apples-adjust', delta: 1 })
          }}
        >
          同帧连发两条命令
        </button>
        {game.activeActivity && (
          <>
            <button
              type="button"
              onClick={() =>
                onAction({
                  type: 'activity/claim',
                  runId: game.activeActivity!.runId,
                  now: Math.max(Date.now(), game.activeActivity!.endsAt),
                })
              }
            >
              领取当前活动
            </button>
            <button
              type="button"
              onClick={() =>
                onAction({
                  type: 'activity/cancel',
                  runId: game.activeActivity!.runId,
                  now: Date.now(),
                })
              }
            >
              取消当前活动
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onAction({ type: 'debug/duration-set', durationMs: 10_000 })}
        >
          调整活动时长
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'debug/collect-all', now: Date.now() })}
        >
          DEBUG 一键全收集
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'debug/clear-all', now: Date.now() })}
        >
          DEBUG 一键撤销所有收集
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'item/purchase', itemId: 'travel-basic' })}
        >
          补充普通便当
        </button>
        <button type="button" onClick={onRequestNotificationPermission}>
          打开桌面提醒
        </button>
        <button
          type="button"
          onClick={() => {
            const dueAt = Date.now()
            onAction({
              type: 'todo/create',
              todoId: 'todo-reminder',
              title: '回来吃苹果',
              dueAt,
              now: dueAt,
            })
            onAction({ type: 'clock/tick', now: dueAt })
          }}
        >
          签发到期提醒
        </button>
        <button
          type="button"
          onClick={() => {
            const session = game.reality.pomodoro.session
            if (!session) {
              onAction({ type: 'pomodoro/start', now: Date.now(), durationMs: 25 * 60_000 })
              return
            }
            onAction({
              type: 'clock/tick',
              now: session.status === 'focus' ? session.focusEndsAt : session.cycleEndsAt,
            })
          }}
        >
          {game.reality.pomodoro.session === null
            ? '开始测试苹果钟'
            : game.reality.pomodoro.session.status === 'completed'
              ? '重复测试时钟'
              : '推进测试苹果钟'}
        </button>
        {game.world === 'game' && !game.reality.pendingSettlement && (
          <button
            type="button"
            onClick={() => onAction({ type: 'reality/enter', now: Date.now() })}
          >
            进入现实
          </button>
        )}
        {game.world === 'reality' && game.reality.activeStay && (
          <button
            type="button"
            onClick={() =>
              onAction({
                type: 'reality/leave',
                now: game.reality.activeStay!.enteredAt + 20 * 60_000,
              })
            }
          >
            返回游戏
          </button>
        )}
        {game.reality.pendingSettlement && (
          <button
            type="button"
            onClick={() =>
              onAction({
                type: 'reality/settle',
                stayId: game.reality.pendingSettlement!.stayId,
                decision: 'not-serious',
                now: game.reality.pendingSettlement!.leftAt,
              })
            }
          >
            结算一半
          </button>
        )}
        {realitySettlementResult && (
          <section role="dialog" aria-label="现实结算结果">
            <h2>
              {realitySettlementResult.decision === 'serious'
                ? '认真完成，全部带回来啦'
                : '这次先带回一半'}
            </h2>
            <p>收好 {realitySettlementResult.awardedApples}🍎。</p>
            <button type="button" onClick={onDismissRealitySettlementResult}>
              收好啦
            </button>
          </section>
        )}
        <button type="button" onClick={onBackup}>
          备份
        </button>
        <button type="button" onClick={onExit}>
          离开
        </button>
      </main>
    ),
  }
})

vi.mock('@/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content')>()
  return { ...actual, loadContentCatalog: vi.fn() }
})

vi.mock('@/infrastructure/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/persistence')>()
  return {
    ...actual,
    createBingoSave: vi.fn(),
    downloadBingoSave: vi.fn(),
    importBingoSave: vi.fn(),
  }
})

const catalogItems = [
  {
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
  },
  {
    id: 'million-shot-test',
    category: 'million-shot',
    title: '测试百万直拍',
    alt: '测试百万直拍海报',
    images: [
      {
        width: 480,
        height: 640,
        path: 'assets/collectibles/million-shots/test.webp',
        byteLength: 1,
        mime: 'image/webp',
      },
    ],
    tags: ['测试'],
    source: { url: 'https://example.com/million-shot' },
  },
  {
    id: 'site-first-test',
    category: 'site-first',
    title: '测试全站第一',
    alt: '测试全站第一海报',
    images: [
      {
        width: 480,
        height: 640,
        path: 'assets/collectibles/site-firsts/test.webp',
        byteLength: 1,
        mime: 'image/webp',
      },
    ],
    tags: ['测试'],
    source: { url: 'https://example.com/site-first' },
  },
] as unknown as CollectibleItem[]

const catalog: ContentCatalog = {
  items: catalogItems,
  byId: Object.fromEntries(catalogItems.map((item) => [item.id, item])),
  categoryCounts: { postcard: 1, 'million-shot': 1, 'site-first': 1 },
  siteFirstChronology: ['site-first-test'],
  friends: [],
  friendById: {},
  videosByBvid: {},
  recordPlayerVideos: [],
}

const domainCatalog = {
  postcard: ['postcard-2025-01-0001'],
  'million-shot': ['million-shot-test'],
  'site-first': ['site-first-test'],
  siteFirstChronology: ['site-first-test'],
} as const

const catalogAddedLaterItem = {
  ...catalogItems[0],
  id: 'postcard-added-later',
  title: '后来新增的明信片',
  source: { url: 'https://example.com/postcard-added-later' },
} as CollectibleItem

const expandedCatalog: ContentCatalog = {
  items: [...catalog.items, catalogAddedLaterItem],
  byId: { ...catalog.byId, [catalogAddedLaterItem.id]: catalogAddedLaterItem },
  categoryCounts: { ...catalog.categoryCounts, postcard: 2 },
  siteFirstChronology: catalog.siteFirstChronology,
  friends: catalog.friends,
  friendById: catalog.friendById,
  videosByBvid: catalog.videosByBvid,
  recordPlayerVideos: catalog.recordPlayerVideos,
}

function recursivelyCollectedKeys(value: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) recursivelyCollectedKeys(entry, result)
    return result
  }
  if (value === null || typeof value !== 'object') return result

  for (const [key, entry] of Object.entries(value)) {
    result.add(key)
    recursivelyCollectedKeys(entry, result)
  }
  return result
}

function importedGame(): GameState {
  const initial = createInitialGameState({
    now: 1_000,
    seed: 'imported-test',
    displayName: '导入玩家',
    debug: true,
  })
  return {
    ...initial,
    economy: { apples: 7 },
    collections: {
      'million-shot-test': {
        id: 'million-shot-test',
        firstObtainedAt: 2_000,
        duplicateCount: 0,
      },
    },
    statistics: {
      ...initial.statistics,
      started: { ...initial.statistics.started, stream: 1 },
      claimed: { ...initial.statistics.claimed, stream: 1 },
    },
  }
}

function completedTaskBoardGame(completedAt: number): GameState {
  const state = importedGame()
  const assignedAt = completedAt - 60_000
  return {
    ...state,
    tasks: {
      ...state.tasks,
      active: [
        {
          instanceId: 'completed-backpack',
          taskId: 'open-backpack',
          assignedAt,
          progress: 1,
          target: 1,
          rewardApples: 1,
          seenKeys: ['opened'],
        },
        {
          instanceId: 'completed-room',
          taskId: 'room-stroll',
          assignedAt,
          progress: 2,
          target: 2,
          rewardApples: 2,
          seenKeys: ['bed', 'computer'],
        },
        {
          instanceId: 'completed-piano',
          taskId: 'piano-time',
          assignedAt,
          progress: 1,
          target: 1,
          rewardApples: 1,
          seenKeys: ['piano:C4'],
        },
      ],
      completedAt,
      completedCount: 3,
    },
  }
}

function partiallyCompletedTaskBoardGame(assignedAt: number): GameState {
  const state = importedGame()
  return {
    ...state,
    tasks: {
      ...state.tasks,
      active: [
        {
          instanceId: 'inherited-backpack',
          taskId: 'open-backpack',
          assignedAt,
          progress: 1,
          target: 1,
          rewardApples: 1,
          seenKeys: ['opened'],
        },
        {
          instanceId: 'inherited-room',
          taskId: 'room-stroll',
          assignedAt,
          progress: 1,
          target: 2,
          rewardApples: 2,
          seenKeys: ['bed'],
        },
        {
          instanceId: 'inherited-piano',
          taskId: 'piano-time',
          assignedAt,
          progress: 0,
          target: 1,
          rewardApples: 1,
          seenKeys: [],
        },
      ],
      completedAt: null,
      completedCount: 1,
    },
  }
}

function importedV2Game(): GameStateV2 {
  const initial = migrateGameStateV1(legacyGame(), { now: 1_000, catalog: domainCatalog })
  return {
    ...initial,
    economy: { apples: 7 },
    collections: {
      'million-shot-test': {
        id: 'million-shot-test',
        firstObtainedAt: 2_000,
        duplicateCount: 0,
      },
    },
    statistics: {
      ...initial.statistics,
      started: { ...initial.statistics.started, stream: 1 },
      claimed: { ...initial.statistics.claimed, stream: 1 },
    },
  }
}

function importedV3Game(): GameStateV3 {
  return migrateGameStateV2ToV3(importedV2Game(), { now: 2_500, catalog: domainCatalog })
}

function readyActivityGame(kind: 'travel' | 'rest', companionDays = 4): GameState {
  const initial = createInitialGameState({
    now: 1_000,
    seed: `ready-${kind}`,
    displayName: '等候领取',
  })
  return {
    ...initial,
    profile: { ...initial.profile, companionDays },
    activeActivity: {
      runId: `ready-${kind}-run`,
      kind,
      startedAt: 1_000,
      endsAt: 2_000,
      rewardSeed: `ready-${kind}-reward`,
      rewardPlan: {
        baseApples: kind === 'rest' ? 1 : 0,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: kind === 'travel' ? 'travel-basic' : null,
      usedLuckyApple: false,
    },
    pet: {
      ...initial.pet,
      location: kind === 'travel' ? 'outside' : 'bed',
      preferences: { travel: false, computer: false, music: false },
      tired: true,
    },
    statistics: {
      ...initial.statistics,
      started: { ...initial.statistics.started, [kind]: 1 },
    },
  }
}

function readyCriticalRewardGame(
  criticalNode: 'site-first' | 'friend',
  alreadyKnown = false,
): GameState {
  const startedAt = 1_000
  const initial = createInitialGameState({
    now: startedAt,
    seed: `critical-${criticalNode}-${alreadyKnown ? 'known' : 'new'}`,
    displayName: '关键节点测试',
  })
  const activityKind = criticalNode === 'site-first' ? 'trend' : 'travel'

  return {
    ...initial,
    collections:
      criticalNode === 'site-first' && alreadyKnown
        ? {
            'site-first-test': {
              id: 'site-first-test',
              firstObtainedAt: 500,
              duplicateCount: 0,
            },
          }
        : {},
    friends:
      criticalNode === 'friend' && alreadyKnown
        ? {
            'signal-dog': {
              id: 'signal-dog',
              firstMetAt: 500,
              lastMetAt: 500,
              encounterCount: 1,
              totalGiftApples: 0,
            },
          }
        : {},
    activeActivity: {
      runId: `critical-${criticalNode}-run`,
      kind: activityKind,
      startedAt,
      endsAt: 2_000,
      rewardSeed: `critical-${criticalNode}-reward`,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection:
          criticalNode === 'site-first' ? { id: 'site-first-test', category: 'site-first' } : null,
        friendId: criticalNode === 'friend' ? 'signal-dog' : null,
        giftItemId: criticalNode === 'friend' ? 'signal-headphones' : null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: criticalNode === 'site-first' ? 'trend-toolbox' : 'travel-basic',
      usedLuckyApple: false,
    },
    pet: {
      ...initial.pet,
      location: criticalNode === 'site-first' ? 'computer' : 'outside',
    },
    statistics: {
      ...initial.statistics,
      started: { ...initial.statistics.started, [activityKind]: 1 },
    },
  }
}

function legacyGame(): GameStateV1 {
  return {
    schemaVersion: 1,
    profile: { createdAt: 500, debug: true },
    economy: { apples: 9 },
    inventory: {
      'travel-basic': 1,
      'travel-apple': 0,
      'signal-headphones': 0,
      'trend-toolbox': 0,
      'lucky-apple': 0,
    },
    collections: {
      'postcard-2025-01-0001': {
        id: 'postcard-2025-01-0001',
        firstObtainedAt: 800,
        duplicateCount: 0,
      },
    },
    activeActivity: null,
    pity: { stream: 1, trend: 2 },
    statistics: {
      started: { travel: 1, stream: 0, trend: 0 },
      claimed: { travel: 1, stream: 0, trend: 0 },
      applesEarned: 4,
      duplicateRewards: 0,
    },
    random: { seed: 'legacy-seed', sequence: 3 },
  }
}

function importResult<TPayload extends ImportableGameState>(
  payload: TPayload,
): BingoSaveImportResult<TPayload> {
  return {
    payload,
    summary: {
      format: 'travelling-bingo-save',
      schemaVersion: 1,
      gameVersion:
        payload.schemaVersion === 1
          ? '0.1.0-demo.1'
          : payload.schemaVersion === 2
            ? '0.2.0-demo.1'
            : payload.schemaVersion === 3
              ? '0.3.0-demo.1'
              : '0.4.0-demo.1',
      exportedAt: 3_000,
      exportedAtIso: new Date(3_000).toISOString(),
      byteLength: 800,
      digest: 'a'.repeat(43),
    },
  } as BingoSaveImportResult<TPayload>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createAudioHarness() {
  const frequency = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => {
      frequency.value = value
    }),
  }
  const oscillator = {
    frequency,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gainParam = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => {
      gainParam.value = value
    }),
  }
  const gain = {
    gain: gainParam,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: {},
    onstatechange: null as (() => void) | null,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {
      context.state = 'running'
      context.onstatechange?.()
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended'
      context.onstatechange?.()
    }),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
  }
  const factory = vi.fn(() => context as unknown as AudioContext)
  return { context, factory, gain, oscillator }
}

function installNotificationHarness(initialPermission: NotificationPermission = 'default') {
  let permission = initialPermission
  const notifications: Array<{ title: string; options?: NotificationOptions }> = []
  const MockNotification = vi.fn(function (
    this: Notification,
    title: string,
    options?: NotificationOptions,
  ) {
    notifications.push({ title, options })
  }) as unknown as typeof Notification
  Object.defineProperty(MockNotification, 'permission', {
    configurable: true,
    get: () => permission,
  })
  MockNotification.requestPermission = vi.fn(async () => {
    permission = 'granted'
    return permission
  })
  vi.stubGlobal('Notification', MockNotification)
  return { MockNotification, notifications }
}

async function startNewJourney() {
  const start = await screen.findByRole('button', { name: '开始新旅程' })
  await waitFor(() => expect(start).toBeEnabled())
  fireEvent.click(start)
}

async function importJourney(game: GameState, fileName: string) {
  vi.mocked(importBingoSave).mockResolvedValue(importResult(game))
  await screen.findByRole('button', { name: '开始新旅程' })
  fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
    target: { files: [new File([fileName], fileName)] },
  })
  fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))
}

async function unlockDebugAndStart() {
  const titleTrigger = screen.getByRole('button', { name: /连续激活五次/ })
  for (let activation = 0; activation < 5; activation += 1) fireEvent.click(titleTrigger)
  fireEvent.change(screen.getByLabelText('暗号'), { target: { value: 'TravellingBingo' } })
  fireEvent.click(screen.getByRole('button', { name: '打开门牌' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await startNewJourney()
}

describe('旅行饼狗应用控制器', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    appServiceWorker.offlineReady = false
    appServiceWorker.needRefresh = false
    appServiceWorker.onNeedReload = undefined
    appServiceWorker.setOfflineReady.mockReset()
    appServiceWorker.setNeedRefresh.mockReset()
    appServiceWorker.updateServiceWorker.mockReset()
    appServiceWorker.updateServiceWorker.mockResolvedValue(undefined)
    vi.mocked(loadContentCatalog).mockReset()
    vi.mocked(createBingoSave).mockReset()
    vi.mocked(downloadBingoSave).mockReset()
    vi.mocked(importBingoSave).mockReset()
    vi.mocked(loadContentCatalog).mockResolvedValue(catalog)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('加载目录后用玩家称呼创建 DEBUG V5 新游戏', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '旅行饼狗' })).toBeInTheDocument()
    await screen.findByRole('button', { name: '开始新旅程' })
    await unlockDebugAndStart()

    expect(screen.getByTestId('schema-version')).toHaveTextContent('5')
    expect(screen.getByTestId('display-name')).toHaveTextContent('小饼干')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('0')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('18')
    expect(screen.getByRole('button', { name: 'DEBUG' })).toBeVisible()
  })

  it('目录加载后读取并校验浏览器缓存，由玩家明确选择继续', async () => {
    const cached = importedGame()
    writeBrowserGameCache(
      createBrowserGameCache({
        saveId: 'cached-journey',
        gameVersion: '0.4.0-demo.1',
        now: 3_000,
        payload: cached,
      }),
    )

    render(<App />)

    const continueButton = await screen.findByRole('button', { name: '从缓存存档继续' })
    await waitFor(() => expect(continueButton).toBeEnabled())
    expect(screen.getByTestId('cached-preview')).toHaveTextContent('导入玩家 · 7🍎')
    expect(downloadBingoSave).not.toHaveBeenCalled()
    fireEvent.click(continueButton)

    expect(screen.getByTestId('display-name')).toHaveTextContent('导入玩家')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('7')
    expect(downloadBingoSave).not.toHaveBeenCalled()
  })

  it('出现本地导入预览后改选缓存继续，会立即清理旧预览且退出后不复现', async () => {
    writeBrowserGameCache(
      createBrowserGameCache({
        saveId: 'cached-before-preview',
        gameVersion: '0.5.0-demo.1',
        now: 3_000,
        payload: importedGame(),
      }),
    )
    vi.mocked(importBingoSave).mockResolvedValue(importResult(importedGame()))
    render(<App />)

    const continueButton = await screen.findByRole('button', { name: '从缓存存档继续' })
    await waitFor(() => expect(continueButton).toBeEnabled())
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['preview'], 'unused-preview.bingo')] },
    })
    expect(await screen.findByText('unused-preview.bingo')).toBeVisible()

    fireEvent.click(continueButton)
    expect(screen.queryByText('unused-preview.bingo')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    expect(screen.queryByText('unused-preview.bingo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入这次旅程' })).not.toBeInTheDocument()
  })

  it('出现本地导入预览后改选全新旅程，会立即清理旧预览且退出后不复现', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(importedGame()))
    render(<App />)

    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['preview'], 'abandoned-preview.bingo')] },
    })
    expect(await screen.findByText('abandoned-preview.bingo')).toBeVisible()

    await startNewJourney()
    expect(screen.queryByText('abandoned-preview.bingo')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    expect(screen.queryByText('abandoned-preview.bingo')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '进入这次旅程' })).not.toBeInTheDocument()
  })

  it('v1、v2、v3 与 v4 载荷都会严格拒绝未知字段', () => {
    expect(
      importableGameStateSchema.safeParse({ ...legacyGame(), strayUiState: true }).success,
    ).toBe(false)
    expect(
      importableGameStateSchema.safeParse({ ...importedV2Game(), strayUiState: true }).success,
    ).toBe(false)
    expect(
      importableGameStateSchema.safeParse({ ...importedV3Game(), strayUiState: true }).success,
    ).toBe(false)
    expect(gameStateSchema.safeParse({ ...importedGame(), strayUiState: true }).success).toBe(false)
  })

  it('V4 严格拒绝结束时间早于开始时间的活动快照', () => {
    const payload = readyActivityGame('travel')
    payload.activeActivity = { ...payload.activeActivity!, endsAt: 999 }

    expect(importableGameStateSchema.safeParse(payload).success).toBe(false)
  })

  it('V3 活动迁移到 V5 时保留当次 startedAt 与 endsAt，不按当前默认重算', async () => {
    const payload = importedV3Game()
    payload.profile = { ...payload.profile, debug: false }
    payload.pet = { ...payload.pet, location: 'outside' }
    payload.activeActivity = {
      runId: 'v3-active-run',
      kind: 'travel',
      startedAt: 50_000,
      endsAt: 162_000,
      rewardSeed: 'v3-active-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-2025-01-0001', category: 'postcard' },
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    }
    payload.statistics = {
      ...payload.statistics,
      started: {
        ...payload.statistics.started,
        travel: payload.statistics.claimed.travel + 1,
      },
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['v3-active'], 'v3-active.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    expect(screen.getByTestId('schema-version')).toHaveTextContent('5')
    expect(screen.getByTestId('activity-duration')).toHaveTextContent(
      DEFAULT_GAME_BALANCE.activityDurationMs.toString(),
    )
    expect(screen.getByTestId('active-started-at')).toHaveTextContent('50000')
    expect(screen.getByTestId('active-ends-at')).toHaveTextContent('162000')
  })

  it('开始旅程的明确手势创建并持续启用守候音频', async () => {
    const audio = createAudioHarness()
    render(<App createAudioContext={audio.factory} />)

    await screen.findByRole('button', { name: '开始新旅程' })
    expect(audio.factory).not.toHaveBeenCalled()
    await startNewJourney()

    await waitFor(() => expect(audio.context.resume).toHaveBeenCalledOnce())
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.oscillator.frequency.value).toBe(10)
    expect(audio.gain.gain.value).toBe(0.01)
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.context.suspend).not.toHaveBeenCalled()
  })

  it('导入预览不会提前创建音频，确认导入的同一手势才启动守候音频', async () => {
    const audio = createAudioHarness()
    vi.mocked(importBingoSave).mockResolvedValue(importResult(importedGame()))
    render(<App createAudioContext={audio.factory} />)

    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['import-audio'], 'import-audio.bingo')] },
    })
    const confirm = await screen.findByRole('button', { name: '进入这次旅程' })
    expect(audio.factory).not.toHaveBeenCalled()

    fireEvent.click(confirm)

    await waitFor(() => expect(audio.context.resume).toHaveBeenCalledOnce())
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.context.resume).toHaveBeenCalledOnce()
  })

  it('标题页的“检查更新”只调用显式检查入口并弹出无更新结果', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(undefined)
    render(<App checkForUpdates={checkForUpdates} />)

    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    await waitFor(() =>
      expect(screen.getByTestId('title-update-status')).toHaveTextContent('checked'),
    )
    expect(checkForUpdates).toHaveBeenCalledOnce()
    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
    expect(screen.getByText('铲铲饼屋暂时没有新布置啦')).toBeVisible()
  })

  it('通知权限只由玩家按钮申请，稳定 notificationId 的到期 effect 只展示一次', async () => {
    const notification = installNotificationHarness()
    render(<App />)
    await startNewJourney()

    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(screen.getByTestId('notification-permission')).toHaveTextContent('default')
    fireEvent.click(screen.getByRole('button', { name: '打开桌面提醒' }))
    await waitFor(() =>
      expect(screen.getByTestId('notification-permission')).toHaveTextContent('granted'),
    )

    fireEvent.click(screen.getByRole('button', { name: '签发到期提醒' }))
    await waitFor(() => expect(notification.notifications).toHaveLength(1))
    expect(notification.notifications[0]).toMatchObject({
      options: { tag: expect.stringMatching(/^todo:todo-reminder:/u) },
    })

    fireEvent.click(screen.getByRole('button', { name: '签发到期提醒' }))
    expect(notification.notifications).toHaveLength(1)
  })

  it('苹果钟专注与整轮完成分别通知一次，重复 tick 不会再次签发', async () => {
    const notification = installNotificationHarness('granted')
    render(<App />)
    await startNewJourney()

    fireEvent.click(screen.getByRole('button', { name: '进入现实' }))
    fireEvent.click(screen.getByRole('button', { name: '开始测试苹果钟' }))
    fireEvent.click(await screen.findByRole('button', { name: '推进测试苹果钟' }))

    await waitFor(() => expect(notification.notifications).toHaveLength(1))
    expect(notification.notifications[0]).toMatchObject({
      title: '专注结束啦',
      options: { tag: expect.stringMatching(/^pomodoro:pomodoro-1:focus:/u) },
    })

    fireEvent.click(screen.getByRole('button', { name: '推进测试苹果钟' }))
    await waitFor(() => expect(notification.notifications).toHaveLength(2))
    expect(notification.notifications[1]).toMatchObject({
      title: '苹果钟完成啦',
      options: { tag: expect.stringMatching(/^pomodoro:pomodoro-1:complete:/u) },
    })

    fireEvent.click(screen.getByRole('button', { name: '重复测试时钟' }))
    expect(notification.notifications).toHaveLength(2)
  })

  it('导入跨多日的未完成任务板后仍原样保留三项及各自进度', async () => {
    const assignedAt = new Date(2026, 7, 1, 12).getTime()
    const current = new Date(2026, 7, 10, 9).getTime()
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(current)

    try {
      const payload = partiallyCompletedTaskBoardGame(assignedAt)
      render(<App />)
      await importJourney(payload, 'unfinished-board.bingo')

      const originalInstanceIds = screen.getByTestId('task-instance-ids').textContent
      const originalSequence = screen.getByTestId('task-sequence').textContent
      expect(originalInstanceIds).toBe('inherited-backpack,inherited-room,inherited-piano')
      expect(screen.getByTestId('task-progresses')).toHaveTextContent('1/1,1/2,0/1')
      expect(screen.getByTestId('task-completed-at')).toHaveTextContent('none')

      act(() => {
        globalThis.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(screen.getByTestId('task-instance-ids').textContent).toBe(originalInstanceIds)
      expect(screen.getByTestId('task-progresses')).toHaveTextContent('1/1,1/2,0/1')
      expect(screen.getByTestId('task-sequence')).toHaveTextContent(originalSequence ?? '')
    } finally {
      dateNow.mockRestore()
    }
  })

  it('全完成任务板同日保持不变，并由统一时钟在下一本地自然日自动刷新', async () => {
    const completedAt = new Date(2026, 7, 9, 23, 30).getTime()
    const nextMidnight = new Date(2026, 7, 10).getTime()
    const realStartedAt = performance.now()
    const fakeStartedAt = nextMidnight - 750
    const dateNow = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => fakeStartedAt + Math.floor(performance.now() - realStartedAt))

    try {
      const payload = completedTaskBoardGame(completedAt)
      vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))
      render(<App />)

      await screen.findByRole('button', { name: '开始新旅程' })
      fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
        target: { files: [new File(['completed-board'], 'completed-board.bingo')] },
      })
      fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

      const originalInstanceIds = screen.getByTestId('task-instance-ids').textContent
      const originalSequence = Number(screen.getByTestId('task-sequence').textContent)
      expect(originalInstanceIds).toContain('completed-backpack')
      expect(screen.getByTestId('task-completed-at')).toHaveTextContent(String(completedAt))

      await waitFor(
        () => expect(screen.getByTestId('task-completed-at')).toHaveTextContent('none'),
        { timeout: 2_000 },
      )
      expect(screen.getByTestId('task-instance-ids').textContent).not.toBe(originalInstanceIds)
      expect(screen.getByTestId('task-sequence')).toHaveTextContent(String(originalSequence + 1))
    } finally {
      dateNow.mockRestore()
    }
  })

  it.each(['focus', 'visibilitychange'] as const)(
    '页面错过午夜定时器后由 %s 唤醒并刷新全完成任务板',
    async (resumeEvent) => {
      const completedAt = new Date(2026, 7, 9, 23, 30).getTime()
      const beforeMidnight = new Date(2026, 7, 9, 23, 59).getTime()
      const afterMidnight = new Date(2026, 7, 10, 8).getTime()
      let current = beforeMidnight
      const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => current)

      try {
        const payload = completedTaskBoardGame(completedAt)
        render(<App />)
        await importJourney(payload, `completed-board-${resumeEvent}.bingo`)

        const originalInstanceIds = screen.getByTestId('task-instance-ids').textContent
        const originalSequence = Number(screen.getByTestId('task-sequence').textContent)
        expect(screen.getByTestId('task-completed-at')).toHaveTextContent(String(completedAt))

        current = afterMidnight
        act(() => {
          const target = resumeEvent === 'focus' ? globalThis : document
          target.dispatchEvent(new Event(resumeEvent))
        })

        await waitFor(() =>
          expect(screen.getByTestId('task-completed-at')).toHaveTextContent('none'),
        )
        expect(screen.getByTestId('task-instance-ids').textContent).not.toBe(originalInstanceIds)
        expect(screen.getByTestId('task-sequence')).toHaveTextContent(String(originalSequence + 1))
      } finally {
        dateNow.mockRestore()
      }
    },
  )

  it('只在最近到期时间签发 clock/tick，恢复焦点也不会重复通知', async () => {
    const notification = installNotificationHarness('granted')
    const payload = importedGame()
    const dueAt = Date.now() + 30
    payload.reality.todos['scheduled-reminder'] = {
      id: 'scheduled-reminder',
      title: '检查苹果钟',
      createdAt: dueAt - 1_000,
      updatedAt: dueAt - 1_000,
      dueAt,
      completedAt: null,
      notificationIssuedAt: null,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))
    render(<App />)

    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['scheduled'], 'scheduled.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    await waitFor(() => expect(notification.notifications).toHaveLength(1))
    expect(notification.notifications[0]?.options?.tag).toBe(`todo:scheduled-reminder:${dueAt}`)
    act(() => globalThis.dispatchEvent(new Event('focus')))
    expect(notification.notifications).toHaveLength(1)
  })

  it('现实维度返回后由领域计算待结算奖励，玩家确认后 App 打开独立结果窗口', async () => {
    render(<App />)
    await startNewJourney()

    fireEvent.click(screen.getByRole('button', { name: '进入现实' }))
    expect(screen.getByTestId('world')).toHaveTextContent('reality')
    fireEvent.click(screen.getByRole('button', { name: '返回游戏' }))
    expect(screen.getByTestId('world')).toHaveTextContent('game')
    expect(screen.getByTestId('pending-reality-reward')).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: '结算一半' }))
    expect(screen.getByTestId('apple-count')).toHaveTextContent('19')
    expect(screen.getByTestId('pending-reality-reward')).toHaveTextContent('none')
    const resultDialog = screen.getByRole('dialog', { name: '现实结算结果' })
    expect(resultDialog).toHaveTextContent('这次先带回一半')
    expect(resultDialog).toHaveTextContent('收好 1🍎。')

    fireEvent.click(screen.getByRole('button', { name: '收好啦' }))
    expect(screen.queryByRole('dialog', { name: '现实结算结果' })).not.toBeInTheDocument()
  })

  it('同一帧连续动作会严格基于刚更新的状态依次归约', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    await unlockDebugAndStart()

    fireEvent.click(screen.getByRole('button', { name: '同帧连发两条命令' }))

    expect(screen.getByTestId('apple-count')).toHaveTextContent('20')
  })

  it('DEBUG 时长写进领域状态，不使用 App 临时副本', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    await unlockDebugAndStart()

    fireEvent.click(screen.getByRole('button', { name: '调整活动时长' }))

    expect(screen.getByTestId('activity-duration')).toHaveTextContent('10000')
  })

  it('DEBUG 一键全收集仍通过 App 的领域动作写入同一份游戏状态', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    await unlockDebugAndStart()

    fireEvent.click(screen.getByRole('button', { name: 'DEBUG 一键全收集' }))

    expect(screen.getByTestId('collection-count')).toHaveTextContent('3')
    expect(screen.getByTestId('friend-count')).toHaveTextContent('5')
    expect(screen.getByText('DEBUG：收好 8 份收藏与好友记录。')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'DEBUG 一键撤销所有收集' }))

    expect(screen.getByTestId('collection-count')).toHaveTextContent('0')
    expect(screen.getByTestId('friend-count')).toHaveTextContent('0')
    expect(screen.getByText('DEBUG：清理 8 份收藏与好友记录。')).toBeVisible()
  })

  it('休息 effect 会把新的日夜过场 key 传给房间 UI', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(readyActivityGame('rest')))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['ready-rest'], 'ready-rest.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))

    expect(screen.getByTestId('rest-transition-key')).toHaveTextContent('1')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('5')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('19')
    expect(screen.getByText('天亮啦，饼狗又有精神了。')).toBeVisible()
  })

  it('补充物品后使用沉浸式反馈，并原子更新苹果与库存', async () => {
    render(<App />)
    await startNewJourney()

    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))

    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('travel-basic-count')).toHaveTextContent('2')
    expect(screen.getByText('冰箱里补充了 1 份补给，花掉 3🍎。')).toBeVisible()
  })

  it('先预览迁移后的 V5 称呼与陪伴天数，再采用导入进度', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(legacyGame()))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    const file = new File(['legacy-save'], 'legacy-trip.bingo')
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [file] },
    })

    const summary = await screen.findByRole('region', { name: '存档摘要' })
    expect(summary).toHaveTextContent('legacy-trip.bingo')
    expect(summary).toHaveTextContent('9🍎')
    expect(summary).toHaveTextContent('1 件')
    expect(summary).toHaveTextContent('你')
    expect(summary).toHaveTextContent('1 天')
    expect(importBingoSave).toHaveBeenCalledWith(file, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: '进入这次旅程' }))

    expect(screen.getByTestId('schema-version')).toHaveTextContent('5')
    expect(screen.getByTestId('display-name')).toHaveTextContent('你')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('1')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('9')
    expect(screen.getByTestId('collection-count')).toHaveTextContent('1')
  })

  it('v1 导入后再次导出时只写 V5 载荷与新版游戏版本', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(legacyGame()))
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'migrated.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['legacy'], 'legacy.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))
    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    expect(createBingoSave).toHaveBeenCalledWith(
      {
        gameVersion: '0.5.0-demo.1',
        payload: expect.objectContaining({
          schemaVersion: 5,
          profile: expect.objectContaining({ displayName: '你', companionDays: 1 }),
          friends: {},
        }),
      },
      gameStateSchema,
    )
  })

  it('普通备份保留点击时的有效快照，后续动作仍同步写入缓存', async () => {
    const pendingExport = deferred<Awaited<ReturnType<typeof createBingoSave>>>()
    vi.mocked(createBingoSave).mockReturnValueOnce(pendingExport.promise)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '备份' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    await act(async () => {
      pendingExport.resolve({
        fileName: 'stale-backup.bingo',
        text: '{}',
      } as Awaited<ReturnType<typeof createBingoSave>>)
      await pendingExport.promise
    })

    expect(downloadBingoSave).toHaveBeenCalledOnce()
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('false')
    const cached = JSON.parse(
      globalThis.localStorage.getItem('travelling-bingo:browser-save:v1')!,
    ) as { payload: GameState }
    expect(cached.payload.economy.apples).toBe(15)
  })

  it('普通备份下载额外副本，浏览器缓存继续作为主存档', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'requested-backup.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('false')
    expect(screen.getByTestId('display-name')).toHaveTextContent('小饼干')
    expect(screen.getByText('存档已经交给浏览器下载。')).toBeVisible()
  })

  it('离开立即回到标题页，并可从缓存继续最新进度', async () => {
    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    fireEvent.click(screen.getByRole('button', { name: '离开' }))

    expect(downloadBingoSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '从缓存存档继续' }))
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
  })

  it('创建新档覆盖缓存前自动下载旧档', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'previous-cache.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    await startNewJourney()

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(screen.getByTestId('apple-count')).toHaveTextContent('18')
  })

  it('确认本地导入覆盖缓存前自动下载旧档', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'before-import.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    vi.mocked(importBingoSave).mockResolvedValue(importResult(importedGame()))

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['import'], 'import.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(screen.getByTestId('display-name')).toHaveTextContent('导入玩家')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('7')
  })

  it('只有浏览器缓存写入失败时标记未保存并启用离开警告', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    render(<App />)
    await startNewJourney()

    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByText('浏览器缓存存档没有写入成功，请下载存档后再离开。')).toBeVisible()
    const event = new Event('beforeunload', { cancelable: true })
    globalThis.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    setItem.mockRestore()
  })

  it('没有未保存进度时可直接安装 PWA 更新', async () => {
    appServiceWorker.needRefresh = true

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '看看新布置' }))

    await waitFor(() => expect(appServiceWorker.updateServiceWorker).toHaveBeenCalledWith(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('跨标签 controlling 回调在当前进度干净时才显式刷新页面', async () => {
    const reloadPage = vi.fn().mockResolvedValue(undefined)
    render(<App reloadPage={reloadPage} />)

    act(() => appServiceWorker.onNeedReload?.())

    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('跨标签 controlling 回调会自动备份缓存后直接刷新', async () => {
    const reloadPage = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'before-reload.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App reloadPage={reloadPage} />)
    await startNewJourney()

    act(() => appServiceWorker.onNeedReload?.())

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce())
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('发现 waiting 更新时自动下载当前缓存，同次安装不重复下载', async () => {
    appServiceWorker.needRefresh = true
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'before-update.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App />)
    await startNewJourney()

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))
    await waitFor(() => expect(appServiceWorker.updateServiceWorker).toHaveBeenCalledWith(true))
    expect(downloadBingoSave).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('检测更新并自动备份后继续游玩，安装前会再备份最新缓存且同次安装不重复', async () => {
    appServiceWorker.needRefresh = true
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'latest-before-update.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App />)
    await startNewJourney()

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(appServiceWorker.updateServiceWorker).toHaveBeenCalledWith(true))
    const exportedApples = vi
      .mocked(createBingoSave)
      .mock.calls.map(([input]) => (input as { payload: GameState }).payload.economy.apples)
    expect(exportedApples).toEqual([18, 15])
    expect(downloadBingoSave).toHaveBeenCalledTimes(2)
  })

  it('更新自动备份失败后释放旧 Promise，点击安装可以重新备份并继续', async () => {
    appServiceWorker.needRefresh = true
    vi.mocked(createBingoSave)
      .mockRejectedValueOnce(new Error('自动备份第一次失败'))
      .mockResolvedValueOnce({
        fileName: 'retry-before-update.bingo',
        text: '{}',
      } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App />)
    await startNewJourney()

    expect(await screen.findByText('自动备份第一次失败')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '看看新布置' }))

    await waitFor(() => expect(createBingoSave).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    await waitFor(() => expect(appServiceWorker.updateServiceWorker).toHaveBeenCalledWith(true))
  })

  it('缓存满三天时自动下载一次并记录周期请求时间', async () => {
    const current = Date.now()
    const cachedGame = createInitialGameState({
      now: current - 4 * 24 * 60 * 60 * 1_000,
      seed: 'periodic-cache',
      displayName: '三天缓存',
    })
    const cache = createBrowserGameCache({
      saveId: 'periodic-save',
      gameVersion: '0.4.0-demo.1',
      now: current - 3 * 24 * 60 * 60 * 1_000,
      payload: cachedGame,
    })
    writeBrowserGameCache(cache)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'periodic.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())

    await waitFor(() =>
      expect(readBrowserGameCache()?.lastPeriodicBackupRequestedAt).not.toBeNull(),
    )
    expect(createBingoSave).toHaveBeenCalledOnce()
  })

  it('仅首次解锁新的全站第一会下载动作后的新档，已有全站第一不重复下载', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'site-first-critical-node.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    const firstRender = render(<App />)
    await importJourney(readyCriticalRewardGame('site-first'), 'new-site-first.bingo')
    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(createBingoSave).toHaveBeenCalledWith(
      {
        gameVersion: '0.5.0-demo.1',
        payload: expect.objectContaining({
          activeActivity: null,
          collections: expect.objectContaining({
            'site-first-test': expect.objectContaining({ id: 'site-first-test' }),
          }),
          friends: {},
        }),
      },
      gameStateSchema,
    )

    firstRender.unmount()
    globalThis.localStorage.clear()
    vi.mocked(createBingoSave).mockClear()
    vi.mocked(downloadBingoSave).mockClear()
    render(<App />)
    await importJourney(readyCriticalRewardGame('site-first', true), 'known-site-first.bingo')
    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))
    await act(async () => Promise.resolve())

    expect(screen.getByTestId('collection-count')).toHaveTextContent('1')
    expect(createBingoSave).not.toHaveBeenCalled()
    expect(downloadBingoSave).not.toHaveBeenCalled()
  })

  it('仅首次结识新朋友会下载动作后的新档，再次遇见旧朋友不重复下载', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'friend-critical-node.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    const firstRender = render(<App />)
    await importJourney(readyCriticalRewardGame('friend'), 'new-friend.bingo')
    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(createBingoSave).toHaveBeenCalledWith(
      {
        gameVersion: '0.5.0-demo.1',
        payload: expect.objectContaining({
          activeActivity: null,
          collections: {},
          friends: expect.objectContaining({
            'signal-dog': expect.objectContaining({
              id: 'signal-dog',
              encounterCount: 1,
            }),
          }),
        }),
      },
      gameStateSchema,
    )

    firstRender.unmount()
    globalThis.localStorage.clear()
    vi.mocked(createBingoSave).mockClear()
    vi.mocked(downloadBingoSave).mockClear()
    render(<App />)
    await importJourney(readyCriticalRewardGame('friend', true), 'known-friend.bingo')
    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))
    await act(async () => Promise.resolve())

    expect(screen.getByTestId('friend-count')).toHaveTextContent('1')
    expect(createBingoSave).not.toHaveBeenCalled()
    expect(downloadBingoSave).not.toHaveBeenCalled()
  })

  it('取消活动不会增加陪伴天数', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(readyActivityGame('travel')))

    render(<App />)
    const startButton = await screen.findByRole('button', { name: '开始新旅程' })
    await waitFor(() => expect(startButton).toBeEnabled())
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['ready-travel'], 'ready-travel.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    expect(screen.getByTestId('companion-days')).toHaveTextContent('4')
    fireEvent.click(screen.getByRole('button', { name: '取消当前活动' }))

    expect(screen.getByTestId('companion-days')).toHaveTextContent('4')
    expect(screen.getByTestId('active-ends-at')).toHaveTextContent('none')
    expect(screen.getByText('饼狗提前回家啦。')).toBeVisible()
  })

  it('普通旧 v2 采用当前默认规则，但原样保留进行中活动的时间窗', async () => {
    const payload = importedV2Game()
    payload.profile = { ...payload.profile, debug: false }
    payload.gameBalance = {
      activityDurationMs: 72 * 60_000,
      probabilities: {
        postcard: 1,
        millionShot: 0.4,
        siteFirst: 0.125,
        friend: 0.2,
      },
    }
    payload.pet = { ...payload.pet, location: 'outside' }
    payload.activeActivity = {
      runId: 'persisted-active-run',
      kind: 'travel',
      startedAt: 50_000,
      endsAt: 4_370_000,
      rewardSeed: 'persisted-active-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-2025-01-0001', category: 'postcard' },
        friendEventId: 'signal-dog',
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    }
    const expectedActivity = {
      runId: 'persisted-active-run',
      kind: 'travel',
      startedAt: 50_000,
      endsAt: 4_370_000,
      rewardSeed: 'persisted-active-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-2025-01-0001', category: 'postcard' },
        friendId: 'signal-dog',
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    }
    expect(importableGameStateSchema.safeParse(payload).success).toBe(true)
    expect(gameStateSchema.safeParse(payload).success).toBe(false)
    const actualPersistence = await vi.importActual<typeof import('@/infrastructure/persistence')>(
      '@/infrastructure/persistence',
    )
    vi.stubGlobal('crypto', webcrypto)
    const oldSave = await actualPersistence.createBingoSave(
      { gameVersion: '0.2.0-old-default', payload, exportedAt: 4_000 },
      importableGameStateSchema,
    )
    vi.mocked(importBingoSave).mockImplementation(actualPersistence.importBingoSave)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'active-round-trip.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File([oldSave.text], 'old-default-active.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))

    expect(screen.getByTestId('activity-duration')).toHaveTextContent(
      DEFAULT_GAME_BALANCE.activityDurationMs.toString(),
    )
    expect(screen.getByTestId('active-started-at')).toHaveTextContent('50000')
    expect(screen.getByTestId('active-ends-at')).toHaveTextContent('4370000')

    fireEvent.click(screen.getByRole('button', { name: '备份' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    const exportedInput = vi.mocked(createBingoSave).mock.calls[0][0] as { payload: GameState }
    expect(exportedInput.payload.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(exportedInput.payload.activeActivity).toEqual(expectedActivity)

    fireEvent.click(screen.getByRole('button', { name: '领取当前活动' }))
    expect(screen.getByTestId('collection-count')).toHaveTextContent('2')
    expect(screen.getByTestId('friend-count')).toHaveTextContent('1')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('3')
  })

  it('导出载荷不快照目录总数、分类解锁状态或全站第一游标', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'portable.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    const exportedInput = vi.mocked(createBingoSave).mock.calls[0][0] as { payload: GameState }
    const { payload } = exportedInput
    const persistedKeys = recursivelyCollectedKeys(payload)

    expect(persistedKeys).not.toContain('collectionTotal')
    expect(persistedKeys).not.toContain('categoryCounts')
    expect(persistedKeys).not.toContain('unlockedCategories')
    expect(persistedKeys).not.toContain('siteFirstCursor')
    expect(persistedKeys).not.toContain('videosByBvid')
    expect(persistedKeys).not.toContain('recordPlayerVideos')
    expect(payload).toMatchObject({
      schemaVersion: 5,
      collections: {},
      friends: {},
      world: 'game',
      player: { effects: { vitality: null } },
      reality: {
        activeStay: null,
        pendingSettlement: null,
        todos: {},
        pomodoro: { selectedPostcardId: null, session: null },
      },
      musicPlayer: { currentBvid: null, currentIndex: 0, loopMode: 'list' },
    })
    expect(payload.inventory).toMatchObject({
      'bottled-speed-magic': 0,
      'bottled-vitality-magic': 0,
    })
  })

  it('V4 好友图鉴按稳定 ID 往返，不写入好友目录总数或展示元数据', async () => {
    const payload = importedGame()
    payload.friends['signal-dog'] = {
      id: 'signal-dog',
      firstMetAt: 2_000,
      lastMetAt: 5_000,
      encounterCount: 3,
      totalGiftApples: 6,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'friends-round-trip.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['friends'], 'friends.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))
    expect(screen.getByTestId('friend-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: '备份' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    const exportedInput = vi.mocked(createBingoSave).mock.calls[0][0] as { payload: GameState }
    const exportedPayload = exportedInput.payload
    expect(exportedPayload.friends).toEqual(payload.friends)
    const keys = recursivelyCollectedKeys(exportedPayload)
    expect(keys).not.toContain('friendTotal')
    expect(keys).not.toContain('friendCatalog')
    expect(keys).not.toContain('giftCatalog')
  })

  it('收藏目录扩容后仍可导入旧 v2 存档并继续导出原有进度', async () => {
    vi.mocked(loadContentCatalog).mockResolvedValue(expandedCatalog)
    vi.mocked(importBingoSave).mockResolvedValue(importResult(importedV2Game()))
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'expanded-catalog.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['old-v2'], 'old-v2.bingo')] },
    })

    expect(await screen.findByRole('region', { name: '存档摘要' })).toHaveTextContent('1 件')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '进入这次旅程' }))
    expect(screen.getByTestId('collection-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: '备份' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    const exportedInput = vi.mocked(createBingoSave).mock.calls[0][0] as { payload: GameState }
    expect(exportedInput.payload.collections).toEqual(importedV2Game().collections)
  })

  it('导入早期 v2 时清除尚未领取的重复收藏计划', async () => {
    const payload = importedV2Game()
    payload.activeActivity = {
      runId: 'legacy-v2-duplicate',
      kind: 'stream',
      startedAt: 2_000,
      endsAt: 114_000,
      rewardSeed: 'legacy-v2-duplicate-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'million-shot-test', category: 'million-shot' },
        friendEventId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'signal-headphones',
      usedLuckyApple: false,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'reconciled.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['legacy-v2'], 'legacy-v2.bingo')] },
    })
    fireEvent.click(await screen.findByRole('button', { name: '进入这次旅程' }))
    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    expect(createBingoSave).toHaveBeenCalledWith(
      {
        gameVersion: '0.5.0-demo.1',
        payload: expect.objectContaining({
          activeActivity: expect.objectContaining({
            rewardPlan: expect.objectContaining({ collection: null }),
          }),
        }),
      },
      gameStateSchema,
    )
  })

  it('导入 V4 时清除已失效的苹果钟背景，再用修复后的状态完成校验', async () => {
    const payload = importedGame()
    payload.reality.pomodoro.selectedPostcardId = 'postcard-no-longer-owned'
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'reconciled-pomodoro.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['stale-pomodoro'], 'stale-pomodoro.bingo')] },
    })

    expect(await screen.findByRole('region', { name: '存档摘要' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '进入这次旅程' }))
    fireEvent.click(screen.getByRole('button', { name: '备份' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())
    const exportedInput = vi.mocked(createBingoSave).mock.calls[0][0] as { payload: GameState }
    expect(exportedInput.payload.reality.pomodoro.selectedPostcardId).toBeNull()
  })

  it('reconcile 不掩盖活动种类与奖励类别不匹配的非法存档', async () => {
    const payload = importedGame()
    payload.collections['postcard-2025-01-0001'] = {
      id: 'postcard-2025-01-0001',
      firstObtainedAt: 2_500,
      duplicateCount: 0,
    }
    payload.activeActivity = {
      runId: 'invalid-owned-postcard',
      kind: 'stream',
      startedAt: 2_000,
      endsAt: 114_000,
      rewardSeed: 'invalid-owned-postcard-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-2025-01-0001', category: 'postcard' },
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'signal-headphones',
      usedLuckyApple: false,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))

    render(<App />)
    const startButton = await screen.findByRole('button', { name: '开始新旅程' })
    await waitFor(() => expect(startButton).toBeEnabled())
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['invalid-owned-reward'], 'invalid-owned-reward.bingo')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'stream 活动只能产生 million-shot 收藏',
    )
    expect(screen.queryByRole('button', { name: '进入这次旅程' })).not.toBeInTheDocument()
  })

  it('拒绝收藏 ID 不属于当前目录的存档，不展示可确认预览', async () => {
    const payload = importedGame()
    payload.collections['removed-collection'] = {
      id: 'removed-collection',
      firstObtainedAt: 2_000,
      duplicateCount: 0,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['invalid-save'], 'removed-collection.bingo')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '收藏 ID“removed-collection”不在当前收藏目录中',
    )
    expect(screen.queryByRole('region', { name: '存档摘要' })).not.toBeInTheDocument()
  })

  it('连续选择 A/B 时只允许较新的导入结果覆盖预览', async () => {
    const first = deferred<BingoSaveImportResult<ImportableGameState>>()
    const second = deferred<BingoSaveImportResult<ImportableGameState>>()
    vi.mocked(importBingoSave)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    const input = screen.getByLabelText('读取 .bingo 存档')
    fireEvent.change(input, { target: { files: [new File(['a'], 'A.bingo')] } })
    fireEvent.change(input, { target: { files: [new File(['b'], 'B.bingo')] } })

    const newerGame = importedGame()
    newerGame.economy.apples = 12
    await act(async () => {
      second.resolve(importResult(newerGame))
      await second.promise
    })
    expect(await screen.findByRole('region', { name: '存档摘要' })).toHaveTextContent('B.bingo')
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12🍎')

    const olderGame = importedGame()
    olderGame.economy.apples = 3
    await act(async () => {
      first.resolve(importResult(olderGame))
      await first.promise
    })
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('B.bingo')
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12🍎')
  })

  it('开始新游戏会使尚未完成的旧导入失效', async () => {
    const pending = deferred<BingoSaveImportResult<ImportableGameState>>()
    vi.mocked(importBingoSave).mockReturnValueOnce(pending.promise)

    render(<App />)
    const start = await screen.findByRole('button', { name: '开始新旅程' })
    await waitFor(() => expect(start).toBeEnabled())
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['pending'], 'pending.bingo')] },
    })
    fireEvent.click(start)
    expect(screen.getByTestId('apple-count')).toHaveTextContent('18')

    await act(async () => {
      pending.resolve(importResult(importedGame()))
      await pending.promise
    })

    expect(screen.queryByRole('region', { name: '存档摘要' })).not.toBeInTheDocument()
    expect(screen.getByTestId('apple-count')).toHaveTextContent('18')
  })

  it('摘要未同步更新的篡改存档仍会被完整性校验拒绝', async () => {
    const actualPersistence = await vi.importActual<typeof import('@/infrastructure/persistence')>(
      '@/infrastructure/persistence',
    )
    vi.stubGlobal('crypto', webcrypto)
    vi.mocked(importBingoSave).mockImplementation(actualPersistence.importBingoSave)

    const exported = await actualPersistence.createBingoSave(
      {
        gameVersion: '0.4.0-demo.1',
        payload: importedGame(),
        exportedAt: 4_000,
      },
      gameStateSchema,
    )
    const tampered = JSON.parse(exported.text) as { payload: GameState }
    tampered.payload.economy.apples += 1

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File([JSON.stringify(tampered)], 'tampered.bingo')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('存档摘要不匹配')
    expect(screen.queryByRole('region', { name: '存档摘要' })).not.toBeInTheDocument()
  })
})
