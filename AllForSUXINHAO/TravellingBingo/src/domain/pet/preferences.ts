import type { ActivityKind, ActivityPreferences, PetInterest } from '../game/types'
import { incrementSafeCounter } from '../game/counters'
import { createRandomCursor, nextRandom, randomInteger } from '../rewards/prng'

const PET_INTERESTS: readonly PetInterest[] = ['travel', 'computer', 'music']

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
  const shuffled = [...PET_INTERESTS]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomInteger(cursor, 0, index)
    cursor = selected.cursor
    ;[shuffled[index], shuffled[selected.value]] = [shuffled[selected.value], shuffled[index]]
  }

  const refused = new Set(shuffled.slice(0, refusalCount))
  return {
    preferences: {
      travel: !refused.has('travel'),
      computer: !refused.has('computer'),
      music: !refused.has('music'),
    },
    nextSequence: incrementSafeCounter(sequence),
  }
}

export function isPetTired(preferences: ActivityPreferences): boolean {
  return !PET_INTERESTS.some((interest) => preferences[interest])
}

export function interestForActivity(kind: ActivityKind): PetInterest | null {
  if (kind === 'stream' || kind === 'trend') return 'computer'
  if (kind === 'rest') return null
  return kind
}

export function exhaustActivityPreference(
  preferences: ActivityPreferences,
  kind: ActivityKind,
): ActivityPreferences {
  const interest = interestForActivity(kind)
  return interest === null ? preferences : { ...preferences, [interest]: false }
}
