import { participantRect, photoCanvasSize, wardrobeElementRect } from './photoGeometry'

describe('奇迹饼狗合拍几何', () => {
  it('横向明信片以原比例生成长边 2400 的画布', () => {
    expect(photoCanvasSize({ width: 1600, height: 900 })).toEqual({ width: 2400, height: 1350 })
  })

  it('竖向明信片以原比例生成长边 2400 的画布', () => {
    expect(photoCanvasSize({ width: 900, height: 1600 })).toEqual({ width: 1350, height: 2400 })
  })

  it('失效明信片使用暖白 4:3 画布', () => {
    expect(photoCanvasSize(null)).toEqual({ width: 2400, height: 1800 })
  })

  it('人物和服装都以父画布宽度为两轴基准，并保留各自天然宽高比', () => {
    const participant = participantRect(
      { x: 0.25, y: 0.5, scaleX: 0.32, scaleY: 0.24 },
      { width: 1200, height: 900 },
      2,
    )
    expect(participant).toEqual({ x: 108, y: 378, width: 384, height: 144 })
    expect(
      wardrobeElementRect({ x: 0.5, y: 0.25, scaleX: 0.5, scaleY: 0.25 }, participant, 2),
    ).toEqual({
      x: 204,
      y: 390,
      width: 192,
      height: 48,
    })
  })
})
