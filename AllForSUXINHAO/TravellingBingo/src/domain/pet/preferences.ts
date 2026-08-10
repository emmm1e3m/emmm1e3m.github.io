import type { ActivityKind, ActivityPreferences, PetInterest } from '../game/types'
import { incrementSafeCounter } from '../game/counters'
import { createRandomCursor, nextRandom, randomInteger } from '../rewards/prng'

const PET_INTERESTS: readonly PetInterest[] = ['travel', 'computer', 'music']

export type PetVitalityStatus = '低活力' | '中等活力' | '高活力' | '活力满满'

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

/**
 * 活力魔法优先显示；普通状态则按当下真正可做的三类事情计算。
 * 菜单与顶栏共用这一纯派生，避免同一状态出现两种文案。
 */
export function getPetVitalityStatus(
  preferences: ActivityPreferences,
  vitalityActive: boolean,
): PetVitalityStatus {
  if (vitalityActive) return '活力满满'

  const availableInterestCount = PET_INTERESTS.filter((interest) => preferences[interest]).length
  if (availableInterestCount <= 1) return '低活力'
  if (availableInterestCount === 2) return '中等活力'
  return '高活力'
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
