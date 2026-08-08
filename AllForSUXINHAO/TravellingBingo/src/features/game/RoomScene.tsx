import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite, type MascotPose } from '@/components/MascotSprite'
import type { GameState, TaskEvent } from '@/domain'

import { ACTIVITY_COPY } from './gameCopy'
import { ROOM_AREAS, type RoomArea } from './roomConfig'
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

  const pet = readPet(game)
  if (
    (area.panel === 'travel' && !pet.preferences.travel) ||
    (area.panel === 'computer' && !pet.preferences.stream && !pet.preferences.trend)
  ) {
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
  onGreet: () => void
}

function PetMenu({ game, open, onClose, onPanel, onGreet }: PetMenuProps) {
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
        <>
          <button
            type="button"
            onClick={() => {
              onGreet()
              onClose()
            }}
          >
            和饼狗打个招呼
          </button>
          <button type="button" onClick={() => onPanel('fridge')}>
            一起去冰箱
          </button>
          {pet.preferences.stream || pet.preferences.trend ? (
            <button type="button" onClick={() => onPanel('computer')}>
              一起去电脑前
            </button>
          ) : (
            <p>今天暂时不想坐在电脑前。</p>
          )}
          {pet.preferences.travel ? (
            <button type="button" onClick={() => onPanel('travel')}>
              一起去门口
            </button>
          ) : (
            <p>今天更想留在家里。</p>
          )}
          <button type="button" onClick={() => onPanel('rest')}>
            {pet.tired ? '去床铺好好睡一觉' : '去床边歇一会儿'}
          </button>
        </>
      )}
    </div>
  )
}

interface RoomSceneProps {
  game: GameState
  panel: PanelId
  area: RoomArea
  walking: boolean
  sleeping: boolean
  onArea: (area: RoomArea) => void
  onPanel: (panel: PanelId) => void
  onTaskEvent: (event: TaskEvent) => void
}

export function RoomScene({
  game,
  panel,
  area,
  walking,
  sleeping,
  onArea,
  onPanel,
  onTaskEvent,
}: RoomSceneProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const travelling = game.activeActivity?.kind === 'travel'
  const pose = poseForRoom({ game, area, walking, sleeping })

  function hotspotHidden(hotspot: RoomArea) {
    if (!game.activeActivity) return false
    if (game.activeActivity.kind === 'travel') return hotspot.id === 'door'
    return hotspot.id === 'computer'
  }

  function openPetMenu() {
    setMenuOpen((value) => !value)
    if (!menuOpen) onTaskEvent({ type: 'pet-menu-opened' })
  }

  return (
    <section className="room-card room-card--v2" aria-label="铲铲饼屋互动场景">
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
      <div className="room-vignette" aria-hidden="true" />
      <span className="room-bingo-badge" aria-hidden="true">
        Bingo!
      </span>

      {ROOM_AREAS.map((hotspot) =>
        hotspotHidden(hotspot) ? null : (
          <button
            key={hotspot.id}
            className={`room-hotspot room-hotspot--text ${panel === hotspot.panel ? 'is-active' : ''}`}
            data-hotspot={hotspot.label}
            style={{ '--x': `${hotspot.x}%`, '--y': `${hotspot.y}%` } as CSSProperties}
            type="button"
            onClick={() => onArea(hotspot)}
          >
            {hotspot.buttonLabel}
          </button>
        ),
      )}

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
          onActivate={openPetMenu}
          style={
            {
              '--pet-x': `${area.petX}%`,
              '--pet-y': `${area.petY}%`,
            } as CSSProperties
          }
        />
      )}

      <PetMenu
        game={game}
        open={menuOpen && !travelling}
        onClose={() => setMenuOpen(false)}
        onPanel={(nextPanel) => {
          onPanel(nextPanel)
          setMenuOpen(false)
        }}
        onGreet={() => onTaskEvent({ type: 'pet-greeted' })}
      />
      {travelling && (
        <p className="travel-note travel-note--v2">
          饼狗出门啦
          <span>回来的时候再见</span>
        </p>
      )}
      <div className={`day-night-overlay ${sleeping ? 'is-playing' : ''}`} aria-hidden="true" />
    </section>
  )
}
