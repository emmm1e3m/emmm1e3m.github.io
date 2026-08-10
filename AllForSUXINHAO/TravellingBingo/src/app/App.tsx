import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  gameStateSchema,
  importableGameStateSchema,
  type ImportableGameState,
} from '@/app/gameStateSchema'
import { useGameController } from '@/app/useGameController'
import { useKeepAliveAudio, type KeepAliveAudioFactory } from '@/app/useKeepAliveAudio'
import { useScreenWakeLock } from '@/app/useScreenWakeLock'
import { useModalFocus } from '@/components/useModalFocus'
import { PwaUpdatePrompt, type InstallPwaUpdate } from '@/components/PwaUpdatePrompt'
import { loadContentCatalog, type ContentCatalog } from '@/content'
import {
  createInitialGameState,
  migrateStoredGameStateToV8,
  normalizeImportedGameBalance,
  reconcileGameStateWithCatalog,
  validateImportedGameState,
  type ClaimSummary,
  type CollectionCatalog,
  type GameAction,
  type GameState,
} from '@/domain'
import { GameHome, type PanelId, type RealitySettlementResult } from '@/features/game/GameHome'
import {
  TitleScreen,
  type CachedSavePreview,
  type ImportPreview,
} from '@/features/title/TitleScreen'
import {
  createBrowserGameCache,
  createBingoSave,
  downloadBingoSave,
  importBingoSave,
  markPeriodicBackupRequested,
  readBrowserGameCache,
  updateBrowserGameCache,
  writeBrowserGameCache,
  type BrowserGameCache,
  type BingoSaveSummary,
} from '@/infrastructure/persistence'

const GAME_VERSION = '0.8.0-demo.1'
const DEBUG_PASSWORD = 'TravellingBingo'
const PERIODIC_BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1_000

interface PendingImport {
  fileName: string
  summary: BingoSaveSummary
  game: GameState
}

type UpdateCheckStatus = 'idle' | 'checking' | 'checked' | 'unsupported' | 'error'
type AppNotificationPermission = NotificationPermission | 'unsupported'

interface PreparedBrowserCache {
  cache: BrowserGameCache<GameState>
  game: GameState
}

