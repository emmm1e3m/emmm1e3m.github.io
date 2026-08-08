import { fireEvent, render, screen } from '@testing-library/react'

import { MascotSprite, type MascotPose } from './MascotSprite'

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
