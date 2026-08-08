import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { gameStateSchema } from '@/app/gameStateSchema'
import { useModalFocus } from '@/components/useModalFocus'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import { loadContentCatalog, type ContentCatalog } from '@/content'
import {
  createInitialGameState,
  reduceGame,
  validateImportedGameState,
  type ClaimSummary,
  type CollectionCatalog,
  type GameAction,
  type GameState,
} from '@/domain'
import { GameHome, type PanelId } from '@/features/game/GameHome'
import { TitleScreen, type ImportPreview } from '@/features/title/TitleScreen'
import {
  createBingoSave,
  downloadBingoSave,
  importBingoSave,
  type BingoSaveImportResult,
} from '@/infrastructure/persistence'

const GAME_VERSION = '0.1.0-demo.1'
const DEBUG_PASSWORD = 'TravellingBingo'

interface PendingImport {
  fileName: string
  result: BingoSaveImportResult<GameState>
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
  }
}

function activitySummary(game: GameState) {
  const activity = game.activeActivity
  if (!activity) return '在铲铲饼屋休息'
  const labels = { travel: '旅行', stream: '刷播', trend: '冲热' }
  if (activity.endsAt <= Date.now()) return `${labels[activity.kind]}已完成，等待领取`
  const minutes = Math.max(1, Math.ceil((activity.endsAt - Date.now()) / 60_000))
  return `${labels[activity.kind]}还剩约 ${minutes} 分钟`
}

function buildImportPreview(pending: PendingImport | null): ImportPreview | null {
  if (!pending) return null
  const { payload, summary } = pending.result
  return {
    fileName: pending.fileName,
    exportedAt: summary.exportedAt,
    gameVersion: summary.gameVersion,
    apples: payload.economy.apples,
    collectionCount: Object.keys(payload.collections).length,
    activityLabel: activitySummary(payload),
    debug: payload.profile.debug,
  }
}

