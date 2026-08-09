import type { ActivityRun, ActivityTiming, GameState } from '@/domain'

import { ACTIVITY_COPY, formatCountdown } from './gameCopy'

interface GameHudProps {
  game: GameState
  now: number
  activity: ActivityRun | null
  timing: ActivityTiming
  dirty: boolean
  inert?: boolean
  statusLabel: string
  vitalityDays: number
  onExit: () => void
  onCenter: () => void
  onFridge: () => void
  onAlbum: () => void
  onDebug: () => void
}

function formatRealityStayDuration(enteredAt: number, now: number) {
  const totalSeconds = Math.max(0, Math.floor((now - enteredAt) / 1_000))
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const minuteSecond = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  return hours > 0 ? `${hours.toString().padStart(2, '0')}:${minuteSecond}` : minuteSecond
}

export function GameHud({
  game,
  now,
  activity,
  timing,
  dirty,
  inert,
  statusLabel,
  vitalityDays,
  onExit,
  onCenter,
  onFridge,
  onAlbum,
  onDebug,
}: GameHudProps) {
  const realityStayDuration =
    game.world === 'reality' && game.reality.activeStay
      ? formatRealityStayDuration(game.reality.activeStay.enteredAt, now)
      : null

  return (
    <header className="game-hud game-hud--v3 game-hud--v4" inert={inert ? true : undefined}>
      <div className="game-hud__leading">
        <button
          className="exit-button exit-button--text"
          type="button"
          onClick={onExit}
          aria-label={`离开铲铲饼屋${dirty ? '，有未导出的进度' : ''}`}
        >
          离开
          {dirty && <i aria-label="有未导出的进度" />}
        </button>
      </div>

      <button className="game-hud__center" type="button" onClick={onCenter}>
        <strong>今天也要好好吃苹果</strong>
        {activity && (
          <small>
            {ACTIVITY_COPY[activity.kind].verb} ·{' '}
            <span className="numeric-copy">
              {timing.phase === 'ready'
                ? '可以看看结果啦'
                : formatCountdown(timing.remainingSeconds)}
            </span>
          </small>
        )}
      </button>

      <div className="game-hud__actions">
        {realityStayDuration && (
          <output
            className="reality-stay-timer numeric-copy"
            role="timer"
            aria-label={`本次现实停留 ${realityStayDuration}`}
          >
            现实 {realityStayDuration}
          </output>
        )}
        <div className="pet-status-bar" role="status" aria-label="饼狗状态">
          <span className="pet-status-bar__label">{statusLabel}</span>
          <span className="hud-companion">
            {game.profile.displayName}陪伴饼狗已经{' '}
            <span className="numeric-copy">{game.profile.companionDays}</span> 天
          </span>
          {vitalityDays > 0 && (
            <span className="pet-status-bar__effect">
              活力还可陪伴 <span className="numeric-copy">{vitalityDays}</span> 天
            </span>
          )}
        </div>
        <div className="game-hud__buttons">
          <button
            className="apple-counter"
            type="button"
            onClick={onFridge}
            aria-label={`${game.economy.apples}🍎，打开冰箱`}
          >
            <strong className="numeric-copy">{game.economy.apples}🍎</strong>
          </button>
          <button
            className="hud-icon hud-icon--album"
            type="button"
            onClick={onAlbum}
            aria-label="打开收藏墙"
          >
            <span aria-hidden="true">🖼️</span>
          </button>
          {game.profile.debug && (
            <button
              className="debug-chip"
              type="button"
              onClick={onDebug}
              aria-label="打开调试面板"
            >
              DEBUG
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
