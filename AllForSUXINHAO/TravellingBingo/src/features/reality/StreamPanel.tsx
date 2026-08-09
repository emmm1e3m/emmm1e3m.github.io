import { useId, useState } from 'react'

import type {
  StreamPlaybackMode,
  StreamPlaybackState,
  StreamParseResult,
} from './stream/useStreamPlayback'
import './reality.css'

const STREAM_INSTRUCTION =
  '输入视频BV号或链接列表，可以包含自测视频。并允许网站弹出窗口的权限。启动前请先在哔哩哔哩设置【自动开播】与【播完暂停】'

export interface StreamRoundHistoryItem {
  round: number
  completedAt: number
}

export interface StreamPanelProps {
  now: number
  completedRounds: number
  recentRounds: readonly StreamRoundHistoryItem[]
  playback: StreamPlaybackState
  getRemainingMs: () => number | null
  onStart: (input: string, mode: StreamPlaybackMode) => StreamParseResult
  onResume: () => boolean
  onStop: () => void
  className?: string
}

function formatRemaining(remainingMs: number | null, renderedAt: number) {
  if (remainingMs === null || !Number.isFinite(renderedAt)) return '—'
  const seconds = Math.max(0, Math.ceil(remainingMs / 1_000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function formatCompletedAt(completedAt: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(completedAt))
}

const STATUS_LABEL: Record<StreamPlaybackState['status'], string> = {
  idle: '等待开始',
  opening: '正在打开视频',
  waiting: '本轮播放中',
  blocked: '等待弹窗权限',
  stopped: '已停止',
}

export function StreamPanel({
  now,
  completedRounds,
  recentRounds,
  playback,
  getRemainingMs,
  onStart,
  onResume,
  onStop,
  className = '',
}: StreamPanelProps) {
  const headingId = useId()
  const modeLegendId = useId()
  const [input, setInput] = useState(() => playback.sourceInput)
  const [mode, setMode] = useState<StreamPlaybackMode>(() => playback.mode ?? 'popup')
  const running = playback.status === 'opening' || playback.status === 'waiting'
  const controlsLocked = running || playback.status === 'blocked'

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
            <small>同一轮同时打开</small>
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
            <small>每个成功打开后间隔 8 秒</small>
          </span>
        </label>
      </fieldset>

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
            onClick={() => onStart(input, mode)}
          >
            {playback.status === 'stopped' ? '重新开始' : '开始刷播'}
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
          <span>完成轮次</span>
          <strong className="numeric-copy">{completedRounds}</strong>
        </div>
        <div>
          <span>本轮视频</span>
          <strong className="numeric-copy">{playback.parsedBvids.length}</strong>
        </div>
        <div>
          <span>已经打开</span>
          <strong className="numeric-copy">{playback.openedCount}</strong>
        </div>
        <div className="reality-stream-status__wide">
          <span>下一动作</span>
          <strong className="numeric-copy">{formatRemaining(getRemainingMs(), now)}</strong>
        </div>
        {playback.message && (
          <p className="reality-stream-status__message" aria-hidden="true">
            {playback.message}
          </p>
        )}
      </section>

      <section className="reality-stream-history" aria-labelledby={`${headingId}-history`}>
        <div>
          <h3 id={`${headingId}-history`}>最近完成</h3>
          <span>最多保留 10 条</span>
        </div>
        {recentRounds.length === 0 ? (
          <p>完成第一轮后，记录会出现在这里。</p>
        ) : (
          <ol>
            {recentRounds.map((record) => (
              <li key={`${record.round}-${record.completedAt}`}>
                <strong>第 {record.round} 轮</strong>
                <time dateTime={new Date(record.completedAt).toISOString()}>
                  {formatCompletedAt(record.completedAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}

export { STREAM_INSTRUCTION }
