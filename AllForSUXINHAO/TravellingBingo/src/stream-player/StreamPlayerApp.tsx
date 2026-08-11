import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  buildOfficialPlayerUrl,
  DEFAULT_STREAM_ROUND_INTERVAL_MS,
  fetchFavoriteCatalog,
  parseSelfTestInput,
  parseStopHoursInput,
  parseStreamPlayerQuery,
  STREAM_FAVORITE_LABELS,
  STREAM_FAVORITE_IDS,
  type StreamFavoriteId,
  type StreamPlayerQuery,
} from './catalog'
import { readStreamPlayerHistory, type StreamPlayerHistoryItem } from './history'
import { storeStreamSession } from '@/features/reality/stream/popupProtocol'
import { startKeepAliveAudio } from './keepAlive'
import {
  createStreamPlayerEvent,
  isStreamPlayerStopCommand,
  type StreamPlayerEventPayload,
} from './protocol'
import {
  StreamRoundScheduler,
  type StreamSchedulerSnapshot,
  type StreamSchedulerStatus,
} from './scheduler'

interface PlayerFrame {
  readonly id: string
  readonly bvid: string
  readonly url: string
  readonly round: number
  readonly index: number
}

type PageStatus = 'idle' | 'loading' | StreamSchedulerStatus | 'error'

export const STREAM_PLAYER_DEBUG_ENABLED_KEY = 'travelling-bingo:stream-player-debug-enabled:v1'

function readDebugEnabled() {
  try {
    return localStorage.getItem(STREAM_PLAYER_DEBUG_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function storeDebugEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STREAM_PLAYER_DEBUG_ENABLED_KEY, '1')
    else localStorage.removeItem(STREAM_PLAYER_DEBUG_ENABLED_KEY)
  } catch {
    // 本地存储不可用时，DEBUG 仍可在当前页面使用。
  }
}

function formatDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

function formatHistoryOutcome(outcome: StreamPlayerHistoryItem['outcome']) {
  return outcome === 'completed' ? '已完成' : '已停止'
}

function pageStatusText(status: PageStatus, snapshot: StreamSchedulerSnapshot | null) {
  switch (status) {
    case 'idle':
      return '等待开始'
    case 'loading':
      return '正在准备收藏夹'
    case 'opening':
      return snapshot === null
        ? '正在打开视频'
        : `第 ${snapshot.round} 轮：已打开 ${snapshot.openedCount} / ${snapshot.totalCount}`
    case 'waiting':
      return snapshot === null ? '本轮播放中' : `第 ${snapshot.round} 轮已全部打开`
    case 'completed':
      return '定时刷播已完成'
    case 'stopped':
      return '刷播已停止'
    case 'error':
      return '刷播未能启动'
  }
}

