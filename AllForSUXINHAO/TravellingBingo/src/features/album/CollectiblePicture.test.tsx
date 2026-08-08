import { fireEvent, render, screen } from '@testing-library/react'

import type { CollectibleItem } from '@/content'

import { CollectiblePicture } from './CollectiblePicture'

const collectible = {
  id: 'fallback-picture',
  category: 'million-shot',
  title: '高清回退测试',
  alt: '高清回退测试图片',
  images: [
    {
      width: 960,
      height: 1_280,
      path: 'assets/collectibles/fallback-picture-960.webp',
      byteLength: 3,
      mime: 'image/webp',
    },
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/fallback-picture-480.webp',
      byteLength: 1,
      mime: 'image/webp',
    },
    {
      width: 800,
      height: 1_067,
      path: 'assets/collectibles/fallback-picture-800.webp',
      byteLength: 2,
      mime: 'image/webp',
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/fallback-picture' },
} as CollectibleItem

describe('CollectiblePicture', () => {
  it('详情高清图加载失败后只使用同一收藏的 480 图', () => {
    render(<CollectiblePicture item={collectible} large />)

    const picture = screen.getByRole('img', { name: collectible.alt })
    expect(picture.getAttribute('src')).toMatch(/fallback-picture-960\.webp$/u)
    expect(picture.getAttribute('srcset')).toContain('fallback-picture-800.webp 800w')
    expect(picture).toHaveAttribute('sizes', '(max-width: 720px) 92vw, 760px')

    fireEvent.error(picture)

    expect(picture.getAttribute('src')).toMatch(/fallback-picture-480\.webp$/u)
    expect(picture).not.toHaveAttribute('srcset')
    expect(picture).not.toHaveAttribute('sizes')
    expect(picture).toHaveAttribute('width', '480')
    expect(picture).toHaveAttribute('height', '640')
  })

  it('普通缩略图的高清候选失败后清除候选集并固定为 480 图', () => {
    render(<CollectiblePicture item={collectible} />)

    const picture = screen.getByRole('img', { name: collectible.alt })
    expect(picture.getAttribute('src')).toMatch(/fallback-picture-480\.webp$/u)
    expect(picture.getAttribute('srcset')).toContain('fallback-picture-960.webp 960w')
    expect(picture).toHaveAttribute('sizes', '(max-width: 720px) 46vw, 220px')

    fireEvent.error(picture)

    expect(picture.getAttribute('src')).toMatch(/fallback-picture-480\.webp$/u)
    expect(picture).not.toHaveAttribute('srcset')
    expect(picture).not.toHaveAttribute('sizes')

    // 480 图自身也失败时不再触发新的回退，避免重复加载循环。
    fireEvent.error(picture)
    expect(picture.getAttribute('src')).toMatch(/fallback-picture-480\.webp$/u)
    expect(picture).not.toHaveAttribute('srcset')
  })
})
