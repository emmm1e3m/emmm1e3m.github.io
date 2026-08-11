import albumStyles from '@/features/album/AlbumView.css?raw'

import realityStyles from './reality.css?raw'

describe('完整图片展示', () => {
  it('收藏详情与全屏查看都完整居中显示图片，并用留白承接不同宽高比', () => {
    expect(albumStyles).toMatch(
      /\.album-page--v4 \.collectible-detail__image-button \.collectible-picture\s*\{[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/u,
    )
    expect(albumStyles).toMatch(
      /\.collectible-fullscreen__canvas\s*\{[^}]*overflow:\s*hidden;[^}]*background:\s*#fffaf2;/u,
    )
    expect(albumStyles).toMatch(
      /\.collectible-fullscreen__image\s*\{[^}]*max-width:\s*100%;[^}]*max-height:\s*100%;[^}]*object-fit:\s*contain;[^}]*object-position:\s*center;/u,
    )
  })

  it('明信片选择与预览使用 contain，苹果钟运行背景单独使用 cover 铺满', () => {
    expect(realityStyles).toMatch(
      /\.reality-postcard-picker__preview > img,[\s\S]*?object-fit:\s*contain;[^}]*object-position:\s*center;/u,
    )
    expect(realityStyles).toMatch(
      /\.reality-postcard-tile > img,[\s\S]*?object-fit:\s*contain;[^}]*object-position:\s*center;/u,
    )
    expect(realityStyles).toMatch(
      /\.pomodoro-focus__background\s*\{[^}]*object-fit:\s*cover;[^}]*object-position:\s*center;/u,
    )
  })
})
