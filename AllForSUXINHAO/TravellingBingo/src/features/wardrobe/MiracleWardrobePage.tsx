import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { AppleAmount } from '@/components/AppleAmount'
import { useModalFocus } from '@/components/useModalFocus'
import type { ContentCatalog } from '@/content'
import type { GameAction, GameState } from '@/domain'
import {
  MAX_WARDROBE_LOOK_ELEMENTS,
  MAX_WARDROBE_LOOK_NAME_LENGTH,
  MAX_WARDROBE_LOOKS_PER_TARGET,
  MAX_WARDROBE_PHOTO_DECORATIONS,
  MAX_WARDROBE_PHOTOS,
  WARDROBE_CATALOG,
  getAvailableWardrobeTargets,
  getOwnedWardrobeItems,
  getSavedWardrobeLooks,
} from '@/domain/game/wardrobe'
import type {
  WardrobeAssetCategory,
  WardrobeAssetId,
  WardrobeElement,
  WardrobePhoto,
  WardrobePhotoDecoration,
  SavedWardrobeLook,
  WardrobeTargetId,
  WardrobeTransform,
} from '@/domain/game/types'
import { buildUnlockedPostcardBackgrounds, PostcardPicker } from '@/features/reality'

import './MiracleWardrobePage.css'

import { PhotoCompositionPreview } from './PhotoCompositionPreview'
import { downloadWardrobePhoto, readPhotoBackgroundDimensions } from './renderPhoto'
import { downloadWardrobeLook } from './renderWardrobeLook'
import { getWardrobeAssetVisual, getWardrobeTargetVisual } from './wardrobeAssets'

type WardrobeTab = 'dressing' | 'photo' | 'collection'

interface MiracleWardrobePageProps {
  game: GameState
  catalog: ContentCatalog
  onClose: () => void
  onAction: (action: GameAction) => void
}

interface PhotoParticipantDraft extends WardrobeTransform {
  targetId: WardrobeTargetId
  lookId: string | null
  defaultTransform: EditableTransform
}

interface PhotoDecorationDraft extends WardrobePhotoDecoration {
  defaultTransform: EditableTransform
}

interface LocalPhotoBackground {
  file: File
  previewUrl: string
  width: number
  height: number
  name: string
}

type EditableTransform = Pick<WardrobeTransform, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>

type PhotoLayerKind = 'participant' | 'decoration'
type KeyboardTransformMode = 'move' | 'stretch' | 'uniform'

interface DragState {
  pointerId: number
  id: string
  rect: DOMRect
  offsetX: number
  offsetY: number
}

interface TransformDragState {
  pointerId: number
  id: string
  centerX: number
  centerY: number
  initialDistance: number
  initialAngle: number
  initialScaleX: number
  initialScaleY: number
  initialRotation: number
}

interface StretchDragState {
  pointerId: number
  id: string
  centerX: number
  centerY: number
  initialLocalX: number
  initialLocalY: number
  initialScaleX: number
  initialScaleY: number
  rotation: number
}

interface PhotoDragState extends DragState {
  kind: PhotoLayerKind
}

interface PhotoTransformDragState extends TransformDragState {
  kind: PhotoLayerKind
}

interface PhotoStretchDragState extends StretchDragState {
  kind: PhotoLayerKind
}

const TABS: readonly { id: WardrobeTab; label: string }[] = [
  { id: 'dressing', label: '搭配室' },
  { id: 'photo', label: '合拍' },
  { id: 'collection', label: '衣服收藏' },
]

const CATEGORY_ORDER: readonly WardrobeAssetCategory[] = [
  'outfit',
  'headwear',
  'face',
  'accessory',
  'prop',
]

const CATEGORY_LABELS: Record<WardrobeAssetCategory, string> = {
  outfit: '套装',
  headwear: '头饰',
  face: '眼镜',
  accessory: '配饰',
  prop: '手持道具',
}

const DEFAULT_BINGO_PHOTO_TRANSFORM = {
  x: 0.5,
  y: 0.57,
  scaleX: 0.34,
  scaleY: 0.34,
  rotation: 0,
} as const

const DEFAULT_PHOTO_DECORATION_SCALE = 0.3
const LOCAL_PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
const LOOK_COMPOSITION_SCALE = 0.5

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distinguishDuplicateNames<T extends { name: string }>(items: readonly T[]) {
  const totals = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const item of items) totals.set(item.name, (totals.get(item.name) ?? 0) + 1)
  return items.map((item) => {
    const occurrence = (seen.get(item.name) ?? 0) + 1
    seen.set(item.name, occurrence)
    return {
      ...item,
      displayName: (totals.get(item.name) ?? 0) > 1 ? `${item.name} ${occurrence}` : item.name,
    }
  })
}

function pointerAngle(centerX: number, centerY: number, clientX: number, clientY: number) {
  return Math.atan2(clientY - centerY, clientX - centerX)
}

function pointerDistance(centerX: number, centerY: number, clientX: number, clientY: number) {
  return Math.hypot(clientX - centerX, clientY - centerY)
}

function localPointerVector(
  centerX: number,
  centerY: number,
  clientX: number,
  clientY: number,
  rotation: number,
) {
  const radians = (-rotation * Math.PI) / 180
  const dx = clientX - centerX
  const dy = clientY - centerY
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  }
}

function normalizeRotation(value: number) {
  let rotation = value
  while (rotation > 180) rotation -= 360
  while (rotation < -180) rotation += 360
  return rotation
}

function uniformScaleWithinBounds(scaleX: number, scaleY: number, requestedFactor: number) {
  const factor = clamp(
    requestedFactor,
    Math.max(0.05 / scaleX, 0.05 / scaleY),
    Math.min(5 / scaleX, 5 / scaleY),
  )
  return {
    scaleX: scaleX * factor,
    scaleY: scaleY * factor,
  }
}

function keyboardTransformUpdate(
  event: KeyboardEvent<HTMLButtonElement>,
  transform: WardrobeTransform,
  mode: KeyboardTransformMode,
): Partial<EditableTransform> | null {
  const moveStep = event.shiftKey ? 0.08 : 0.02
  const scaleStep = event.shiftKey ? 0.12 : 0.04
  const uniformFactor = event.shiftKey ? 1.25 : 1.1
  const rotationStep = event.shiftKey ? 15 : 5

  if (mode === 'move') {
    if (event.key === 'ArrowLeft') return { x: clamp(transform.x - moveStep, 0, 1) }
    if (event.key === 'ArrowRight') return { x: clamp(transform.x + moveStep, 0, 1) }
    if (event.key === 'ArrowUp') return { y: clamp(transform.y - moveStep, 0, 1) }
    if (event.key === 'ArrowDown') return { y: clamp(transform.y + moveStep, 0, 1) }
    return null
  }

  if (mode === 'stretch') {
    if (event.key === 'ArrowLeft') {
      return { scaleX: clamp(transform.scaleX - scaleStep, 0.05, 5) }
    }
    if (event.key === 'ArrowRight') {
      return { scaleX: clamp(transform.scaleX + scaleStep, 0.05, 5) }
    }
    if (event.key === 'ArrowUp') {
      return { scaleY: clamp(transform.scaleY + scaleStep, 0.05, 5) }
    }
    if (event.key === 'ArrowDown') {
      return { scaleY: clamp(transform.scaleY - scaleStep, 0.05, 5) }
    }
    return null
  }

  if (event.key === 'ArrowUp') {
    return uniformScaleWithinBounds(transform.scaleX, transform.scaleY, uniformFactor)
  }
  if (event.key === 'ArrowDown') {
    return uniformScaleWithinBounds(transform.scaleX, transform.scaleY, 1 / uniformFactor)
  }
  if (event.key === 'ArrowRight') {
    return { rotation: normalizeRotation(transform.rotation + rotationStep) }
  }
  if (event.key === 'ArrowLeft') {
    return { rotation: normalizeRotation(transform.rotation - rotationStep) }
  }
  return null
}

function cloneElements(elements: readonly WardrobeElement[]): WardrobeElement[] {
  return elements.map((element) => ({ ...element }))
}

function normalizeLayerOrder(elements: readonly WardrobeElement[]): WardrobeElement[] {
  return [...elements]
    .sort((left, right) => left.z - right.z || left.placementId.localeCompare(right.placementId))
    .map((element, index) => ({ ...element, z: index + 1 }))
}