export function StreamPlayerApp() {
  const queryResult = useMemo(() => {
    try {
      return { ok: true as const, value: parseStreamPlayerQuery(window.location.search) }
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : '刷播参数无效。',
      }
    }
  }, [])
  const query: StreamPlayerQuery | null = queryResult.ok ? queryResult.value : null

  const schedulerRef = useRef<StreamRoundScheduler | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)
  const completedTaskRef = useRef(false)
  const autostartHandledRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)
  const openerRef = useRef(window.opener ?? null)
  const sessionIdRef = useRef(query?.sessionId ?? '')

  const [status, setStatus] = useState<PageStatus>(query === null ? 'error' : 'idle')
  const [favoriteId, setFavoriteId] = useState<StreamFavoriteId>(query?.favoriteId ?? '3682220021')
  const [selfTestInput, setSelfTestInput] = useState(query?.selfTestBvid ?? '')
  const [stopHoursInput, setStopHoursInput] = useState(
    query?.stopHours === null || query?.stopHours === undefined ? '' : String(query.stopHours),
  )
  const [activeConfig, setActiveConfig] = useState<StreamPlayerQuery | null>(null)
  const [snapshot, setSnapshot] = useState<StreamSchedulerSnapshot | null>(null)
  const [frames, setFrames] = useState<readonly PlayerFrame[]>([])
  const [errorMessage, setErrorMessage] = useState(queryResult.ok ? '' : queryResult.message)
  const [history, setHistory] = useState(() => readStreamPlayerHistory())
  const [secretClicks, setSecretClicks] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [debugEnabled, setDebugEnabled] = useState(readDebugEnabled)
  const [showPlayers, setShowPlayers] = useState(false)
  const [roundSeconds, setRoundSeconds] = useState(String(DEFAULT_STREAM_ROUND_INTERVAL_MS / 1_000))
  const roundIntervalMsRef = useRef(DEFAULT_STREAM_ROUND_INTERVAL_MS)
  const [debugMessage, setDebugMessage] = useState('')

  const postToMain = useCallback(
    (event: StreamPlayerEventPayload) => {
      if (query === null || openerRef.current === null) return
      openerRef.current.postMessage(
        createStreamPlayerEvent(sessionIdRef.current, event),
        window.location.origin,
      )
    },
    [query],
  )

  const finishHistory = useCallback(
    (endedAt: number, roundsCompleted: number, outcome: StreamPlayerHistoryItem['outcome']) => {
      if (query === null || startedAtRef.current === null) return
      storeStreamSession({
        sessionId: sessionIdRef.current,
        startedAt: startedAtRef.current,
        endedAt,
        roundsCompleted,
        outcome,
      })
      setHistory(readStreamPlayerHistory())
    },
    [query],
  )

  const stopPlayback = useCallback(() => {
    const scheduler = schedulerRef.current
    if (scheduler !== null) {
      scheduler.stop()
      return
    }
    if (!startedRef.current) return

    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    const endedAt = Date.now()
    finishHistory(endedAt, 0, 'stopped')
    postToMain({ event: 'ended', outcome: 'stopped' })
    startedRef.current = false
    completedTaskRef.current = true
    setSnapshot(null)
    setFrames([])
    setStatus('stopped')
    setErrorMessage('')
  }, [finishHistory, postToMain])

  const start = useCallback(async () => {
    if (query === null || startedRef.current) return
    let nextConfig: StreamPlayerQuery
    try {
      nextConfig = {
        ...query,
        favoriteId,
        selfTestBvid: parseSelfTestInput(selfTestInput),
        stopHours: parseStopHoursInput(stopHoursInput),
      }
    } catch (error) {
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '刷播设置无效。')
      return
    }

    if (completedTaskRef.current) sessionIdRef.current = crypto.randomUUID()
    completedTaskRef.current = false
    startedRef.current = true
    startedAtRef.current = Date.now()
    schedulerRef.current?.dispose()
    schedulerRef.current = null
    setSnapshot(null)
    setFrames([])
    setActiveConfig(nextConfig)
    setStatus('loading')
    setErrorMessage('')
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const catalogBvids = await fetchFavoriteCatalog(nextConfig.favoriteId, controller.signal)
      if (controller.signal.aborted) return
      const stopAt =
        nextConfig.stopHours === null ? null : Date.now() + nextConfig.stopHours * 60 * 60 * 1_000

      const scheduler = new StreamRoundScheduler({
        catalogBvids,
        selfTestBvid: nextConfig.selfTestBvid,
        stopAt,
        roundIntervalMs: roundIntervalMsRef.current,
        onStarted: (startedAt) => {
          startedAtRef.current = startedAt
          postToMain({ event: 'started' })
        },
        onOpenVideo: (bvid, round, index) => {
          setFrames((current) => [
            ...current,
            {
              id: `${round}:${index}:${bvid}`,
              bvid,
              url: buildOfficialPlayerUrl(bvid),
              round,
              index,
            },
          ])
        },
        onClearRound: () => setFrames([]),
        onStatus: (nextSnapshot) => {
          setSnapshot(nextSnapshot)
          setStatus(nextSnapshot.status)
        },
        onEnded: (outcome, endedAt, roundsCompleted) => {
          finishHistory(endedAt, roundsCompleted, outcome)
          postToMain({ event: 'ended', outcome })
          startedRef.current = false
          completedTaskRef.current = true
        },
      })
      schedulerRef.current = scheduler
      scheduler.start()
    } catch (error) {
      if (controller.signal.aborted) return
      startedRef.current = false
      setActiveConfig(null)
      setStatus('error')
      setErrorMessage(error instanceof Error ? error.message : '刷播未能启动。')
    }
  }, [favoriteId, finishHistory, postToMain, query, selfTestInput, stopHoursInput])

  useEffect(() => {
    return startKeepAliveAudio()
  }, [])

  useEffect(() => {
    if (!query?.autostart || autostartHandledRef.current) return undefined
    autostartHandledRef.current = true
    const timer = window.setTimeout(() => void start(), 0)
    return () => window.clearTimeout(timer)
  }, [query, start])

  useEffect(() => {
    const opener = openerRef.current
    if (query === null || opener === null) return undefined
    const receiveCommand = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== opener) return
      if (!isStreamPlayerStopCommand(event.data, sessionIdRef.current)) return
      stopPlayback()
    }
    window.addEventListener('message', receiveCommand)
    return () => window.removeEventListener('message', receiveCommand)
  }, [query, stopPlayback])

  useEffect(() => {
    const reconcile = () => schedulerRef.current?.reconcile()
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('pageshow', reconcile)
    return () => {
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('pageshow', reconcile)
    }
  }, [])

  useEffect(
    () => () => {
      abortControllerRef.current?.abort()
      schedulerRef.current?.dispose()
    },
    [],
  )

  const unlockDebug = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== 'SUperView') {
      setPasswordError('密码不对，再试一次吧。')
      return
    }
    setDebugEnabled(true)
    storeDebugEnabled(true)
    setShowPassword(false)
    setPassword('')
    setPasswordError('')
  }

  const closeDebug = () => {
    setDebugEnabled(false)
    storeDebugEnabled(false)
    setShowPlayers(false)
    setShowPassword(false)
    setSecretClicks(0)
    setPassword('')
    setPasswordError('')
    setDebugMessage('')
  }

  const applyDebugInterval = () => {
    const parsedSeconds = Number(roundSeconds)
    if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) {
      setDebugMessage('请填写大于 0 的秒数。')
      return
    }
    const intervalMs = parsedSeconds * 1_000
    roundIntervalMsRef.current = intervalMs
    const running = status === 'opening' || status === 'waiting'
    if (running) schedulerRef.current?.setRoundIntervalMs(intervalMs)
    setDebugMessage(
      running
        ? `轮次间隔已设为 ${parsedSeconds} 秒。`
        : `轮次间隔已设为 ${parsedSeconds} 秒，下次启动生效。`,
    )
  }

  const onTitleClick = () => {
    if (debugEnabled || showPassword) return
    const next = secretClicks + 1
    setSecretClicks(next)
    if (next >= 5) setShowPassword(true)
  }

  const canStop = status === 'loading' || status === 'opening' || status === 'waiting'
  const canStart =
    status === 'idle' || status === 'error' || status === 'stopped' || status === 'completed'
  const canConfigure = canStart
  const visibleConfig = activeConfig ?? query

  return (
    <main className="stream-page">
      <header className="stream-hero">
        <span className="paper-tag">SUperView</span>
        <h1 onClick={onTitleClick}>在线刷播工具</h1>
        <p>会使用当前浏览器账号，登录时每天不要超过5小时。</p>
        <p>
          在新设备/浏览器上请先检查：若登录，历史记录里出现刷播视频为成功；若未登录，自测视频播放量增加为成功。
        </p>
      </header>

      {query !== null ? (
        <section className="stream-card" aria-labelledby="stream-status-title">
          <div className="stream-card__heading">
            <div>
              <p className="stream-eyebrow">当前任务</p>
              <h2 id="stream-status-title">
                {STREAM_FAVORITE_LABELS[visibleConfig?.favoriteId ?? favoriteId]}收藏夹
              </h2>
            </div>
            <span
              className={`stream-status stream-status--${status}`}
              data-status={status}
              data-round={snapshot?.round}
              data-next-round-at={snapshot?.nextActionAt ?? undefined}
            >
              {pageStatusText(status, snapshot)}
            </span>
          </div>

          <fieldset className="stream-config" disabled={!canConfigure}>
            <legend>刷播设置</legend>
            <span className="stream-config__label">收藏夹</span>
            <div className="stream-radio-group" role="group" aria-label="收藏夹">
              {STREAM_FAVORITE_IDS.map((id) => (
                <label key={id}>
                  <input
                    type="radio"
                    name="stream-favorite"
                    value={id}
                    checked={favoriteId === id}
                    onChange={(event) => setFavoriteId(event.target.value as StreamFavoriteId)}
                  />
                  {STREAM_FAVORITE_LABELS[id]}
                </label>
              ))}
            </div>
            <label htmlFor="stream-self-test">自测视频（可留空）</label>
            <input
              id="stream-self-test"
              type="text"
              aria-label="自测视频BV号或链接"
              placeholder="BV 号或完整视频链接"
              value={selfTestInput}
              onChange={(event) => setSelfTestInput(event.target.value)}
            />
            <label htmlFor="stream-stop-hours">定时停止（小时）</label>
            <input
              id="stream-stop-hours"
              type="number"
              aria-label="定时停止（小时）"
              min="0"
              max="24"
              step="0.5"
              placeholder="0 或留空表示不限时"
              value={stopHoursInput}
              onChange={(event) => setStopHoursInput(event.target.value)}
            />
          </fieldset>

          <dl className="stream-facts">
            <div>
              <dt>自测视频</dt>
              <dd>{visibleConfig?.selfTestBvid ?? '未添加'}</dd>
            </div>
            <div>
              <dt>已完成轮次</dt>
              <dd>{snapshot?.roundsCompleted ?? 0}</dd>
            </div>
            {snapshot?.status === 'waiting' && snapshot.nextActionAt !== null ? (
              <div>
                <dt>下一轮</dt>
                <dd>
                  <time dateTime={new Date(snapshot.nextActionAt).toISOString()}>
                    {formatDateTime(snapshot.nextActionAt)}
                  </time>
                </dd>
              </div>
            ) : null}
            {snapshot?.stopAt !== null && snapshot?.stopAt !== undefined ? (
              <div>
                <dt>定时停止</dt>
                <dd>
                  <time dateTime={new Date(snapshot.stopAt).toISOString()}>
                    {formatDateTime(snapshot.stopAt)}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>

          {errorMessage ? (
            <p className="stream-message stream-message--error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="stream-actions">
            {canStart && !(query.autostart && status === 'idle') ? (
              <button
                className="paper-button paper-button--primary"
                type="button"
                onClick={() => void start()}
              >
                开始刷播
              </button>
            ) : null}
            {canStop ? (
              <button className="paper-button" type="button" onClick={stopPlayback}>
                停止刷播
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="stream-card">
          <h2>还不能开始</h2>
          <p className="stream-message stream-message--error" role="alert">
            {errorMessage}
          </p>
        </section>
      )}

      {showPassword ? (
        <section
          className="stream-card stream-debug-unlock"
          aria-labelledby="stream-debug-unlock-title"
        >
          <h2 id="stream-debug-unlock-title">页面 DEBUG</h2>
          <form onSubmit={unlockDebug}>
            <label htmlFor="stream-debug-password">输入密码</label>
            <input
              id="stream-debug-password"
              type="password"
              aria-label="DEBUG密码"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {passwordError ? (
              <p className="stream-message stream-message--error">{passwordError}</p>
            ) : null}
            <button className="paper-button paper-button--primary" type="submit">
              解锁DEBUG
            </button>
          </form>
        </section>
      ) : null}

      {debugEnabled ? (
        <section className="stream-card stream-debug" aria-labelledby="stream-debug-title">
          <div className="stream-card__heading">
            <h2 id="stream-debug-title">DEBUG</h2>
            <button className="paper-button" type="button" onClick={closeDebug}>
              关闭DEBUG
            </button>
          </div>
          <label className="stream-check">
            <input
              type="checkbox"
              checked={showPlayers}
              onChange={(event) => setShowPlayers(event.target.checked)}
            />
            显示播放器
          </label>
          <label htmlFor="stream-debug-round-seconds">轮次间隔（秒）</label>
          <div className="stream-debug__row">
            <input
              id="stream-debug-round-seconds"
              type="number"
              aria-label="轮次间隔（秒）"
              min="0.1"
              step="0.1"
              value={roundSeconds}
              onChange={(event) => setRoundSeconds(event.target.value)}
            />
            <button className="paper-button" type="button" onClick={applyDebugInterval}>
              应用到当前轮
            </button>
          </div>
          {debugMessage ? <p className="stream-message">{debugMessage}</p> : null}
        </section>
      ) : null}

      <section className="stream-card" aria-labelledby="stream-history-title">
        <div className="stream-card__heading">
          <h2 id="stream-history-title">最近记录</h2>
          <span className="paper-tag">最近 10 次</span>
        </div>
        {history.length === 0 ? (
          <p className="stream-message">还没有完成的刷播记录。</p>
        ) : (
          <ol className="stream-history">
            {history.map((item) => (
              <li key={item.sessionId}>
                <span>{formatDateTime(item.startedAt)}</span>
                <strong>{item.roundsCompleted} 轮</strong>
                <span>{formatHistoryOutcome(item.outcome)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        className={`stream-frames ${showPlayers ? 'stream-frames--visible' : 'stream-frames--hidden'}`}
        data-testid="player-host"
        aria-hidden={!showPlayers}
        aria-label="实际播放器"
        inert={showPlayers ? undefined : true}
      >
        {showPlayers ? <h2>实际播放器</h2> : null}
        <div className="stream-frame-grid">
          {frames.map((frame) => (
            <article className="stream-frame" key={frame.id}>
              {showPlayers ? <p>{frame.bvid}</p> : null}
              <iframe
                src={frame.url}
                data-bvid={frame.bvid}
                title={`第 ${frame.round} 轮第 ${frame.index + 1} 个刷播视频`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                loading="eager"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                tabIndex={showPlayers ? 0 : -1}
              />
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
