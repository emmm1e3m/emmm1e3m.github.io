import { MAX_COMPANION_DAYS, VITALITY_MAGIC_COMPANION_DAYS } from '../game/constants'
import type { ActivityPreferences, GameState, VitalityEffect } from '../game/types'
import { generateActivityPreferences } from '../pet/preferences'

export const ALL_ACTIVITY_PREFERENCES: ActivityPreferences = Object.freeze({
  travel: true,
  computer: true,
  music: true,
})

export type VitalityMagicUnavailableReason =
  'missing-item' | 'already-active' | 'not-needed' | 'day-limit'

export type VitalityMagicAvailability =
  | { canUse: true; reason: null; message: string }
  | { canUse: false; reason: VitalityMagicUnavailableReason; message: string }

export type CompanionDayVitalityResolution =
  | { ok: false; reason: 'day-limit' }
  | {
      ok: true
      nextCompanionDay: number
      nextVitality: VitalityEffect | null
      /** null 表示本次推进不应改变普通偏好。 */
      preferences: ActivityPreferences | null
      nextPreferenceSequence: number
      vitalityWasActive: boolean
      vitalityExpired: boolean
    }

export function isVitalityActive(state: GameState): boolean {
  const vitality = state.player.effects.vitality
  return vitality !== null && state.profile.companionDays < vitality.expiresAfterCompanionDay
}

export function getVitalityMagicAvailability(state: GameState): VitalityMagicAvailability {
  if (state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return { canUse: false, reason: 'day-limit', message: '陪伴日已经到达存档上限' }
  }
  if (isVitalityActive(state)) {
    return { canUse: false, reason: 'already-active', message: '活力魔法还在生效' }
  }
  if (state.inventory['bottled-vitality-magic'] < 1) {
    return { canUse: false, reason: 'missing-item', message: '冰箱里还没有瓶装活力魔法' }
  }
  if (Object.values(state.pet.preferences).every(Boolean)) {
    return { canUse: false, reason: 'not-needed', message: '饼狗现在对所有事情都有兴趣' }
  }
  return { canUse: true, reason: null, message: '接下来七个伴随日都会充满活力' }
}

export function vitalityExpiryDay(companionDays: number): number {
  return Math.min(MAX_COMPANION_DAYS, companionDays + VITALITY_MAGIC_COMPANION_DAYS)
}

/**
 * 统一计算一次成功读条结束后的伴随日与活力效果。
 * 普通状态不改变偏好；活力的第七个伴随日结束时才消耗一次独立偏好随机序列。
 */
export function resolveVitalityForCompanionDayAdvance(
  state: GameState,
): CompanionDayVitalityResolution {
  if (state.profile.companionDays >= MAX_COMPANION_DAYS) {
    return { ok: false, reason: 'day-limit' }
  }

  const nextCompanionDay = state.profile.companionDays + 1
  const vitality = isVitalityActive(state) ? state.player.effects.vitality : null
  if (vitality === null) {
    return {
      ok: true,
      nextCompanionDay,
      nextVitality: state.player.effects.vitality,
      preferences: null,
      nextPreferenceSequence: state.random.sequences.preferences,
      vitalityWasActive: false,
      vitalityExpired: false,
    }
  }

  if (nextCompanionDay < vitality.expiresAfterCompanionDay) {
    return {
      ok: true,
      nextCompanionDay,
      nextVitality: vitality,
      preferences: { ...ALL_ACTIVITY_PREFERENCES },
      nextPreferenceSequence: state.random.sequences.preferences,
      vitalityWasActive: true,
      vitalityExpired: false,
    }
  }

  const generated = generateActivityPreferences(
    state.random.seed,
    state.random.sequences.preferences,
  )
  return {
    ok: true,
    nextCompanionDay,
    nextVitality: null,
    preferences: generated.preferences,
    nextPreferenceSequence: generated.nextSequence,
    vitalityWasActive: true,
    vitalityExpired: true,
  }
}
