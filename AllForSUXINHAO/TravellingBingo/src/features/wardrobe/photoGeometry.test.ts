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

  it('人物和服装都按归一化坐标映射，participant scale 不含隐式倍率', () => {
    const participant = participantRect(
      { x: 0.25, y: 0.5, scale: 0.32 },
      { width: 1200, height: 900 },
    )
    expect(participant).toEqual({ x: 108, y: 258, width: 384, height: 384 })
    expect(wardrobeElementRect({ x: 0.5, y: 0.25, scale: 0.5 }, participant)).toEqual({
      x: 204,
      y: 258,
      width: 192,
      height: 192,
    })
  })
})
