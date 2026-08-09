import gameV4Styles from './game-v4.css?raw'

describe('电子琴面板布局', () => {
  it('面板标题、琴体和下方活动说明卡之间使用统一间距', () => {
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-content--v4\.piano-panel\s*\{[^}]*display:\s*grid;[^}]*gap:\s*clamp\(0\.8rem, 1\.5vw, 1rem\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-content--v4\.piano-panel > h2,[\s\S]*?> \.activity-card\s*\{[^}]*margin:\s*0;/u,
    )
  })
})
