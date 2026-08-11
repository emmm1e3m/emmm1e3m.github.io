import { fireEvent, render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

import mascotStyles from './MascotSprite.css?raw'
import { MascotSprite, type MascotPose } from './MascotSprite'

const appRoot = existsSync(resolve(process.cwd(), 'public/assets/game'))
  ? process.cwd()
  : resolve(process.cwd(), 'AllForSUXINHAO/TravellingBingo')
const MASCOT_ATLAS = resolve(appRoot, 'public/assets/game/bingo-sprites-v2.webp')

const POSE_ATLASES: Readonly<Record<MascotPose, string>> = {
  idle: 'bingo-sprites-v2.webp',
  travel: 'bingo-sprites-v2.webp',
  stream: 'bingo-sprites-v2.webp',
  celebrate: 'bingo-sprites-v2.webp',
  walk: 'bingo-walk-v2.webp',
  fridge: 'bingo-actions-v2.webp',
  refuse: 'bingo-refuse-v2.webp',
  warm: 'bingo-actions-v2.webp',
  sit: 'bingo-actions-v2.webp',
  ready: 'bingo-actions-v2.webp',
  sleep: 'bingo-actions-v2.webp',
}

describe('饼狗图集演员', () => {
  it('动作帧定位不依赖游戏页祖先，供全屏 portal 只显示一帧', () => {
    expect(mascotStyles).toMatch(
      /\.mascot-sprite--sit\s*\{[^}]*background-position:\s*33\.333% 0;/u,
    )
    expect(mascotStyles).toMatch(
      /\.mascot-sprite--walk,[\s\S]*?\.mascot-sprite--sleep\s*\{[^}]*background-size:\s*400% 100%;/u,
    )
  })

  it('通用看电脑帧保持房间原始定位，不施加全局裁切', () => {
    const streamRule = mascotStyles.match(/\.mascot-sprite--stream\s*\{[^}]*\}/u)?.[0]

    expect(streamRule).toContain('background-position: 0 100%;')
    expect(streamRule).not.toContain('clip-path')
  })

  it('苹果钟的 2% 局部裁切能覆盖 stream 帧顶端独立杂边且不触及主体', async () => {
    const metadata = await sharp(MASCOT_ATLAS).metadata()
    expect(metadata.width).toBe(metadata.height)
    expect(metadata.width! % 2).toBe(0)
    const frameSize = metadata.width! / 2
    const { data, info } = await sharp(MASCOT_ATLAS)
      .extract({ left: 0, top: frameSize, width: frameSize, height: frameSize })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const visibleRows: number[] = []

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * info.channels + 3]! > 5) {
          visibleRows.push(y)
          break
        }
      }
    }

    const firstSubjectIndex = visibleRows.findIndex(
      (row, index) => index > 0 && row - visibleRows[index - 1]! > 1,
    )
    expect(firstSubjectIndex).toBeGreaterThan(0)
    const topArtifactEnd = visibleRows[firstSubjectIndex - 1]!
    const firstSubjectRow = visibleRows[firstSubjectIndex]!

    expect((topArtifactEnd + 1) / frameSize).toBeLessThanOrEqual(0.02)
    expect(firstSubjectRow / frameSize).toBeGreaterThan(0.02)
  })

  it.each(Object.entries(POSE_ATLASES) as Array<[MascotPose, string]>)(
    '%s 姿态带有稳定帧类并读取正确图集',
    (pose, atlas) => {
      const { container } = render(<MascotSprite pose={pose} label={`${pose} 饼狗`} />)
      const sprite = screen.getByRole('img', { name: `${pose} 饼狗` })

      expect(sprite).toHaveClass('mascot-sprite', `mascot-sprite--${pose}`)
      expect(sprite.getAttribute('style')).toContain(`/assets/game/${atlas}`)
      expect(container.querySelectorAll('.mascot-sprite')).toHaveLength(1)
    },
  )

  it('仅奖励庆祝态内收图集边界，避免采样到相邻帧', () => {
    const { rerender } = render(
      <MascotSprite pose="celebrate" className="reward-mascot" label="奖励庆祝饼狗" />,
    )

    expect(screen.getByRole('img', { name: '奖励庆祝饼狗' })).toHaveStyle({
      backgroundSize: '205% 205%',
    })

    rerender(<MascotSprite pose="idle" className="reward-mascot" label="奖励待机饼狗" />)
    expect(screen.getByRole('img', { name: '奖励待机饼狗' })).toHaveStyle({
      backgroundSize: '200% 200%',
    })

    rerender(<MascotSprite pose="celebrate" className="room-mascot" label="场景庆祝饼狗" />)
    expect(screen.getByRole('img', { name: '场景庆祝饼狗' })).toHaveStyle({
      backgroundSize: '200% 200%',
    })
  })

  it('无互动时暴露图片语义与自定义外层样式', () => {
    render(
      <MascotSprite
        pose="idle"
        className="reward-companion"
        label="开心的饼狗"
        style={{ left: '42%' }}
      />,
    )

    const sprite = screen.getByRole('img', { name: '开心的饼狗' })
    expect(sprite.parentElement).toHaveClass('reward-companion')
    expect(sprite.parentElement).toHaveStyle({ left: '42%' })
  })

  it('有互动时只暴露一个按钮语义，并完整传递展开状态与菜单关联', () => {
    const onActivate = vi.fn()
    const { container } = render(
      <MascotSprite
        pose="walk"
        className="room-pet"
        label="饼狗，打开行动菜单"
        expanded={false}
        controls="pet-action-menu"
        onActivate={onActivate}
      />,
    )

    const actor = screen.getByRole('button', { name: '饼狗，打开行动菜单' })
    expect(actor).toHaveClass('mascot-actor', 'room-pet')
    expect(actor).toHaveAttribute('aria-expanded', 'false')
    expect(actor).toHaveAttribute('aria-controls', 'pet-action-menu')
    expect(container.querySelector('.mascot-sprite--walk')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()

    fireEvent.click(actor)
    expect(onActivate).toHaveBeenCalledOnce()
  })
})
