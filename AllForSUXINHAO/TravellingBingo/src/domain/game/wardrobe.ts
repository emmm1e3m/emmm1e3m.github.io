import { FRIEND_EVENT_IDS } from './constants'
import { incrementSafeCounter } from './counters'
import { createRandomCursor, hashSeed, randomInteger } from '../rewards/prng'
import { isValidTimestamp } from './time'
import type {
  CollectionCatalog,
  GameAction,
  GameEffect,
  GameState,
  GameTransition,
  WardrobeCatalogItem,
  WardrobeAssetId,
  WardrobeElement,
  WardrobePhoto,
  WardrobePhotoParticipant,
  WardrobeState,
  WardrobeTargetId,
  WardrobeTransform,
} from './types'

export const WARDROBE_LAYOUT_VERSION = 1 as const
export const WARDROBE_SHOP_SIZE = 3 as const
export const MAX_WARDROBE_LOOK_ELEMENTS = 12
export const MAX_WARDROBE_LOOKS_PER_TARGET = 8
export const MAX_WARDROBE_LOOK_NAME_LENGTH = 20
export const MAX_WARDROBE_PHOTOS = 40
export const MAX_WARDROBE_PHOTO_PARTICIPANTS = 6

export const WARDROBE_ASSET_IDS = [
  'green-sailor-top',
  'red-ruffle-dress',
  'monochrome-maid-dress',
  'black-stage-suit',
  'black-tie-uniform',
  'blue-street-jacket',
  'tan-bear-suit',
  'cream-apple-cape',
  'round-glasses',
  'square-glasses',
  'maid-headband',
  'black-beret',
  'cat-ears',
  'microphone',
  'signal-sign',
  'apple-cake',
  'paw-glove',
  'check-sign',
  'cross-sign',
  'dim-sum-basket',
  'apple-cuffs',
  'apple-badge',
  'black-fedora',
  'red-bead-trim',
] as const

export const STARTER_WARDROBE_ASSET_IDS = [
  'cream-apple-cape',
] as const satisfies readonly WardrobeAssetId[]

const WARDROBE_CATALOG_DETAILS: readonly Omit<WardrobeCatalogItem, 'defaultTransform'>[] = [
  {
    id: 'green-sailor-top',
    name: '绿领结水手装',
    category: 'outfit',
    priceApples: 5,
    starter: false,
  },
  {
    id: 'red-ruffle-dress',
    name: '红色荷叶边礼裙',
    category: 'outfit',
    priceApples: 6,
    starter: false,
  },
  {
    id: 'monochrome-maid-dress',
    name: '黑白女仆裙',
    category: 'outfit',
    priceApples: 7,
    starter: false,
  },
  {
    id: 'black-stage-suit',
    name: '黑色舞台礼服',
    category: 'outfit',
    priceApples: 7,
    starter: false,
  },
  {
    id: 'black-tie-uniform',
    name: '黑色领带制服',
    category: 'outfit',
    priceApples: 5,
    starter: false,
  },
  {
    id: 'blue-street-jacket',
    name: '蓝黑街头夹克',
    category: 'outfit',
    priceApples: 6,
    starter: false,
  },
  { id: 'tan-bear-suit', name: '焦糖小熊装', category: 'outfit', priceApples: 7, starter: false },
  {
    id: 'cream-apple-cape',
    name: '奶油苹果斗篷',
    category: 'outfit',
    priceApples: 5,
    starter: true,
  },
  { id: 'round-glasses', name: '红色圆框眼镜', category: 'face', priceApples: 3, starter: false },
  { id: 'square-glasses', name: '棕色方框眼镜', category: 'face', priceApples: 3, starter: false },
  { id: 'maid-headband', name: '女仆头饰', category: 'headwear', priceApples: 4, starter: false },
  { id: 'black-beret', name: '黑色贝雷帽', category: 'headwear', priceApples: 4, starter: false },
  { id: 'cat-ears', name: '猫耳发箍', category: 'headwear', priceApples: 4, starter: false },
  { id: 'microphone', name: '手持麦克风', category: 'prop', priceApples: 6, starter: false },
  { id: 'signal-sign', name: '信号手牌', category: 'prop', priceApples: 6, starter: false },
  { id: 'apple-cake', name: '苹果蛋糕', category: 'prop', priceApples: 6, starter: false },
  { id: 'paw-glove', name: '猫爪手套', category: 'prop', priceApples: 4, starter: false },
  { id: 'check-sign', name: '通过手牌', category: 'prop', priceApples: 4, starter: false },
  { id: 'cross-sign', name: '拒绝手牌', category: 'prop', priceApples: 4, starter: false },
  { id: 'dim-sum-basket', name: '点心蒸笼', category: 'prop', priceApples: 6, starter: false },
  { id: 'apple-cuffs', name: '苹果袖饰', category: 'accessory', priceApples: 4, starter: false },
  { id: 'apple-badge', name: '苹果徽章', category: 'accessory', priceApples: 3, starter: false },
  { id: 'black-fedora', name: '黑色礼帽', category: 'headwear', priceApples: 6, starter: false },
  {
    id: 'red-bead-trim',
    name: '红珠蕾丝项饰',
    category: 'accessory',
    priceApples: 5,
    starter: false,
  },
] as const

