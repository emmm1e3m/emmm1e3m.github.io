import { useState } from 'react'

import { publicAsset } from '@/app/assets'
import type { CollectibleItem } from '@/content'

export function CollectiblePicture({
  item,
  large = false,
}: {
  item: CollectibleItem
  large?: boolean
}) {
  const ordered = [...item.images].sort((left, right) => left.width - right.width)
  const fallback = ordered[0]
  const preferred = large ? ordered.at(-1)! : fallback
  const preferredKey = `${item.id}:${large ? 'large' : 'compact'}:${preferred.path}`
  const [failedPreferredKey, setFailedPreferredKey] = useState<string | null>(null)
  const hasFallenBack = failedPreferredKey === preferredKey
  const selected = hasFallenBack ? fallback : preferred
  const srcSet = ordered.map((image) => `${publicAsset(image.path)} ${image.width}w`).join(', ')
  const shouldOfferResponsiveSources = !hasFallenBack

  return (
    <img
      src={publicAsset(selected.path)}
      srcSet={shouldOfferResponsiveSources ? srcSet : undefined}
      sizes={
        shouldOfferResponsiveSources
          ? large
            ? '(max-width: 720px) 92vw, 760px'
            : '(max-width: 720px) 46vw, 220px'
          : undefined
      }
      alt={item.alt}
      width={selected.width}
      height={selected.height}
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
      onError={!hasFallenBack ? () => setFailedPreferredKey(preferredKey) : undefined}
    />
  )
}
