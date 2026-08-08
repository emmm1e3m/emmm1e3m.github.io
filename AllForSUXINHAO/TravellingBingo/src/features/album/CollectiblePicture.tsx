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
  const selected = large ? ordered.at(-1)! : ordered[0]
  const srcSet = ordered.map((image) => `${publicAsset(image.path)} ${image.width}w`).join(', ')

  return (
    <img
      src={publicAsset(selected.path)}
      srcSet={srcSet}
      sizes={large ? '(max-width: 720px) 92vw, 760px' : '(max-width: 720px) 46vw, 220px'}
      alt={item.alt}
      width={selected.width}
      height={selected.height}
      loading={large ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