const WARDROBE_DEFAULT_TRANSFORM_BY_ID: Readonly<Record<WardrobeAssetId, WardrobeTransform>> = {
  'green-sailor-top': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'red-ruffle-dress': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'monochrome-maid-dress': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'black-stage-suit': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'black-tie-uniform': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'blue-street-jacket': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'tan-bear-suit': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'cream-apple-cape': { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
  'round-glasses': { x: 0.5, y: 0.48, scale: 0.3, rotation: 0, z: 45 },
  'square-glasses': { x: 0.5, y: 0.48, scale: 0.3, rotation: 0, z: 45 },
  'maid-headband': { x: 0.5, y: 0.18, scale: 0.3, rotation: 0, z: 40 },
  'black-beret': { x: 0.5, y: 0.14, scale: 0.31, rotation: -3, z: 40 },
  'cat-ears': { x: 0.5, y: 0.15, scale: 0.34, rotation: 0, z: 40 },
  microphone: { x: 0.72, y: 0.7, scale: 0.22, rotation: -12, z: 30 },
  'signal-sign': { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  'apple-cake': { x: 0.5, y: 0.84, scale: 0.3, rotation: 0, z: 35 },
  'paw-glove': { x: 0.25, y: 0.7, scale: 0.18, rotation: -12, z: 30 },
  'check-sign': { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  'cross-sign': { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  'dim-sum-basket': { x: 0.5, y: 0.84, scale: 0.3, rotation: 0, z: 35 },
  'apple-cuffs': { x: 0.5, y: 0.74, scale: 0.34, rotation: 0, z: 28 },
  'apple-badge': { x: 0.67, y: 0.7, scale: 0.11, rotation: 0, z: 28 },
  'black-fedora': { x: 0.5, y: 0.14, scale: 0.32, rotation: 0, z: 40 },
  'red-bead-trim': { x: 0.5, y: 0.62, scale: 0.32, rotation: 0, z: 28 },
}

export const WARDROBE_CATALOG: readonly WardrobeCatalogItem[] = WARDROBE_CATALOG_DETAILS.map(
  (item) => ({ ...item, defaultTransform: WARDROBE_DEFAULT_TRANSFORM_BY_ID[item.id] }),
)

const WARDROBE_CATALOG_BY_ID = new Map(WARDROBE_CATALOG.map((item) => [item.id, item] as const))
const WARDROBE_ASSET_ID_SET = new Set<string>(WARDROBE_ASSET_IDS)
const WARDROBE_FOR_SALE_IDS = WARDROBE_CATALOG.filter((item) => !item.starter).map(
  (item) => item.id,
)

export type WardrobeAction = Extract<GameAction, { type: `wardrobe/${string}` }>

export type WardrobePurchaseAvailability =
  | { canPurchase: true; item: (typeof WARDROBE_CATALOG)[number] }
  | {
      canPurchase: false
      reason: 'not-in-shop' | 'already-owned' | 'insufficient-apples' | 'unknown-asset'
      message: string
    }

function fail(
  state: GameState,
  code: Extract<GameTransition, { ok: false }>['error']['code'],
  message: string,
): GameTransition {
  return { ok: false, state, error: { code, message }, effects: [] }
}

function succeed(state: GameState, effects: readonly GameEffect[] = []): GameTransition {
  return { ok: true, state, effects }
}

export function isWardrobeAssetId(value: string): value is WardrobeAssetId {
  return WARDROBE_ASSET_ID_SET.has(value)
}

export function getWardrobeCatalogItem(assetId: string) {
  return isWardrobeAssetId(assetId) ? WARDROBE_CATALOG_BY_ID.get(assetId) : undefined
}

export function generateWardrobeShop(
  seed: string,
  companionDay: number,
  ownedAssetIds: readonly WardrobeAssetId[],
): WardrobeAssetId[] {
  if (seed.trim().length === 0) throw new TypeError('衣柜刷新种子不能为空')
  if (!Number.isSafeInteger(companionDay) || companionDay < 0) {
    throw new RangeError('衣柜刷新游戏日必须是非负安全整数')
  }

  const owned = new Set<WardrobeAssetId>(ownedAssetIds)
  const shuffled = WARDROBE_FOR_SALE_IDS.filter((assetId) => !owned.has(assetId))
  let cursor = createRandomCursor(`${seed}:wardrobe:${companionDay}`)
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = randomInteger(cursor, 0, index)
    cursor = random.cursor
    ;[shuffled[index], shuffled[random.value]] = [shuffled[random.value], shuffled[index]]
  }
  return shuffled.slice(0, WARDROBE_SHOP_SIZE)
}

export function createInitialWardrobeState(seed: string, companionDay: number): WardrobeState {
  const ownedAssetIds = [...STARTER_WARDROBE_ASSET_IDS]
  return {
    layoutVersion: WARDROBE_LAYOUT_VERSION,
    shop: {
      companionDay,
      assetIds: generateWardrobeShop(seed, companionDay, ownedAssetIds),
    },
    ownedAssetIds,
    nextLookSequence: 0,
    looks: {},
    nextPhotoSequence: 0,
    photos: {},
  }
}

export function refreshWardrobeShopForCompanionDay(state: GameState): GameState {
  const companionDay = state.profile.companionDays
  if (state.wardrobe.shop.companionDay === companionDay) return state
  return {
    ...state,
    wardrobe: {
      ...state.wardrobe,
      shop: {
        companionDay,
        assetIds: generateWardrobeShop(
          state.random.seed,
          companionDay,
          state.wardrobe.ownedAssetIds,
        ),
      },
    },
  }
}

export function getAvailableWardrobeTargets(state: Pick<GameState, 'friends'>): WardrobeTargetId[] {
  return ['bingo', ...FRIEND_EVENT_IDS.filter((friendId) => state.friends[friendId] !== undefined)]
}

export function isWardrobeTargetAvailable(
  state: Pick<GameState, 'friends'>,
  targetId: WardrobeTargetId,
): boolean {
  return targetId === 'bingo' || state.friends[targetId] !== undefined
}

export function getWardrobeShopItems(state: Pick<GameState, 'wardrobe'>) {
  return state.wardrobe.shop.assetIds
    .filter((assetId) => !state.wardrobe.ownedAssetIds.includes(assetId))
    .map((assetId) => WARDROBE_CATALOG_BY_ID.get(assetId)!)
}

export function getOwnedWardrobeItems(state: Pick<GameState, 'wardrobe'>) {
  return state.wardrobe.ownedAssetIds.map((assetId) => WARDROBE_CATALOG_BY_ID.get(assetId)!)
}

export function getWardrobeLook(state: Pick<GameState, 'wardrobe'>, lookId: string) {
  return state.wardrobe.looks[lookId] ?? null
}

export function getSavedWardrobeLooks(
  state: Pick<GameState, 'wardrobe'>,
  targetId: WardrobeTargetId,
) {
  return Object.values(state.wardrobe.looks)
    .filter((look) => look.targetId === targetId)
    .sort(
      (left, right) => right.updatedAt - left.updatedAt || right.lookId.localeCompare(left.lookId),
    )
}

export function getWardrobePhotos(state: Pick<GameState, 'wardrobe'>): WardrobePhoto[] {
  return Object.values(state.wardrobe.photos).sort(
    (left, right) => right.createdAt - left.createdAt || right.photoId.localeCompare(left.photoId),
  )
}

export function getWardrobePurchaseAvailability(
  state: Pick<GameState, 'wardrobe' | 'economy'>,
  assetId: string,
): WardrobePurchaseAvailability {
  const item = getWardrobeCatalogItem(assetId)
  if (item === undefined || item.starter) {
    return { canPurchase: false, reason: 'unknown-asset', message: '这件服装不在可购买目录中' }
  }
  if (!state.wardrobe.shop.assetIds.includes(item.id)) {
    return { canPurchase: false, reason: 'not-in-shop', message: '这件服装今天没有出现在衣柜里' }
  }
  if (state.wardrobe.ownedAssetIds.includes(item.id)) {
    return { canPurchase: false, reason: 'already-owned', message: '这件服装已经收藏了' }
  }
  if (state.economy.apples < item.priceApples) {
    return {
      canPurchase: false,
      reason: 'insufficient-apples',
      message: '🍎不够，暂时不能买下这件服装',
    }
  }
  return { canPurchase: true, item }
}

export function isValidWardrobeTransform(transform: WardrobeTransform): boolean {
  return (
    Number.isFinite(transform.x) &&
    transform.x >= 0 &&
    transform.x <= 1 &&
    Number.isFinite(transform.y) &&
    transform.y >= 0 &&
    transform.y <= 1 &&
    Number.isFinite(transform.scale) &&
    transform.scale >= 0.05 &&
    transform.scale <= 5 &&
    Number.isFinite(transform.rotation) &&
    transform.rotation >= -180 &&
    transform.rotation <= 180 &&
    Number.isSafeInteger(transform.z) &&
    transform.z >= -100 &&
    transform.z <= 100
  )
}

function hasUniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length
}

function areValidLookElements(
  elements: readonly WardrobeElement[],
  ownedAssetIds: ReadonlySet<string>,
): boolean {
  return (
    elements.length <= MAX_WARDROBE_LOOK_ELEMENTS &&
    hasUniqueValues(elements.map((element) => element.placementId)) &&
    hasUniqueValues(elements.map((element) => element.z)) &&
    elements.every(
      (element) =>
        /^[a-z0-9][a-z0-9-]{0,47}$/.test(element.placementId) &&
        isWardrobeAssetId(element.assetId) &&
        ownedAssetIds.has(element.assetId) &&
        isValidWardrobeTransform(element),
    )
  )
}

function copyWardrobeElement(element: WardrobeElement): WardrobeElement {
  return {
    placementId: element.placementId,
    assetId: element.assetId,
    x: element.x,
    y: element.y,
    scale: element.scale,
    rotation: element.rotation,
    z: element.z,
  }
}

function purchaseWardrobeItem(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/item-purchase' }>,
): GameTransition {
  const availability = getWardrobePurchaseAvailability(state, action.assetId)
  if (!availability.canPurchase) {
    if (availability.reason === 'already-owned') {
      return fail(state, 'WARDROBE_ITEM_ALREADY_OWNED', availability.message)
    }
    if (availability.reason === 'insufficient-apples') {
      return fail(state, 'INSUFFICIENT_APPLES', availability.message)
    }
    return fail(state, 'WARDROBE_ITEM_NOT_FOR_SALE', availability.message)
  }

  const { item } = availability
  return succeed(
    {
      ...state,
      economy: { apples: state.economy.apples - item.priceApples },
      wardrobe: {
        ...state.wardrobe,
        ownedAssetIds: [...state.wardrobe.ownedAssetIds, item.id],
      },
    },
    [{ type: 'wardrobe-item-purchased', assetId: item.id, applesSpent: item.priceApples }],
  )
}

function validateWardrobeLookDraft(
  state: GameState,
  name: string,
  elements: readonly WardrobeElement[],
): { ok: true; name: string } | { ok: false; transition: GameTransition } {
  const normalizedName = name.trim()
  if (normalizedName.length < 1 || normalizedName.length > MAX_WARDROBE_LOOK_NAME_LENGTH) {
    return {
      ok: false,
      transition: fail(
        state,
        'WARDROBE_LOOK_NAME_INVALID',
        `造型名称需要填写 1–${MAX_WARDROBE_LOOK_NAME_LENGTH} 个字符`,
      ),
    }
  }
  if (!areValidLookElements(elements, new Set(state.wardrobe.ownedAssetIds))) {
    const hasUnownedAsset = elements.some(
      (element) => !state.wardrobe.ownedAssetIds.includes(element.assetId),
    )
    return {
      ok: false,
      transition: fail(
        state,
        hasUnownedAsset ? 'WARDROBE_ASSET_NOT_OWNED' : 'WARDROBE_LOOK_INVALID',
        hasUnownedAsset ? '搭配中包含还没有收藏的服装' : '搭配元素的位置或图层顺序无效',
      ),
    }
  }
  return { ok: true, name: normalizedName }
}

function createWardrobeLook(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/look-create' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '保存造型的时间无效')
  if (!isWardrobeTargetAvailable(state, action.targetId)) {
    return fail(state, 'WARDROBE_TARGET_LOCKED', '还没有遇见这位朋友，暂时不能为它搭配')
  }
  const validation = validateWardrobeLookDraft(state, action.name, action.elements)
  if (!validation.ok) return validation.transition
  if (
    Object.values(state.wardrobe.looks).filter((look) => look.targetId === action.targetId)
      .length >= MAX_WARDROBE_LOOKS_PER_TARGET
  ) {
    return fail(
      state,
      'WARDROBE_LOOK_LIMIT_REACHED',
      `每位角色最多保存 ${MAX_WARDROBE_LOOKS_PER_TARGET} 套造型`,
    )
  }
  if (state.wardrobe.nextLookSequence >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '造型序列已达到存档上限')
  }

  const lookId = `look-${state.wardrobe.nextLookSequence.toString(36)}-${hashSeed(
    `${state.random.seed}:look:${state.wardrobe.nextLookSequence}:${action.targetId}:${action.now}`,
  ).toString(36)}`
  const look = {
    lookId,
    targetId: action.targetId,
    name: validation.name,
    elements: action.elements.map(copyWardrobeElement),
    createdAt: action.now,
    updatedAt: action.now,
  }
  return succeed(
    {
      ...state,
      wardrobe: {
        ...state.wardrobe,
        nextLookSequence: incrementSafeCounter(state.wardrobe.nextLookSequence),
        looks: { ...state.wardrobe.looks, [lookId]: look },
      },
    },
    [{ type: 'wardrobe-look-created', look }],
  )
}

function updateWardrobeLook(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/look-update' }>,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '更新造型的时间无效')
  const previous = state.wardrobe.looks[action.lookId]
  if (previous === undefined) {
    return fail(state, 'WARDROBE_LOOK_NOT_FOUND', '衣柜中没有这套造型')
  }
  if (!isWardrobeTargetAvailable(state, previous.targetId)) {
    return fail(state, 'WARDROBE_TARGET_LOCKED', '还没有遇见这位朋友，暂时不能修改它的搭配')
  }
  const validation = validateWardrobeLookDraft(state, action.name, action.elements)
  if (!validation.ok) return validation.transition
  const look = {
    ...previous,
    name: validation.name,
    elements: action.elements.map(copyWardrobeElement),
    updatedAt: action.now,
  }
  return succeed(
    {
      ...state,
      wardrobe: {
        ...state.wardrobe,
        looks: { ...state.wardrobe.looks, [action.lookId]: look },
      },
    },
    [{ type: 'wardrobe-look-updated', look }],
  )
}

function deleteWardrobeLook(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/look-delete' }>,
): GameTransition {
  const previous = state.wardrobe.looks[action.lookId]
  if (previous === undefined) {
    return fail(state, 'WARDROBE_LOOK_NOT_FOUND', '衣柜中没有这套造型')
  }
  const looks = { ...state.wardrobe.looks }
  delete looks[action.lookId]
  return succeed({ ...state, wardrobe: { ...state.wardrobe, looks } }, [
    { type: 'wardrobe-look-deleted', lookId: action.lookId, targetId: previous.targetId },
  ])
}

function createWardrobePhoto(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/photo-create' }>,
  catalog: CollectionCatalog,
): GameTransition {
  if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '合拍时间无效')
  if (Object.keys(state.wardrobe.photos).length >= MAX_WARDROBE_PHOTOS) {
    return fail(state, 'WARDROBE_PHOTO_LIMIT_REACHED', `相册最多保存 ${MAX_WARDROBE_PHOTOS} 张合拍`)
  }
  if (
    !catalog.postcard.includes(action.postcardId) ||
    state.collections[action.postcardId] === undefined
  ) {
    return fail(state, 'WARDROBE_POSTCARD_NOT_OWNED', '合拍背景必须选择已经收藏的明信片')
  }
  if (
    action.participants.length < 1 ||
    action.participants.length > MAX_WARDROBE_PHOTO_PARTICIPANTS ||
    !hasUniqueValues(action.participants.map((participant) => participant.targetId)) ||
    !hasUniqueValues(action.participants.map((participant) => participant.z)) ||
    action.participants.some(
      (participant) =>
        !isWardrobeTargetAvailable(state, participant.targetId) ||
        !isValidWardrobeTransform(participant),
    )
  ) {
    return fail(
      state,
      'WARDROBE_PARTICIPANTS_INVALID',
      '合拍至少选择一位角色，且每位已认识的朋友只能出现一次',
    )
  }
  for (const participant of action.participants) {
    if (participant.lookId === null) continue
    const look = state.wardrobe.looks[participant.lookId]
    if (look === undefined) {
      return fail(state, 'WARDROBE_LOOK_NOT_FOUND', '合拍选择的造型已经不存在')
    }
    if (look.targetId !== participant.targetId) {
      return fail(state, 'WARDROBE_LOOK_TARGET_MISMATCH', '合拍造型与角色不匹配')
    }
  }
  if (state.wardrobe.nextPhotoSequence >= Number.MAX_SAFE_INTEGER) {
    return fail(state, 'INVALID_AMOUNT', '合拍序列已达到存档上限')
  }

  const photoId = `photo-${state.wardrobe.nextPhotoSequence.toString(36)}-${hashSeed(
    `${state.random.seed}:photo:${state.wardrobe.nextPhotoSequence}:${action.now}`,
  ).toString(36)}`
  const participants: WardrobePhotoParticipant[] = action.participants.map((participant) => ({
    targetId: participant.targetId,
    x: participant.x,
    y: participant.y,
    scale: participant.scale,
    rotation: participant.rotation,
    z: participant.z,
    sourceLookId: participant.lookId,
    elements:
      participant.lookId === null
        ? []
        : state.wardrobe.looks[participant.lookId].elements.map(copyWardrobeElement),
  }))
  const photo: WardrobePhoto = {
    photoId,
    postcardId: action.postcardId,
    participants,
    createdAt: action.now,
  }
  return succeed(
    {
      ...state,
      wardrobe: {
        ...state.wardrobe,
        nextPhotoSequence: incrementSafeCounter(state.wardrobe.nextPhotoSequence),
        photos: { ...state.wardrobe.photos, [photoId]: photo },
      },
    },
    [{ type: 'wardrobe-photo-created', photo }],
  )
}

