import { FRIEND_EVENT_IDS } from '../game/constants'
import {
  addProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BONUS,
  DEFAULT_GAME_BALANCE,
  LUCKY_APPLE_COLLECTION_DROP_BONUS,
  type GameProbabilities,
} from '../game/gameBalance'
import type {
  ActivityKind,
  CollectionCatalog,
  CollectibleCategory,
  ItemId,
  PityState,
  PlannedCollectionReward,
  RewardPlan,
} from '../game/types'
import { createRandomCursor, nextRandom, randomInteger, type RandomCursor } from './prng'

export interface RewardPlanningInput {
  kind: ActivityKind
  rewardSeed: string
  /** @deprecated v2 已取消保底，输入仅用于兼容旧调用方。 */
  pity?: PityState
  catalog: CollectionCatalog
  ownedCollectionIds: ReadonlySet<string>
  supplyId: ItemId
  usedLuckyApple: boolean
  probabilities?: Readonly<GameProbabilities>
}

const COLLECTION_CATEGORY_BY_ACTIVITY: Record<ActivityKind, CollectibleCategory> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

const PROBABILITY_BY_ACTIVITY: Record<ActivityKind, keyof GameProbabilities> = {
  travel: 'postcard',
  stream: 'millionShot',
  trend: 'siteFirst',
}

function chooseRandomUnowned(
  cursor: RandomCursor,
  candidates: readonly string[],
): { id: string; cursor: RandomCursor } | null {
  if (candidates.length === 0) return null
  const selected = randomInteger(cursor, 0, candidates.length - 1)
  return { id: candidates[selected.value], cursor: selected.cursor }
}

function planCollection(
  cursor: RandomCursor,
  category: CollectibleCategory,
  catalog: CollectionCatalog,
  ownedCollectionIds: ReadonlySet<string>,
): { collection: PlannedCollectionReward | null; cursor: RandomCursor } {
  if (category === 'site-first') {
    const nextId = catalog.siteFirstChronology.find((id) => !ownedCollectionIds.has(id))
    return {
      collection: nextId === undefined ? null : { id: nextId, category },
      cursor,
    }
  }

  const candidates = catalog[category].filter((id) => !ownedCollectionIds.has(id))
  const selected = chooseRandomUnowned(cursor, candidates)
  if (selected === null) return { collection: null, cursor }

  return {
    collection: { id: selected.id, category },
    cursor: selected.cursor,
  }
}

/**
 * 奖励只依赖传入的持久种子、开始时收藏和当时的概率快照。
 * v2 活动不产生苹果，也没有首次固定掉落或保底。
 */
export function planActivityReward(input: RewardPlanningInput): RewardPlan {
  let cursor = createRandomCursor(input.rewardSeed)
  const probabilities = input.probabilities ?? DEFAULT_GAME_BALANCE.probabilities
  const category = COLLECTION_CATEGORY_BY_ACTIVITY[input.kind]
  const drop = nextRandom(cursor)
  cursor = drop.cursor
  const dropChance = addProbabilityBonus(
    probabilities[PROBABILITY_BY_ACTIVITY[input.kind]],
    input.usedLuckyApple ? LUCKY_APPLE_COLLECTION_DROP_BONUS : 0,
  )
  const shouldDrop = drop.value < dropChance

  let collection: PlannedCollectionReward | null = null
  if (shouldDrop) {
    const selected = planCollection(cursor, category, input.catalog, input.ownedCollectionIds)
    collection = selected.collection
    cursor = selected.cursor
  }

  let friendEventId: RewardPlan['friendEventId'] = null
  if (input.kind === 'travel') {
    const friendRoll = nextRandom(cursor)
    cursor = friendRoll.cursor
    const friendChance = addProbabilityBonus(
      probabilities.friend,
      input.supplyId === 'travel-apple' ? APPLE_LUNCHBOX_FRIEND_BONUS : 0,
    )
    if (friendRoll.value < friendChance) {
      const friendIndex = randomInteger(cursor, 0, FRIEND_EVENT_IDS.length - 1)
      friendEventId = FRIEND_EVENT_IDS[friendIndex.value]
    }
  }

  return {
    baseApples: 0,
    modifierApples: 0,
    collection,
    friendEventId,
    guaranteedByPity: false,
    pityAfterClaim: null,
  }
}