function editableLayerStyle(
  transform: WardrobeTransform,
  naturalWidth = 1,
  naturalHeight = 1,
): CSSProperties {
  return {
    left: `${transform.x * 100}%`,
    top: `${transform.y * 100}%`,
    width: `${transform.scaleX * 100}%`,
    aspectRatio: `${naturalWidth * transform.scaleX} / ${naturalHeight * transform.scaleY}`,
    zIndex: 200 + transform.z,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
  }
}

function targetName(targetId: WardrobeTargetId) {
  return getWardrobeTargetVisual(targetId).name
}

function AssetCategoryFilter({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string
  items: readonly { category: WardrobeAssetCategory }[]
  selected: WardrobeAssetCategory
  onSelect: (category: WardrobeAssetCategory) => void
}) {
  const categories = CATEGORY_ORDER.filter((category) =>
    items.some((item) => item.category === category),
  )

  return (
    <div className="miracle-asset-category-filter" role="group" aria-label={label}>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={selected === category}
          className={selected === category ? 'is-selected' : ''}
          onClick={() => onSelect(category)}
        >
          {`${CATEGORY_LABELS[category]}【${items.filter((item) => item.category === category).length}】`}
        </button>
      ))}
    </div>
  )
}

function LayerActions({
  onForward,
  onBackward,
  onReset,
  onRemove,
  removeLabel,
}: {
  onForward: () => void
  onBackward: () => void
  onReset: () => void
  onRemove: () => void
  removeLabel: string
}) {
  const actions = [
    { icon: '🔼', label: '向前一层', onClick: onForward },
    { icon: '🔽', label: '向后一层', onClick: onBackward },
    { icon: '🔄️', label: '恢复默认比例/变换', onClick: onReset },
    { icon: '❌', label: removeLabel, onClick: onRemove },
  ] as const

  return (
    <div className="miracle-layer-actions">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          aria-label={action.label}
          title={action.label}
          onClick={action.onClick}
        >
          <span aria-hidden="true">{action.icon}</span>
        </button>
      ))}
    </div>
  )
}

