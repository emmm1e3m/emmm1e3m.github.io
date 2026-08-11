import {
  useMemo,
  useRef,
  useState,
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
  SavedWardrobeLook,
  WardrobeTargetId,
  WardrobeTransform,
} from '@/domain/game/types'
import { buildUnlockedPostcardBackgrounds } from '@/features/reality'

import './MiracleWardrobePage.css'

import { PhotoCompositionPreview } from './PhotoCompositionPreview'
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
  defaultTransform: Pick<WardrobeTransform, 'x' | 'y' | 'scale' | 'rotation'>
}

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
  initialScale: number
  initialRotation: number
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
  scale: 0.34,
  rotation: 0,
} as const

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function pointerAngle(centerX: number, centerY: number, clientX: number, clientY: number) {
  return Math.atan2(clientY - centerY, clientX - centerX)
}

function pointerDistance(centerX: number, centerY: number, clientX: number, clientY: number) {
  return Math.hypot(clientX - centerX, clientY - centerY)
}

function normalizeRotation(value: number) {
  let rotation = value
  while (rotation > 180) rotation -= 360
  while (rotation < -180) rotation += 360
  return rotation
}

function cloneElements(elements: readonly WardrobeElement[]): WardrobeElement[] {
  return elements.map((element) => ({ ...element }))
}

function normalizeLayerOrder(elements: readonly WardrobeElement[]): WardrobeElement[] {
  return [...elements]
    .sort((left, right) => left.z - right.z || left.placementId.localeCompare(right.placementId))
    .map((element, index) => ({ ...element, z: index + 1 }))
}

function elementStyle(element: WardrobeElement): CSSProperties {
  return {
    left: `${element.x * 100}%`,
    top: `${element.y * 100}%`,
    width: `${element.scale * 100}%`,
    zIndex: 200 + element.z,
    transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
  }
}

function participantHitStyle(participant: PhotoParticipantDraft): CSSProperties {
  return {
    left: `${participant.x * 100}%`,
    top: `${participant.y * 100}%`,
    width: `${participant.scale * 100}%`,
    zIndex: 200 + participant.z,
    transform: `translate(-50%, -50%) rotate(${participant.rotation}deg)`,
  }
}