function createSeed() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `bingo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function toDomainCatalog(catalog: ContentCatalog): CollectionCatalog {
  return {
    postcard: catalog.items.filter((item) => item.category === 'postcard').map((item) => item.id),
    'million-shot': catalog.items
      .filter((item) => item.category === 'million-shot')
      .map((item) => item.id),
    'site-first': catalog.items
      .filter((item) => item.category === 'site-first')
      .map((item) => item.id),
    siteFirstChronology: catalog.siteFirstChronology,
  }
}

function activitySummary(game: GameState) {
  const activity = game.activeActivity
  if (!activity) return '在铲铲饼屋休息'
  const labels = { travel: '旅行', stream: '刷播', trend: '冲热', music: '听歌', rest: '睡觉' }
  if (activity.endsAt <= Date.now()) return `${labels[activity.kind]}已完成，等待领取`
  const minutes = Math.max(1, Math.ceil((activity.endsAt - Date.now()) / 60_000))
  return `${labels[activity.kind]}还剩约 ${minutes} 分钟`
}

function nextClockDeadline(game: GameState | null): number | null {
  if (!game) return null
  const deadlines: number[] = []
  for (const todo of Object.values(game.reality.todos)) {
    if (todo.completedAt === null && todo.dueAt !== null && todo.notificationIssuedAt === null) {
      deadlines.push(todo.dueAt)
    }
  }
  const session = game.reality.pomodoro.session
  if (session?.status === 'focus' && session.focusNotificationIssuedAt === null) {
    deadlines.push(session.focusEndsAt)
  } else if (session?.status === 'break' && session.completionNotificationIssuedAt === null) {
    deadlines.push(session.cycleEndsAt)
  }
  return deadlines.length > 0 ? Math.min(...deadlines) : null
}

function buildImportPreview(pending: PendingImport | null): ImportPreview | null {
  if (!pending) return null
  const { game, summary } = pending
  return {
    fileName: pending.fileName,
    exportedAt: summary.exportedAt,
    gameVersion: summary.gameVersion,
    apples: game.economy.apples,
    collectionCount: Object.keys(game.collections).length,
    activityLabel: activitySummary(game),
    debug: game.profile.debug,
    displayName: game.profile.displayName,
    companionDays: game.profile.companionDays,
  }
}

function buildCachedPreview(prepared: PreparedBrowserCache | null): CachedSavePreview | null {
  if (!prepared) return null
  const { cache, game } = prepared
  return {
    updatedAt: cache.updatedAt,
    gameVersion: cache.gameVersion,
    apples: game.economy.apples,
    collectionCount: Object.keys(game.collections).length,
    activityLabel: activitySummary(game),
    debug: game.profile.debug,
    displayName: game.profile.displayName,
    companionDays: game.profile.companionDays,
  }
}

function prepareStoredGame(
  stored: ImportableGameState,
  catalog: CollectionCatalog,
  now: number,
): GameState {
  const migrated = migrateStoredGameStateToV8(stored, { now, catalog })
  const normalized = normalizeImportedGameBalance(migrated)
  const reconciled = reconcileGameStateWithCatalog(normalized, catalog)
  const validation = validateImportedGameState(reconciled, catalog)
  if (!validation.ok) throw new Error(validation.message)
  return reconciled
}

function prepareBrowserCache(
  rawCache: BrowserGameCache,
  catalog: CollectionCatalog,
  now: number,
): PreparedBrowserCache {
  const parsedPayload = importableGameStateSchema.safeParse(rawCache.payload)
  if (!parsedPayload.success) {
    throw new Error('缓存中的游戏进度没有通过结构校验。', { cause: parsedPayload.error })
  }
  const game = prepareStoredGame(parsedPayload.data, catalog, now)
  const metadataNeedsUpgrade = rawCache.gameVersion !== GAME_VERSION || game !== parsedPayload.data
  const cache = metadataNeedsUpgrade
    ? updateBrowserGameCache(rawCache, game, now, GAME_VERSION)
    : { ...rawCache, payload: game }
  return { cache, game }
}

const reloadCurrentPage: InstallPwaUpdate = async () => {
  globalThis.location.reload()
}

async function checkServiceWorkerForUpdate(): Promise<boolean> {
  if (!('serviceWorker' in globalThis.navigator)) {
    throw new Error('当前浏览器不支持离线更新。')
  }
  const registration = await globalThis.navigator.serviceWorker.getRegistration()
  if (!registration) throw new Error('离线行囊还没有准备好，请稍后再检查。')
  if (registration.waiting || registration.installing) return true

  let updateFound = false
  const markUpdateFound = () => {
    updateFound = true
  }
  registration.addEventListener('updatefound', markUpdateFound)
  try {
    await registration.update()
    return updateFound || Boolean(registration.waiting || registration.installing)
  } finally {
    registration.removeEventListener('updatefound', markUpdateFound)
  }
}

function readNotificationPermission(): AppNotificationPermission {
  return 'Notification' in globalThis ? globalThis.Notification.permission : 'unsupported'
}

interface AppProps {
  checkForUpdates?: () => Promise<boolean | void>
  createAudioContext?: KeepAliveAudioFactory
  reloadPage?: InstallPwaUpdate
}

export function App({
  checkForUpdates: checkForUpdatesOverride,
  createAudioContext,
  reloadPage = reloadCurrentPage,
}: AppProps = {}) {
  const checkForUpdates = checkForUpdatesOverride ?? checkServiceWorkerForUpdate
  const [catalog, setCatalog] = useState<ContentCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [cacheReady, setCacheReady] = useState(false)
  const [cacheError, setCacheError] = useState<string | null>(null)
  const [preparedCache, setPreparedCache] = useState<PreparedBrowserCache | null>(null)
  const [screen, setScreen] = useState<'title' | 'home'>('title')
  const { game, replaceGame, applyAction: applyGameAction, getSnapshot } = useGameController()
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [cacheWriteFailed, setCacheWriteFailed] = useState(false)
  const [entryBusy, setEntryBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reward, setReward] = useState<ClaimSummary | null>(null)
  const [realitySettlementResult, setRealitySettlementResult] =
    useState<RealitySettlementResult | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugPassword, setDebugPassword] = useState('')
  const [debugError, setDebugError] = useState<string | null>(null)
  const [debugUnlocked, setDebugUnlocked] = useState(false)
  const [restTransitionKey, setRestTransitionKey] = useState(0)
  const [notificationPermission, setNotificationPermission] = useState<AppNotificationPermission>(
    readNotificationPermission,
  )
  const [updateCheckStatus, setUpdateCheckStatus] = useState<UpdateCheckStatus>(() =>
    checkForUpdatesOverride || 'serviceWorker' in globalThis.navigator ? 'idle' : 'unsupported',
  )
  const { activateFromJourneyGesture } = useKeepAliveAudio(createAudioContext)
  useScreenWakeLock(screen === 'home' && game !== null && catalog !== null)
  const titleActivations = useRef<number[]>([])
  const importAttempt = useRef(0)
  const preparedCacheRef = useRef<PreparedBrowserCache | null>(null)
  const periodicBackupInFlight = useRef(false)
  const pwaUpdateBackupPending = useRef(false)
  const pwaUpdateBackupRequest = useRef<{
    snapshot: GameState
    request: Promise<void>
  } | null>(null)
  const debugDialogRef = useModalFocus<HTMLFormElement>(debugOpen, () => setDebugOpen(false))

  const domainCatalog = useMemo(() => (catalog ? toDomainCatalog(catalog) : null), [catalog])

  const setCurrentCache = useCallback((next: PreparedBrowserCache | null) => {
    preparedCacheRef.current = next
    setPreparedCache(next)
  }, [])

  const persistGameToCache = useCallback(
    (nextGame: GameState, replaceSlot = false) => {
      const savedAt = Date.now()
      const current = preparedCacheRef.current
      const nextCache =
        replaceSlot || current === null
          ? createBrowserGameCache({
              saveId: createSeed(),
              gameVersion: GAME_VERSION,
              now: savedAt,
              payload: nextGame,
            })
          : updateBrowserGameCache(current.cache, nextGame, savedAt, GAME_VERSION)
      const prepared = { cache: nextCache, game: nextGame }
      setCurrentCache(prepared)
      try {
        writeBrowserGameCache(nextCache)
        setCacheWriteFailed(false)
        setCacheError(null)
        return true
      } catch (error) {
        setCacheWriteFailed(true)
        setToast(error instanceof Error ? error.message : '浏览器缓存存档没有写入成功。')
        return false
      }
    },
    [setCurrentCache],
  )

  const downloadGameSnapshot = useCallback(async (snapshot: GameState) => {
    const exported = await createBingoSave(
      { gameVersion: GAME_VERSION, payload: snapshot },
      gameStateSchema,
    )
    const fileName = snapshot.profile.debug
      ? exported.fileName.replace(/\.bingo$/u, '-debug.bingo')
      : exported.fileName
    downloadBingoSave({ fileName, text: exported.text })
  }, [])

  const startPwaUpdateBackup = useCallback(() => {
    pwaUpdateBackupPending.current = true
    const snapshot = preparedCacheRef.current?.game ?? getSnapshot().game
    if (!snapshot) return null

    pwaUpdateBackupPending.current = false
    const existing = pwaUpdateBackupRequest.current
    if (existing?.snapshot === snapshot) return existing.request

    const request = downloadGameSnapshot(snapshot)
    const entry = { snapshot, request }
    pwaUpdateBackupRequest.current = entry
    void request.then(undefined, (error: unknown) => {
      if (pwaUpdateBackupRequest.current === entry) pwaUpdateBackupRequest.current = null
      setToast(
        error instanceof Error ? error.message : '发现新布置，但当前缓存存档没有自动下载成功。',
      )
    })
    return request
  }, [downloadGameSnapshot, getSnapshot])

  useEffect(() => {
    if (preparedCache && pwaUpdateBackupPending.current) startPwaUpdateBackup()
  }, [preparedCache, startPwaUpdateBackup])

  const invalidatePendingImport = useCallback(() => {
    importAttempt.current += 1
    setPendingImport(null)
    setImportError(null)
  }, [])

  useEffect(() => {
    let active = true
    loadContentCatalog()
      .then((loaded) => {
        if (active) setCatalog(loaded)
      })
      .catch((error: unknown) => {
        if (active) {
          setCatalogError(error instanceof Error ? error.message : '收藏目录没有加载成功。')
        }
      })
    return () => {
      active = false
    }
  }, [catalogAttempt])

  useEffect(() => {
    if (!domainCatalog) return
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      setCacheReady(false)
      try {
        const rawCache = readBrowserGameCache()
        if (rawCache === null) {
          setCurrentCache(null)
          setCacheError(null)
          return
        }
        setCurrentCache(prepareBrowserCache(rawCache, domainCatalog, Date.now()))
        setCacheError(null)
      } catch (error) {
        setCurrentCache(null)
        setCacheError(error instanceof Error ? error.message : '浏览器缓存存档没有读取成功。')
      } finally {
        setCacheReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [domainCatalog, setCurrentCache])

  useEffect(() => {
    const update = () => {
      setNow(Date.now())
      setNotificationPermission(readNotificationPermission())
    }
    const timer = globalThis.setInterval(update, 1_000)
    globalThis.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      globalThis.clearInterval(timer)
      globalThis.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = globalThis.setTimeout(() => setToast(null), 2_800)
    return () => globalThis.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!cacheWriteFailed) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', warn)
    return () => globalThis.removeEventListener('beforeunload', warn)
  }, [cacheWriteFailed])

  const startNewGame = useCallback(
    async (displayName: string) => {
      if (!catalog) return
      invalidatePendingImport()
      void activateFromJourneyGesture()
      setEntryBusy(true)
      let initial: GameState
      try {
        const previous = preparedCacheRef.current?.game
        if (previous) await downloadGameSnapshot(previous)
        initial = createInitialGameState({
          now: Date.now(),
          seed: createSeed(),
          displayName,
          debug: debugUnlocked,
        })
      } catch (error) {
        setToast(error instanceof Error ? error.message : '新存档暂时没有准备好。')
        setEntryBusy(false)
        return
      }
      const cacheSaved = persistGameToCache(initial, true)
      replaceGame(initial)
      setRealitySettlementResult(null)
      setRestTransitionKey(0)
      setPanel(null)
      setScreen('home')
      setEntryBusy(false)
      if (cacheSaved) {
        setToast(debugUnlocked ? 'DEBUG 旅程已经开始。' : '欢迎回到铲铲饼屋。')
      }
    },
    [
      activateFromJourneyGesture,
      catalog,
      debugUnlocked,
      downloadGameSnapshot,
      invalidatePendingImport,
      persistGameToCache,
      replaceGame,
    ],
  )

  const continueCachedGame = useCallback(() => {
    const cached = preparedCacheRef.current
    if (!cached) return
    invalidatePendingImport()
    void activateFromJourneyGesture()
    const cacheSaved = persistGameToCache(cached.game)
    replaceGame(cached.game)
    setRealitySettlementResult(null)
    setRestTransitionKey(0)
    setDebugUnlocked((value) => value || cached.game.profile.debug)
    setPanel(null)
    setScreen('home')
    if (cacheSaved) setToast('已从浏览器缓存继续旅程。')
  }, [activateFromJourneyGesture, invalidatePendingImport, persistGameToCache, replaceGame])

  const issueBrowserNotification = useCallback(
    (notificationId: string, title: string, body: string) => {
      const permission = readNotificationPermission()
      setNotificationPermission(permission)
      if (permission !== 'granted' || !('Notification' in globalThis)) {
        setToast(`${title} ${body}`)
        return
      }
      try {
        new globalThis.Notification(title, { body, tag: notificationId })
      } catch {
        setToast(`${title} ${body}`)
      }
    },
    [],
  )

  function requestNotificationPermission() {
    if (!('Notification' in globalThis)) {
      setNotificationPermission('unsupported')
      setToast('当前浏览器不支持桌面提醒。')
      return
    }
    void globalThis.Notification.requestPermission()
      .then((permission) => {
        setNotificationPermission(permission)
        setToast(permission === 'granted' ? '桌面提醒准备好啦。' : '桌面提醒没有打开。')
      })
      .catch(() => {
        setNotificationPermission(readNotificationPermission())
        setToast('桌面提醒没有打开。')
      })
  }

  function requestUpdateCheck() {
    if (updateCheckStatus === 'checking') return
    if (!checkForUpdatesOverride && !('serviceWorker' in globalThis.navigator)) {
      setUpdateCheckStatus('unsupported')
      setToast('当前浏览器不支持离线更新。')
      return
    }
    setUpdateCheckStatus('checking')
    setToast(null)
    void checkForUpdates()
      .then((updateFound) => {
        setUpdateCheckStatus('checked')
        if (!updateFound) setToast('铲铲饼屋暂时没有新布置啦')
      })
      .catch((error: unknown) => {
        setUpdateCheckStatus('error')
        setToast(error instanceof Error ? error.message : '检查更新没有成功，请稍后再试。')
      })
  }

  const applyAction = useCallback(
    (action: GameAction) => {
      if (!domainCatalog) return
      const previousGame = getSnapshot().game
      const transition = applyGameAction(action, domainCatalog)
      if (!transition) return
      if (!transition.ok) {
        setToast(transition.error.message)
        return
      }
      const cacheSaved = persistGameToCache(transition.state)
      setNow(Date.now())
      for (const effect of transition.effects) {
        if (effect.type === 'item-purchased') {
          setToast(`冰箱里补充了 ${effect.quantity} 份补给，花掉 ${effect.applesSpent}🍎。`)
        } else if (effect.type === 'activity-started') {
          const label = {
            travel: '旅行',
            stream: '刷播',
            trend: '冲热',
            music: '听歌',
            rest: '睡觉',
          }[effect.activity.kind]
          setToast(`${label}开始啦，回来时记得领取。`)
          setPanel('activity')
        } else if (effect.type === 'activity-cancelled') {
          setReward(null)
          setPanel(null)
          setToast('饼狗提前回家啦。')
        } else if (effect.type === 'activity-claimed') {
          setReward(effect.summary)
          setPanel(null)
        } else if (effect.type === 'pet-rested') {
          setRestTransitionKey(effect.replayKey)
          setPanel(null)
          setToast('天亮啦，饼狗又有精神了。')
        } else if (effect.type === 'pet-encouraged') {
          setToast(`饼狗收下了鼓励，花掉 ${effect.applesSpent}🍎。`)
        } else if (effect.type === 'task-progressed' && effect.completed) {
          setToast(`小事完成，收好 ${effect.applesAwarded}🍎。`)
        } else if (effect.type === 'debug-applied') {
          if (effect.action === 'debug/collect-all') {
            setToast(`DEBUG：收好 ${effect.changedCount ?? 0} 份收藏与好友记录。`)
          } else if (effect.action === 'debug/clear-all') {
            setToast(`DEBUG：清理 ${effect.changedCount ?? 0} 份收藏与好友记录。`)
          } else {
            setToast('DEBUG 操作已应用。')
          }
        } else if (effect.type === 'activity-accelerated') {
          setToast('速度魔法生效啦，这次活动已经完成。')
        } else if (effect.type === 'player-effect-activated') {
          setToast('活力魔法生效啦，饼狗精神满满。')
        } else if (effect.type === 'player-effect-expired') {
          setToast('这瓶活力魔法陪我们走完七天啦。')
        } else if (effect.type === 'reality-entered') {
          setToast('现实里的时间开始记录啦。')
        } else if (effect.type === 'reality-reward-pending') {
          setToast('欢迎回来，请告诉饼狗这段现实任务完成得怎么样。')
        } else if (effect.type === 'reality-reward-settled') {
          setRealitySettlementResult({
            decision: effect.decision,
            awardedApples: effect.awardedApples,
            fullRewardApples: effect.fullRewardApples,
          })
        } else if (effect.type === 'todo-notification-due') {
          issueBrowserNotification(
            effect.notificationId,
            effect.notificationTitle,
            effect.notificationBody,
          )
        } else if (
          effect.type === 'pomodoro-break-started' ||
          effect.type === 'pomodoro-completed'
        ) {
          issueBrowserNotification(
            effect.notificationId,
            effect.notificationTitle,
            effect.notificationBody,
          )
        }
      }
      const unlockedSiteFirst =
        previousGame !== null &&
        domainCatalog['site-first'].some(
          (id) => previousGame.collections[id] === undefined && transition.state.collections[id],
        )
      const metNewFriend =
        previousGame !== null &&
        Object.keys(transition.state.friends).some(
          (id) =>
            previousGame.friends[id as keyof typeof previousGame.friends] === undefined &&
            transition.state.friends[id as keyof typeof transition.state.friends] !== undefined,
        )
      if (unlockedSiteFirst || metNewFriend) {
        void downloadGameSnapshot(transition.state).catch((error: unknown) => {
          setToast(error instanceof Error ? error.message : '关键节点存档没有自动下载成功。')
        })
      }
      if (!cacheSaved) setToast('浏览器缓存存档没有写入成功，请立即下载一份存档。')
    },
    [
      applyGameAction,
      domainCatalog,
      downloadGameSnapshot,
      getSnapshot,
      issueBrowserNotification,
      persistGameToCache,
    ],
  )

  const clockDeadline = useMemo(() => nextClockDeadline(game), [game])

  useEffect(() => {
    if (clockDeadline === null) return
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null
    let dispatched = false

    const dispatchIfDue = () => {
      const current = Date.now()
      setNow(current)
      if (dispatched || current < clockDeadline) return false
      dispatched = true
      applyAction({ type: 'clock/tick', now: current })
      return true
    }
    const schedule = () => {
      if (dispatchIfDue()) return
      const delay = Math.min(Math.max(0, clockDeadline - Date.now()), 2_147_483_647)
      timer = globalThis.setTimeout(schedule, delay)
    }
    const resume = () => {
      if (document.visibilityState === 'visible') dispatchIfDue()
    }

    schedule()
    globalThis.addEventListener('focus', dispatchIfDue)
    document.addEventListener('visibilitychange', resume)
    return () => {
      if (timer !== null) globalThis.clearTimeout(timer)
      globalThis.removeEventListener('focus', dispatchIfDue)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [applyAction, clockDeadline])

  async function loadFile(file: File) {
    const attempt = importAttempt.current + 1
    importAttempt.current = attempt
    setPendingImport(null)
    setImportError(null)
    if (!file.name.toLowerCase().endsWith('.bingo')) {
      setImportError('请选择扩展名为 .bingo 的旅行饼狗存档。')
      return
    }
    try {
      // importBingoSave 会先按文件原值验证 SHA-256；schema 本身不做 transform。
      const result = await importBingoSave<ImportableGameState>(file, importableGameStateSchema)
      if (attempt !== importAttempt.current) return
      if (!domainCatalog) {
        throw new Error('收藏目录尚未准备好，暂时不能校验这份存档。')
      }
      const imported = prepareStoredGame(result.payload, domainCatalog, Date.now())
      setPendingImport({ fileName: file.name, summary: result.summary, game: imported })
    } catch (error) {
      if (attempt !== importAttempt.current) return
      setPendingImport(null)
      setImportError(
        error instanceof Error
          ? `这份存档没有打开，当前进度未改变：${error.message}`
          : '这份存档没有打开，当前进度未改变。',
      )
    }
  }

  async function confirmImport() {
    if (!pendingImport || entryBusy) return
    void activateFromJourneyGesture()
    const imported = pendingImport.game
    setEntryBusy(true)
    try {
      const previous = preparedCacheRef.current?.game
      if (previous) await downloadGameSnapshot(previous)
    } catch (error) {
      setToast(error instanceof Error ? error.message : '原缓存存档没有自动下载成功。')
      setEntryBusy(false)
      return
    }
    importAttempt.current += 1
    const cacheSaved = persistGameToCache(imported, true)
    replaceGame(imported)
    setRealitySettlementResult(null)
    setRestTransitionKey(0)
    setDebugUnlocked((value) => value || imported.profile.debug)
    setPendingImport(null)
    setImportError(null)
    setEntryBusy(false)
    setPanel(null)
    setScreen('home')
    if (cacheSaved) setToast('存档已打开，饼狗回家啦。')
  }

  useEffect(() => {
    if (!preparedCache) return
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null

    const requestIfDue = () => {
      const current = preparedCacheRef.current
      if (!current || periodicBackupInFlight.current) return
      const base = current.cache.lastPeriodicBackupRequestedAt ?? current.cache.firstCachedAt
      const deadline = base + PERIODIC_BACKUP_INTERVAL_MS
      const currentTime = Date.now()
      if (currentTime < deadline) return

      periodicBackupInFlight.current = true
      const saveId = current.cache.saveId
      void downloadGameSnapshot(current.game)
        .then(() => {
          const latest = preparedCacheRef.current
          if (!latest || latest.cache.saveId !== saveId) return
          const markedCache = markPeriodicBackupRequested(latest.cache, Date.now())
          const marked = { cache: markedCache, game: latest.game }
          setCurrentCache(marked)
          try {
            writeBrowserGameCache(markedCache)
            setCacheWriteFailed(false)
          } catch (error) {
            setCacheWriteFailed(true)
            setToast(error instanceof Error ? error.message : '周期备份时间没有写入缓存。')
          }
        })
        .catch((error: unknown) => {
          setToast(error instanceof Error ? error.message : '三天周期存档没有自动下载成功。')
        })
        .finally(() => {
          periodicBackupInFlight.current = false
        })
    }

    const base =
      preparedCache.cache.lastPeriodicBackupRequestedAt ?? preparedCache.cache.firstCachedAt
    const delay = Math.min(
      Math.max(0, base + PERIODIC_BACKUP_INTERVAL_MS - Date.now()),
      2_147_483_647,
    )
    timer = globalThis.setTimeout(requestIfDue, delay)
    const resume = () => {
      if (document.visibilityState === 'visible') requestIfDue()
    }
    globalThis.addEventListener('focus', requestIfDue)
    document.addEventListener('visibilitychange', resume)
    return () => {
      if (timer !== null) globalThis.clearTimeout(timer)
      globalThis.removeEventListener('focus', requestIfDue)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [downloadGameSnapshot, preparedCache, setCurrentCache])

  function requestPwaUpdate(installUpdate: InstallPwaUpdate) {
    void (async () => {
      try {
        const backupRequest = startPwaUpdateBackup()
        if (backupRequest) await backupRequest
        await installUpdate()
      } catch (error) {
        setToast(error instanceof Error ? error.message : '新布置没有打开，请稍后再试。')
      }
    })()
  }

  async function exportGame() {
    const snapshotGame = getSnapshot().game ?? preparedCacheRef.current?.game ?? null
    if (!snapshotGame) return
    try {
      await downloadGameSnapshot(snapshotGame)
      setToast('存档已经交给浏览器下载。')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '存档下载没有成功，请再试一次。')
    }
  }

  function leaveHome() {
    setScreen('title')
    replaceGame(null)
    setRestTransitionKey(0)
    setPanel(null)
    setReward(null)
    setRealitySettlementResult(null)
  }

  function activateTitle() {
    const current = Date.now()
    titleActivations.current = [
      ...titleActivations.current.filter((time) => current - time <= 3_000),
      current,
    ]
    if (titleActivations.current.length >= 5) {
      titleActivations.current = []
      setDebugPassword('')
      setDebugError(null)
      setDebugOpen(true)
    }
  }

  function submitDebug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (debugPassword !== DEBUG_PASSWORD) {
      setDebugError('门牌没有反应……再想想暗号。')
      return
    }
    setDebugUnlocked(true)
    setDebugOpen(false)
    setToast('隐藏门牌打开了，DEBUG 已解锁。')
  }

  const preview = buildImportPreview(pendingImport)
  const cachedPreview = buildCachedPreview(preparedCache)

  return (
    <>
      {screen === 'title' || !game || !catalog ? (
        <TitleScreen
          loading={entryBusy || (!catalog && !catalogError) || (Boolean(catalog) && !cacheReady)}
          available={Boolean(catalog) && cacheReady}
          error={catalogError ?? importError ?? cacheError}
          importPreview={preview}
          cachedPreview={cachedPreview}
          debugUnlocked={debugUnlocked}
          updateCheckStatus={updateCheckStatus}
          onStart={startNewGame}
          onContinueCached={continueCachedGame}
          onFile={(file) => void loadFile(file)}
          onConfirmImport={confirmImport}
          onCancelImport={invalidatePendingImport}
          onRetryCatalog={() => {
            setCatalogError(null)
            setCatalogAttempt((attempt) => attempt + 1)
          }}
          onTitleActivate={activateTitle}
          onCheckForUpdates={requestUpdateCheck}
        />
      ) : (
        <GameHome
          game={game}
          catalog={catalog}
          now={now}
          panel={panel}
          dirty={cacheWriteFailed}
          restTransitionKey={restTransitionKey}
          reward={reward}
          realitySettlementResult={realitySettlementResult}
          notificationPermission={notificationPermission}
          onPanel={setPanel}
          onAction={applyAction}
          onExit={leaveHome}
          onBackup={() => void exportGame()}
          onRequestNotificationPermission={requestNotificationPermission}
          onDismissReward={() => setReward(null)}
          onDismissRealitySettlementResult={() => setRealitySettlementResult(null)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <PwaUpdatePrompt
        onNeedReload={() => requestPwaUpdate(reloadPage)}
        onUpdateAvailable={startPwaUpdateBackup}
        onRequestUpdate={requestPwaUpdate}
      />

      {debugOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDebugOpen(false)}>
          <form
            ref={debugDialogRef}
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="debug-title"
            tabIndex={-1}
            onSubmit={submitDebug}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="paper-tag paper-tag--debug">隐藏门牌</span>
            <h2 id="debug-title">输入调试暗号</h2>
            <p>说出铲铲饼屋的暗号，就能调整下一段旅程。</p>
            <label className="field-label">
              暗号
              <input
                autoFocus
                type="password"
                value={debugPassword}
                onChange={(event) => setDebugPassword(event.target.value)}
              />
            </label>
            {debugError && (
              <p className="inline-error" role="alert">
                {debugError}
              </p>
            )}
            <div className="button-row">
              <button className="paper-button paper-button--primary" type="submit">
                打开门牌
              </button>
              <button className="paper-button" type="button" onClick={() => setDebugOpen(false)}>
                算啦
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
