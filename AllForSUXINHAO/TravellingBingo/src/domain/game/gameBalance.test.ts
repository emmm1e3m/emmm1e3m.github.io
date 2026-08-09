import { describe, expect, it } from 'vitest'

import {
  addProbabilityBonus,
  DEFAULT_GAME_BALANCE,
  LUCKY_APPLE_COLLECTION_DROP_BONUS,
} from './gameBalance'

describe('当前游戏平衡', () => {
  it('百万直拍基础掉落率为 30%，幸运苹果额外增加 10 个百分点', () => {
    const baseChance = DEFAULT_GAME_BALANCE.probabilities.millionShot

    expect(baseChance).toBe(0.3)
    expect(LUCKY_APPLE_COLLECTION_DROP_BONUS).toBe(0.1)
    expect(addProbabilityBonus(baseChance, LUCKY_APPLE_COLLECTION_DROP_BONUS)).toBe(0.4)
  })

  it('幸运苹果加成仍统一封顶为 100%', () => {
    expect(addProbabilityBonus(0.95, LUCKY_APPLE_COLLECTION_DROP_BONUS)).toBe(1)
  })
})
