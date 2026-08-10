import { generateActivityPreferences } from '../pet/preferences'
import { generateTaskBoard } from '../tasks/taskBoard'
import { INITIAL_APPLES, INITIAL_INVENTORY } from './constants'
import { createDefaultGameBalance } from './gameBalance'
import { normalizeDisplayName } from './profile'
import { assertValidTimestamp } from './time'
import type { GameState } from './types'

export interface InitialGameOptions {
  now: number
  seed: string
  /** UI 新建流程必须传入；领域保留“你”作为脚本与旧调用方的安全回退。 */
  displayName?: string
  debug?: boolean
}

export function createInitialGameState(options: InitialGameOptions): GameState {
  assertValidTimestamp(options.now, '建档时间必须是 Date 可表示的非负整数毫秒时间戳')
  if (options.seed.trim().length === 0) {
    throw new TypeError('持久随机种子不能为空')
  }

  const generatedPreferences = generateActivityPreferences(options.seed, 0)
  const generatedTasks = generateTaskBoard({
    seed: options.seed,
    sequence: 0,
    now: options.now,
  })

  return {
    schemaVersion: 8,
    profile: {
      createdAt: options.now,
      debug: options.debug ?? false,
      displayName: normalizeDisplayName(options.displayName ?? '你'),
      companionDays: 0,
    },
    economy: { apples: INITIAL_APPLES },
    inventory: { ...INITIAL_INVENTORY },
    collections: {},
    friends: {},
    activeActivity: null,
    pet: {
      location: 'center',
      preferences: generatedPreferences.preferences,
      tired: false,
      restCount: 0,
    },
    tasks: { ...generatedTasks.board, completedAt: null },
    gameBalance: createDefaultGameBalance(),
    statistics: {
      started: { travel: 0, stream: 0, trend: 0, music: 0, rest: 0 },
      claimed: { travel: 0, stream: 0, trend: 0, music: 0, rest: 0 },
      applesEarned: 0,
      duplicateRewards: 0,
    },
    random: {
      seed: options.seed,
      sequences: {
        reward: 0,
        tasks: generatedTasks.nextSequence,
        preferences: generatedPreferences.nextSequence,
      },
    },
    world: 'game',
    player: { effects: { vitality: null } },
    reality: {
      nextStaySequence: 0,
      activeStay: null,
      pendingSettlement: null,
      todos: {},
      pomodoro: {
        nextSessionSequence: 0,
        selectedPostcardId: null,
        session: null,
      },
      streamHistory: {
        completedRounds: 0,
        recentSessions: [],
      },
      streamSettings: {
        selfTestBvid: null,
        dimensionPenetrationEnabled: false,
      },
    },
    musicPlayer: {
      currentBvid: null,
      currentIndex: 0,
      loopMode: 'list',
    },
  }
}
