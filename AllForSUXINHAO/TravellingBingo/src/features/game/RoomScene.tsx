import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite, type MascotPose } from '@/components/MascotSprite'
import { getPetVitalityStatus, isVitalityActive, type GameState, type TaskEvent } from '@/domain'

import { ACTIVITY_COPY } from './gameCopy'
import {
  ROOM_CANVAS,
  ROOM_AREAS,
  roomAreaForWorld,
  roomAreaVisibleInWorld,
  roomPointToPercent,
  type RoomArea,
  type RoomPixelPoint,
} from './roomConfig'
import {
  GAME_ROOM_WANDER_HULL,
  randomRoomPointInHull,
  randomRoomWanderDuration,
  type RoomWanderPhase,
} from './roomWander'
import type { PanelId } from './GameHome'

function readPet(game: GameState) {
  return game.pet
}

function poseForRoom({
  game,
  area,
  walking,
  sleeping,
}: {
  game: GameState
  area: RoomArea
  walking: boolean
  sleeping: boolean
}): MascotPose {
  if (sleeping) return 'sleep'
  if (walking) return 'walk'
  if (game.activeActivity?.kind === 'stream' || game.activeActivity?.kind === 'trend') {
    return 'stream'
  }
  if (game.activeActivity?.kind === 'rest') return 'sleep'
  if (game.activeActivity?.kind === 'music') return 'sit'

  const pet = readPet(game)
  if (area.interest && (!pet.preferences[area.interest] || pet.tired)) {
    return 'refuse'
  }
  if (area.id === 'fridge') return 'fridge'
  if (area.id === 'wardrobe') return 'warm'
  if (area.id === 'bed') return 'sit'
  return 'idle'
}

interface PetMenuProps {
  game: GameState
  open: boolean
  anchorPoint: RoomPixelPoint
  followingPet: boolean
  transitionMs: number
  onClose: () => void
  onPanel: (panel: PanelId) => void
}

