import { render } from '@testing-library/react'

import type { WardrobePhoto } from '@/domain/game/types'

import { PhotoCompositionPreview } from './PhotoCompositionPreview'
import compositionStyles from './PhotoCompositionPreview.css?raw'

const photo: WardrobePhoto = {
  photoId: 'photo-preview-v12',
  postcardId: null,
  createdAt: 1_000,
  participants: [
    {
      targetId: 'bingo',
      sourceLookId: null,
      x: 0.5,
      y: 0.55,
      scaleX: 0.32,
      scaleY: 0.24,
      rotation: 4,
      z: 2,
      elements: [
        {
          placementId: 'local-behind',
          assetId: 'apple-cuffs',
          x: 0.5,
          y: 0.6,
          scaleX: 0.4,
          scaleY: 0.2,
          rotation: -3,
          z: -1,
        },
        {
          placementId: 'local-front',
          assetId: 'round-glasses',
          x: 0.5,
          y: 0.4,
          scaleX: 0.3,
          scaleY: 0.3,
          rotation: 0,
          z: 1,
        },
      ],
    },
  ],
  decorations: [
    {
      placementId: 'global-front',
      assetId: 'apple-badge',
      x: 0.8,
      y: 0.75,
      scaleX: 0.12,
      scaleY: 0.24,
      rotation: 12,
      z: 3,
    },
    {
      placementId: 'global-behind',
      assetId: 'signal-sign',
      x: 0.2,
      y: 0.25,
      scaleX: 0.2,
      scaleY: 0.1,
      rotation: -8,
      z: 1,
    },
  ],
}

describe('合拍共享预览', () => {
  it('按照片级 z 交错人物与装饰，并用双轴变换重建各层', () => {
    const { container } = render(<PhotoCompositionPreview photo={photo} />)
    const scene = container.querySelector('.photo-composition__people')
    expect(scene).not.toBeNull()

    const layers = Array.from(scene?.children ?? [])
    expect(
      layers.map(
        (layer) => layer.getAttribute('data-decoration-id') ?? layer.getAttribute('data-target-id'),
      ),
    ).toEqual(['global-behind', 'bingo', 'global-front'])

    const participant = container.querySelector<HTMLElement>('[data-target-id="bingo"]')
    expect(participant?.style.width).toBe('32%')
    expect(participant?.style.transform).toContain('scaleY(0.75)')

    const behind = container.querySelector<HTMLElement>('[data-decoration-id="global-behind"]')
    expect(behind?.style.width).toBe('20%')
    expect(behind?.style.transform).toContain('rotate(-8deg) scaleY(0.5)')

    const localBehind = container.querySelector<HTMLElement>('img[src$="apple-cuffs.webp"]')
    expect(localBehind?.style.width).toBe('40%')
    expect(localBehind?.style.transform).toContain('scaleY(0.5)')
    expect(container.querySelectorAll('.photo-composition__decoration')).toHaveLength(2)
  })

  it('cover 模式统一放大整张源画布并裁切，装饰预览不进入无障碍树', () => {
    const { container } = render(
      <PhotoCompositionPreview
        photo={photo}
        postcard={{ url: '/wide.webp', width: 960, height: 540 }}
        mode="cover"
        decorative
      />,
    )
    const preview = container.querySelector<HTMLElement>('.photo-composition')

    expect(preview).toHaveClass('photo-composition--cover')
    expect(preview).toHaveAttribute('aria-hidden', 'true')
    expect(preview).toHaveAttribute('inert')
    expect(preview).not.toHaveAttribute('role')
    expect(preview).toHaveStyle({ '--photo-aspect-ratio': '1.7777777777777777' })
    expect(preview?.querySelector(':scope > .photo-composition__canvas')).not.toBeNull()
    expect(compositionStyles).toContain('container-type: size;')
    expect(compositionStyles).toMatch(
      /\.photo-composition--cover \.photo-composition__canvas\s*\{[\s\S]*width: max\(100cqw,[\s\S]*height: max\(100cqh,/u,
    )
    expect(compositionStyles).toContain('overflow: clip;')
  })

  it('natural 模式保留明信片的原始宽高比', () => {
    const { container } = render(
      <PhotoCompositionPreview
        photo={photo}
        postcard={{ url: '/portrait.webp', width: 480, height: 640 }}
      />,
    )

    expect(container.querySelector('.photo-composition')).toHaveStyle({ aspectRatio: '480 / 640' })
  })

  it('contain 模式统一缩小整张源画布并完整显示', () => {
    const { container } = render(
      <PhotoCompositionPreview
        photo={photo}
        postcard={{ url: '/portrait.webp', width: 480, height: 640 }}
        mode="contain"
      />,
    )

    expect(container.querySelector('.photo-composition')).toHaveClass('photo-composition--contain')
    expect(compositionStyles).toMatch(
      /\.photo-composition--contain \.photo-composition__canvas\s*\{[\s\S]*width: min\(100cqw,[\s\S]*height: min\(100cqh,/u,
    )
  })
})
