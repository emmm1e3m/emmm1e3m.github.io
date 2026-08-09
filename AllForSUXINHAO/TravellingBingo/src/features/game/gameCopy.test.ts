import { ITEM_IDS } from '@/domain'

import { ITEM_COPY } from './gameCopy'

describe('ITEM_COPY', () => {
  it('为全部冰箱道具提供稳定且可区分的 emoji', () => {
    expect(Object.keys(ITEM_COPY)).toEqual(ITEM_IDS)
    expect(Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, ITEM_COPY[itemId].emoji]))).toEqual(
      {
        'travel-basic': '🍱',
        'travel-apple': '🍎',
        'signal-headphones': '🎧',
        'trend-toolbox': '🧰',
        'lucky-apple': '🍀',
        'bottled-speed-magic': '⚡',
        'bottled-vitality-magic': '✨',
      },
    )
  })
})
