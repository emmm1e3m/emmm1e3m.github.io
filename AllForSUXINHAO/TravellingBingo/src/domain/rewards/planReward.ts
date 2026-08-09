import { FRIEND_EVENT_IDS } from '../game/constants'
import {
  addProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BONUS,
  DEFAULT_GAME_BALANCE,
  FRIEND_GIFT_APPLES_BY_ID,
  FRIEND_GIFT_ITEM_BY_ID,
  LUCKY_APPLE_COLLECTION_DROP_BONUS,
  REST_COMPLETION_APPLES,
  type GameProbabilities,
} from '../game/gameBalance'
import type {
  ActivityKind,
  CollectionCatalog,
  CollectibleActivityKind,
  CollectibleCategory,
  FriendId,
  LegacyItemId,
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
  knownFriendIds?: ReadonlySet<FriendId>
  supplyId: LegacyItemId | null
  usedLuckyApple: boolean
  probabilities?: Readonly<GameProbabilities>
}

const COLLECTION_CATEGORY_BY_ACTIVITY: Record<CollectibleActivityKind, CollectibleCategory> = {
  travel: 'postcard',
  stream: 'million-shot',
  trend: 'site-first',
}

const PROBABILITY_BY_ACTIVITY: Record<CollectibleActivityKind, keyof GameProbabilities> = {
  travel: 'postcard',
  stream: 'millionShot',
  trend: 'siteFirst',
}

function isCollectibleActivity(kind: ActivityKind): kind is CollectibleActivityKind {
  return kind === 'travel' || kind === 'stream' || kind === 'trend'
}

function chooseFriend(
  cursor: RandomCursor,
  candidates: readonly FriendId[],
): { id: FriendId; cursor: RandomCursor } | null {
  if (candidates.length === 0) return null
  const selected = randomInteger(cursor, 0, candidates.length - 1)
  return { id: candidates[selected.value], cursor: selected.cursor }
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
 * 奖励只依赖持久种子、开始时收藏/好友图鉴和当时的概率快照。
 * V3/V4 没有首次固定掉落或保底；休息苹果和好友礼物在开始时一并固化。
 */
export function planActivityReward(input: RewardPlanningInput): RewardPlan {
  let cursor = createRandomCursor(input.rewardSeed)
  const probabilities = input.probabilities ?? DEFAULT_GAME_BALANCE.probabilities
  let baseApples = 0
  let modifierApples = 0
  let collection: PlannedCollectionReward | null = null
  let friendId: FriendId | null = null
  let giftItemId: LegacyItemId | null = null

  if (input.kind === 'rest') {
    baseApples = REST_COMPLETION_APPLES
  }

  if (input.kind === 'music') {
    const knownFriends = FRIEND_EVENT_IDS.filter((id) => input.knownFriendIds?.has(id) === true)
    if (knownFriends.length > 0) {
      const friendRoll = nextRandom(cursor)
      cursor = friendRoll.cursor
      if (friendRoll.value < probabilities.musicFriend) {
        const selected = chooseFriend(cursor, knownFriends)
        if (selected !== null) {
          friendId = selected.id
          modifierApples = FRIEND_GIFT_APPLES_BY_ID[selected.id]
          cursor = selected.cursor
        }
      }
    }
  }

  if (input.kind === 'travel') {
    const friendRoll = nextRandom(cursor)
    cursor = friendRoll.cursor
    const friendChance = addProbabilityBonus(
      probabilities.travelFriend,
      input.supplyId === 'travel-apple' ? APPLE_LUNCHBOX_FRIEND_BONUS : 0,
    )
    if (friendRoll.value < friendChance) {
      const selected = chooseFriend(cursor, FRIEND_EVENT_IDS)
      if (selected !== null) {
        friendId = selected.id
        giftItemId = FRIEND_GIFT_ITEM_BY_ID[selected.id]
        cursor = selected.cursor
      }
    }
  }

  // 旅行先判朋友；遇见朋友后不再判明信片，保证两个结果互斥。
  if (isCollectibleActivity(input.kind) && friendId === null) {
    const category = COLLECTION_CATEGORY_BY_ACTIVITY[input.kind]
    const drop = nextRandom(cursor)
    cursor = drop.cursor
    // 幸运苹果只叠加当前活动对应的收藏概率，不改变遇友概率。
    const dropChance = addProbabilityBonus(
      probabilities[PROBABILITY_BY_ACTIVITY[input.kind]],
      input.usedLuckyApple ? LUCKY_APPLE_COLLECTION_DROP_BONUS : 0,
    )
    if (drop.value < dropChance) {
      const selected = planCollection(cursor, category, input.catalog, input.ownedCollectionIds)
      collection = selected.collection
    }
  }

  return {
    baseApples,
    modifierApples,
    collection,
    friendId,
    giftItemId,
    guaranteedByPity: false,
    pityAfterClaim: null,
  }
}
