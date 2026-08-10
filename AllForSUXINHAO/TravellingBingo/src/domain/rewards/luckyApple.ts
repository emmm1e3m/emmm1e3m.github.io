import {
  addNonStackingBaseProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
  type GameProbabilities,
  LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE,
} from '../game/gameBalance'
import type {
  ActivityKind,
  CollectionCatalog,
  CollectibleActivityKind,
  CollectibleCategory,
  GameState,
  LegacyItemId,
} from '../game/types'

const CATEGORY_BY_ACTIVITY: Readonly<Record<CollectibleActivityKind, CollectibleCategory>> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

const PROBABILITY_BY_ACTIVITY: Readonly<Record<CollectibleActivityKind, keyof GameProbabilities>> =
  {
    travel: 'postcard',
    stream: 'millionShot',
    trend: 'siteFirst',
  }

export type LuckyAppleAvailability =
  | { canUse: true }
  | {
      canUse: false
      reason:
        | 'activity-not-collectible'
        | 'friend-result-guaranteed'
        | 'drop-already-guaranteed'
        | 'drop-cannot-increase'
        | 'category-complete'
      message: string
    }

/** UI 与 reducer 共用：幸运苹果必须确实有机会提高“新收藏”的获得概率。 */
export function getLuckyAppleAvailability(
  state: Pick<GameState, 'gameBalance' | 'collections'>,
  kind: ActivityKind,
  catalog: CollectionCatalog,
  supplyId?: LegacyItemId | null,
): LuckyAppleAvailability {
  if (kind === 'music' || kind === 'rest') {
    return {
      canUse: false,
      reason: 'activity-not-collectible',
      message: '这项活动不会发现收藏，不需要带幸运苹果。',
    }
  }
  if (
    kind === 'travel' &&
    (supplyId === 'travel-apple'
      ? addNonStackingBaseProbabilityBonus(
          state.gameBalance.probabilities.travelFriend,
          APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
        )
      : state.gameBalance.probabilities.travelFriend) >= 1
  ) {
    return {
      canUse: false,
      reason: 'friend-result-guaranteed',
      message: '这次一定会遇见朋友，不会出现明信片，幸运苹果留到下次吧。',
    }
  }
  const probabilityKey = PROBABILITY_BY_ACTIVITY[kind]
  const baseDropChance = state.gameBalance.probabilities[probabilityKey]
  if (baseDropChance >= 1) {
    return {
      canUse: false,
      reason: 'drop-already-guaranteed',
      message: '这次收藏概率已经是 100%，幸运苹果留到下次吧。',
    }
  }
  if (
    addNonStackingBaseProbabilityBonus(baseDropChance, LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE) <=
    baseDropChance
  ) {
    return {
      canUse: false,
      reason: 'drop-cannot-increase',
      message: '这次不会发现收藏，幸运苹果留到下次吧。',
    }
  }

  const category = CATEGORY_BY_ACTIVITY[kind]
  const hasUnownedCollection = catalog[category].some((id) => state.collections[id] === undefined)
  if (!hasUnownedCollection) {
    return {
      canUse: false,
      reason: 'category-complete',
      message: '这一类收藏已经集齐，幸运苹果留到下一段旅程吧。',
    }
  }

  return { canUse: true }
}

export function canUseLuckyApple(
  state: Pick<GameState, 'gameBalance' | 'collections'>,
  kind: ActivityKind,
  catalog: CollectionCatalog,
  supplyId?: LegacyItemId | null,
): boolean {
  return getLuckyAppleAvailability(state, kind, catalog, supplyId).canUse
}
