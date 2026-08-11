import { publicAsset } from '@/app/assets'
import type { CollectibleItem, ContentCatalog } from '@/content'
import type { GameState, PomodoroBackgroundRef } from '@/domain'
import type { PhotoPostcardVisual } from '@/features/wardrobe/PhotoCompositionPreview'

import type { PomodoroBackgroundOption, PostcardBackgroundOption, RealityTodoView } from './types'

function postcardVisual(item: CollectibleItem | undefined, preferredWidth: number) {
  if (!item || item.category !== 'postcard') return null
  const image =
    item.images.find((candidate) => candidate.width === preferredWidth) ??
    [...item.images].sort(
      (left, right) =>
        Math.abs(left.width - preferredWidth) - Math.abs(right.width - preferredWidth) ||
        right.width - left.width,
    )[0]
  if (!image) return null
  return {
    url: publicAsset(image.path),
    width: image.width,
    height: image.height,
    alt: item.alt,
  } satisfies PhotoPostcardVisual
}

export function samePomodoroBackgroundRef(
  left: PomodoroBackgroundRef | null,
  right: PomodoroBackgroundRef | null,
) {
  return left === null || right === null
    ? left === right
    : left.kind === right.kind && left.id === right.id
}

export function findPomodoroBackgroundOption(
  options: readonly PomodoroBackgroundOption[],
  ref: PomodoroBackgroundRef | null,
) {
  return ref === null
    ? null
    : (options.find((option) => samePomodoroBackgroundRef(option.ref, ref)) ?? null)
}

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
        kind: 'postcard',
        ref: { kind: 'postcard', id: item.id },
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

export function buildPomodoroBackgroundOptions(
  game: GameState,
  catalog: ContentCatalog,
): PomodoroBackgroundOption[] {
  const postcards = buildUnlockedPostcardBackgrounds(game, catalog)
  const photos = Object.values(game.wardrobe.photos)
    .sort(
      (left, right) =>
        right.createdAt - left.createdAt || right.photoId.localeCompare(left.photoId),
    )
    .map((photo) => {
      const postcard = photo.postcardId ? catalog.byId[photo.postcardId] : undefined
      const thumbnailPostcard = postcardVisual(postcard, 480)
      const fullPostcard = postcardVisual(postcard, 960) ?? thumbnailPostcard
      const date = new Date(photo.createdAt)
      const title = `奇迹合拍 · ${date.getMonth() + 1}月${date.getDate()}日`
      return {
        kind: 'wardrobe-photo',
        ref: { kind: 'wardrobe-photo', id: photo.photoId },
        id: photo.photoId,
        title,
        description: '把保存时的形象与站位带进这一轮苹果钟。',
        aspectRatio:
          fullPostcard && fullPostcard.height > 0
            ? fullPostcard.width / fullPostcard.height
            : 4 / 3,
        photo,
        thumbnailPostcard,
        fullPostcard,
      } satisfies PomodoroBackgroundOption
    })
  return [...postcards, ...photos]
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