function PetMenu({
  game,
  open,
  anchorPoint,
  followingPet,
  transitionMs,
  onClose,
  onPanel,
}: PetMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const pet = readPet(game)

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  if (!open) return null
  const activity = game.activeActivity
  const vitalityStatus = getPetVitalityStatus(pet.preferences, isVitalityActive(game))
  const anchor = roomPointToPercent(anchorPoint)
  const verticalPlacement = anchorPoint.y < ROOM_CANVAS.height * 0.42 ? 'below' : 'above'

  return (
    <div
      ref={menuRef}
      className={`pet-menu pet-menu--${verticalPlacement} ${followingPet ? 'is-following-pet' : ''}`}
      id="pet-action-menu"
      role="dialog"
      aria-label="饼狗状态"
      style={
        {
          '--pet-menu-x': `${anchor.x}%`,
          '--pet-menu-y': `${anchor.y}%`,
          '--pet-menu-transition': `${transitionMs}ms`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="pet-menu__heading">
        <strong>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗正看着你👀'}</strong>
        <button type="button" onClick={onClose}>
          收起菜单
        </button>
      </div>
      <p className="pet-menu__vitality" aria-label="饼狗活力状态">
        <strong>活力状态</strong>
        <span>{vitalityStatus}</span>
      </p>
      {activity && (
        <button type="button" onClick={() => onPanel('activity')}>
          查看这次活动
        </button>
      )}
    </div>
  )
}

interface RoomSceneProps {
  game: GameState
  panel: PanelId | null
  area: RoomArea
  walking: boolean
  walkingDirection: RoomWalkingDirection
  sleeping: boolean
  restDarkness: number
  onArea: (area: RoomArea) => void
  onPetCenterChange?: (point: RoomPixelPoint) => void
  onReluctantArea?: (area: RoomArea) => void
  onPanel: (panel: PanelId) => void
  onBackgroundActivate: () => void
  onRequestCancelActivity?: () => void
  pomodoroRunning?: boolean
  onRequestCancelPomodoro?: () => void
  onHelp: () => void
  dimensionToggleRef?: Ref<HTMLButtonElement>
  dimensionToggleDisabled?: boolean
  onToggleDimension?: () => void
  onTaskEvent: (event: TaskEvent) => void
  wanderRandom?: () => number
  petMenuOpenRequest?: number
}

export type RoomWalkingDirection = 'left' | 'right'

export function RoomScene({
  game,
  panel,
  area,
  walking,
  walkingDirection,
  sleeping,
  restDarkness,
  onArea,
  onPetCenterChange,
  onReluctantArea,
  onPanel,
  onBackgroundActivate,
  onRequestCancelActivity,
  pomodoroRunning = false,
  onRequestCancelPomodoro,
  onHelp,
  dimensionToggleRef,
  dimensionToggleDisabled = false,
  onToggleDimension = () => undefined,
  onTaskEvent,
  wanderRandom = Math.random,
  petMenuOpenRequest = 0,
}: RoomSceneProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [wanderState, setWanderState] = useState<{
    phase: RoomWanderPhase
    point: ReturnType<typeof randomRoomPointInHull>
    durationMs: number
    facing: 'left' | 'right'
  }>(() => ({
    phase: 'resting',
    point: randomRoomPointInHull(GAME_ROOM_WANDER_HULL, wanderRandom),
    durationMs: randomRoomWanderDuration('resting', wanderRandom),
    facing: 'right',
  }))
  const [reducedMotion, setReducedMotion] = useState(
    () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  const petButtonRef = useRef<HTMLButtonElement>(null)
  const handledPetMenuOpenRequest = useRef(petMenuOpenRequest)
  const travelling = game.activeActivity?.kind === 'travel'
  const wanderEligible =
    game.activeActivity === null &&
    !sleeping &&
    !pomodoroRunning &&
    (panel === null || panel === 'status')
  const wandering = wanderEligible && !reducedMotion
  const wanderMoving = wandering && wanderState.phase === 'moving'
  const facingLeft =
    (walking && walkingDirection === 'left') || (wanderMoving && wanderState.facing === 'left')
  const pose = wandering
    ? wanderMoving
      ? 'walk'
      : 'idle'
    : poseForRoom({ game, area, walking, sleeping })
  const visiblePetCenter = wandering ? wanderState.point : area.petCenter
  const petCenter = roomPointToPercent(visiblePetCenter)

  useEffect(() => {
    const motionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const followPreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    motionPreference?.addEventListener('change', followPreference)
    return () => {
      motionPreference?.removeEventListener('change', followPreference)
    }
  }, [])

  useEffect(() => {
    onPetCenterChange?.(visiblePetCenter)
  }, [onPetCenterChange, visiblePetCenter])

  useEffect(() => {
    if (!wandering) return
    const timer = globalThis.setTimeout(() => {
      if (wanderState.phase === 'resting') {
        const nextPoint = randomRoomPointInHull(GAME_ROOM_WANDER_HULL, wanderRandom)
        setWanderState({
          phase: 'moving',
          point: nextPoint,
          durationMs: randomRoomWanderDuration('moving', wanderRandom),
          facing: nextPoint.x < wanderState.point.x ? 'left' : 'right',
        })
        return
      }

      setWanderState((current) => ({
        ...current,
        phase: 'resting',
        durationMs: randomRoomWanderDuration('resting', wanderRandom),
      }))
    }, wanderState.durationMs)
    return () => globalThis.clearTimeout(timer)
  }, [wanderRandom, wanderState, wandering])

  useEffect(() => {
    if (!travelling) return
    const frame = globalThis.requestAnimationFrame(() => setMenuOpen(false))
    return () => globalThis.cancelAnimationFrame(frame)
  }, [travelling])

  useEffect(() => {
    if (petMenuOpenRequest <= handledPetMenuOpenRequest.current) return
    const frame = globalThis.requestAnimationFrame(() => {
      if (petMenuOpenRequest <= handledPetMenuOpenRequest.current) return
      handledPetMenuOpenRequest.current = petMenuOpenRequest
      if (travelling) {
        onPanel('activity')
        return
      }

      setMenuOpen(true)
      onTaskEvent({ type: 'pet-menu-opened' })
      if (game.activeActivity) onPanel('activity')
    })
    return () => globalThis.cancelAnimationFrame(frame)
  }, [game.activeActivity, onPanel, onTaskEvent, petMenuOpenRequest, travelling])

  function hotspotHidden(hotspot: RoomArea) {
    if (!roomAreaVisibleInWorld(hotspot, game.world)) return true
    if (game.activeActivity?.kind === 'music' && hotspot.id === 'keyboard') return false
    return Boolean(game.activeActivity && hotspot.activityKinds?.includes(game.activeActivity.kind))
  }

  function openPetMenu() {
    const opening = !menuOpen
    setMenuOpen(opening)
    if (!opening) return

    onTaskEvent({ type: 'pet-menu-opened' })
    if (game.activeActivity) onPanel('activity')
  }

  function closePetMenu(restoreFocus = false) {
    setMenuOpen(false)
    if (restoreFocus) globalThis.requestAnimationFrame(() => petButtonRef.current?.focus())
  }

  function closeRoomLayers() {
    closePetMenu()
    if (panel !== null && panel !== 'status') {
      setWanderState({
        phase: 'resting',
        point: area.petCenter,
        durationMs: randomRoomWanderDuration('resting', wanderRandom),
        facing: 'right',
      })
    }
    onBackgroundActivate()
  }

  return (
    <section
      className="room-card room-card--v3 room-card--v4"
      aria-label="铲铲饼屋互动场景"
      onClick={(event) => {
        if (
          event.target === event.currentTarget ||
          (event.target instanceof Element && event.target.closest('.room-picture'))
        ) {
          closeRoomLayers()
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (menuOpen) closePetMenu(true)
        else onBackgroundActivate()
      }}
    >
      <div className="room-stage">
        <picture className="room-picture">
          <source
            srcSet={`${publicAsset('assets/game/chan-chan-house-v2-768.webp')} 768w, ${publicAsset('assets/game/chan-chan-house-v2-1098.webp')} 1098w`}
            sizes="(max-width: 900px) calc(100vw - 12px), 996px"
          />
          <img
            src={publicAsset('assets/game/chan-chan-house-v2-768.webp')}
            alt="纵向展开的两层铲铲饼屋，有床铺、电脑、衣架、电子琴、唱片机、冰箱、收藏墙和房门"
            width="1098"
            height="1433"
          />
        </picture>
        {(panel !== null || menuOpen) && (
          <button
            className="room-background-dismiss"
            type="button"
            aria-label="回到房间概览"
            onClick={closeRoomLayers}
          />
        )}
        {ROOM_AREAS.map((configuredHotspot) => {
          if (hotspotHidden(configuredHotspot)) return null
          const hotspot = roomAreaForWorld(configuredHotspot, game.world)
          const reluctant = Boolean(
            game.world === 'game' &&
            hotspot.interest &&
            (!game.pet.preferences[hotspot.interest] || game.pet.tired),
          )
          return (
            <button
              key={hotspot.id}
              className={`room-hotspot room-hotspot--text ${panel === hotspot.panel ? 'is-active' : ''} ${
                reluctant ? 'is-reluctant' : ''
              }`}
              data-hotspot={hotspot.label}
              data-interest={hotspot.interest}
              aria-pressed={panel === hotspot.panel}
              style={
                {
                  '--x': `${hotspot.hotspot.x}%`,
                  '--y': `${hotspot.hotspot.y}%`,
                } as CSSProperties
              }
              type="button"
              onClick={() => {
                closePetMenu()
                onArea(hotspot)
                if (reluctant) onReluctantArea?.(hotspot)
              }}
            >
              {hotspot.buttonLabel}
            </button>
          )
        })}

        {travelling && (
          <button
            className="travel-note travel-note--v2"
            type="button"
            aria-label="饼狗不在家，查看出门进度"
            onClick={() => onPanel('activity')}
          >
            <strong>饼狗不在家</strong>
            <span>点击查看出门进度</span>
          </button>
        )}

        {!travelling && (
          <MascotSprite
            pose={pose}
            className={`room-mascot room-mascot--actor ${walking ? 'is-walking' : ''} ${wandering ? 'is-wandering' : ''} ${wanderMoving ? 'is-wander-moving' : ''} ${facingLeft ? 'is-facing-left' : ''} ${wandering && !wanderMoving ? 'is-wander-resting' : ''}`}
            label={
              game.activeActivity
                ? `正在${ACTIVITY_COPY[game.activeActivity.kind].verb}的饼狗`
                : '饼狗，打开行动菜单'
            }
            expanded={menuOpen}
            controls="pet-action-menu"
            actorRef={petButtonRef}
            onActivate={openPetMenu}
            style={
              {
                '--pet-x': `${petCenter.x}%`,
                '--pet-y': `${petCenter.y}%`,
                '--pet-wander-duration': `${wanderState.durationMs}ms`,
              } as CSSProperties
            }
          />
        )}

        <PetMenu
          game={game}
          open={menuOpen && !travelling}
          anchorPoint={visiblePetCenter}
          followingPet={walking || wanderMoving}
          transitionMs={wanderMoving ? wanderState.durationMs : 620}
          onClose={() => closePetMenu(true)}
          onPanel={(nextPanel) => {
            onPanel(nextPanel)
            setMenuOpen(false)
          }}
        />
        <div
          className={`day-night-overlay ${restDarkness > 0 ? 'is-resting' : ''} ${sleeping ? 'is-playing' : ''}`}
          style={{ '--rest-darkness': restDarkness } as CSSProperties}
          aria-hidden="true"
        />
      </div>
      <button
        className="room-corner-control room-corner-control--help"
        type="button"
        onClick={onHelp}
        aria-label={game.world === 'reality' ? '查看现实维度说明' : '查看房屋玩法说明'}
      >
        <span aria-hidden="true">ℹ️</span>
      </button>
      {(game.activeActivity || pomodoroRunning) && (
        <button
          className="room-corner-control room-corner-control--return"
          type="button"
          aria-label={game.activeActivity ? '取消当前活动' : '取消当前苹果钟'}
          onClick={() => {
            closePetMenu()
            if (game.activeActivity) {
              if (onRequestCancelActivity) onRequestCancelActivity()
              else onPanel('activity')
              return
            }

            if (onRequestCancelPomodoro) onRequestCancelPomodoro()
            else onPanel('reality-work')
          }}
        >
          <span aria-hidden="true">↩️</span>
        </button>
      )}
      <button
        ref={dimensionToggleRef}
        className="room-corner-control room-corner-control--dimension"
        type="button"
        disabled={dimensionToggleDisabled}
        onClick={onToggleDimension}
        aria-label={game.world === 'reality' ? '回到旅行饼狗游戏' : '切换到现实生活维度'}
      >
        <span aria-hidden="true">🔃</span>
      </button>
    </section>
  )
}
