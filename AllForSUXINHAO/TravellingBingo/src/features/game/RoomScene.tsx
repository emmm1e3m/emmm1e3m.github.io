import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite, type MascotPose } from '@/components/MascotSprite'
import type { GameState, TaskEvent } from '@/domain'

import { ACTIVITY_COPY } from './gameCopy'
import {
  ROOM_AREAS,
  roomAreaForWorld,
  roomAreaVisibleInWorld,
  roomPointToPercent,
  type RoomArea,
} from './roomConfig'
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
  onClose: () => void
  onPanel: (panel: PanelId) => void
}

function PetMenu({ game, open, onClose, onPanel }: PetMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const pet = readPet(game)

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  if (!open) return null
  const activity = game.activeActivity

  return (
    <div
      ref={menuRef}
      className="pet-menu"
      id="pet-action-menu"
      role="dialog"
      aria-label="饼狗想做什么"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="pet-menu__heading">
        <strong>{activity ? ACTIVITY_COPY[activity.kind].verb : '饼狗正看着你'}</strong>
        <button type="button" onClick={onClose}>
          收起菜单
        </button>
      </div>
      {activity ? (
        <button type="button" onClick={() => onPanel('activity')}>
          查看这次活动
        </button>
      ) : (
        <div className="pet-menu__wishes" aria-label="饼狗今天的想法">
          <p className={pet.preferences.travel && !pet.tired ? '' : 'is-reluctant'}>
            <strong>出门</strong>
            <span>{pet.preferences.travel && !pet.tired ? '想出去走走' : '更想待在家'}</span>
          </p>
          <p className={pet.preferences.computer && !pet.tired ? '' : 'is-reluctant'}>
            <strong>电脑</strong>
            <span>
              {pet.preferences.computer && !pet.tired ? '愿意认真坐一会儿' : '想离屏幕远一点'}
            </span>
          </p>
          <p className={pet.preferences.music && !pet.tired ? '' : 'is-reluctant'}>
            <strong>音乐</strong>
            <span>{pet.preferences.music && !pet.tired ? '想听见一点旋律' : '今天想安静一点'}</span>
          </p>
        </div>
      )}
    </div>
  )
}

interface RoomSceneProps {
  game: GameState
  panel: PanelId | null
  area: RoomArea
  walking: boolean
  sleeping: boolean
  restDarkness: number
  onArea: (area: RoomArea) => void
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
}

export function RoomScene({
  game,
  panel,
  area,
  walking,
  sleeping,
  restDarkness,
  onArea,
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
}: RoomSceneProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const petButtonRef = useRef<HTMLButtonElement>(null)
  const travelling = game.activeActivity?.kind === 'travel'
  const pose = poseForRoom({ game, area, walking, sleeping })
  const petCenter = roomPointToPercent(area.petCenter)

  useEffect(() => {
    if (!travelling) return
    const frame = globalThis.requestAnimationFrame(() => setMenuOpen(false))
    return () => globalThis.cancelAnimationFrame(frame)
  }, [travelling])

  function hotspotHidden(hotspot: RoomArea) {
    if (!roomAreaVisibleInWorld(hotspot, game.world)) return true
    if (game.activeActivity?.kind === 'music' && hotspot.id === 'keyboard') return false
    return Boolean(game.activeActivity && hotspot.activityKinds?.includes(game.activeActivity.kind))
  }

  function openPetMenu() {
    setMenuOpen((value) => !value)
    if (!menuOpen) onTaskEvent({ type: 'pet-menu-opened' })
  }

  function closePetMenu(restoreFocus = false) {
    setMenuOpen(false)
    if (restoreFocus) globalThis.requestAnimationFrame(() => petButtonRef.current?.focus())
  }

  function closeRoomLayers() {
    closePetMenu()
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
        <span className="room-bingo-badge" aria-hidden="true">
          Bingo!
        </span>
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

        {!travelling && (
          <MascotSprite
            pose={pose}
            className={`room-mascot room-mascot--actor ${walking ? 'is-walking' : ''}`}
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
              } as CSSProperties
            }
          />
        )}

        <PetMenu
          game={game}
          open={menuOpen && !travelling}
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
