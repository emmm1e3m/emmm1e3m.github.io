import type { CSSProperties, MouseEventHandler } from 'react'

import { publicAsset } from '@/app/assets'

import './MascotSprite.css'

export type MascotPose =
  | 'idle'
  | 'travel'
  | 'stream'
  | 'celebrate'
  | 'walk'
  | 'fridge'
  | 'refuse'
  | 'warm'
  | 'sit'
  | 'ready'
  | 'sleep'

interface MascotSpriteProps {
  pose?: MascotPose
  className?: string
  label?: string
  onActivate?: MouseEventHandler<HTMLButtonElement>
  expanded?: boolean
  controls?: string
  style?: CSSProperties
}

const LEGACY_POSES = new Set<MascotPose>(['idle', 'travel', 'stream', 'celebrate'])

function spriteStyle(pose: MascotPose): CSSProperties {
  if (pose === 'walk') {
    return { backgroundImage: `url(${publicAsset('assets/game/bingo-walk-v2.webp')})` }
  }

  if (pose === 'refuse') {
    return { backgroundImage: `url(${publicAsset('assets/game/bingo-refuse-v2.webp')})` }
  }

  if (LEGACY_POSES.has(pose)) {
    return { backgroundImage: `url(${publicAsset('assets/game/bingo-sprites-v2.webp')})` }
  }

  return { backgroundImage: `url(${publicAsset('assets/game/bingo-actions-v2.webp')})` }
}

/**
 * 饼狗演员。静态场景保持 role=img；传入 onActivate 后自动变成可访问按钮。
 */
export function MascotSprite({
  pose = 'idle',
  className = '',
  label = '戴着苹果头套的饼狗',
  onActivate,
  expanded,
  controls,
  style,
}: MascotSpriteProps) {
  const sprite = (
    <span
      aria-hidden={Boolean(onActivate)}
      aria-label={onActivate ? undefined : label}
      className={`mascot-sprite mascot-sprite--${pose}`}
      role={onActivate ? undefined : 'img'}
      style={spriteStyle(pose)}
    />
  )

  if (onActivate) {
    return (
      <button
        type="button"
        className={`mascot-actor ${className}`.trim()}
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onActivate}
        style={style}
      >
        {sprite}
      </button>
    )
  }

  return (
    <span className={className} style={style}>
      {sprite}
    </span>
  )
}
