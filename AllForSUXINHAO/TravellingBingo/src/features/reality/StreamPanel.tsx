import { useId, useState } from 'react'

import {
  STREAM_MAX_OPEN_DELAY_MS,
  STREAM_MAX_SESSION_DURATION_MS,
  STREAM_MIN_OPEN_DELAY_MS,
  parseStreamSelfTestInput,
} from './stream/useStreamPlayback'
import type {
  StreamPlaybackMode,
  StreamPlaybackState,
  StreamParseResult,
  StreamStartSettings,
} from './stream/useStreamPlayback'
import type { VisitorStreamState } from './stream/useVisitorStreamPlayback'
import './reality.css'

const STREAM_INSTRUCTION =
  '输入一个自测视频 BV 号或视频链接（可留空），其余视频使用本站已保存的收藏夹快照。'

const STREAM_GUIDANCE = [
  '请允许网站弹出窗口，并先在哔哩哔哩设置【自动开播】与【播完暂停】。',
  '如果设备或者网络较为卡顿，可以适当增加时长以使视频完全加载。',
  '登录时尽量不要连续刷播超过5小时以避免黑号。',
  '同一局域网下应当只能有一台账号和一台设备参与刷播。',
  '维度穿透刷播是实验性功能，条件允许时请尽量使用打开新页面的方式（在登录状态下）。',
] as const

const VISITOR_STREAM_INSTRUCTION = STREAM_GUIDANCE.at(-1)!

export interface StreamSessionHistoryItem {
  sessionId: string
  startedAt: number
  endedAt: number
  roundsCompleted: number
  outcome: 'completed' | 'stopped'
}

export interface StreamPanelProps {
  now: number
  completedRounds: number
  recentSessions: readonly StreamSessionHistoryItem[]
  staticVideoCount: number
  selfTestBvid: string | null
  dimensionPenetrationEnabled: boolean
  videoIntervalMs: number
  roundIntervalMs: number
  playback: StreamPlaybackState
  visitorPlayback: VisitorStreamState
  getRemainingMs: () => number | null
  getStopRemainingMs: () => number | null
  onStart: (
    input: string,
    mode: StreamPlaybackMode,
    settings?: StreamStartSettings,
  ) => StreamParseResult
  onResume: () => boolean
  onStop: () => void
  onSelfTestBvidChange: (bvid: string | null) => void
  onDimensionPenetrationChange: (enabled: boolean) => void
  onVideoIntervalChange: (intervalMs: number) => void
  className?: string
}

