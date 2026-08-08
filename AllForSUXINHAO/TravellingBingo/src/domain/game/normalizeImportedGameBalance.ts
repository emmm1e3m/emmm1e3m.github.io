import {
  DEFAULT_GAME_BALANCE,
  isValidActivityDuration,
  isValidProbability,
  PROBABILITY_KEYS,
} from './gameBalance'
import type { GameBalance } from './gameBalance'
import type { GameState } from './types'

function assertValidBalance(balance: Readonly<GameBalance>): void {
  if (
    !isValidActivityDuration(balance.activityDurationMs) ||
    PROBABILITY_KEYS.some((key) => !isValidProbability(balance.probabilities[key]))
  ) {
    throw new RangeError('当前版本的默认游戏平衡配置无效')
  }
}

function balancesEqual(left: Readonly<GameBalance>, right: Readonly<GameBalance>): boolean {
  return (
    left.activityDurationMs === right.activityDurationMs &&
    PROBABILITY_KEYS.every((key) => left.probabilities[key] === right.probabilities[key])
  )
}

/**
 * 普通档导入后使用当前版本平衡配置启动未来活动；DEBUG 档保留玩家调参。
 * activeActivity 已在开始时固化绝对结束时间与奖励，因此这里只替换 gameBalance，
 * 绝不重算或改写进行中活动。
 */
export function normalizeImportedGameBalance(
  state: GameState,
  currentDefault: Readonly<GameBalance> = DEFAULT_GAME_BALANCE,
): GameState {
  if (state.profile.debug) return state
  assertValidBalance(currentDefault)
  if (balancesEqual(state.gameBalance, currentDefault)) return state

  return {
    ...state,
    gameBalance: {
      activityDurationMs: currentDefault.activityDurationMs,
      probabilities: { ...currentDefault.probabilities },
    },
  }
}
