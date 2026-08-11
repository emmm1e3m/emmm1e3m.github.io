import { MAX_APPLES } from './constants'
import { saturatingAddSafeCounter } from './counters'
import type { GameAction, GameState, GameTransition } from './types'

export const STREAM_DAILY_REWARD_APPLES = 20

export type StreamDailyRewardAction = Extract<GameAction, { type: 'stream/daily-reward-claim' }>

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

export function isValidLocalDateKey(value: string): boolean {
  const matched = DATE_KEY_PATTERN.exec(value)
  if (matched === null) return false
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12) return false
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

export function isStreamDailyRewardAction(action: GameAction): action is StreamDailyRewardAction {
  return action.type === 'stream/daily-reward-claim'
}

export function reduceStreamDailyReward(
  state: GameState,
  action: StreamDailyRewardAction,
): GameTransition {
  if (!isValidLocalDateKey(action.dateKey)) {
    return {
      ok: false,
      state,
      error: { code: 'INVALID_DATE_KEY', message: '刷播奖励日期必须是有效的 YYYY-MM-DD' },
      effects: [],
    }
  }
  const lastRewardDateKey = state.reality.streamDailyReward.lastRewardDateKey
  // YYYY-MM-DD 已经过严格校验，固定宽度字符串顺序就是本地日历日期顺序。
  if (lastRewardDateKey !== null && action.dateKey <= lastRewardDateKey) {
    return { ok: true, state, effects: [] }
  }

  const applesAwarded = Math.min(STREAM_DAILY_REWARD_APPLES, MAX_APPLES - state.economy.apples)
  return {
    ok: true,
    state: {
      ...state,
      economy: { apples: state.economy.apples + applesAwarded },
      statistics: {
        ...state.statistics,
        applesEarned: saturatingAddSafeCounter(state.statistics.applesEarned, applesAwarded),
      },
      reality: {
        ...state.reality,
        streamDailyReward: { lastRewardDateKey: action.dateKey },
      },
    },
    effects: [
      {
        type: 'stream-daily-reward-claimed',
        dateKey: action.dateKey,
        applesAwarded,
      },
    ],
  }
}
