import { useId, useMemo, useState } from 'react'

import type { StreamFavoriteId } from '@/domain'

import {
  STREAM_MAX_SESSION_DURATION_MS,
  parseStreamSelfTestInput,
  type StoredStreamSession,
  type StreamPlaybackState,
  type StreamParseResult,
  type StreamStartSettings,
} from './stream/useStreamPlayback'
import './reality.css'

const STREAM_INSTRUCTION = '选择收藏夹，也可以加入一个自测视频 BV 号或完整视频链接（可留空）。'

const STREAM_GUIDANCE = [
  '刷播会在单独页面运行，请允许本站弹出窗口。',
  '会使用当前浏览器账号，登录时每天不要超过5小时。',
  '移动端使用前请先用自测视频测试。',
] as const

const STREAM_FAVORITES: readonly { id: StreamFavoriteId; label: string }[] = [
  { id: 3682220021, label: '刷播' },
  { id: 3986840044, label: '测试' },
]

export interface StreamSessionHistoryItem {
  sessionId: string
  startedAt: number
  endedAt: number
  roundsCompleted: number
  outcome: 'completed' | 'stopped'
}

export interface StreamPanelProps {
  completedRounds: number
  recentSessions: readonly StreamSessionHistoryItem[]
  standaloneHistory: readonly StoredStreamSession[]
  selfTestBvid: string | null
  favoriteId: StreamFavoriteId
  playback: StreamPlaybackState
  onStart: (input: string, settings: StreamStartSettings) => StreamParseResult
  onStop: () => void
  onSelfTestBvidChange: (bvid: string | null) => void
  onFavoriteChange: (favoriteId: StreamFavoriteId) => void
  className?: string
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

function formatDeadline(timestamp: number | null) {
  if (timestamp === null) return '正在加载本轮视频'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

const STATUS_LABEL: Record<StreamPlaybackState['status'], string> = {
  idle: '等待开始',
  opening: '独立页正在准备',
  waiting: '正在运行',
  blocked: '等待弹窗权限',
  stopped: '已停止',
  completed: '已按时完成',
}

export function StreamPanel({
  completedRounds,
  recentSessions,
  standaloneHistory,
  selfTestBvid,
  favoriteId,
  playback,
  onStart,
  onStop,
  onSelfTestBvidChange,
  onFavoriteChange,
  className = '',
}: StreamPanelProps) {
  const headingId = useId()
  const favoriteLegendId = useId()
  const [input, setInput] = useState(selfTestBvid ?? '')
  const [stopAfterHours, setStopAfterHours] = useState(() =>
    playback.stopAfterMs === null ? '' : String(playback.stopAfterMs / 3_600_000),
  )

  const inputResult = parseStreamSelfTestInput(input)
  const running = playback.status === 'opening' || playback.status === 'waiting'
  const stopHours = stopAfterHours.trim() === '' ? 0 : Number(stopAfterHours)
  const settingsValid =
    inputResult.ok &&
    Number.isFinite(stopHours) &&
    stopHours >= 0 &&
    stopHours <= STREAM_MAX_SESSION_DURATION_MS / 3_600_000
  const displayedHistory = useMemo(() => {
    const bySessionId = new Map<string, StreamSessionHistoryItem>()
    for (const record of standaloneHistory) bySessionId.set(record.sessionId, record)
    for (const record of recentSessions) bySessionId.set(record.sessionId, record)
    return [...bySessionId.values()]
      .sort((left, right) => right.endedAt - left.endedAt)
      .slice(0, 10)
  }, [recentSessions, standaloneHistory])

  const startPlayback = () => {
    if (!settingsValid) return
    onStart(input, {
      favoriteId,
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

      <fieldset
        className="reality-stream-modes"
        aria-labelledby={favoriteLegendId}
        disabled={running}
      >
        <legend id={favoriteLegendId}>收藏夹</legend>
        {STREAM_FAVORITES.map((favorite) => (
          <label key={favorite.id}>
            <input
              type="radio"
              name={`${headingId}-favorite`}
              value={favorite.id}
              checked={favoriteId === favorite.id}
              onChange={() => onFavoriteChange(favorite.id)}
            />
            <span>
              <strong>{favorite.label}</strong>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="reality-stream-field" htmlFor={`${headingId}-input`}>
        <span>自测视频（可留空）</span>
        <input
          id={`${headingId}-input`}
          aria-label="自测视频BV号或链接"
          value={input}
          disabled={running}
          placeholder="BV... 或完整视频链接"
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
        <small>自测视频会去重，并固定排在每轮最后。</small>
      </label>
      {!inputResult.ok && (
        <p className="reality-stream-setting-error" role="alert">
          {inputResult.errors[0]?.message}
        </p>
      )}

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
          disabled={running}
          placeholder="0 或留空为不限时"
          onChange={(event) => setStopAfterHours(event.currentTarget.value)}
        />
      </label>
      {!settingsValid && inputResult.ok && (
        <p className="reality-stream-setting-error" role="alert">
          定时停止请填写 0–24 小时；0 或留空表示不限时。
        </p>
      )}

      <div className="reality-stream-actions">
        {running ? (
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
            {playback.status === 'blocked' ? '允许弹窗后重新开始' : '开始刷播'}
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
          <span>当前状态</span>
          <strong>{STATUS_LABEL[playback.status]}</strong>
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
          <span>当前轮次</span>
          <strong className="numeric-copy">{playback.round || '—'}</strong>
        </div>
        <div>
          <span>已经打开</span>
          <strong className="numeric-copy">
            {playback.totalCount > 0 ? `${playback.openedCount} / ${playback.totalCount}` : '—'}
          </strong>
        </div>
        <div>
          <span>下一轮时间</span>
          <strong className="numeric-copy">{formatDeadline(playback.nextRoundAt)}</strong>
        </div>
        {playback.message && <p className="reality-stream-status__message">{playback.message}</p>}
      </section>

      <section className="reality-stream-history" aria-labelledby={`${headingId}-history`}>
        <div>
          <h3 id={`${headingId}-history`}>最近任务</h3>
          <span>最多保留 10 次刷播</span>
        </div>
        {displayedHistory.length === 0 ? (
          <p>完成或停止一次刷播后，记录会出现在这里。</p>
        ) : (
          <ol>
            {displayedHistory.map((record) => (
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
