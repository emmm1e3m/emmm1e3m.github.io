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
  type GameAction,
  type GameState,
  type GameStateV1,
  type GameStateV2,
} from '@/domain'
import {
  createBingoSave,
  downloadBingoSave,
  importBingoSave,
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

  interface Props {
    available: boolean
    error: string | null
    importPreview: Preview | null
    onStart: (displayName: string) => void
    onFile: (file: File) => void
    onConfirmImport: () => void
    onCancelImport: () => void
    onTitleActivate: () => void
  }

  return {
    TitleScreen: ({
      available,
      error,
      importPreview,
      onStart,
      onFile,
      onConfirmImport,
      onCancelImport,
      onTitleActivate,
    }: Props) => (
      <main>
        <h1>旅行饼狗</h1>
        <button type="button" disabled={!available} onClick={() => onStart('小饼干')}>
          开始新旅程
        </button>
        <button type="button" aria-label="连续激活五次可打开隐藏门牌" onClick={onTitleActivate}>
          标题
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
            <span>{importPreview.apples} 个</span>
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
    onAction: (action: GameAction) => void
    onExit: () => void
    onBackup: () => void
  }

  return {
    GameHome: ({ game, dirty, restTransitionKey, onAction, onExit, onBackup }: Props) => (
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
        <output data-testid="dirty-state">{dirty.toString()}</output>
        <output data-testid="active-started-at">{game.activeActivity?.startedAt ?? 'none'}</output>
        <output data-testid="active-ends-at">{game.activeActivity?.endsAt ?? 'none'}</output>
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
          onClick={() => onAction({ type: 'item/purchase', itemId: 'travel-basic' })}
        >
          补充普通便当
        </button>
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
            : '0.3.0-demo.1',
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

async function startNewJourney() {
  const start = await screen.findByRole('button', { name: '开始新旅程' })
  await waitFor(() => expect(start).toBeEnabled())
  fireEvent.click(start)
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

  it('加载目录后用玩家称呼创建 DEBUG V3 新游戏', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '旅行饼狗' })).toBeInTheDocument()
    await screen.findByRole('button', { name: '开始新旅程' })
    await unlockDebugAndStart()

    expect(screen.getByTestId('schema-version')).toHaveTextContent('3')
    expect(screen.getByTestId('display-name')).toHaveTextContent('小饼干')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('0')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('18')
    expect(screen.getByRole('button', { name: 'DEBUG' })).toBeVisible()
  })

  it('v1、v2 与 v3 载荷都会严格拒绝未知字段', () => {
    expect(
      importableGameStateSchema.safeParse({ ...legacyGame(), strayUiState: true }).success,
    ).toBe(false)
    expect(
      importableGameStateSchema.safeParse({ ...importedV2Game(), strayUiState: true }).success,
    ).toBe(false)
    expect(gameStateSchema.safeParse({ ...importedGame(), strayUiState: true }).success).toBe(false)
  })

  it('V3 严格拒绝结束时间早于开始时间的活动快照', () => {
    const payload = readyActivityGame('travel')
    payload.activeActivity = { ...payload.activeActivity!, endsAt: 999 }

    expect(importableGameStateSchema.safeParse(payload).success).toBe(false)
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
    expect(screen.getByText('DEBUG：新增 3 件收藏。')).toBeVisible()
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

  it('先预览迁移后的 V3 称呼与陪伴天数，再采用导入进度', async () => {
    vi.mocked(importBingoSave).mockResolvedValue(importResult(legacyGame()))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    const file = new File(['legacy-save'], 'legacy-trip.bingo')
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [file] },
    })

    const summary = await screen.findByRole('region', { name: '存档摘要' })
    expect(summary).toHaveTextContent('legacy-trip.bingo')
    expect(summary).toHaveTextContent('9 个')
    expect(summary).toHaveTextContent('1 件')
    expect(summary).toHaveTextContent('你')
    expect(summary).toHaveTextContent('1 天')
    expect(importBingoSave).toHaveBeenCalledWith(file, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: '进入这次旅程' }))

    expect(screen.getByTestId('schema-version')).toHaveTextContent('3')
    expect(screen.getByTestId('display-name')).toHaveTextContent('你')
    expect(screen.getByTestId('companion-days')).toHaveTextContent('1')
    expect(screen.getByTestId('apple-count')).toHaveTextContent('9')
    expect(screen.getByTestId('collection-count')).toHaveTextContent('1')
  })

  it('v1 导入后再次导出时只写 V3 载荷与新版游戏版本', async () => {
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
        gameVersion: '0.3.0-demo.1',
        payload: expect.objectContaining({
          schemaVersion: 3,
          profile: expect.objectContaining({ displayName: '你', companionDays: 1 }),
          friends: {},
        }),
      },
      gameStateSchema,
    )
  })

  it('普通备份生成期间出现新动作时不下载旧快照，也不清除 dirty', async () => {
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

    expect(downloadBingoSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByText('刚刚又记下了新进度，这次没有下载，请再保存一次。')).toBeVisible()
  })

  it('普通备份只请求浏览器下载，不把唯一内存进度标记为已保存', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'requested-backup.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '备份' }))

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByTestId('display-name')).toHaveTextContent('小饼干')
    expect(screen.getByText('已请求浏览器下载存档，当前进度仍留在房间里。')).toBeVisible()
  })

  it('下载并离开期间出现新动作时保留最新进度且停留在房间', async () => {
    const pendingExport = deferred<Awaited<ReturnType<typeof createBingoSave>>>()
    vi.mocked(createBingoSave).mockReturnValueOnce(pendingExport.promise)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    await act(async () => {
      pendingExport.resolve({
        fileName: 'stale-exit.bingo',
        text: '{}',
      } as Awaited<ReturnType<typeof createBingoSave>>)
      await pendingExport.promise
    })

    expect(downloadBingoSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.queryByRole('dialog', { name: '要离开铲铲饼屋了吗？' })).not.toBeInTheDocument()
    expect(screen.getByText('刚刚又记下了新进度，请重新保存后再离开。')).toBeVisible()
  })

  it('取消旧的离开意图后，旧导出完成不会关闭后来重新打开的确认框', async () => {
    const pendingExport = deferred<Awaited<ReturnType<typeof createBingoSave>>>()
    vi.mocked(createBingoSave).mockReturnValueOnce(pendingExport.promise)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(createBingoSave).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '继续陪饼狗' }))
    expect(screen.queryByRole('dialog', { name: '要离开铲铲饼屋了吗？' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    expect(screen.getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })).toBeVisible()

    await act(async () => {
      pendingExport.resolve({
        fileName: 'cancelled-exit.bingo',
        text: '{}',
      } as Awaited<ReturnType<typeof createBingoSave>>)
      await pendingExport.promise
    })

    expect(downloadBingoSave).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })).toBeVisible()
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
  })

  it('请求离开下载后仍保留进度，只有明确确认文件已保存才回到标题页', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'confirmed-exit.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))

    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByTestId('display-name')).toHaveTextContent('小饼干')
    expect(screen.getByRole('dialog', { name: '存档保存好了吗？' })).toBeVisible()

    const confirmSaved = screen.getByRole('button', { name: '我已保存，离开' })
    expect(confirmSaved).toHaveFocus()
    fireEvent.click(confirmSaved)

    expect(screen.getByRole('heading', { name: '旅行饼狗' })).toBeVisible()
    expect(screen.queryByTestId('dirty-state')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '存档保存好了吗？' })).not.toBeInTheDocument()
  })

  it('离开下载后确认前出现新进度时拒绝离开并要求重新保存', async () => {
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'stale-confirmation.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '离开' }))
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    fireEvent.click(screen.getByRole('button', { name: '我已保存，离开' }))

    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByRole('dialog', { name: '要离开铲铲饼屋了吗？' })).toBeVisible()
    expect(screen.getByRole('button', { name: '请求下载存档' })).toHaveFocus()
    expect(screen.getByText('刚刚又记下了新进度，请重新保存后再离开。')).toBeVisible()
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

  it('跨标签 controlling 回调遇到未保存进度时走同一保存确认闸门', async () => {
    const reloadPage = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'before-reload.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App reloadPage={reloadPage} />)
    await startNewJourney()

    act(() => appServiceWorker.onNeedReload?.())

    expect(reloadPage).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '更新前先保存这次旅程' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    expect(reloadPage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '我已保存，安装更新' }))

    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce())
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('false')
  })

  it('controlling 后取消保护再重试时直接重走受保护刷新，不调用 waiting 更新', async () => {
    appServiceWorker.needRefresh = true
    const reloadPage = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'retry-reload.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)
    render(<App reloadPage={reloadPage} />)
    await startNewJourney()

    act(() => appServiceWorker.onNeedReload?.())
    fireEvent.click(screen.getByRole('button', { name: '晚点更新' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存后更新' }))

    expect(reloadPage).not.toHaveBeenCalled()
    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '更新前先保存这次旅程' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '我已保存，安装更新' }))

    await waitFor(() => expect(reloadPage).toHaveBeenCalledOnce())
    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('有未保存进度时，PWA 更新会先下载并等待玩家明确确认', async () => {
    appServiceWorker.needRefresh = true
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'before-update.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '保存后更新' }))

    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '更新前先保存这次旅程' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())

    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    fireEvent.click(screen.getByRole('button', { name: '我已保存，安装更新' }))

    await waitFor(() => expect(appServiceWorker.updateServiceWorker).toHaveBeenCalledWith(true))
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('false')
  })

  it('PWA 下载后确认前出现新进度时拒绝更新并保留最新内存状态', async () => {
    appServiceWorker.needRefresh = true
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'stale-update.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    await startNewJourney()
    fireEvent.click(screen.getByRole('button', { name: '保存后更新' }))
    fireEvent.click(screen.getByRole('button', { name: '请求下载存档' }))
    await waitFor(() => expect(downloadBingoSave).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: '补充普通便当' }))
    fireEvent.click(screen.getByRole('button', { name: '我已保存，安装更新' }))

    expect(appServiceWorker.updateServiceWorker).not.toHaveBeenCalled()
    expect(screen.getByTestId('apple-count')).toHaveTextContent('15')
    expect(screen.getByTestId('dirty-state')).toHaveTextContent('true')
    expect(screen.getByRole('dialog', { name: '更新前先保存这次旅程' })).toBeVisible()
    expect(screen.getByText('刚刚又记下了新进度，请重新保存后再更新。')).toBeVisible()
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
    const [{ payload }] = vi.mocked(createBingoSave).mock.calls[0]
    const persistedKeys = recursivelyCollectedKeys(payload)

    expect(persistedKeys).not.toContain('collectionTotal')
    expect(persistedKeys).not.toContain('categoryCounts')
    expect(persistedKeys).not.toContain('unlockedCategories')
    expect(persistedKeys).not.toContain('siteFirstCursor')
    expect(persistedKeys).not.toContain('videosByBvid')
    expect(persistedKeys).not.toContain('recordPlayerVideos')
    expect(payload).toMatchObject({ schemaVersion: 3, collections: {}, friends: {} })
  })

  it('V3 好友图鉴按稳定 ID 往返，不写入好友目录总数或展示元数据', async () => {
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
        gameVersion: '0.3.0-demo.1',
        payload: expect.objectContaining({
          activeActivity: expect.objectContaining({
            rewardPlan: expect.objectContaining({ collection: null }),
          }),
        }),
      },
      gameStateSchema,
    )
  })

  it('在清除已拥有奖励前拒绝活动种类与奖励类别不匹配的存档', async () => {
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
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12 个')

    const olderGame = importedGame()
    olderGame.economy.apples = 3
    await act(async () => {
      first.resolve(importResult(olderGame))
      await first.promise
    })
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('B.bingo')
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12 个')
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
        gameVersion: '0.3.0-demo.1',
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
