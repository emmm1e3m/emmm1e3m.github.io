import { useId, useState } from 'react'

import type { StreamFavoriteId } from '@/domain'
import {
  STREAM_PLAYBACK_MODE_LABELS,
  STREAM_PLAYBACK_MODES,
  type StreamPlaybackMode,
} from '@/stream-player/catalog'

import {
  STREAM_MAX_SESSION_DURATION_MS,
  parseStreamSelfTestInput,
  type StreamPlaybackState,
  type StreamParseResult,
  type StreamStartSettings,
} from './stream/useStreamPlayback'
import './reality.css'

const STREAM_INSTRUCTION = '选择收藏夹，也可以加入一个自测视频 BV 号或完整视频链接（可留空）。'

const STREAM_GUIDANCE = [
  '刷播会在单独页面运行，请允许本站弹出窗口；启动刷播窗口后，返回游戏维度也可以继续。',
  '移动端离开刷播页面可能会导致刷播暂停。',
  '会使用当前浏览器账号，登录时每天不要超过5小时。',
  '请在网页版哔哩哔哩设置‘自动开播’和‘播完暂停’。',
  '静默播放功能在某些条件下可能失效，因此请务必检查轮次和自测视频涨幅的关系。',
] as const

const STREAM_FAVORITES: readonly { id: StreamFavoriteId; label: string }[] = [
  { id: 3682220021, label: '刷播' },
  { id: 3986840044, label: '测试' },
]

export interface StreamPanelProps {
  selfTestBvid: string | null
  favoriteId: StreamFavoriteId
  playback: StreamPlaybackState
  onStart: (input: string, settings: StreamStartSettings) => StreamParseResult
  onStop: () => void
  onSelfTestBvidChange: (bvid: string | null) => void
  onFavoriteChange: (favoriteId: StreamFavoriteId) => void
  className?: string
}

export function StreamPanel({
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
  const playbackModeLegendId = useId()
  const [input, setInput] = useState(selfTestBvid ?? '')
  const [playbackMode, setPlaybackMode] = useState<StreamPlaybackMode>('silent')
  const [stopAfterHours, setStopAfterHours] = useState(() =>
    playback.stopAfterMs === null ? '' : String(playback.stopAfterMs / 3_600_000),
  )

  const inputResult = parseStreamSelfTestInput(input)
  const running =
    playback.status === 'opening' || playback.status === 'waiting' || playback.status === 'stopping'
  const stopHours = stopAfterHours.trim() === '' ? 0 : Number(stopAfterHours)
  const settingsValid =
    inputResult.ok &&
    Number.isFinite(stopHours) &&
    stopHours >= 0 &&
    stopHours <= STREAM_MAX_SESSION_DURATION_MS / 3_600_000
  const startPlayback = () => {
    if (!settingsValid) return
    onStart(input, {
      favoriteId,
      stopAfterMs: stopHours === 0 ? null : stopHours * 3_600_000,
      playbackMode,
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

      <fieldset
        className="reality-stream-modes reality-stream-modes--playback"
        aria-labelledby={playbackModeLegendId}
        disabled={running}
      >
        <legend id={playbackModeLegendId}>播放方式</legend>
        {STREAM_PLAYBACK_MODES.map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name={`${headingId}-playback-mode`}
              value={mode}
              checked={playbackMode === mode}
              onChange={() => setPlaybackMode(mode)}
            />
            <span>
              <strong>{STREAM_PLAYBACK_MODE_LABELS[mode]}</strong>
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
          <button
            className="reality-danger-button"
            type="button"
            disabled={playback.status === 'stopping'}
            onClick={onStop}
          >
            {playback.status === 'stopping' ? '正在停止刷播' : '停止刷播'}
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
    </section>
  )
}

export { STREAM_INSTRUCTION }
