import { describe, expect, it } from 'vitest'

import {
  addNonStackingBaseProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
  DEFAULT_GAME_BALANCE,
  LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE,
  TRAVEL_FRIEND_GIFT_APPLES_BY_ID,
} from './gameBalance'

describe('当前游戏平衡', () => {
  it('三类目标概率与两种遇友概率使用当前数值', () => {
    expect(DEFAULT_GAME_BALANCE.probabilities).toEqual({
      postcard: 0.65,
      millionShot: 0.3,
      siteFirst: 0.15,
      travelFriend: 0.1,
      musicFriend: 0.15,
    })
  })

  it('幸运苹果按常规收藏概率增加 100% 的基础值', () => {
    const baseChance = DEFAULT_GAME_BALANCE.probabilities.millionShot

    expect(baseChance).toBe(0.3)
    expect(LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE).toBe(1)
    expect(
      addNonStackingBaseProbabilityBonus(baseChance, LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE),
    ).toBe(0.6)
  })

  it('旅行好友按身份固定赠送 2/3/4/3/2 个苹果', () => {
    expect(TRAVEL_FRIEND_GIFT_APPLES_BY_ID).toEqual({
      'class-representative-bing': 2,
      'san-hao-rabbit': 3,
      'xin-hao-rabbit': 4,
      'signal-dog': 3,
      'bili-bing': 2,
    })
  })

  it('基础概率加成不复合叠加、统一封顶，0% 不会凭空提高', () => {
    expect(addNonStackingBaseProbabilityBonus(0.2, APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE)).toBe(0.4)
    expect(
      addNonStackingBaseProbabilityBonus(
        0.2,
        APPLE_LUNCHBOX_FRIEND_BASE_BONUS_RATE,
        LUCKY_APPLE_COLLECTION_BASE_BONUS_RATE,
      ),
    ).toBe(0.4)
    expect(addNonStackingBaseProbabilityBonus(0.95, 1)).toBe(1)
    expect(addNonStackingBaseProbabilityBonus(0, 1)).toBe(0)
  })
})
