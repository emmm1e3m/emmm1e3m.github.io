import { useId, useState } from 'react'

import type {
  StreamPlaybackMode,
  StreamPlaybackState,
  StreamParseResult,
  StreamStartSettings,
} from './stream/useStreamPlayback'
import {
  STREAM_MAX_OPEN_DELAY_MS,
  STREAM_MAX_SESSION_DURATION_MS,
  STREAM_MIN_OPEN_DELAY_MS,
} from './stream/useStreamPlayback'
import './reality.css'

const STREAM_INSTRUCTION =
  '输入视频BV号或链接列表，可以包含自测视频，并允许网站弹出窗口的权限。启动前请先在哔哩哔哩设置【自动开播】与【播完暂停】。如果设备或者网络较为卡顿，可以适当增加时长以便加载。登录时尽量不要连续刷播超过5小时以避免黑号。'

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
  playback: StreamPlaybackState
  getRemainingMs: () => number | null
  getStopRemainingMs: () => number | null
  onStart: (
    input: string,
    mode: StreamPlaybackMode,
    settings?: StreamStartSettings,
  ) => StreamParseResult
  onResume: () => boolean
  onStop: () => void
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
  playback,
  getRemainingMs,
  getStopRemainingMs,
  onStart,
  onResume,
  onStop,
  className = '',
}: StreamPanelProps) {
  const headingId = useId()
  const modeLegendId = useId()
  const [input, setInput] = useState(() => playback.sourceInput)
  const [mode, setMode] = useState<StreamPlaybackMode>(() => playback.mode ?? 'popup')
  const [openDelaySeconds, setOpenDelaySeconds] = useState(() =>
    String(playback.openDelayMs / 1_000),
  )
  const [stopAfterHours, setStopAfterHours] = useState(() =>
    playback.stopAfterMs === null ? '' : String(playback.stopAfterMs / 3_600_000),
  )
  const running = playback.status === 'opening' || playback.status === 'waiting'
  const controlsLocked = running || playback.status === 'blocked'
  const delaySeconds = Number(openDelaySeconds)
  const stopHours = stopAfterHours.trim() === '' ? 0 : Number(stopAfterHours)
  const settingsValid =
    Number.isInteger(delaySeconds) &&
    delaySeconds >= STREAM_MIN_OPEN_DELAY_MS / 1_000 &&
    delaySeconds <= STREAM_MAX_OPEN_DELAY_MS / 1_000 &&
    Number.isFinite(stopHours) &&
    stopHours >= 0 &&
    stopHours <= STREAM_MAX_SESSION_DURATION_MS / 3_600_000

  const startPlayback = () => {
    if (!settingsValid) return
    onStart(input, mode, {
      openDelayMs: delaySeconds * 1_000,
      stopAfterMs: stopHours === 0 ? null : stopHours * 3_600_000,
    })
  }

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
      <p className="reality-panel__intro reality-stream-panel__instruction">{STREAM_INSTRUCTION}</p>

      <label className="reality-stream-field" htmlFor={`${headingId}-input`}>
        <span>视频列表</span>
        <textarea
          id={`${headingId}-input`}
          aria-label="视频BV号或链接列表"
          value={input}
          rows={7}
          disabled={controlsLocked}
          placeholder={'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1yy411c7mE'}
          onChange={(event) => setInput(event.currentTarget.value)}
        />
      </label>

      <fieldset
        className="reality-stream-modes"
        aria-labelledby={modeLegendId}
        disabled={controlsLocked}
      >
        <legend id={modeLegendId}>打开方式</legend>
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
            <small>按设置的间隔依次打开</small>
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
            <small>按设置的间隔依次打开</small>
          </span>
        </label>
      </fieldset>

      <div className="reality-stream-settings" aria-label="刷播计时设置">
        <label className="reality-stream-field">
          <span>打开间隔（秒）</span>
          <input
            aria-label="打开间隔（秒）"
            type="number"
            min={STREAM_MIN_OPEN_DELAY_MS / 1_000}
            max={STREAM_MAX_OPEN_DELAY_MS / 1_000}
            step="1"
            inputMode="numeric"
            value={openDelaySeconds}
            disabled={controlsLocked}
            onChange={(event) => setOpenDelaySeconds(event.currentTarget.value)}
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
      {!settingsValid && (
        <p className="reality-stream-setting-error" role="alert">
          打开间隔请填写 1–60 秒，定时停止请填写 0–24 小时。
        </p>
      )}

      <div className="reality-stream-actions">
        {playback.status === 'blocked' ? (
          <>
            <button className="reality-primary-button" type="button" onClick={onResume}>
              允许弹窗后继续
            </button>
            <button className="reality-secondary-button" type="button" onClick={onStop}>
              取消刷播
            </button>
          </>
        ) : running ? (
          <button className="reality-danger-button" type="button" onClick={onStop}>
            停止刷播
          </button>
        ) : (
          <button
            className="reality-primary-button"
            type="button"
            disabled={!settingsValid}
            onClick={startPlayback}
          >
            {playback.status === 'idle' ? '开始刷播' : '再次开始'}
          </button>
        )}
      </div>

      {playback.errors.length > 0 && (
        <div className="reality-stream-errors" role="alert">
          <strong>请检查视频列表</strong>
          <ul>
            {playback.errors.map((error) => (
              <li key={`${error.line}-${error.code}`}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="reality-stream-status" aria-label="刷播状态">
        <div role="status" aria-live="polite" aria-atomic="true">
          <span>当前状态</span>
          <strong>{STATUS_LABEL[playback.status]}</strong>
          {playback.message && <span className="visually-hidden">{playback.message}</span>}
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
          <strong className="numeric-copy">{playback.parsedBvids.length}</strong>
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
        {playback.message && (
          <p className="reality-stream-status__message" aria-hidden="true">
            {playback.message}
          </p>
        )}
      </section>

      <section className="reality-stream-history" aria-labelledby={`${headingId}-history`}>
        <div>
          <h3 id={`${headingId}-history`}>最近任务</h3>
          <span>最多保留 10 次</span>
        </div>
        {recentSessions.length === 0 ? (
          <p>完成或停止一次刷播后，记录会出现在这里。</p>
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

export { STREAM_INSTRUCTION }
