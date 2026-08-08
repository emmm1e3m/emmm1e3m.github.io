import type { ActivityKind, ActivityPreferences } from '../game/types'
import { createRandomCursor, nextRandom, randomInteger } from '../rewards/prng'

const ACTIVITY_KINDS: readonly ActivityKind[] = ['travel', 'stream', 'trend']

export interface GeneratedPreferences {
  preferences: ActivityPreferences
  nextSequence: number
}

/** 35% 全部愿意、50% 拒绝一项、15% 拒绝两项。 */
export function getRefusalCountForRoll(roll: number): 0 | 1 | 2 {
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) {
    throw new RangeError('偏好随机值必须在 [0, 1) 内')
  }
  if (roll < 0.35) return 0
  if (roll < 0.85) return 1
  return 2
}

/** 偏好使用独立序列；刷新任务或生成收藏不会改变同一次睡醒后的心情。 */
export function generateActivityPreferences(seed: string, sequence: number): GeneratedPreferences {
  let cursor = createRandomCursor(`${seed}:preferences:${sequence}`)
  const refusalRoll = nextRandom(cursor)
  cursor = refusalRoll.cursor
  const refusalCount = getRefusalCountForRoll(refusalRoll.value)
  const shuffled = [...ACTIVITY_KINDS]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomInteger(cursor, 0, index)
    cursor = selected.cursor
    ;[shuffled[index], shuffled[selected.value]] = [shuffled[selected.value], shuffled[index]]
  }

  const refused = new Set(shuffled.slice(0, refusalCount))
  return {
    preferences: {
      travel: !refused.has('travel'),
      stream: !refused.has('stream'),
      trend: !refused.has('trend'),
    },
    nextSequence: sequence + 1,
  }
}

export function isPetTired(preferences: ActivityPreferences): boolean {
  return !ACTIVITY_KINDS.some((kind) => preferences[kind])
}

export function exhaustActivityPreference(
  preferences: ActivityPreferences,
  kind: ActivityKind,
): ActivityPreferences {
  return { ...preferences, [kind]: false }
}