function LookCanvas({
  targetId,
  elements,
  selectedPlacementId,
  canvasRef,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTransformPointerDown,
  onTransformPointerMove,
  onTransformPointerUp,
  onStretchPointerDown,
  onStretchPointerMove,
  onStretchPointerUp,
  onKeyboardTransform,
}: {
  targetId: WardrobeTargetId
  elements: readonly WardrobeElement[]
  selectedPlacementId: string | null
  canvasRef: React.RefObject<HTMLDivElement | null>
  onSelect: (placementId: string) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, element: WardrobeElement) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTransformPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: WardrobeElement,
  ) => void
  onTransformPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onTransformPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onStretchPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: WardrobeElement,
  ) => void
  onStretchPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onStretchPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onKeyboardTransform: (
    event: KeyboardEvent<HTMLButtonElement>,
    element: WardrobeElement,
    mode: KeyboardTransformMode,
  ) => void
}) {
  const target = getWardrobeTargetVisual(targetId)
  const sorted = [...elements].sort(
    (left, right) => left.z - right.z || left.placementId.localeCompare(right.placementId),
  )
  const behind = sorted.filter((element) => element.z < 0)
  const inFront = sorted.filter((element) => element.z >= 0)

  function layers(values: readonly WardrobeElement[]) {
    return values.map((element) => {
      const visual = getWardrobeAssetVisual(element.assetId)
      return (
        <div
          className={`miracle-look-layer ${selectedPlacementId === element.placementId ? 'is-selected' : ''}`}
          key={element.placementId}
          style={editableLayerStyle(element, visual.width, visual.height)}
        >
          <button
            className="miracle-editable-center"
            type="button"
            aria-label={`${visual.name}${selectedPlacementId === element.placementId ? '，已选中' : ''}`}
            onClick={() => onSelect(element.placementId)}
            onPointerDown={(event) => onPointerDown(event, element)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={(event) => onKeyboardTransform(event, element, 'move')}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
            aria-description="方向键移动"
          >
            <img
              src={visual.url}
              alt=""
              width={visual.width}
              height={visual.height}
              draggable={false}
            />
          </button>
          {selectedPlacementId === element.placementId && (
            <>
              <button
                className="miracle-transform-handle miracle-transform-handle--stretch"
                type="button"
                aria-label={`${visual.name}：分别调整宽度和高度`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                aria-description="方向键左右调宽，上下调高"
                onClick={() => onSelect(element.placementId)}
                onPointerDown={(event) => onStretchPointerDown(event, element)}
                onPointerMove={onStretchPointerMove}
                onPointerUp={onStretchPointerUp}
                onPointerCancel={onStretchPointerUp}
                onKeyDown={(event) => onKeyboardTransform(event, element, 'stretch')}
              />
              <button
                className="miracle-transform-handle miracle-transform-handle--uniform"
                type="button"
                aria-label={`${visual.name}：等比缩放并旋转`}
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                aria-description="方向键上下缩放，左右旋转"
                onClick={() => onSelect(element.placementId)}
                onPointerDown={(event) => onTransformPointerDown(event, element)}
                onPointerMove={onTransformPointerMove}
                onPointerUp={onTransformPointerUp}
                onPointerCancel={onTransformPointerUp}
                onKeyDown={(event) => onKeyboardTransform(event, element, 'uniform')}
              />
            </>
          )}
        </div>
      )
    })
  }

  return (
    <div className="miracle-look-canvas" role="group" aria-label={`${target.name}搭配画布`}>
      <div
        ref={canvasRef}
        className="miracle-look-composition"
        data-testid="miracle-look-canvas"
        style={{ '--miracle-look-composition-scale': LOOK_COMPOSITION_SCALE } as CSSProperties}
      >
        {layers(behind)}
        <img
          className="miracle-look-character"
          src={target.url}
          alt={`${target.name}海星体模板`}
          width={target.width}
          height={target.height}
          draggable={false}
        />
        {layers(inFront)}
      </div>
    </div>
  )
}

export function MiracleWardrobePage({
  game,
  catalog,
  onClose,
  onAction,
}: MiracleWardrobePageProps) {
  const [tab, setTab] = useState<WardrobeTab>('dressing')
  const [message, setMessage] = useState('')
  const availableTargets = useMemo(() => getAvailableWardrobeTargets(game), [game])
  const [lookTargetId, setLookTargetId] = useState<WardrobeTargetId>('bingo')
  const [selectedLookId, setSelectedLookId] = useState<string | null>(
    () => getSavedWardrobeLooks(game, 'bingo')[0]?.lookId ?? null,
  )
  const [lookName, setLookName] = useState(
    () => getSavedWardrobeLooks(game, 'bingo')[0]?.name ?? '新造型',
  )
  const [lookDraft, setLookDraft] = useState<WardrobeElement[]>(() => {
    const initialLook = getSavedWardrobeLooks(game, 'bingo')[0]
    return cloneElements(initialLook?.elements ?? [])
  })
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null)
  const [lookAssetCategory, setLookAssetCategory] = useState<WardrobeAssetCategory>('outfit')
  const [lookDownloadState, setLookDownloadState] = useState<'idle' | 'working' | 'error'>('idle')
  const [selectedPostcardId, setSelectedPostcardId] = useState<string | null>(null)
  const [localPhotoBackground, setLocalPhotoBackground] = useState<LocalPhotoBackground | null>(
    null,
  )
  const [localPhotoLoadState, setLocalPhotoLoadState] = useState<'idle' | 'working'>('idle')
  const [localPhotoDownloadState, setLocalPhotoDownloadState] = useState<'idle' | 'working'>('idle')
  const [photoParticipants, setPhotoParticipants] = useState<PhotoParticipantDraft[]>([
    {
      targetId: 'bingo',
      lookId: getSavedWardrobeLooks(game, 'bingo')[0]?.lookId ?? null,
      ...DEFAULT_BINGO_PHOTO_TRANSFORM,
      defaultTransform: { ...DEFAULT_BINGO_PHOTO_TRANSFORM },
      z: 1,
    },
  ])
  const [selectedPhotoTargetId, setSelectedPhotoTargetId] = useState<WardrobeTargetId | null>(
    'bingo',
  )
  const [photoDecorations, setPhotoDecorations] = useState<PhotoDecorationDraft[]>([])
  const [selectedPhotoDecorationId, setSelectedPhotoDecorationId] = useState<string | null>(null)
  const [photoAssetCategory, setPhotoAssetCategory] = useState<WardrobeAssetCategory>('outfit')
  const closeRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lookCanvasRef = useRef<HTMLDivElement>(null)
  const photoCanvasRef = useRef<HTMLDivElement>(null)
  const lookDragRef = useRef<DragState | null>(null)
  const photoDragRef = useRef<PhotoDragState | null>(null)
  const lookTransformDragRef = useRef<TransformDragState | null>(null)
  const lookStretchDragRef = useRef<StretchDragState | null>(null)
  const photoTransformDragRef = useRef<PhotoTransformDragState | null>(null)
  const photoStretchDragRef = useRef<PhotoStretchDragState | null>(null)
  const localPhotoInputRef = useRef<HTMLInputElement>(null)
  const localPhotoRequestRef = useRef(0)
  const liveLocalPhotoUrlsRef = useRef(new Set<string>())
  const mountedRef = useRef(true)
  const placementSequenceRef = useRef(0)
  const photoDecorationSequenceRef = useRef(0)
  const dialogRef = useModalFocus<HTMLElement>(true, onClose, { initialFocus: closeRef })
  useEffect(() => {
    const liveUrls = liveLocalPhotoUrlsRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      localPhotoRequestRef.current += 1
      for (const url of liveUrls) URL.revokeObjectURL(url)
      liveUrls.clear()
    }
  }, [])
  const ownedItems = useMemo(() => getOwnedWardrobeItems(game), [game])
  const ownedCategories = CATEGORY_ORDER.filter((category) =>
    ownedItems.some((item) => item.category === category),
  )
  const effectiveLookAssetCategory = ownedCategories.includes(lookAssetCategory)
    ? lookAssetCategory
    : (ownedCategories[0] ?? 'outfit')
  const effectivePhotoAssetCategory = ownedCategories.includes(photoAssetCategory)
    ? photoAssetCategory
    : (ownedCategories[0] ?? 'outfit')
  const visibleLookAssets = ownedItems.filter(
    (item) => item.category === effectiveLookAssetCategory,
  )
  const visiblePhotoAssets = ownedItems.filter(
    (item) => item.category === effectivePhotoAssetCategory,
  )
  const savedLooks = useMemo(() => getSavedWardrobeLooks(game, lookTargetId), [game, lookTargetId])
  const postcards = useMemo(() => buildUnlockedPostcardBackgrounds(game, catalog), [catalog, game])
  const effectivePostcardId = selectedPostcardId ?? postcards[0]?.id ?? null
  const selectedElement =
    lookDraft.find((element) => element.placementId === selectedPlacementId) ?? null
  const selectedParticipant =
    photoParticipants.find((participant) => participant.targetId === selectedPhotoTargetId) ?? null
  const selectedDecoration =
    photoDecorations.find((decoration) => decoration.placementId === selectedPhotoDecorationId) ??
    null
  const selectedPostcard = postcards.find((postcard) => postcard.id === effectivePostcardId) ?? null
  const selectedPostcardImage = effectivePostcardId
    ? [...(catalog.byId[effectivePostcardId]?.images ?? [])].sort(
        (left, right) => right.width - left.width,
      )[0]
    : undefined
  const activePhotoBackground = localPhotoBackground
    ? {
        url: localPhotoBackground.previewUrl,
        width: localPhotoBackground.width,
        height: localPhotoBackground.height,
        alt: localPhotoBackground.name,
      }
    : selectedPostcard?.fullUrl
      ? {
          url: selectedPostcard.fullUrl,
          width: selectedPostcardImage?.width ?? 4,
          height: selectedPostcardImage?.height ?? 3,
          alt: selectedPostcard.alt,
        }
      : null
  const selectedPhotoAspectRatio = activePhotoBackground
    ? activePhotoBackground.width / activePhotoBackground.height
    : 4 / 3
  const photoLayers = distinguishDuplicateNames(
    [
      ...photoParticipants.map((participant) => ({
        kind: 'participant' as const,
        id: participant.targetId,
        name: targetName(participant.targetId),
        z: participant.z,
      })),
      ...photoDecorations.map((decoration) => ({
        kind: 'decoration' as const,
        id: decoration.placementId,
        name: getWardrobeAssetVisual(decoration.assetId).name,
        z: decoration.z,
      })),
    ].sort((left, right) => right.z - left.z || left.id.localeCompare(right.id)),
  )

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (index + direction + TABS.length) % TABS.length
    setTab(TABS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  function selectLookTarget(targetId: WardrobeTargetId) {
    const nextLook = getSavedWardrobeLooks(game, targetId)[0] ?? null
    setLookTargetId(targetId)
    setSelectedLookId(nextLook?.lookId ?? null)
    setLookName(nextLook?.name ?? '新造型')
    setLookDraft(cloneElements(nextLook?.elements ?? []))
    setSelectedPlacementId(null)
    setMessage(`正在为${targetName(targetId)}搭配`)
  }

  function loadSavedLook(look: SavedWardrobeLook) {
    setSelectedLookId(look.lookId)
    setLookName(look.name)
    setLookDraft(cloneElements(look.elements))
    setSelectedPlacementId(null)
    setMessage(`已载入${look.name}`)
  }

  function addAsset(assetId: WardrobeAssetId) {
    if (lookDraft.length >= MAX_WARDROBE_LOOK_ELEMENTS) {
      setMessage(`一个形象最多放置 ${MAX_WARDROBE_LOOK_ELEMENTS} 个元素`)
      return
    }
    const visual = getWardrobeAssetVisual(assetId)
    let placementId: string
    do {
      placementSequenceRef.current += 1
      placementId = `layer-${assetId}-${placementSequenceRef.current.toString(36)}`
    } while (lookDraft.some((element) => element.placementId === placementId))
    const nextZ = Math.max(0, ...lookDraft.map((element) => element.z)) + 1
    setLookDraft((current) => [
      ...current,
      { ...visual.defaultTransform, z: nextZ, placementId, assetId },
    ])
    setSelectedPlacementId(placementId)
    setMessage(`已把${visual.name}放到画布中`)
  }

  function moveSelectedLayer(direction: -1 | 1) {
    if (!selectedPlacementId) return
    setLookDraft((current) => {
      const ordered = normalizeLayerOrder(current)
      const index = ordered.findIndex((element) => element.placementId === selectedPlacementId)
      const targetIndex = clamp(index + direction, 0, ordered.length - 1)
      if (index < 0 || index === targetIndex) return ordered
      ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]]
      return ordered.map((element, layerIndex) => ({ ...element, z: layerIndex + 1 }))
    })
  }

  function resetSelectedElementTransform() {
    if (!selectedPlacementId) return
    setLookDraft((current) =>
      current.map((element) => {
        if (element.placementId !== selectedPlacementId) return element
        const { x, y, scaleX, scaleY, rotation } = getWardrobeAssetVisual(
          element.assetId,
        ).defaultTransform
        return { ...element, x, y, scaleX, scaleY, rotation, z: element.z }
      }),
    )
    setMessage('已恢复这个元素的默认位置、大小和角度')
  }

  function startLookDrag(event: ReactPointerEvent<HTMLButtonElement>, element: WardrobeElement) {
    const canvas = lookCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    lookDragRef.current = {
      pointerId: event.pointerId,
      id: element.placementId,
      rect,
      offsetX: event.clientX - rect.left - element.x * rect.width,
      offsetY: event.clientY - rect.top - element.y * rect.height,
    }
    setSelectedPlacementId(element.placementId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveLookDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = lookDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = clamp((event.clientX - drag.rect.left - drag.offsetX) / drag.rect.width, 0, 1)
    const y = clamp((event.clientY - drag.rect.top - drag.offsetY) / drag.rect.height, 0, 1)
    setLookDraft((current) =>
      current.map((element) => (element.placementId === drag.id ? { ...element, x, y } : element)),
    )
  }

  function endLookDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (lookDragRef.current?.pointerId !== event.pointerId) return
    lookDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startLookTransform(
    event: ReactPointerEvent<HTMLButtonElement>,
    element: WardrobeElement,
  ) {
    const canvas = lookCanvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + element.x * rect.width
    const centerY = rect.top + element.y * rect.height
    lookTransformDragRef.current = {
      pointerId: event.pointerId,
      id: element.placementId,
      centerX,
      centerY,
      initialDistance: Math.max(1, pointerDistance(centerX, centerY, event.clientX, event.clientY)),
      initialAngle: pointerAngle(centerX, centerY, event.clientX, event.clientY),
      initialScaleX: element.scaleX,
      initialScaleY: element.scaleY,
      initialRotation: element.rotation,
    }
    setSelectedPlacementId(element.placementId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveLookTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = lookTransformDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const distance = pointerDistance(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const angle = pointerAngle(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const scaleRatio = distance / drag.initialDistance
    const { scaleX, scaleY } = uniformScaleWithinBounds(
      drag.initialScaleX,
      drag.initialScaleY,
      scaleRatio,
    )
    const rotation = normalizeRotation(
      drag.initialRotation + ((angle - drag.initialAngle) * 180) / Math.PI,
    )
    setLookDraft((current) =>
      current.map((element) =>
        element.placementId === drag.id ? { ...element, scaleX, scaleY, rotation } : element,
      ),
    )
  }

  function endLookTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    if (lookTransformDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    lookTransformDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startLookStretch(event: ReactPointerEvent<HTMLButtonElement>, element: WardrobeElement) {
    const canvas = lookCanvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + element.x * rect.width
    const centerY = rect.top + element.y * rect.height
    const initial = localPointerVector(
      centerX,
      centerY,
      event.clientX,
      event.clientY,
      element.rotation,
    )
    lookStretchDragRef.current = {
      pointerId: event.pointerId,
      id: element.placementId,
      centerX,
      centerY,
      initialLocalX: initial.x,
      initialLocalY: initial.y,
      initialScaleX: element.scaleX,
      initialScaleY: element.scaleY,
      rotation: element.rotation,
    }
    setSelectedPlacementId(element.placementId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveLookStretch(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = lookStretchDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const current = localPointerVector(
      drag.centerX,
      drag.centerY,
      event.clientX,
      event.clientY,
      drag.rotation,
    )
    const scaleX = clamp(
      drag.initialScaleX * (Math.abs(current.x) / Math.max(1, Math.abs(drag.initialLocalX))),
      0.05,
      5,
    )
    const scaleY = clamp(
      drag.initialScaleY * (Math.abs(current.y) / Math.max(1, Math.abs(drag.initialLocalY))),
      0.05,
      5,
    )
    setLookDraft((elements) =>
      elements.map((element) =>
        element.placementId === drag.id ? { ...element, scaleX, scaleY } : element,
      ),
    )
  }

  function endLookStretch(event: ReactPointerEvent<HTMLButtonElement>) {
    if (lookStretchDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    lookStretchDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function keyboardLookTransform(
    event: KeyboardEvent<HTMLButtonElement>,
    element: WardrobeElement,
    mode: KeyboardTransformMode,
  ) {
    const update = keyboardTransformUpdate(event, element, mode)
    if (!update) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedPlacementId(element.placementId)
    setLookDraft((current) =>
      current.map((candidate) =>
        candidate.placementId === element.placementId ? { ...candidate, ...update } : candidate,
      ),
    )
  }

  async function downloadCurrentLook() {
    setLookDownloadState('working')
    try {
      await downloadWardrobeLook(lookTargetId, lookDraft)
      setLookDownloadState('idle')
      setMessage(`${targetName(lookTargetId)}的透明 PNG 已经生成`)
    } catch {
      setLookDownloadState('error')
      setMessage('透明 PNG 生成失败，请稍后再试')
    }
  }

  function normalizedLookDraft() {
    const name = lookName.trim()
    if (name.length < 1 || name.length > MAX_WARDROBE_LOOK_NAME_LENGTH) {
      setMessage(`造型名称需要填写 1–${MAX_WARDROBE_LOOK_NAME_LENGTH} 个字符`)
      return null
    }
    const normalized = normalizeLayerOrder(lookDraft)
    setLookDraft(normalized)
    return { name, elements: normalized }
  }

  function createLook() {
    if (savedLooks.length >= MAX_WARDROBE_LOOKS_PER_TARGET) {
      setMessage(`每位角色最多保存 ${MAX_WARDROBE_LOOKS_PER_TARGET} 套造型`)
      return
    }
    const draft = normalizedLookDraft()
    if (!draft) return
    onAction({
      type: 'wardrobe/look-create',
      targetId: lookTargetId,
      ...draft,
      now: Date.now(),
    })
    setMessage(`${targetName(lookTargetId)}的新造型已经保存`)
  }

  function updateLook() {
    if (!selectedLookId) {
      setMessage('先载入一套已保存的造型')
      return
    }
    const draft = normalizedLookDraft()
    if (!draft) return
    onAction({
      type: 'wardrobe/look-update',
      lookId: selectedLookId,
      ...draft,
      now: Date.now(),
    })
    setMessage(`${draft.name}已经更新`)
  }

  function deleteLook() {
    if (!selectedLookId) return
    onAction({ type: 'wardrobe/look-delete', lookId: selectedLookId })
    const nextLook = savedLooks.find((look) => look.lookId !== selectedLookId) ?? null
    setPhotoParticipants((current) =>
      current.map((participant) =>
        participant.lookId === selectedLookId
          ? {
              ...participant,
              lookId:
                getSavedWardrobeLooks(game, participant.targetId).find(
                  (look) => look.lookId !== selectedLookId,
                )?.lookId ?? null,
            }
          : participant,
      ),
    )
    setSelectedLookId(nextLook?.lookId ?? null)
    setLookName(nextLook?.name ?? '新造型')
    setLookDraft(cloneElements(nextLook?.elements ?? []))
    setSelectedPlacementId(null)
    setMessage('这套造型已经删除，旧合拍仍会保留原来的样子')
  }

  function updateParticipant(targetId: WardrobeTargetId, update: Partial<PhotoParticipantDraft>) {
    setPhotoParticipants((current) =>
      current.map((participant) =>
        participant.targetId === targetId ? { ...participant, ...update } : participant,
      ),
    )
  }

  function updateDecoration(placementId: string, update: Partial<PhotoDecorationDraft>) {
    setPhotoDecorations((current) =>
      current.map((decoration) =>
        decoration.placementId === placementId ? { ...decoration, ...update } : decoration,
      ),
    )
  }

  function updatePhotoLayer(kind: PhotoLayerKind, id: string, update: Partial<WardrobeTransform>) {
    if (kind === 'participant') updateParticipant(id as WardrobeTargetId, update)
    else updateDecoration(id, update)
  }

  function selectPhotoLayer(kind: PhotoLayerKind, id: string) {
    if (kind === 'participant') {
      setSelectedPhotoTargetId(id as WardrobeTargetId)
      setSelectedPhotoDecorationId(null)
    } else {
      setSelectedPhotoDecorationId(id)
      setSelectedPhotoTargetId(null)
    }
  }

  function nextPhotoLayerZ() {
    return (
      Math.max(
        0,
        ...photoParticipants.map((participant) => participant.z),
        ...photoDecorations.map((decoration) => decoration.z),
      ) + 1
    )
  }

  function togglePhotoTarget(targetId: WardrobeTargetId) {
    if (photoParticipants.some((participant) => participant.targetId === targetId)) {
      const remaining = photoParticipants.filter((participant) => participant.targetId !== targetId)
      setPhotoParticipants(remaining)
      if (selectedPhotoTargetId === targetId) {
        setSelectedPhotoTargetId(remaining[0]?.targetId ?? null)
        if (remaining.length === 0 && photoDecorations.length > 0) {
          setSelectedPhotoDecorationId(photoDecorations[0].placementId)
        }
      }
      return
    }

    const index = photoParticipants.length
    const defaultTransform = {
      x: clamp(0.34 + index * 0.16, 0.18, 0.82),
      y: 0.57,
      scaleX: 0.3,
      scaleY: 0.3,
      rotation: 0,
    }
    setPhotoParticipants((current) => [
      ...current,
      {
        targetId,
        lookId: getSavedWardrobeLooks(game, targetId)[0]?.lookId ?? null,
        ...defaultTransform,
        defaultTransform: { ...defaultTransform },
        z: nextPhotoLayerZ(),
      },
    ])
    selectPhotoLayer('participant', targetId)
  }

  function addPhotoDecoration(assetId: WardrobeAssetId) {
    if (photoDecorations.length >= MAX_WARDROBE_PHOTO_DECORATIONS) {
      setMessage(`一张合拍最多放置 ${MAX_WARDROBE_PHOTO_DECORATIONS} 个独立元素`)
      return
    }
    const visual = getWardrobeAssetVisual(assetId)
    let placementId: string
    do {
      photoDecorationSequenceRef.current += 1
      placementId = `photo-${assetId}-${photoDecorationSequenceRef.current.toString(36)}`
    } while (photoDecorations.some((decoration) => decoration.placementId === placementId))
    const defaultScaleRatio =
      DEFAULT_PHOTO_DECORATION_SCALE /
      Math.max(visual.defaultTransform.scaleX, visual.defaultTransform.scaleY)
    const defaultTransform = {
      x: 0.5,
      y: 0.5,
      scaleX: visual.defaultTransform.scaleX * defaultScaleRatio,
      scaleY: visual.defaultTransform.scaleY * defaultScaleRatio,
      rotation: visual.defaultTransform.rotation,
    }
    const decoration: PhotoDecorationDraft = {
      placementId,
      assetId,
      ...defaultTransform,
      defaultTransform: { ...defaultTransform },
      z: nextPhotoLayerZ(),
    }
    setPhotoDecorations((current) => [...current, decoration])
    selectPhotoLayer('decoration', placementId)
    setMessage(`已把${visual.name}作为独立元素放进合拍`)
  }

  function startPhotoDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: PhotoLayerKind,
    id: string,
    transform: WardrobeTransform,
  ) {
    const canvas = photoCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    photoDragRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      rect,
      offsetX: event.clientX - rect.left - transform.x * rect.width,
      offsetY: event.clientY - rect.top - transform.y * rect.height,
    }
    selectPhotoLayer(kind, id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePhotoDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = photoDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = clamp((event.clientX - drag.rect.left - drag.offsetX) / drag.rect.width, 0, 1)
    const y = clamp((event.clientY - drag.rect.top - drag.offsetY) / drag.rect.height, 0, 1)
    updatePhotoLayer(drag.kind, drag.id, { x, y })
  }

  function endPhotoDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (photoDragRef.current?.pointerId !== event.pointerId) return
    photoDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startPhotoTransform(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: PhotoLayerKind,
    id: string,
    transform: WardrobeTransform,
  ) {
    const canvas = photoCanvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + transform.x * rect.width
    const centerY = rect.top + transform.y * rect.height
    photoTransformDragRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      centerX,
      centerY,
      initialDistance: Math.max(1, pointerDistance(centerX, centerY, event.clientX, event.clientY)),
      initialAngle: pointerAngle(centerX, centerY, event.clientX, event.clientY),
      initialScaleX: transform.scaleX,
      initialScaleY: transform.scaleY,
      initialRotation: transform.rotation,
    }
    selectPhotoLayer(kind, id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePhotoTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = photoTransformDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const distance = pointerDistance(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const angle = pointerAngle(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const scaleRatio = distance / drag.initialDistance
    const scale = uniformScaleWithinBounds(drag.initialScaleX, drag.initialScaleY, scaleRatio)
    updatePhotoLayer(drag.kind, drag.id, {
      ...scale,
      rotation: normalizeRotation(
        drag.initialRotation + ((angle - drag.initialAngle) * 180) / Math.PI,
      ),
    })
  }

  function endPhotoTransform(event: ReactPointerEvent<HTMLButtonElement>) {
    if (photoTransformDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    photoTransformDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startPhotoStretch(
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: PhotoLayerKind,
    id: string,
    transform: WardrobeTransform,
  ) {
    const canvas = photoCanvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + transform.x * rect.width
    const centerY = rect.top + transform.y * rect.height
    const initial = localPointerVector(
      centerX,
      centerY,
      event.clientX,
      event.clientY,
      transform.rotation,
    )
    photoStretchDragRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      centerX,
      centerY,
      initialLocalX: initial.x,
      initialLocalY: initial.y,
      initialScaleX: transform.scaleX,
      initialScaleY: transform.scaleY,
      rotation: transform.rotation,
    }
    selectPhotoLayer(kind, id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePhotoStretch(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = photoStretchDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const current = localPointerVector(
      drag.centerX,
      drag.centerY,
      event.clientX,
      event.clientY,
      drag.rotation,
    )
    updatePhotoLayer(drag.kind, drag.id, {
      scaleX: clamp(
        drag.initialScaleX * (Math.abs(current.x) / Math.max(1, Math.abs(drag.initialLocalX))),
        0.05,
        5,
      ),
      scaleY: clamp(
        drag.initialScaleY * (Math.abs(current.y) / Math.max(1, Math.abs(drag.initialLocalY))),
        0.05,
        5,
      ),
    })
  }

  function endPhotoStretch(event: ReactPointerEvent<HTMLButtonElement>) {
    if (photoStretchDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    photoStretchDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function keyboardPhotoTransform(
    event: KeyboardEvent<HTMLButtonElement>,
    kind: PhotoLayerKind,
    id: string,
    transform: WardrobeTransform,
    mode: KeyboardTransformMode,
  ) {
    const update = keyboardTransformUpdate(event, transform, mode)
    if (!update) return
    event.preventDefault()
    event.stopPropagation()
    selectPhotoLayer(kind, id)
    updatePhotoLayer(kind, id, update)
  }

  function moveSelectedPhotoLayer(direction: -1 | 1) {
    const selectedKey = selectedPhotoDecorationId
      ? `decoration:${selectedPhotoDecorationId}`
      : selectedPhotoTargetId
        ? `participant:${selectedPhotoTargetId}`
        : null
    if (!selectedKey) return
    const ordered = [
      ...photoParticipants.map((value) => ({
        key: `participant:${value.targetId}`,
        z: value.z,
      })),
      ...photoDecorations.map((value) => ({
        key: `decoration:${value.placementId}`,
        z: value.z,
      })),
    ].sort((left, right) => left.z - right.z || left.key.localeCompare(right.key))
    const index = ordered.findIndex((layer) => layer.key === selectedKey)
    const targetIndex = clamp(index + direction, 0, ordered.length - 1)
    if (index < 0 || index === targetIndex) return
    ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]]
    const zByKey = new Map(ordered.map((layer, layerIndex) => [layer.key, layerIndex + 1]))
    setPhotoParticipants((current) =>
      current.map((participant) => ({
        ...participant,
        z: zByKey.get(`participant:${participant.targetId}`) ?? participant.z,
      })),
    )
    setPhotoDecorations((current) =>
      current.map((decoration) => ({
        ...decoration,
        z: zByKey.get(`decoration:${decoration.placementId}`) ?? decoration.z,
      })),
    )
  }

  function resetSelectedParticipantTransform() {
    if (!selectedPhotoTargetId) return
    setPhotoParticipants((current) =>
      current.map((participant) =>
        participant.targetId === selectedPhotoTargetId
          ? {
              ...participant,
              ...participant.defaultTransform,
              z: participant.z,
            }
          : participant,
      ),
    )
    setMessage(`已恢复${targetName(selectedPhotoTargetId)}的默认位置、大小和角度`)
  }

  function resetSelectedDecorationTransform() {
    if (!selectedPhotoDecorationId) return
    const selected = photoDecorations.find(
      (decoration) => decoration.placementId === selectedPhotoDecorationId,
    )
    if (!selected) return
    updateDecoration(selectedPhotoDecorationId, {
      ...selected.defaultTransform,
      z: selected.z,
    })
    setMessage(`已恢复${getWardrobeAssetVisual(selected.assetId).name}的默认位置、大小和角度`)
  }

  function createTrackedLocalPhotoUrl(file: File) {
    const url = URL.createObjectURL(file)
    liveLocalPhotoUrlsRef.current.add(url)
    return url
  }

  function releaseLocalPhotoUrl(url: string) {
    if (!liveLocalPhotoUrlsRef.current.delete(url)) return
    URL.revokeObjectURL(url)
  }

  function clearLocalPhotoBackground() {
    localPhotoRequestRef.current += 1
    if (localPhotoBackground) releaseLocalPhotoUrl(localPhotoBackground.previewUrl)
    setLocalPhotoBackground(null)
    setLocalPhotoLoadState('idle')
    if (localPhotoInputRef.current) localPhotoInputRef.current.value = ''
  }

  async function handleLocalPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!LOCAL_PHOTO_TYPES.has(file.type)) {
      setMessage('请选择 PNG、JPG、WebP 或 AVIF 图片')
      return
    }

    const requestId = localPhotoRequestRef.current + 1
    localPhotoRequestRef.current = requestId
    setLocalPhotoLoadState('working')
    let previewUrl = ''
    try {
      previewUrl = createTrackedLocalPhotoUrl(file)
      const { width, height } = await readPhotoBackgroundDimensions(previewUrl)
      if (localPhotoRequestRef.current !== requestId || !mountedRef.current) {
        releaseLocalPhotoUrl(previewUrl)
        return
      }
      if (localPhotoBackground) releaseLocalPhotoUrl(localPhotoBackground.previewUrl)
      setLocalPhotoBackground({ file, previewUrl, width, height, name: file.name })
      setLocalPhotoLoadState('idle')
      setMessage('本地图片已经放到合拍画布，只会保留在当前页面')
    } catch {
      if (previewUrl) releaseLocalPhotoUrl(previewUrl)
      if (localPhotoRequestRef.current === requestId && mountedRef.current) {
        setLocalPhotoLoadState('idle')
        setMessage('这张图片暂时无法读取，请换一张常见格式的图片')
      }
    }
  }

  const draftPhoto: WardrobePhoto = {
    photoId: 'miracle-draft',
    postcardId: localPhotoBackground ? null : effectivePostcardId,
    createdAt: 0,
    participants: photoParticipants.map((participant) => ({
      targetId: participant.targetId,
      x: participant.x,
      y: participant.y,
      scaleX: participant.scaleX,
      scaleY: participant.scaleY,
      rotation: participant.rotation,
      z: participant.z,
      sourceLookId: participant.lookId,
      elements: cloneElements(
        participant.lookId ? (game.wardrobe.looks[participant.lookId]?.elements ?? []) : [],
      ),
    })),
    decorations: photoDecorations.map((decoration) => ({
      placementId: decoration.placementId,
      assetId: decoration.assetId,
      x: decoration.x,
      y: decoration.y,
      scaleX: decoration.scaleX,
      scaleY: decoration.scaleY,
      rotation: decoration.rotation,
      z: decoration.z,
    })),
  }

  function clearPhotoCanvas() {
    setPhotoParticipants([])
    setPhotoDecorations([])
    setSelectedPhotoTargetId(null)
    setSelectedPhotoDecorationId(null)
    setMessage('合拍画布已经清空')
  }

  function savePhoto() {
    if (localPhotoBackground) {
      setMessage('本地图片合拍不会保存到收藏墙，请直接下载 PNG')
      return
    }
    if (!effectivePostcardId) {
      setMessage('先选择一张已经收藏的明信片')
      return
    }
    if (photoParticipants.length === 0) {
      setMessage('请先选择出镜角色')
      return
    }
    if (Object.keys(game.wardrobe.photos).length >= MAX_WARDROBE_PHOTOS) {
      setMessage(`合拍相册已经装满 ${MAX_WARDROBE_PHOTOS} 张，请先删除一张再保存`)
      return
    }
    onAction({
      type: 'wardrobe/photo-create',
      postcardId: effectivePostcardId,
      participants: photoParticipants.map((participant) => ({
        targetId: participant.targetId,
        lookId: participant.lookId,
        x: participant.x,
        y: participant.y,
        scaleX: participant.scaleX,
        scaleY: participant.scaleY,
        rotation: participant.rotation,
        z: participant.z,
      })),
      decorations: photoDecorations.map((decoration) => ({
        placementId: decoration.placementId,
        assetId: decoration.assetId,
        x: decoration.x,
        y: decoration.y,
        scaleX: decoration.scaleX,
        scaleY: decoration.scaleY,
        rotation: decoration.rotation,
        z: decoration.z,
      })),
      now: Date.now(),
    })
    setMessage('合拍已经保存到收藏墙的合拍相册')
  }

  async function downloadLocalPhoto() {
    if (!localPhotoBackground || localPhotoDownloadState === 'working') return
    setLocalPhotoDownloadState('working')
    let exportUrl = ''
    try {
      exportUrl = createTrackedLocalPhotoUrl(localPhotoBackground.file)
      const now = Date.now()
      await downloadWardrobePhoto(
        {
          ...draftPhoto,
          photoId: `local-${now.toString(36)}`,
          postcardId: null,
          createdAt: now,
        },
        catalog,
        {
          backgroundOverride: {
            url: exportUrl,
            width: localPhotoBackground.width,
            height: localPhotoBackground.height,
          },
          fileName: '奇迹饼狗-本地合拍.png',
        },
      )
      if (mountedRef.current) setMessage('本地图片合拍 PNG 已经生成')
    } catch {
      if (mountedRef.current) setMessage('合拍 PNG 生成失败，请再试一次')
    } finally {
      if (exportUrl) releaseLocalPhotoUrl(exportUrl)
      if (mountedRef.current) setLocalPhotoDownloadState('idle')
    }
  }

  return (
    <section
      ref={dialogRef}
      className="miracle-wardrobe-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="miracle-wardrobe-title"
      tabIndex={-1}
    >
      <header className="miracle-wardrobe-header">
        <div>
          <span className="paper-tag">衣柜上线</span>
          <h2 id="miracle-wardrobe-title">奇迹饼狗</h2>
          <p>遇见饼狗是最美的奇迹</p>
        </div>
        <div className="miracle-wardrobe-header__actions">
          <span className="miracle-wardrobe-wallet">
            现有 <AppleAmount value={game.economy.apples} />
          </span>
          <button ref={closeRef} className="text-close-button" type="button" onClick={onClose}>
            关闭衣柜
          </button>
        </div>
      </header>

      <div className="miracle-wardrobe-tabs" role="tablist" aria-label="奇迹饼狗功能">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            id={`miracle-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`miracle-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? 'is-active' : ''}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="miracle-wardrobe-live" role="status" aria-live="polite">
        {message}
      </div>

      {tab === 'dressing' && (
        <section
          className="miracle-wardrobe-panel miracle-editor-layout"
          id="miracle-panel-dressing"
          role="tabpanel"
          aria-labelledby="miracle-tab-dressing"
        >
          <aside className="miracle-editor-library">
            <div className="miracle-target-picker" aria-label="选择搭配对象">
              {availableTargets.map((targetId) => (
                <button
                  type="button"
                  key={targetId}
                  aria-pressed={lookTargetId === targetId}
                  onClick={() => selectLookTarget(targetId)}
                >
                  {targetName(targetId)}
                </button>
              ))}
            </div>
            <section className="miracle-look-library" aria-labelledby="miracle-look-library-title">
              <h3 id="miracle-look-library-title">已保存造型</h3>
              {savedLooks.length > 0 ? (
                <div>
                  {savedLooks.map((look) => (
                    <button
                      type="button"
                      key={look.lookId}
                      className={selectedLookId === look.lookId ? 'is-selected' : ''}
                      aria-pressed={selectedLookId === look.lookId}
                      onClick={() => loadSavedLook(look)}
                    >
                      {look.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p>还没有保存过造型，可以从空白画布开始。</p>
              )}
            </section>
            <div className="miracle-look-name-row">
              <label className="miracle-look-name">
                造型名称
                <input
                  type="text"
                  maxLength={MAX_WARDROBE_LOOK_NAME_LENGTH}
                  value={lookName}
                  onChange={(event) => setLookName(event.currentTarget.value)}
                />
              </label>
              <button
                className="paper-button"
                type="button"
                disabled={lookDownloadState === 'working'}
                onClick={() => void downloadCurrentLook()}
              >
                {lookDownloadState === 'working' ? '正在生成…' : '下载透明 PNG'}
              </button>
            </div>
            <div className="miracle-editor-save-row">
              <button
                className="paper-button paper-button--primary"
                type="button"
                onClick={createLook}
              >
                保存为新造型
              </button>
              <button
                className="paper-button"
                type="button"
                disabled={!selectedLookId}
                onClick={updateLook}
              >
                更新当前造型
              </button>
              <button
                className="paper-button paper-button--danger"
                type="button"
                disabled={!selectedLookId}
                onClick={deleteLook}
              >
                删除当前造型
              </button>
              <button
                className="paper-button"
                type="button"
                onClick={() => {
                  setLookDraft([])
                  setSelectedLookId(null)
                  setLookName('新造型')
                  setSelectedPlacementId(null)
                  setMessage('画布已经清空，可以保存为一套新造型')
                }}
              >
                清空画布
              </button>
            </div>
          </aside>

          <div className="miracle-editor-stage">
            <LookCanvas
              targetId={lookTargetId}
              elements={lookDraft}
              selectedPlacementId={selectedPlacementId}
              canvasRef={lookCanvasRef}
              onSelect={setSelectedPlacementId}
              onPointerDown={startLookDrag}
              onPointerMove={moveLookDrag}
              onPointerUp={endLookDrag}
              onTransformPointerDown={startLookTransform}
              onTransformPointerMove={moveLookTransform}
              onTransformPointerUp={endLookTransform}
              onStretchPointerDown={startLookStretch}
              onStretchPointerMove={moveLookStretch}
              onStretchPointerUp={endLookStretch}
              onKeyboardTransform={keyboardLookTransform}
            />
          </div>

          <aside className="miracle-editor-tools">
            <section className="miracle-layer-list" aria-label="画布图层">
              <h3>画布图层</h3>
              {lookDraft.length > 0 ? (
                <div>
                  {[...lookDraft]
                    .sort((left, right) => right.z - left.z)
                    .map((element) => (
                      <button
                        type="button"
                        key={element.placementId}
                        className={selectedPlacementId === element.placementId ? 'is-selected' : ''}
                        onClick={() => setSelectedPlacementId(element.placementId)}
                      >
                        {getWardrobeAssetVisual(element.assetId).name}
                      </button>
                    ))}
                </div>
              ) : (
                <p>还没有放置元素。</p>
              )}
            </section>
            <section className="miracle-transform-controls" aria-label="选中元素调整">
              <h3>
                {selectedElement
                  ? getWardrobeAssetVisual(selectedElement.assetId).name
                  : '选择一个元素'}
              </h3>
              {selectedElement ? (
                <LayerActions
                  onForward={() => moveSelectedLayer(1)}
                  onBackward={() => moveSelectedLayer(-1)}
                  onReset={resetSelectedElementTransform}
                  removeLabel="移除元素"
                  onRemove={() => {
                    setLookDraft((current) =>
                      current.filter((element) => element.placementId !== selectedPlacementId),
                    )
                    setSelectedPlacementId(null)
                  }}
                />
              ) : (
                <p>点画布上的衣服或配饰，再拖动、缩放、旋转和调整遮挡关系。</p>
              )}
            </section>
            <section className="miracle-asset-section">
              <h3>放一件到画布上</h3>
              <AssetCategoryFilter
                label="搭配素材分类"
                items={ownedItems}
                selected={effectiveLookAssetCategory}
                onSelect={setLookAssetCategory}
              />
              <div className="miracle-asset-buttons">
                {visibleLookAssets.map((item) => (
                  <button type="button" key={item.id} onClick={() => addAsset(item.id)}>
                    <img src={getWardrobeAssetVisual(item.id).url} alt="" draggable={false} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>
      )}

      {tab === 'photo' && (
        <section
          className="miracle-wardrobe-panel miracle-photo-layout"
          id="miracle-panel-photo"
          role="tabpanel"
          aria-labelledby="miracle-tab-photo"
        >
          <>
            <aside className="miracle-photo-setup">
              <section className="miracle-photo-background-controls">
                {postcards.length > 0 ? (
                  <PostcardPicker
                    options={postcards}
                    selected={selectedPostcard?.ref ?? null}
                    onChange={(background) => {
                      if (background?.kind !== 'postcard') return
                      clearLocalPhotoBackground()
                      setSelectedPostcardId(background.id)
                      setMessage('已经改用收藏的明信片背景')
                    }}
                    variant="compact"
                    heading="明信片背景"
                    triggerLabel="选择合拍明信片"
                    dialogEyebrow="合拍背景"
                    dialogTitle="选择合拍的风景"
                    dialogDescription="从已经收藏的明信片中选一张，单击即可确定。"
                    groupLabel="合拍明信片背景"
                    includePlain={false}
                  />
                ) : (
                  <div className="miracle-photo-background-empty">
                    <h3>明信片背景</h3>
                    <p>还没有收藏明信片，也可以先用本地图片合拍。</p>
                  </div>
                )}
                <section className="miracle-local-photo" aria-label="本地图片背景">
                  <div>
                    <h3>本地图片背景</h3>
                    <p title={localPhotoBackground?.name}>
                      {localPhotoBackground?.name ?? '只在当前页面使用，不会写入存档。'}
                    </p>
                  </div>
                  <div className="miracle-local-photo__actions">
                    <label className="paper-button miracle-local-photo__upload">
                      <input
                        ref={localPhotoInputRef}
                        className="miracle-visually-hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif"
                        aria-label="上传本地图片"
                        onChange={handleLocalPhotoChange}
                      />
                      <span>
                        {localPhotoLoadState === 'working'
                          ? '正在读取…'
                          : localPhotoBackground
                            ? '更换本地图片'
                            : '上传本地图片'}
                      </span>
                    </label>
                    {localPhotoBackground && (
                      <button
                        className="paper-button"
                        type="button"
                        onClick={() => {
                          clearLocalPhotoBackground()
                          setMessage(
                            postcards.length > 0
                              ? '已经改回收藏的明信片背景'
                              : '本地图片背景已经移除',
                          )
                        }}
                      >
                        {postcards.length > 0 ? '改回明信片' : '移除本地图片'}
                      </button>
                    )}
                  </div>
                </section>
              </section>
              <section className="miracle-photo-participants">
                <h3>是谁出镜呢</h3>
                <div className="miracle-participant-picker">
                  {availableTargets.map((targetId) => {
                    const included = photoParticipants.some(
                      (participant) => participant.targetId === targetId,
                    )
                    return (
                      <button
                        type="button"
                        key={targetId}
                        aria-pressed={included}
                        className={included ? 'is-selected' : ''}
                        onClick={() => togglePhotoTarget(targetId)}
                      >
                        {targetName(targetId)}
                      </button>
                    )
                  })}
                </div>
                {photoParticipants.length > 0 && (
                  <div className="miracle-participant-looks">
                    {photoParticipants.map((participant) => {
                      const looks = getSavedWardrobeLooks(game, participant.targetId)
                      return (
                        <label key={participant.targetId}>
                          <span>{targetName(participant.targetId)}的造型</span>
                          <select
                            value={participant.lookId ?? ''}
                            onChange={(event) =>
                              updateParticipant(participant.targetId, {
                                lookId: event.currentTarget.value || null,
                              })
                            }
                          >
                            <option value="">基础形象</option>
                            {looks.map((look) => (
                              <option value={look.lookId} key={look.lookId}>
                                {look.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>
            </aside>

            <div className="miracle-photo-stage">
              <div className="miracle-photo-canvas-slot">
                <div
                  className="miracle-photo-canvas"
                  ref={photoCanvasRef}
                  style={
                    {
                      '--miracle-photo-aspect': selectedPhotoAspectRatio,
                      aspectRatio: selectedPhotoAspectRatio,
                    } as CSSProperties
                  }
                >
                  <PhotoCompositionPreview
                    photo={draftPhoto}
                    postcard={activePhotoBackground}
                    label="奇迹饼狗合拍预览"
                  />
                  <div className="miracle-photo-hit-layer" aria-label="合拍组件调整层">
                    {photoParticipants.map((participant) => {
                      const visual = getWardrobeTargetVisual(participant.targetId)
                      const selected = selectedPhotoTargetId === participant.targetId
                      const name = targetName(participant.targetId)
                      return (
                        <div
                          className={`miracle-photo-editable miracle-photo-editable--participant ${selected ? 'is-selected' : ''}`}
                          key={participant.targetId}
                          style={editableLayerStyle(participant, visual.width, visual.height)}
                        >
                          <button
                            className="miracle-editable-center"
                            type="button"
                            aria-label={`移动${name}`}
                            aria-description="方向键移动"
                            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                            onClick={() => selectPhotoLayer('participant', participant.targetId)}
                            onPointerDown={(event) =>
                              startPhotoDrag(
                                event,
                                'participant',
                                participant.targetId,
                                participant,
                              )
                            }
                            onPointerMove={movePhotoDrag}
                            onPointerUp={endPhotoDrag}
                            onPointerCancel={endPhotoDrag}
                            onKeyDown={(event) =>
                              keyboardPhotoTransform(
                                event,
                                'participant',
                                participant.targetId,
                                participant,
                                'move',
                              )
                            }
                          />
                          {selected && (
                            <>
                              <button
                                className="miracle-transform-handle miracle-transform-handle--stretch"
                                type="button"
                                aria-label={`${name}：分别调整宽度和高度`}
                                aria-description="方向键左右调宽，上下调高"
                                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                                onClick={() =>
                                  selectPhotoLayer('participant', participant.targetId)
                                }
                                onPointerDown={(event) =>
                                  startPhotoStretch(
                                    event,
                                    'participant',
                                    participant.targetId,
                                    participant,
                                  )
                                }
                                onPointerMove={movePhotoStretch}
                                onPointerUp={endPhotoStretch}
                                onPointerCancel={endPhotoStretch}
                                onKeyDown={(event) =>
                                  keyboardPhotoTransform(
                                    event,
                                    'participant',
                                    participant.targetId,
                                    participant,
                                    'stretch',
                                  )
                                }
                              />
                              <button
                                className="miracle-transform-handle miracle-transform-handle--uniform"
                                type="button"
                                aria-label={`${name}：等比缩放并旋转`}
                                aria-description="方向键上下缩放，左右旋转"
                                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                                onClick={() =>
                                  selectPhotoLayer('participant', participant.targetId)
                                }
                                onPointerDown={(event) =>
                                  startPhotoTransform(
                                    event,
                                    'participant',
                                    participant.targetId,
                                    participant,
                                  )
                                }
                                onPointerMove={movePhotoTransform}
                                onPointerUp={endPhotoTransform}
                                onPointerCancel={endPhotoTransform}
                                onKeyDown={(event) =>
                                  keyboardPhotoTransform(
                                    event,
                                    'participant',
                                    participant.targetId,
                                    participant,
                                    'uniform',
                                  )
                                }
                              />
                            </>
                          )}
                        </div>
                      )
                    })}
                    {photoDecorations.map((decoration) => {
                      const visual = getWardrobeAssetVisual(decoration.assetId)
                      const selected = selectedPhotoDecorationId === decoration.placementId
                      return (
                        <div
                          className={`miracle-photo-editable miracle-photo-editable--decoration ${selected ? 'is-selected' : ''}`}
                          key={decoration.placementId}
                          style={editableLayerStyle(decoration, visual.width, visual.height)}
                        >
                          <button
                            className="miracle-editable-center"
                            type="button"
                            aria-label={`移动独立元素${visual.name}`}
                            aria-description="方向键移动"
                            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                            onClick={() => selectPhotoLayer('decoration', decoration.placementId)}
                            onPointerDown={(event) =>
                              startPhotoDrag(
                                event,
                                'decoration',
                                decoration.placementId,
                                decoration,
                              )
                            }
                            onPointerMove={movePhotoDrag}
                            onPointerUp={endPhotoDrag}
                            onPointerCancel={endPhotoDrag}
                            onKeyDown={(event) =>
                              keyboardPhotoTransform(
                                event,
                                'decoration',
                                decoration.placementId,
                                decoration,
                                'move',
                              )
                            }
                          />
                          {selected && (
                            <>
                              <button
                                className="miracle-transform-handle miracle-transform-handle--stretch"
                                type="button"
                                aria-label={`${visual.name}：分别调整宽度和高度`}
                                aria-description="方向键左右调宽，上下调高"
                                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                                onClick={() =>
                                  selectPhotoLayer('decoration', decoration.placementId)
                                }
                                onPointerDown={(event) =>
                                  startPhotoStretch(
                                    event,
                                    'decoration',
                                    decoration.placementId,
                                    decoration,
                                  )
                                }
                                onPointerMove={movePhotoStretch}
                                onPointerUp={endPhotoStretch}
                                onPointerCancel={endPhotoStretch}
                                onKeyDown={(event) =>
                                  keyboardPhotoTransform(
                                    event,
                                    'decoration',
                                    decoration.placementId,
                                    decoration,
                                    'stretch',
                                  )
                                }
                              />
                              <button
                                className="miracle-transform-handle miracle-transform-handle--uniform"
                                type="button"
                                aria-label={`${visual.name}：等比缩放并旋转`}
                                aria-description="方向键上下缩放，左右旋转"
                                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
                                onClick={() =>
                                  selectPhotoLayer('decoration', decoration.placementId)
                                }
                                onPointerDown={(event) =>
                                  startPhotoTransform(
                                    event,
                                    'decoration',
                                    decoration.placementId,
                                    decoration,
                                  )
                                }
                                onPointerMove={movePhotoTransform}
                                onPointerUp={endPhotoTransform}
                                onPointerCancel={endPhotoTransform}
                                onKeyDown={(event) =>
                                  keyboardPhotoTransform(
                                    event,
                                    'decoration',
                                    decoration.placementId,
                                    decoration,
                                    'uniform',
                                  )
                                }
                              />
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="miracle-photo-output">
                <div className="miracle-photo-save-row">
                  {localPhotoBackground ? (
                    <button
                      className="paper-button paper-button--primary"
                      type="button"
                      disabled={localPhotoDownloadState === 'working'}
                      onClick={() => void downloadLocalPhoto()}
                    >
                      {localPhotoDownloadState === 'working' ? '正在生成…' : '下载当前合拍'}
                    </button>
                  ) : (
                    <button
                      className="paper-button paper-button--primary"
                      type="button"
                      onClick={savePhoto}
                    >
                      保存这张合拍
                    </button>
                  )}
                  <button
                    className="paper-button"
                    type="button"
                    disabled={photoParticipants.length === 0 && photoDecorations.length === 0}
                    onClick={clearPhotoCanvas}
                  >
                    清空画布
                  </button>
                </div>
                {localPhotoBackground && <p>本地图片合拍只能当场下载，不会保存到收藏墙或存档。</p>}
              </div>
            </div>

            <aside className="miracle-photo-tools">
              <section className="miracle-layer-list" aria-label="照片图层">
                <h3>照片图层</h3>
                {photoLayers.length > 0 ? (
                  <div>
                    {photoLayers.map((layer) => {
                      const selected =
                        layer.kind === 'participant'
                          ? selectedPhotoTargetId === layer.id
                          : selectedPhotoDecorationId === layer.id
                      return (
                        <button
                          type="button"
                          key={`${layer.kind}:${layer.id}`}
                          aria-label={`选择照片图层：${layer.displayName}`}
                          className={selected ? 'is-selected' : ''}
                          onClick={() => selectPhotoLayer(layer.kind, layer.id)}
                        >
                          {layer.displayName}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p>还没有放置组件。</p>
                )}
              </section>
              <section className="miracle-transform-controls">
                <h3>
                  {selectedDecoration
                    ? `调整${getWardrobeAssetVisual(selectedDecoration.assetId).name}`
                    : selectedParticipant
                      ? `调整${targetName(selectedParticipant.targetId)}`
                      : '选择一个组件'}
                </h3>
                {(selectedParticipant || selectedDecoration) && (
                  <LayerActions
                    onForward={() => moveSelectedPhotoLayer(1)}
                    onBackward={() => moveSelectedPhotoLayer(-1)}
                    onReset={
                      selectedDecoration
                        ? resetSelectedDecorationTransform
                        : resetSelectedParticipantTransform
                    }
                    removeLabel={selectedDecoration ? '删除独立元素' : '移除出镜'}
                    onRemove={() => {
                      if (selectedDecoration) {
                        setPhotoDecorations((current) =>
                          current.filter(
                            (decoration) =>
                              decoration.placementId !== selectedDecoration.placementId,
                          ),
                        )
                        setSelectedPhotoDecorationId(null)
                      } else if (selectedParticipant) {
                        togglePhotoTarget(selectedParticipant.targetId)
                      }
                    }}
                  />
                )}
              </section>
              <section className="miracle-asset-section">
                <h3>给照片加独立元素</h3>
                <AssetCategoryFilter
                  label="合拍独立元素分类"
                  items={ownedItems}
                  selected={effectivePhotoAssetCategory}
                  onSelect={setPhotoAssetCategory}
                />
                <div className="miracle-asset-buttons miracle-photo-asset-buttons">
                  {visiblePhotoAssets.map((item) => (
                    <button type="button" key={item.id} onClick={() => addPhotoDecoration(item.id)}>
                      <img src={getWardrobeAssetVisual(item.id).url} alt="" draggable={false} />
                      <span>{item.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </>
        </section>
      )}

      {tab === 'collection' && (
        <section
          className="miracle-wardrobe-panel miracle-collection"
          id="miracle-panel-collection"
          role="tabpanel"
          aria-labelledby="miracle-tab-collection"
        >
          <div className="miracle-panel-heading">
            <div>
              <h3>衣服收藏</h3>
              <p>{`已经收藏 ${ownedItems.length} 件，可以反复放进不同朋友的搭配里。`}</p>
            </div>
          </div>
          {CATEGORY_ORDER.map((category) => {
            const items = WARDROBE_CATALOG.filter(
              (item) => item.category === category && game.wardrobe.ownedAssetIds.includes(item.id),
            )
            if (items.length === 0) return null
            return (
              <section
                className={`miracle-collection-group miracle-collection-group--${category}`}
                key={category}
              >
                <h4>{`${CATEGORY_LABELS[category]}【${items.length}】`}</h4>
                <div>
                  {items.map((item) => {
                    const visual = getWardrobeAssetVisual(item.id)
                    return (
                      <article key={item.id}>
                        <span className="miracle-collection-thumb">
                          <img
                            src={visual.url}
                            alt={visual.name}
                            width={visual.width}
                            height={visual.height}
                            draggable={false}
                          />
                        </span>
                        <strong>{item.name}</strong>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </section>
      )}
    </section>
  )
}
