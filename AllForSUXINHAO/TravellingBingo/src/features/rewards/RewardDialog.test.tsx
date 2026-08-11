import { fireEvent, render, screen } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import type { ClaimSummary } from '@/domain'

import { RewardDialog } from './RewardDialog'

const postcard = {
  id: 'postcard-test',
  category: 'postcard',
  title: '山海明信片',
  alt: '一张山海明信片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/test.webp',
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
  ],
  tags: ['山海'],
  source: { url: 'https://example.com/postcard' },
} as unknown as CollectibleItem

const millionShot = {
  ...postcard,
  id: 'million-shot-test',
  category: 'million-shot',
  title: '舞台海报',
  alt: '一张舞台海报',
  images: [
    {
      ...postcard.images[0],
      height: 640,
      path: 'assets/collectibles/million-shots/test.webp',
    },
  ],
} as unknown as CollectibleItem

const siteFirst = {
  ...postcard,
  id: 'site-first-test',
  category: 'site-first',
  title: '全站第一海报',
  alt: '一张全站第一海报',
  images: [
    {
      ...postcard.images[0],
      height: 679,
      path: 'assets/collectibles/site-firsts/test.webp',
    },
  ],
} as unknown as CollectibleItem

const friend = {
  id: 'signal-dog',
  name: '信号狗',
  kind: 'dog',
  description: '总会带着好消息出现。',
  alt: '站着挥手的信号狗',
  image: {
    width: 512,
    height: 512,
    path: 'assets/friends/signal-dog.webp',
    byteLength: 1,
    mime: 'image/webp',
    sha256: '0'.repeat(64),
  },
  sourceCell: 4,
} as FriendItem

const catalog: ContentCatalog = {
  items: [postcard, millionShot, siteFirst],
  byId: {
    [postcard.id]: postcard,
    [millionShot.id]: millionShot,
    [siteFirst.id]: siteFirst,
  },
  categoryCounts: { postcard: 1, 'million-shot': 1, 'site-first': 1 },
  siteFirstChronology: [siteFirst.id],
  friends: [friend],
  friendById: { [friend.id]: friend },
  videosByBvid: {},
  recordPlayerVideos: [],
}

function summary(overrides: Partial<ClaimSummary> = {}): ClaimSummary {
  return {
    runId: 'reward-run',
    kind: 'travel',
    apples: { base: 0, modifier: 0, duplicateCompensation: 0, total: 0 },
    collection: null,
    friendId: null,
    giftItemId: null,
    giftApples: 0,
    guaranteedByPity: false,
    ...overrides,
  }
}

describe('RewardDialog', () => {
  it('冲热未获得收藏时使用简短鼓励文案', () => {
    render(
      <RewardDialog reward={summary({ kind: 'trend' })} catalog={catalog} onDismiss={vi.fn()} />,
    )

    expect(screen.getByText('加油准备下一次冲刺')).toBeInTheDocument()
    expect(screen.queryByText(/饼狗会陪你/u)).not.toBeInTheDocument()
  })

  it('纯货币奖励只使用紧凑的 N🍎 文案', () => {
    render(
      <RewardDialog
        reward={summary({
          kind: 'rest',
          apples: { base: 1, modifier: 0, duplicateCompensation: 0, total: 1 },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('得到 1🍎')).toHaveTextContent('1🍎')
    expect(screen.getByLabelText('1🍎').querySelector('.apple-amount__number')).toHaveTextContent(
      '1',
    )
    expect(screen.queryByText(/个苹果/u)).not.toBeInTheDocument()
  })

  it('新明信片不显示活动完成标签', () => {
    render(
      <RewardDialog
        reward={summary({
          collection: { id: postcard.id, category: 'postcard', duplicate: false },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('旅途中遇见一份风景')).toBeInTheDocument()
    expect(screen.queryByText(/(?:Bingo|活动).*完成/u)).not.toBeInTheDocument()

    const image = screen.getByRole('img', { name: postcard.alt })
    expect(image.parentElement).toHaveClass(
      'reward-collectible__media',
      'reward-collectible__media--postcard',
    )
    expect(window.getComputedStyle(image).objectFit).toBe('cover')
    expect(window.getComputedStyle(screen.getByRole('dialog')).overflow).toBe('hidden')
    expect(screen.getByRole('button', { name: '收好这份回忆' })).toHaveFocus()
  })

  it.each([
    ['百万直拍', millionShot, 'million-shot'],
    ['全站第一', siteFirst, 'site-first'],
  ] as const)('%s奖励海报使用对应比例的 cover 裁切', (_label, item, category) => {
    render(
      <RewardDialog
        reward={summary({
          collection: { id: item.id, category, duplicate: false },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    const image = screen.getByRole('img', { name: item.alt })
    expect(image.parentElement).toHaveClass(`reward-collectible__media--${category}`)
    expect(window.getComputedStyle(image).objectFit).toBe('cover')
    expect(window.getComputedStyle(image.parentElement! as HTMLElement).overflow).toBe('hidden')
  })

  it('展示遇见的朋友、礼物与 N🍎', () => {
    render(
      <RewardDialog
        reward={summary({
          kind: 'music',
          friendId: friend.id,
          giftItemId: 'lucky-apple',
          giftApples: 3,
          apples: { base: 3, modifier: 0, duplicateCompensation: 0, total: 3 },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('信号狗循着音乐来啦')).toBeInTheDocument()
    expect(screen.getByText('送来一份幸运苹果')).toBeInTheDocument()
    expect(screen.getByLabelText('3🍎').closest('small')).toHaveTextContent('还送来 3🍎')
    expect(screen.queryByText(/收到/u)).not.toBeInTheDocument()

    const friendImage = screen.getByRole('img', { name: friend.alt })
    expect(friendImage.parentElement).toHaveClass('reward-friend__media')
    expect(window.getComputedStyle(friendImage).objectFit).toBe('cover')
    expect(window.getComputedStyle(friendImage).width).toBe('104%')
    expect(window.getComputedStyle(friendImage.parentElement! as HTMLElement).overflow).toBe(
      'hidden',
    )
    expect(document.querySelector('.reward-mascot > .mascot-sprite')).toBeInTheDocument()
  })

  it('保持焦点圈定、Escape 关闭和关闭后焦点恢复', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '打开奖励'
    document.body.append(trigger)
    trigger.focus()
    const onDismiss = vi.fn()

    const { unmount } = render(
      <RewardDialog reward={summary()} catalog={catalog} onDismiss={onDismiss} />,
    )

    const dismiss = screen.getByRole('button', { name: '回到房间' })
    expect(dismiss).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dismiss).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()

    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
