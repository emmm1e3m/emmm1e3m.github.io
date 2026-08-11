import { AppleAmount } from '@/components/AppleAmount'
import {
  deriveRealityActiveDurationMs,
  getPetVitalityStatus,
  isVitalityActive,
  type ActivityRun,
  type ActivityTiming,
  type GameState,
} from '@/domain'

import { ACTIVITY_COPY, formatCountdown } from './gameCopy'

interface GameHudProps {
  game: GameState
  now: number
  activity: ActivityRun | null
  timing: ActivityTiming
  dirty: boolean
  inert?: boolean
  statusLabel: string | null
  vitalityDays: number
  onExit: () => void
  onCenter: () => void
  onRealityTimer: () => void
  onPetStatus: () => void
  onFridge: () => void
  onAlbum: () => void
  onDebug: () => void
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
  onRealityTimer,
  onPetStatus,
  onFridge,
  onAlbum,
  onDebug,
}: GameHudProps) {
  const realityStayMinutes =
    game.world === 'reality' && game.reality.activeStay
      ? Math.floor(deriveRealityActiveDurationMs(game.reality.activeStay, now) / 60_000)
      : null
  const vitalityStatus = getPetVitalityStatus(game.pet.preferences, isVitalityActive(game))

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
        {realityStayMinutes !== null && (
          <button
            className="reality-stay-timer numeric-copy"
            type="button"
            onClick={onRealityTimer}
            aria-label={`本次现实停留 ${realityStayMinutes} 分钟，返回游戏维度`}
          >
            现实 {realityStayMinutes} 分钟
          </button>
        )}
        <button
          className="pet-status-bar"
          type="button"
          onClick={onPetStatus}
          aria-label={`饼狗活力状态 ${vitalityStatus}，打开饼狗菜单`}
        >
          {statusLabel && <span className="pet-status-bar__activity">{statusLabel}</span>}
          <span className="pet-status-bar__label">{vitalityStatus}</span>
          <span className="hud-companion">
            {game.profile.displayName}陪伴饼狗已经{' '}
            <span className="numeric-copy">{game.profile.companionDays}</span> 天
          </span>
          {vitalityDays > 0 && (
            <span className="pet-status-bar__effect">
              活力还可陪伴 <span className="numeric-copy">{vitalityDays}</span> 天
            </span>
          )}
        </button>
        <div className="game-hud__buttons">
          <button
            className="apple-counter"
            type="button"
            onClick={onFridge}
            aria-label={`${game.economy.apples}🍎，打开冰箱`}
          >
            <strong>
              <AppleAmount value={game.economy.apples} />
            </strong>
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