function deleteWardrobePhoto(
  state: GameState,
  action: Extract<GameAction, { type: 'wardrobe/photo-delete' }>,
): GameTransition {
  if (state.wardrobe.photos[action.photoId] === undefined) {
    return fail(state, 'WARDROBE_PHOTO_NOT_FOUND', '相册中没有这张合拍')
  }
  const photos = { ...state.wardrobe.photos }
  delete photos[action.photoId]
  return succeed({ ...state, wardrobe: { ...state.wardrobe, photos } }, [
    { type: 'wardrobe-photo-deleted', photoId: action.photoId },
  ])
}

export function isWardrobeAction(action: GameAction): action is WardrobeAction {
  return action.type.startsWith('wardrobe/')
}

export function reduceWardrobe(
  state: GameState,
  action: WardrobeAction,
  catalog: CollectionCatalog,
): GameTransition {
  switch (action.type) {
    case 'wardrobe/item-purchase':
      return purchaseWardrobeItem(state, action)
    case 'wardrobe/look-create':
      return createWardrobeLook(state, action)
    case 'wardrobe/look-update':
      return updateWardrobeLook(state, action)
    case 'wardrobe/look-delete':
      return deleteWardrobeLook(state, action)
    case 'wardrobe/photo-create':
      return createWardrobePhoto(state, action, catalog)
    case 'wardrobe/photo-delete':
      return deleteWardrobePhoto(state, action)
  }
}