function targetName(targetId: WardrobeTargetId) {
  return getWardrobeTargetVisual(targetId).name
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
    event: ReactPointerEvent<HTMLSpanElement>,
    element: WardrobeElement,
  ) => void
  onTransformPointerMove: (event: ReactPointerEvent<HTMLSpanElement>) => void
  onTransformPointerUp: (event: ReactPointerEvent<HTMLSpanElement>) => void
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
        <button
          className={`miracle-look-layer ${selectedPlacementId === element.placementId ? 'is-selected' : ''}`}
          type="button"
          key={element.placementId}
          style={elementStyle(element)}
          aria-label={`${visual.name}${selectedPlacementId === element.placementId ? '，已选中' : ''}`}
          onClick={() => onSelect(element.placementId)}
          onPointerDown={(event) => onPointerDown(event, element)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={visual.url}
            alt=""
            width={visual.width}
            height={visual.height}
            draggable={false}
          />
          {selectedPlacementId === element.placementId && (
            <span
              className="miracle-transform-handle"
              aria-hidden="true"
              onPointerDown={(event) => onTransformPointerDown(event, element)}
              onPointerMove={onTransformPointerMove}
              onPointerUp={onTransformPointerUp}
              onPointerCancel={onTransformPointerUp}
            />
          )}
        </button>
      )
    })
  }

  return (
    <div
      ref={canvasRef}
      className="miracle-look-canvas"
      role="group"
      aria-label={`${target.name}搭配画布`}
      data-testid="miracle-look-canvas"
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
  const [selectedPostcardId, setSelectedPostcardId] = useState<string | null>(null)
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
  const closeRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const lookCanvasRef = useRef<HTMLDivElement>(null)
  const photoCanvasRef = useRef<HTMLDivElement>(null)
  const lookDragRef = useRef<DragState | null>(null)
  const photoDragRef = useRef<DragState | null>(null)
  const lookTransformDragRef = useRef<TransformDragState | null>(null)
  const photoTransformDragRef = useRef<TransformDragState | null>(null)
  const placementSequenceRef = useRef(0)
  const dialogRef = useModalFocus<HTMLElement>(true, onClose, { initialFocus: closeRef })
  const ownedItems = useMemo(() => getOwnedWardrobeItems(game), [game])
  const savedLooks = useMemo(() => getSavedWardrobeLooks(game, lookTargetId), [game, lookTargetId])
  const postcards = useMemo(() => buildUnlockedPostcardBackgrounds(game, catalog), [catalog, game])
  const effectivePostcardId = selectedPostcardId ?? postcards[0]?.id ?? null
  const selectedElement =
    lookDraft.find((element) => element.placementId === selectedPlacementId) ?? null
  const selectedParticipant =
    photoParticipants.find((participant) => participant.targetId === selectedPhotoTargetId) ?? null
  const selectedPostcard = postcards.find((postcard) => postcard.id === effectivePostcardId) ?? null
  const selectedPostcardImage = effectivePostcardId
    ? [...(catalog.byId[effectivePostcardId]?.images ?? [])].sort(
        (left, right) => right.width - left.width,
      )[0]
    : undefined

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
        const { x, y, scale, rotation } = getWardrobeAssetVisual(element.assetId).defaultTransform
        return { ...element, x, y, scale, rotation, z: element.z }
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

  function startLookTransform(event: ReactPointerEvent<HTMLSpanElement>, element: WardrobeElement) {
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
      initialScale: element.scale,
      initialRotation: element.rotation,
    }
    setSelectedPlacementId(element.placementId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveLookTransform(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = lookTransformDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const distance = pointerDistance(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const angle = pointerAngle(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const scale = clamp(drag.initialScale * (distance / drag.initialDistance), 0.05, 5)
    const rotation = normalizeRotation(
      drag.initialRotation + ((angle - drag.initialAngle) * 180) / Math.PI,
    )
    setLookDraft((current) =>
      current.map((element) =>
        element.placementId === drag.id ? { ...element, scale, rotation } : element,
      ),
    )
  }

  function endLookTransform(event: ReactPointerEvent<HTMLSpanElement>) {
    if (lookTransformDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    lookTransformDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
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

  function togglePhotoTarget(targetId: WardrobeTargetId) {
    if (photoParticipants.some((participant) => participant.targetId === targetId)) {
      const remaining = photoParticipants.filter((participant) => participant.targetId !== targetId)
      setPhotoParticipants(remaining)
      if (selectedPhotoTargetId === targetId) {
        setSelectedPhotoTargetId(remaining[0]?.targetId ?? null)
      }
      return
    }

    const index = photoParticipants.length
    const defaultTransform = {
      x: clamp(0.34 + index * 0.16, 0.18, 0.82),
      y: 0.57,
      scale: 0.3,
      rotation: 0,
    }
    setPhotoParticipants((current) => [
      ...current,
      {
        targetId,
        lookId: getSavedWardrobeLooks(game, targetId)[0]?.lookId ?? null,
        ...defaultTransform,
        defaultTransform,
        z: Math.max(0, ...current.map((participant) => participant.z)) + 1,
      },
    ])
    setSelectedPhotoTargetId(targetId)
  }

  function startPhotoDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    participant: PhotoParticipantDraft,
  ) {
    const canvas = photoCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    photoDragRef.current = {
      pointerId: event.pointerId,
      id: participant.targetId,
      rect,
      offsetX: event.clientX - rect.left - participant.x * rect.width,
      offsetY: event.clientY - rect.top - participant.y * rect.height,
    }
    setSelectedPhotoTargetId(participant.targetId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePhotoDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = photoDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = clamp((event.clientX - drag.rect.left - drag.offsetX) / drag.rect.width, 0, 1)
    const y = clamp((event.clientY - drag.rect.top - drag.offsetY) / drag.rect.height, 0, 1)
    updateParticipant(drag.id as WardrobeTargetId, { x, y })
  }

  function endPhotoDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (photoDragRef.current?.pointerId !== event.pointerId) return
    photoDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startPhotoTransform(
    event: ReactPointerEvent<HTMLSpanElement>,
    participant: PhotoParticipantDraft,
  ) {
    const canvas = photoCanvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.left + participant.x * rect.width
    const centerY = rect.top + participant.y * rect.height
    photoTransformDragRef.current = {
      pointerId: event.pointerId,
      id: participant.targetId,
      centerX,
      centerY,
      initialDistance: Math.max(1, pointerDistance(centerX, centerY, event.clientX, event.clientY)),
      initialAngle: pointerAngle(centerX, centerY, event.clientX, event.clientY),
      initialScale: participant.scale,
      initialRotation: participant.rotation,
    }
    setSelectedPhotoTargetId(participant.targetId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function movePhotoTransform(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = photoTransformDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const distance = pointerDistance(drag.centerX, drag.centerY, event.clientX, event.clientY)
    const angle = pointerAngle(drag.centerX, drag.centerY, event.clientX, event.clientY)
    updateParticipant(drag.id as WardrobeTargetId, {
      scale: clamp(drag.initialScale * (distance / drag.initialDistance), 0.05, 5),
      rotation: normalizeRotation(
        drag.initialRotation + ((angle - drag.initialAngle) * 180) / Math.PI,
      ),
    })
  }

  function endPhotoTransform(event: ReactPointerEvent<HTMLSpanElement>) {
    if (photoTransformDragRef.current?.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    photoTransformDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function moveSelectedParticipant(direction: -1 | 1) {
    setPhotoParticipants((current) => {
      const ordered = [...current].sort(
        (left, right) => left.z - right.z || left.targetId.localeCompare(right.targetId),
      )
      const index = ordered.findIndex(
        (participant) => participant.targetId === selectedPhotoTargetId,
      )
      const targetIndex = clamp(index + direction, 0, ordered.length - 1)
      if (index < 0 || index === targetIndex) return ordered
      ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]]
      return ordered.map((participant, layerIndex) => ({ ...participant, z: layerIndex + 1 }))
    })
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

  const draftPhoto: WardrobePhoto = {
    photoId: 'miracle-draft',
    postcardId: effectivePostcardId,
    createdAt: 0,
    participants: photoParticipants.map((participant) => ({
      targetId: participant.targetId,
      x: participant.x,
      y: participant.y,
      scale: participant.scale,
      rotation: participant.rotation,
      z: participant.z,
      sourceLookId: participant.lookId,
      elements: cloneElements(
        participant.lookId ? (game.wardrobe.looks[participant.lookId]?.elements ?? []) : [],
      ),
    })),
  }

  function savePhoto() {
    if (!effectivePostcardId) {
      setMessage('先选择一张已经收藏的明信片')
      return
    }
    if (photoParticipants.length === 0) {
      setMessage('至少选择一位出镜的朋友')
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
        scale: participant.scale,
        rotation: participant.rotation,
        z: participant.z,
      })),
      now: Date.now(),
    })
    setMessage('合拍已经保存到收藏墙的合拍相册')
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
          <div className="miracle-editor-stage">
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
            <label className="miracle-look-name">
              造型名称
              <input
                type="text"
                maxLength={MAX_WARDROBE_LOOK_NAME_LENGTH}
                value={lookName}
                onChange={(event) => setLookName(event.currentTarget.value)}
              />
            </label>
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
            />
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
          </div>

          <aside className="miracle-editor-tools">
            <section>
              <h3>放一件到画布上</h3>
              <div className="miracle-asset-buttons">
                {ownedItems.map((item) => (
                  <button type="button" key={item.id} onClick={() => addAsset(item.id)}>
                    <img src={getWardrobeAssetVisual(item.id).url} alt="" draggable={false} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="miracle-transform-controls" aria-label="选中元素调整">
              <h3>
                {selectedElement
                  ? getWardrobeAssetVisual(selectedElement.assetId).name
                  : '选择一个元素'}
              </h3>
              {selectedElement ? (
                <>
                  <p>
                    拖动图片中心来移动；拖动右下角圆点可同时缩放和旋转。手柄离开画布时，可从图层列表重新选中并复位。
                  </p>
                  <div className="miracle-layer-actions">
                    <button type="button" onClick={() => moveSelectedLayer(-1)}>
                      向后一层
                    </button>
                    <button type="button" onClick={() => moveSelectedLayer(1)}>
                      向前一层
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLookDraft((current) =>
                          current.filter((element) => element.placementId !== selectedPlacementId),
                        )
                        setSelectedPlacementId(null)
                      }}
                    >
                      移除元素
                    </button>
                    <button type="button" onClick={resetSelectedElementTransform}>
                      恢复默认变换
                    </button>
                  </div>
                </>
              ) : (
                <p>点画布上的衣服或配饰，再拖动、缩放、旋转和调整遮挡关系。</p>
              )}
            </section>
            <section className="miracle-layer-list">
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
          {postcards.length > 0 ? (
            <>
              <div className="miracle-photo-stage">
                <div className="miracle-photo-canvas" ref={photoCanvasRef}>
                  <PhotoCompositionPreview
                    photo={draftPhoto}
                    postcard={
                      selectedPostcard?.fullUrl
                        ? {
                            url: selectedPostcard.fullUrl,
                            width: selectedPostcardImage?.width ?? 4,
                            height: selectedPostcardImage?.height ?? 3,
                            alt: selectedPostcard.alt,
                          }
                        : null
                    }
                    label="奇迹饼狗合拍预览"
                  />
                  <div className="miracle-photo-hit-layer">
                    {photoParticipants.map((participant) => (
                      <button
                        key={participant.targetId}
                        type="button"
                        style={participantHitStyle(participant)}
                        className={
                          selectedPhotoTargetId === participant.targetId ? 'is-selected' : ''
                        }
                        aria-label={`移动${targetName(participant.targetId)}`}
                        onClick={() => setSelectedPhotoTargetId(participant.targetId)}
                        onPointerDown={(event) => startPhotoDrag(event, participant)}
                        onPointerMove={movePhotoDrag}
                        onPointerUp={endPhotoDrag}
                        onPointerCancel={endPhotoDrag}
                      >
                        {selectedPhotoTargetId === participant.targetId && (
                          <span
                            className="miracle-transform-handle"
                            aria-hidden="true"
                            onPointerDown={(event) => startPhotoTransform(event, participant)}
                            onPointerMove={movePhotoTransform}
                            onPointerUp={endPhotoTransform}
                            onPointerCancel={endPhotoTransform}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="paper-button paper-button--primary"
                  type="button"
                  onClick={savePhoto}
                >
                  保存这张合拍
                </button>
              </div>

              <aside className="miracle-photo-tools">
                <section>
                  <h3>明信片背景</h3>
                  <div className="miracle-postcard-picker">
                    {postcards.map((postcard) => (
                      <button
                        type="button"
                        key={postcard.id}
                        className={effectivePostcardId === postcard.id ? 'is-selected' : ''}
                        aria-pressed={effectivePostcardId === postcard.id}
                        onClick={() => setSelectedPostcardId(postcard.id)}
                      >
                        {postcard.thumbnailUrl ? (
                          <img src={postcard.thumbnailUrl} alt="" draggable={false} />
                        ) : (
                          <span aria-hidden="true">✦</span>
                        )}
                        <strong>{postcard.title}</strong>
                      </button>
                    ))}
                  </div>
                </section>
                <section>
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
                <section className="miracle-transform-controls">
                  <h3>
                    {selectedParticipant
                      ? `调整${targetName(selectedParticipant.targetId)}`
                      : '选择一个人'}
                  </h3>
                  {selectedParticipant && (
                    <>
                      <p>
                        拖动人物中心来移动；拖动右下角圆点可同时缩放和旋转。手柄被裁住时，重新点人物即可复位。
                      </p>
                      <div className="miracle-layer-actions">
                        <button type="button" onClick={() => moveSelectedParticipant(-1)}>
                          向后一层
                        </button>
                        <button type="button" onClick={() => moveSelectedParticipant(1)}>
                          向前一层
                        </button>
                        <button type="button" onClick={resetSelectedParticipantTransform}>
                          恢复默认变换
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </aside>
            </>
          ) : (
            <div className="miracle-empty-state">
              <span aria-hidden="true">📮</span>
              <h3>还没有可以合拍的明信片</h3>
              <p>旅行收藏到明信片以后，再来一起选风景吧。</p>
            </div>
          )}
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
              <section className="miracle-collection-group" key={category}>
                <h4>{`${CATEGORY_LABELS[category]}【${items.length}】`}</h4>
                <div>
                  {items.map((item) => {
                    const visual = getWardrobeAssetVisual(item.id)
                    return (
                      <article key={item.id}>
                        <img
                          src={visual.url}
                          alt={visual.name}
                          width={visual.width}
                          height={visual.height}
                          draggable={false}
                        />
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
