import {
  ACTIVITY_APPLE_REWARDS,
  APPLE_LUNCHBOX_BONUS,
  COLLECTION_DROP_CHANCES,
  DUPLICATE_COLLECTION_WEIGHT,
  FRIEND_EVENT_CHANCE,
  FRIEND_EVENT_IDS,
  LUCKY_NEW_COLLECTION_WEIGHT,
  NEW_COLLECTION_WEIGHT,
  PITY_THRESHOLDS,
} from '../game/constants'
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
  pity: PityState
  catalog: CollectionCatalog
  ownedCollectionIds: ReadonlySet<string>
  supplyId: ItemId
  usedLuckyApple: boolean
}

interface WeightedCandidate {
  id: string
  weight: number
}

const COLLECTION_CATEGORY_BY_ACTIVITY: Record<ActivityKind, CollectibleCategory> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

function chooseWeighted(
  cursor: RandomCursor,
  candidates: readonly WeightedCandidate[],
): { id: string; cursor: RandomCursor } {
  const totalWeight = candidates.reduce((total, candidate) => total + candidate.weight, 0)
  const rolled = nextRandom(cursor)
  let threshold = rolled.value * totalWeight

  for (const candidate of candidates) {
    threshold -= candidate.weight
    if (threshold < 0) {
      return { id: candidate.id, cursor: rolled.cursor }
    }
  }

  // 浮点边界的兜底分支，正常情况下不会抵达这里。
  return { id: candidates[candidates.length - 1].id, cursor: rolled.cursor }
}

function planCollection(
  cursor: RandomCursor,
  category: CollectibleCategory,
  catalog: CollectionCatalog,
  ownedCollectionIds: ReadonlySet<string>,
  usedLuckyApple: boolean,
): { collection: PlannedCollectionReward; cursor: RandomCursor } {
  const candidates = catalog[category].map((id) => ({
    id,
    weight: ownedCollectionIds.has(id)
      ? DUPLICATE_COLLECTION_WEIGHT
      : usedLuckyApple
        ? LUCKY_NEW_COLLECTION_WEIGHT
        : NEW_COLLECTION_WEIGHT,
  }))
  const selected = chooseWeighted(cursor, candidates)

  return {
    collection: { id: selected.id, category },
    cursor: selected.cursor,
  }
}

/**
 * 奖励只依赖传入的持久种子和开始任务时的状态。
 * 返回结果应完整写入 ActivityRun，领奖时不得再次调用本函数。
 */
export function planActivityReward(input: RewardPlanningInput): RewardPlan {
  let cursor = createRandomCursor(input.rewardSeed)
  const appleRange = ACTIVITY_APPLE_REWARDS[input.kind]
  const baseApples = randomInteger(cursor, appleRange.min, appleRange.max)
  cursor = baseApples.cursor

  let modifierApples = 0
  if (input.kind === 'travel' && input.supplyId === 'travel-apple') {
    const bonus = randomInteger(cursor, APPLE_LUNCHBOX_BONUS.min, APPLE_LUNCHBOX_BONUS.max)
    modifierApples = bonus.value
    cursor = bonus.cursor
  }

  let shouldDrop = input.kind === 'travel'
  let guaranteedByPity = false
  let pityAfterClaim: number | null = null

  if (input.kind === 'stream' || input.kind === 'trend') {
    const naturalDrop = nextRandom(cursor)
    cursor = naturalDrop.cursor
    const consecutiveMisses = input.pity[input.kind]
    const pityReached = consecutiveMisses >= PITY_THRESHOLDS[input.kind] - 1
    // 首次刷播固定带回一张百万纪念海报，让新玩家稳定走通奖励与收藏墙闭环。
    const firstStreamGift =
      input.kind === 'stream' &&
      input.catalog['million-shot'].every((id) => !input.ownedCollectionIds.has(id))
    shouldDrop =
      firstStreamGift || naturalDrop.value < COLLECTION_DROP_CHANCES[input.kind] || pityReached
    guaranteedByPity = pityReached && naturalDrop.value >= COLLECTION_DROP_CHANCES[input.kind]
    pityAfterClaim = shouldDrop ? 0 : consecutiveMisses + 1
  }

  let collection: PlannedCollectionReward | null = null
  if (shouldDrop) {
    const selected = planCollection(
      cursor,
      COLLECTION_CATEGORY_BY_ACTIVITY[input.kind],
      input.catalog,
      input.ownedCollectionIds,
      input.usedLuckyApple,
    )
    collection = selected.collection
    cursor = selected.cursor
  }

  let friendEventId: RewardPlan['friendEventId'] = null
  if (input.kind === 'travel') {
    const friendRoll = nextRandom(cursor)
    cursor = friendRoll.cursor
    if (friendRoll.value < FRIEND_EVENT_CHANCE) {
      const friendIndex = randomInteger(cursor, 0, FRIEND_EVENT_IDS.length - 1)
      friendEventId = FRIEND_EVENT_IDS[friendIndex.value]
    }
  }

  return {
    baseApples: baseApples.value,
    modifierApples,
    collection,
    friendEventId,
    guaranteedByPity,
    pityAfterClaim,
  }
}
