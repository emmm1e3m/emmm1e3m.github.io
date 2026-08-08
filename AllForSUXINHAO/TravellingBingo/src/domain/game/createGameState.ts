import { INITIAL_APPLES, INITIAL_INVENTORY } from './constants'
import type { GameState } from './types'

export interface InitialGameOptions {
  now: number
  seed: string
  debug?: boolean
}

export function createInitialGameState(options: InitialGameOptions): GameState {
  if (!Number.isSafeInteger(options.now) || options.now < 0) {
    throw new RangeError('建档时间必须是非负安全整数毫秒时间戳')
  }
  if (options.seed.trim().length === 0) {
    throw new TypeError('持久随机种子不能为空')
  }

  return {
    schemaVersion: 1,
    profile: {
      createdAt: options.now,
      debug: options.debug ?? false,
    },
    economy: { apples: INITIAL_APPLES },
    inventory: { ...INITIAL_INVENTORY },
    collections: {},
    activeActivity: null,
    pity: { stream: 0, trend: 0 },
    statistics: {
      started: { travel: 0, stream: 0, trend: 0 },
      claimed: { travel: 0, stream: 0, trend: 0 },
      applesEarned: 0,
      duplicateRewards: 0,
    },
    random: {
      seed: options.seed,
      sequence: 0,
    },
  }
}
