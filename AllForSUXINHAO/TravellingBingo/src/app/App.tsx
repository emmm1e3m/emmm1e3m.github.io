import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import {
  gameStateSchema,
  importableGameStateSchema,
  type ImportableGameState,
} from '@/app/gameStateSchema'
import { useGameController } from '@/app/useGameController'
import { useModalFocus } from '@/components/useModalFocus'
import { PwaUpdatePrompt, type InstallPwaUpdate } from '@/components/PwaUpdatePrompt'
import { loadContentCatalog, type ContentCatalog } from '@/content'
import {
  createInitialGameState,
  migrateStoredGameStateToV3,
  normalizeImportedGameBalance,
  reconcileGameStateWithCatalog,
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
  type BingoSaveSummary,
} from '@/infrastructure/persistence'

const GAME_VERSION = '0.3.0-demo.1'
const DEBUG_PASSWORD = 'TravellingBingo'

interface PendingImport {
  fileName: string
  summary: BingoSaveSummary
  game: GameState
}

type ProtectedOperation = 'exit' | 'update'

interface PendingSaveConfirmation {
  fileName: string
  intent: number
  operation: ProtectedOperation
  revision: number
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

const reloadCurrentPage: InstallPwaUpdate = async () => {
  globalThis.location.reload()
}

interface AppProps {
  reloadPage?: InstallPwaUpdate
}

export function App({ reloadPage = reloadCurrentPage }: AppProps = {}) {
  const [catalog, setCatalog] = useState<ContentCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [screen, setScreen] = useState<'title' | 'home'>('title')
  const { game, replaceGame, applyAction: applyGameAction, getSnapshot } = useGameController()
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [reward, setReward] = useState<ClaimSummary | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exitOpen, setExitOpen] = useState(false)
  const [protectedOperation, setProtectedOperation] = useState<ProtectedOperation>('exit')
  const [pendingSaveConfirmation, setPendingSaveConfirmation] =
    useState<PendingSaveConfirmation | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugPassword, setDebugPassword] = useState('')
  const [debugError, setDebugError] = useState<string | null>(null)
  const [debugUnlocked, setDebugUnlocked] = useState(false)
  const [restTransitionKey, setRestTransitionKey] = useState(0)
  const titleActivations = useRef<number[]>([])
  const importAttempt = useRef(0)
  const lastConfirmedRevision = useRef(0)
  const exitIntent = useRef(0)
  const pendingUpdate = useRef<InstallPwaUpdate | null>(null)
  const closeExitDialog = useCallback(() => {
    exitIntent.current += 1
    pendingUpdate.current = null
    setPendingSaveConfirmation(null)
    setExitOpen(false)
  }, [])
  const openExitDialog = useCallback(() => {
    exitIntent.current += 1
    pendingUpdate.current = null
    setProtectedOperation('exit')
    setPendingSaveConfirmation(null)
    setExitOpen(true)
  }, [])
  const debugDialogRef = useModalFocus<HTMLFormElement>(debugOpen, () => setDebugOpen(false))
  const exitDialogRef = useModalFocus<HTMLElement>(exitOpen, closeExitDialog)
  const saveFlowPrimaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (exitOpen) saveFlowPrimaryRef.current?.focus()
  }, [exitOpen, pendingSaveConfirmation])

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

  const startNewGame = useCallback(
    (displayName: string) => {
      if (!catalog) return
      let initial: GameState
      try {
        initial = createInitialGameState({
          now: Date.now(),
          seed: createSeed(),
          displayName,
          debug: debugUnlocked,
        })
      } catch (error) {
        setToast(error instanceof Error ? error.message : '这个称呼暂时不能使用。')
        return
      }
      invalidatePendingImport()
      replaceGame(initial)
      setRestTransitionKey(0)
      setDirty(true)
      setPanel(null)
      setScreen('home')
      setToast(debugUnlocked ? 'DEBUG 旅程已经开始。' : '欢迎回到铲铲饼屋。')
    },
    [catalog, debugUnlocked, invalidatePendingImport, replaceGame],
  )

  const applyAction = useCallback(
    (action: GameAction) => {
      if (!domainCatalog) return
      const transition = applyGameAction(action, domainCatalog)
      if (!transition) return
      if (!transition.ok) {
        setToast(transition.error.message)
        return
      }
      setDirty(true)
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
          setToast(
            effect.boardRefreshed
              ? `Bingo！收好 ${effect.applesAwarded}🍎，新的三件小事写好啦。`
              : `小事完成，收好 ${effect.applesAwarded}🍎。`,
          )
        } else if (effect.type === 'debug-applied') {
          setToast(
            effect.changedCount
              ? `DEBUG：新增 ${effect.changedCount} 件收藏。`
              : 'DEBUG 操作已应用。',
          )
        }
      }
    },
    [applyGameAction, domainCatalog],
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
      // importBingoSave 会先按文件原值验证 SHA-256；schema 本身不做 transform。
      const result = await importBingoSave<ImportableGameState>(file, importableGameStateSchema)
      if (attempt !== importAttempt.current) return
      if (!domainCatalog) {
        throw new Error('收藏目录尚未准备好，暂时不能校验这份存档。')
      }
      const migrated = migrateStoredGameStateToV3(result.payload, {
        now: Date.now(),
        catalog: domainCatalog,
      })
      const normalized = normalizeImportedGameBalance(migrated)
      const semanticValidation = validateImportedGameState(normalized, domainCatalog)
      if (!semanticValidation.ok) throw new Error(semanticValidation.message)
      const imported = reconcileGameStateWithCatalog(normalized, domainCatalog)
      const validation = validateImportedGameState(imported, domainCatalog)
      if (!validation.ok) throw new Error(validation.message)
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

  function confirmImport() {
    if (!pendingImport || !catalog || !domainCatalog) return
    const imported = pendingImport.game
    const validation = validateImportedGameState(imported, domainCatalog)
    if (!validation.ok) {
      importAttempt.current += 1
      setPendingImport(null)
      setImportError(`这份存档没有打开，当前进度未改变：${validation.message}`)
      return
    }
    importAttempt.current += 1
    replaceGame(imported)
    lastConfirmedRevision.current = getSnapshot().revision
    setRestTransitionKey(0)
    setDebugUnlocked((value) => value || imported.profile.debug)
    setPendingImport(null)
    setImportError(null)
    setDirty(false)
    setPanel(null)
    setScreen('home')
    setToast('存档已打开，饼狗回家啦。')
  }

  function requestPwaUpdate(installUpdate: InstallPwaUpdate) {
    const currentSnapshot = getSnapshot()
    const hasUnsavedProgress =
      currentSnapshot.game !== null && currentSnapshot.revision !== lastConfirmedRevision.current
    if (!hasUnsavedProgress) {
      void installUpdate().catch((error: unknown) => {
        setToast(error instanceof Error ? error.message : '新布置没有打开，请稍后再试。')
      })
      return
    }

    exitIntent.current += 1
    pendingUpdate.current = installUpdate
    setProtectedOperation('update')
    setPendingSaveConfirmation(null)
    setExitOpen(true)
  }

  async function exportGame(operation?: ProtectedOperation, requestedExitIntent?: number) {
    const capturedExitIntent = operation ? requestedExitIntent : undefined
    const exportSnapshot = getSnapshot()
    const snapshotGame = exportSnapshot.game
    if (!snapshotGame) return
    try {
      const exported = await createBingoSave(
        { gameVersion: GAME_VERSION, payload: snapshotGame },
        gameStateSchema,
      )
      const latestSnapshot = getSnapshot()
      if (operation && capturedExitIntent !== exitIntent.current) return
      if (latestSnapshot.revision !== exportSnapshot.revision) {
        if (operation) closeExitDialog()
        setDirty(
          latestSnapshot.game !== null && latestSnapshot.revision !== lastConfirmedRevision.current,
        )
        setToast(
          operation === 'exit'
            ? '刚刚又记下了新进度，请重新保存后再离开。'
            : operation === 'update'
              ? '刚刚又记下了新进度，请重新保存后再更新。'
              : '刚刚又记下了新进度，这次没有下载，请再保存一次。',
        )
        return
      }

      const fileName = snapshotGame.profile.debug
        ? exported.fileName.replace(/\.bingo$/u, '-debug.bingo')
        : exported.fileName
      downloadBingoSave({ fileName, text: exported.text })
      if (operation) {
        setPendingSaveConfirmation({
          fileName,
          intent: capturedExitIntent!,
          operation,
          revision: exportSnapshot.revision,
        })
        setToast('已请求浏览器下载存档，请确认文件保存好后再继续。')
      } else {
        setToast('已请求浏览器下载存档，当前进度仍留在房间里。')
      }
    } catch (error) {
      if (operation && capturedExitIntent !== exitIntent.current) return
      setToast(error instanceof Error ? error.message : '存档下载没有成功，请再试一次。')
    }
  }

  function confirmSavedAndContinue() {
    const pending = pendingSaveConfirmation
    if (!pending || pending.intent !== exitIntent.current) return

    const latestSnapshot = getSnapshot()
    if (!latestSnapshot.game || latestSnapshot.revision !== pending.revision) {
      setPendingSaveConfirmation(null)
      setDirty(
        latestSnapshot.game !== null && latestSnapshot.revision !== lastConfirmedRevision.current,
      )
      setToast(
        pending.operation === 'update'
          ? '刚刚又记下了新进度，请重新保存后再更新。'
          : '刚刚又记下了新进度，请重新保存后再离开。',
      )
      return
    }

    lastConfirmedRevision.current = pending.revision
    setDirty(false)
    if (pending.operation === 'exit') {
      closeExitDialog()
      setScreen('title')
      replaceGame(null)
      setRestTransitionKey(0)
      setPanel(null)
      setReward(null)
      return
    }

    const installUpdate = pendingUpdate.current
    closeExitDialog()
    if (!installUpdate) {
      setToast('新布置没有打开，请稍后再试。')
      return
    }
    void installUpdate().catch((error: unknown) => {
      setToast(error instanceof Error ? error.message : '新布置没有打开，请稍后再试。')
    })
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
          restTransitionKey={restTransitionKey}
          reward={reward}
          onPanel={setPanel}
          onAction={applyAction}
          onExit={openExitDialog}
          onBackup={() => void exportGame()}
          onDismissReward={() => setReward(null)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <PwaUpdatePrompt
        hasUnsavedProgress={dirty}
        onNeedReload={() => requestPwaUpdate(reloadPage)}
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

      {exitOpen && game && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeExitDialog}>
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
            <h2 id="exit-title">
              {pendingSaveConfirmation
                ? '存档保存好了吗？'
                : protectedOperation === 'update'
                  ? '更新前先保存这次旅程'
                  : '要离开铲铲饼屋了吗？'}
            </h2>
            {pendingSaveConfirmation ? (
              <p>
                已请求下载 <code>{pendingSaveConfirmation.fileName}</code>
                。请在浏览器下载记录或保存位置确认文件已经存在。
              </p>
            ) : (
              <p>
                {protectedOperation === 'update'
                  ? '先请求浏览器下载最新的 `.bingo` 存档，确认保存后再安装新布置。'
                  : '先请求浏览器下载最新的 `.bingo` 存档，确认保存后再回到标题页。'}
              </p>
            )}
            <div className="button-row">
              {pendingSaveConfirmation ? (
                <button
                  ref={saveFlowPrimaryRef}
                  className="paper-button paper-button--primary"
                  type="button"
                  onClick={confirmSavedAndContinue}
                >
                  {protectedOperation === 'update' ? '我已保存，安装更新' : '我已保存，离开'}
                </button>
              ) : (
                <button
                  ref={saveFlowPrimaryRef}
                  className="paper-button paper-button--primary"
                  type="button"
                  onClick={() => void exportGame(protectedOperation, exitIntent.current)}
                >
                  请求下载存档
                </button>
              )}
              <button className="paper-button" type="button" onClick={closeExitDialog}>
                {protectedOperation === 'update' ? '晚点更新' : '继续陪饼狗'}
              </button>
            </div>
          </article>
        </div>
      )}
    </>
  )
}