export function App() {
  const [catalog, setCatalog] = useState<ContentCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [screen, setScreen] = useState<'title' | 'home'>('title')
  const [game, setGame] = useState<GameState | null>(null)
  const [panel, setPanel] = useState<PanelId>('status')
  const [now, setNow] = useState(() => Date.now())
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reward, setReward] = useState<ClaimSummary | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exitOpen, setExitOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugPassword, setDebugPassword] = useState('')
  const [debugError, setDebugError] = useState<string | null>(null)
  const [debugUnlocked, setDebugUnlocked] = useState(false)
  const [debugDurationMs, setDebugDurationMs] = useState(10_000)
  const titleActivations = useRef<number[]>([])
  const importAttempt = useRef(0)
  const debugDialogRef = useModalFocus<HTMLFormElement>(debugOpen, () => setDebugOpen(false))
  const exitDialogRef = useModalFocus<HTMLElement>(exitOpen, () => setExitOpen(false))

  const domainCatalog = useMemo(() => (catalog ? toDomainCatalog(catalog) : null), [catalog])

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
    const update = () => setNow(Date.now())
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
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    globalThis.addEventListener('beforeunload', warn)
    return () => globalThis.removeEventListener('beforeunload', warn)
  }, [dirty])

  const startNewGame = useCallback(() => {
    if (!catalog) return
    invalidatePendingImport()
    const initial = createInitialGameState({
      now: Date.now(),
      seed: createSeed(),
      debug: debugUnlocked,
    })
    setGame(initial)
    setDirty(true)
    setPanel('status')
    setScreen('home')
    setToast(debugUnlocked ? 'DEBUG 旅程已经开始。' : '欢迎回到铲铲饼屋。')
  }, [catalog, debugUnlocked, invalidatePendingImport])

  const applyAction = useCallback(
    (action: GameAction) => {
      if (!game || !domainCatalog) return
      const transition = reduceGame(game, action, domainCatalog)
      if (!transition.ok) {
        setToast(transition.error.message)
        return
      }
      setGame(transition.state)
      setDirty(true)
      setNow(Date.now())
      for (const effect of transition.effects) {
        if (effect.type === 'item-purchased') {
          setToast(`补给已经放进背包，花掉 ${effect.applesSpent} 个苹果。`)
        } else if (effect.type === 'activity-started') {
          const label = { travel: '旅行', stream: '刷播', trend: '冲热' }[effect.activity.kind]
          setToast(`${label}开始啦，回来时记得领取。`)
          setPanel('activity')
        } else if (effect.type === 'activity-claimed') {
          setReward(effect.summary)
          setPanel('status')
        } else if (effect.type === 'debug-applied') {
          setToast(
            effect.changedCount
              ? `DEBUG：新增 ${effect.changedCount} 件收藏。`
              : 'DEBUG 操作已应用。',
          )
        }
      }
    },
    [domainCatalog, game],
  )

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
      const result = await importBingoSave(file, gameStateSchema)
      if (attempt !== importAttempt.current) return
      if (!domainCatalog) {
        throw new Error('收藏目录尚未准备好，暂时不能校验这份存档。')
      }
      const validation = validateImportedGameState(result.payload, domainCatalog)
      if (!validation.ok) throw new Error(validation.message)
      setPendingImport({ fileName: file.name, result })
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

  function confirmImport() {
    if (!pendingImport || !catalog || !domainCatalog) return
    const imported = pendingImport.result.payload
    const validation = validateImportedGameState(imported, domainCatalog)
    if (!validation.ok) {
      importAttempt.current += 1
      setPendingImport(null)
      setImportError(`这份存档没有打开，当前进度未改变：${validation.message}`)
      return
    }
    importAttempt.current += 1
    setGame(imported)
    setDebugUnlocked((value) => value || imported.profile.debug)
    setPendingImport(null)
    setImportError(null)
    setDirty(false)
    setPanel('status')
    setScreen('home')
    setToast('存档已打开，饼狗回家啦。')
  }

  async function exportGame(leaveAfter: boolean) {
    if (!game) return
    try {
      const exported = await createBingoSave(
        { gameVersion: GAME_VERSION, payload: game },
        gameStateSchema,
      )
      const fileName = game.profile.debug
        ? exported.fileName.replace(/\.bingo$/u, '-debug.bingo')
        : exported.fileName
      downloadBingoSave({ fileName, text: exported.text })
      setDirty(false)
      setExitOpen(false)
      setToast('存档已装进背包。')
      if (leaveAfter) {
        setScreen('title')
        setGame(null)
        setPanel('status')
        setReward(null)
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : '存档下载没有成功，请再试一次。')
    }
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
    setGame((current) =>
      current ? { ...current, profile: { ...current.profile, debug: true } } : current,
    )
    setDebugOpen(false)
    setToast('隐藏门牌打开了，DEBUG 已解锁。')
  }

  const preview = buildImportPreview(pendingImport)

  return (
    <>
      {screen === 'title' || !game || !catalog ? (
        <TitleScreen
          loading={!catalog && !catalogError}
          available={Boolean(catalog)}
          error={catalogError ?? importError}
          importPreview={preview}
          debugUnlocked={debugUnlocked}
          onStart={startNewGame}
          onFile={(file) => void loadFile(file)}
          onConfirmImport={confirmImport}
          onCancelImport={invalidatePendingImport}
          onRetryCatalog={() => {
            setCatalogError(null)
            setCatalogAttempt((attempt) => attempt + 1)
          }}
          onTitleActivate={activateTitle}
        />
      ) : (
        <GameHome
          game={game}
          catalog={catalog}
          now={now}
          panel={panel}
          dirty={dirty}
          debugDurationMs={debugDurationMs}
          reward={reward}
          onPanel={setPanel}
          onAction={applyAction}
          onExit={() => setExitOpen(true)}
          onBackup={() => void exportGame(false)}
          onDebugDuration={setDebugDurationMs}
          onDismissReward={() => setReward(null)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <PwaUpdatePrompt />

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
            <p>这里不是安全边界，只是给开发和验收留的一扇小门。</p>
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

      {exitOpen && game && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setExitOpen(false)}>
          <article
            ref={exitDialogRef}
            className="small-dialog exit-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-title"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="exit-dialog__bag" aria-hidden="true">
              🎒
            </span>
            <h2 id="exit-title">要离开铲铲饼屋了吗？</h2>
            <p>会先把最新进度下载为 `.bingo`，再回到标题页。</p>
            <div className="button-row">
              <button
                className="paper-button paper-button--primary"
                type="button"
                onClick={() => void exportGame(true)}
              >
                下载存档并离开
              </button>
              <button className="paper-button" type="button" onClick={() => setExitOpen(false)}>
                继续陪饼狗
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  )
}
