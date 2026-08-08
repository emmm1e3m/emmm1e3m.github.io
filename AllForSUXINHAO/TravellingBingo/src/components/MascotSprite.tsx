import { publicAsset } from '@/app/assets'

export type MascotPose = 'idle' | 'travel' | 'stream' | 'celebrate'

interface MascotSpriteProps {
  pose?: MascotPose
  className?: string
  label?: string
}

export function MascotSprite({
  pose = 'idle',
  className = '',
  label = '戴着苹果头套的饼狗',
}: MascotSpriteProps) {
  return (
    <span
      aria-label={label}
      className={`mascot-sprite mascot-sprite--${pose} ${className}`.trim()}
      role="img"
      style={{ backgroundImage: `url(${publicAsset('assets/game/bingo-sprites-v2.webp')})` }}
    />
  )
}
