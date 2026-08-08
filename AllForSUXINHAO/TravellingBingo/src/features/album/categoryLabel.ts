import type { CollectibleCategory } from '@/domain'

export function categoryLabel(category: CollectibleCategory) {
  if (category === 'postcard') return '明信片'
  if (category === 'million-shot') return '百万直拍'
  return '全站第一'
}