function formatRemaining(remainingMs: number | null, renderedAt: number, unlimited = '—') {
  if (remainingMs === null || !Number.isFinite(renderedAt)) return unlimited
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000))
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const secondPart = (seconds % 60).toString().padStart(2, '0')
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondPart}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secondPart}`
}

function formatHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

const STATUS_LABEL: Record<StreamPlaybackState['status'], string> = {
  idle: '等待开始',
  opening: '正在打开视频',
  waiting: '本轮播放中',
  blocked: '等待弹窗权限',
  stopped: '已停止',
  completed: '已按时完成',
}

export function StreamPanel({
  now,
  completedRounds,
  recentSessions,
  staticVideoCount,
  selfTestBvid,
  dimensionPenetrationEnabled,
  videoIntervalMs,
  roundIntervalMs,
  playback,
  visitorPlayback,
  getRemainingMs,
  getStopRemainingMs,
  onStart,
  onResume,
  onStop,
  onSelfTestBvidChange,
  onDimensionPenetrationChange,
  onVideoIntervalChange,
  className = '',
}: StreamPanelProps) {
  const headingId = useId()
  const modeLegendId = useId()
  const [input, setInput] = useState(selfTestBvid ?? '')
  const [mode, setMode] = useState<StreamPlaybackMode>(() => playback.mode ?? 'popup')
  const [openDelaySeconds, setOpenDelaySeconds] = useState(() => String(videoIntervalMs / 1_000))
  const [stopAfterHours, setStopAfterHours] = useState(() =>
    playback.stopAfterMs === null ? '' : String(playback.stopAfterMs / 3_600_000),
  )

  const inputResult = parseStreamSelfTestInput(input)
  const loginRunning = playback.status === 'opening' || playback.status === 'waiting'
  const controlsLocked = loginRunning || playback.status === 'blocked'
  const visitorRunning = visitorPlayback.status !== 'idle'
  const delaySeconds = Number(openDelaySeconds)
  const stopHours = stopAfterHours.trim() === '' ? 0 : Number(stopAfterHours)
  const settingsValid =
    inputResult.ok &&
    Number.isInteger(delaySeconds) &&
    delaySeconds >= STREAM_MIN_OPEN_DELAY_MS / 1_000 &&
    delaySeconds <= STREAM_MAX_OPEN_DELAY_MS / 1_000 &&
    Number.isFinite(stopHours) &&
    stopHours >= 0 &&
    stopHours <= STREAM_MAX_SESSION_DURATION_MS / 3_600_000

  const saveVideoInterval = () => {
    if (!Number.isInteger(delaySeconds)) return false
    if (
      delaySeconds < STREAM_MIN_OPEN_DELAY_MS / 1_000 ||
      delaySeconds > STREAM_MAX_OPEN_DELAY_MS / 1_000
    ) {
      return false
    }
    onVideoIntervalChange(delaySeconds * 1_000)
    return true
  }

  const startPlayback = () => {
    if (!settingsValid || !saveVideoInterval()) return
    onStart(input, mode, {
      openDelayMs: delaySeconds * 1_000,
      stopAfterMs: stopHours === 0 ? null : stopHours * 3_600_000,
    })
  }

  const visitorElapsed =
    visitorPlayback.startedAt === null ? null : Math.max(0, now - visitorPlayback.startedAt)
  const activeRoundIntervalMs =
    loginRunning || playback.status === 'blocked'
      ? playback.roundDurationMs
      : visitorRunning
        ? visitorPlayback.roundIntervalMs
        : roundIntervalMs
  const nextRoundIntervalPending = activeRoundIntervalMs !== roundIntervalMs

  return (
    <section
      className={`reality-panel reality-stream-panel ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="reality-panel__heading">
        <div>
          <span className="paper-tag">刷播</span>
          <h2 id={headingId}>视频刷播</h2>
        </div>
      </div>
      <div className="reality-stream-guidance">
        <p className="reality-panel__intro reality-stream-panel__instruction">
          {STREAM_INSTRUCTION}
        </p>
        <ul>
          {STREAM_GUIDANCE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <label className="reality-stream-field" htmlFor={`${headingId}-input`}>
        <span>自测视频 BV 号（可留空）</span>
        <input
          id={`${headingId}-input`}
          aria-label="自测视频BV号"
          value={input}
          disabled={controlsLocked}
          placeholder="BV...（或视频链接）"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            const nextInput = event.currentTarget.value
            setInput(nextInput)
            const nextResult = parseStreamSelfTestInput(nextInput)
            if (nextResult.ok) onSelfTestBvidChange(nextResult.bvid)
          }}
        />
        <small>收藏夹快照中有 {staticVideoCount} 个视频，自测视频会排在最后。</small>
      </label>
      {!inputResult.ok && (
        <p className="reality-stream-setting-error" role="alert">
          {inputResult.errors[0]?.message}
        </p>
      )}

      <fieldset
        className="reality-stream-modes"
        aria-labelledby={modeLegendId}
        disabled={controlsLocked}
      >
        <legend id={modeLegendId}>登录刷播打开方式</legend>
        <label>
          <input
            type="radio"
            name={`${headingId}-mode`}
            value="popup"
            checked={mode === 'popup'}
            onChange={() => setMode('popup')}
          />
          <span>
            <strong>弹出窗口</strong>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name={`${headingId}-mode`}
            value="tabs"
            checked={mode === 'tabs'}
            onChange={() => setMode('tabs')}
          />
          <span>
            <strong>新标签页</strong>
          </span>
        </label>
      </fieldset>

      <div className="reality-stream-settings" aria-label="刷播计时设置">
        <label className="reality-stream-field">
          <span>视频间隔（秒）</span>
          <input
            aria-label="视频间隔（秒）"
            type="number"
            min={STREAM_MIN_OPEN_DELAY_MS / 1_000}
            max={STREAM_MAX_OPEN_DELAY_MS / 1_000}
            step="1"
            inputMode="numeric"
            value={openDelaySeconds}
            disabled={controlsLocked}
            onChange={(event) => setOpenDelaySeconds(event.currentTarget.value)}
            onBlur={saveVideoInterval}
          />
        </label>
        <label className="reality-stream-field">
          <span>定时停止（小时）</span>
          <input
            aria-label="定时停止（小时）"
            type="number"
            min="0"
            max={STREAM_MAX_SESSION_DURATION_MS / 3_600_000}
            step="0.5"
            inputMode="decimal"
            value={stopAfterHours}
            disabled={controlsLocked}
            placeholder="0 或留空为不限时"
            onChange={(event) => setStopAfterHours(event.currentTarget.value)}
          />
        </label>
      </div>
      <p className="reality-stream-shared-settings">
        登录刷播与游客刷播共用视频间隔；本轮轮次间隔为 {activeRoundIntervalMs / 1_000} 秒
        {nextRoundIntervalPending ? `，下一轮为 ${roundIntervalMs / 1_000} 秒` : ''}。
      </p>
      {!settingsValid && inputResult.ok && (
        <p className="reality-stream-setting-error" role="alert">
          视频间隔请填写 1–60 秒，定时停止请填写 0–24 小时。
        </p>
      )}

      <label className="reality-stream-penetration">
        <input
          type="checkbox"
          checked={dimensionPenetrationEnabled}
          onChange={(event) => {
            const enabled = event.currentTarget.checked
            if (enabled && (!inputResult.ok || !saveVideoInterval())) return
            onDimensionPenetrationChange(enabled)
          }}
        />
        <span>
          <strong>维度穿透</strong>
          <small>开启后，没有登录刷播时会自动运行游客刷播，回到游戏维度也会继续。</small>
        </span>
      </label>
      <div className="reality-stream-actions">
        {playback.status === 'blocked' ? (
          <>
            <button className="reality-primary-button" type="button" onClick={onResume}>
              允许弹窗后继续
            </button>
            <button className="reality-secondary-button" type="button" onClick={onStop}>
              取消登录刷播
            </button>
          </>
        ) : loginRunning ? (
          <button className="reality-danger-button" type="button" onClick={onStop}>
            停止登录刷播
          </button>
        ) : (
          <button
            className="reality-primary-button"
            type="button"
            disabled={!settingsValid}
            onClick={startPlayback}
          >
            开始登录刷播
          </button>
        )}
      </div>

      {playback.errors.length > 0 && (
        <div className="reality-stream-errors" role="alert">
          <strong>请检查自测视频</strong>
          <ul>
            {playback.errors.map((error) => (
              <li key={`${error.line}-${error.code}`}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="reality-stream-status" aria-label="刷播状态">
        <div role="status" aria-live="polite" aria-atomic="true">
          <span>登录刷播</span>
          <strong>{STATUS_LABEL[playback.status]}</strong>
          {playback.message && <span className="visually-hidden">{playback.message}</span>}
        </div>
        <div>
          <span>游客刷播</span>
          <strong>{visitorRunning ? '运行中' : '未运行'}</strong>
        </div>
        <div>
          <span>游客运行时间</span>
          <strong className="numeric-copy">{formatRemaining(visitorElapsed, now)}</strong>
        </div>
        <div>
          <span>游客轮次</span>
          <strong className="numeric-copy">{visitorRunning ? visitorPlayback.round : '—'}</strong>
        </div>
        <div>
          <span>累计完成轮次</span>
          <strong className="numeric-copy">{completedRounds}</strong>
        </div>
        <div>
          <span>本次完成轮次</span>
          <strong className="numeric-copy">{playback.sessionRoundsCompleted}</strong>
        </div>
        <div>
          <span>本轮视频</span>
          <strong className="numeric-copy">
            {loginRunning || playback.status === 'blocked'
              ? playback.parsedBvids.length
              : visitorPlayback.bvids.length}
          </strong>
        </div>
        <div>
          <span>已经打开</span>
          <strong className="numeric-copy">{playback.openedCount}</strong>
        </div>
        <div>
          <span>下一动作</span>
          <strong className="numeric-copy">{formatRemaining(getRemainingMs(), now)}</strong>
        </div>
        <div className="reality-stream-status__wide">
          <span>定时停止</span>
          <strong className="numeric-copy">
            {formatRemaining(getStopRemainingMs(), now, '不限时')}
          </strong>
        </div>
        {(playback.message || visitorPlayback.message) && (
          <p className="reality-stream-status__message" aria-hidden="true">
            {loginRunning || playback.status === 'blocked'
              ? playback.message
              : visitorPlayback.message}
          </p>
        )}
      </section>

      <section className="reality-stream-history" aria-labelledby={`${headingId}-history`}>
        <div>
          <h3 id={`${headingId}-history`}>最近任务</h3>
          <span>最多保留 10 次登录刷播</span>
        </div>
        {recentSessions.length === 0 ? (
          <p>完成或停止一次登录刷播后，记录会出现在这里。</p>
        ) : (
          <ol>
            {recentSessions.map((record) => (
              <li key={record.sessionId}>
                <strong>
                  {record.outcome === 'completed' ? '按时完成' : '已停止'} ·{' '}
                  {record.roundsCompleted} 轮
                </strong>
                <span>
                  <time dateTime={new Date(record.startedAt).toISOString()}>
                    {formatHistoryTime(record.startedAt)}
                  </time>
                  {' – '}
                  <time dateTime={new Date(record.endedAt).toISOString()}>
                    {formatHistoryTime(record.endedAt)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}

export { STREAM_INSTRUCTION, VISITOR_STREAM_INSTRUCTION }
