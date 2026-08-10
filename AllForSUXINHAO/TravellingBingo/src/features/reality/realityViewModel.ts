import { publicAsset } from '@/app/assets'
import type { ContentCatalog } from '@/content'
import type { GameState } from '@/domain'

import type { PostcardBackgroundOption, RealityTodoView } from './types'

export function buildUnlockedPostcardBackgrounds(
  game: GameState,
  catalog: ContentCatalog,
): PostcardBackgroundOption[] {
  return catalog.items.flatMap((item) => {
    if (item.category !== 'postcard' || game.collections[item.id] === undefined) return []

    const images = [...item.images].sort((left, right) => left.width - right.width)
    const thumbnail = images[0]
    const full = images.at(-1)
    return [
      {
        id: item.id,
        title: item.title,
        thumbnailUrl: thumbnail ? publicAsset(thumbnail.path) : undefined,
        fullUrl: full ? publicAsset(full.path) : undefined,
        aspectRatio: full && full.height > 0 ? full.width / full.height : undefined,
        alt: item.alt,
        description: item.caption,
      },
    ]
  })
}

export function buildRealityTodoViews(game: GameState): RealityTodoView[] {
  return Object.values(game.reality.todos)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: todo.completedAt !== null,
      dueLabel:
        todo.dueAt === null
          ? null
          : `截止 ${new Intl.DateTimeFormat('zh-CN', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(todo.dueAt)}`,
    }))
}
