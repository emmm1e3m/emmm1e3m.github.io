import gameV4Styles from './game-v4.css?raw'

describe('V4 界面字号契约', () => {
  it('房间设施热点使用展示字体并保持可读字号', () => {
    expect(gameV4Styles).toMatch(
      /\.room-card--v4 \.room-hotspot--text\s*\{[^}]*font-family:\s*var\(--v2-display\);[^}]*font-size:\s*clamp\(0\.82rem,\s*0\.9vw,\s*0\.92rem\);/su,
    )
  })

  it('正文与辅助信息分别有 0.9rem 和 0.82rem 的字号下限', () => {
    expect(gameV4Styles).toContain('--v4-body-copy-size: 0.9rem;')
    expect(gameV4Styles).toContain('--v4-support-copy-size: 0.82rem;')
    expect(gameV4Styles).toMatch(
      /\.help-dialog--v4 \.help-dialog__sections p[^}]*\{[^}]*font-size:\s*var\(--v4-body-copy-size\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.task-copy strong[^}]*\{[^}]*font-size:\s*var\(--v4-body-copy-size\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.reality-eyebrow[^}]*\{[^}]*font-size:\s*var\(--v4-support-copy-size\);/su,
    )
  })

  it('房间信息栏正文与表单控件统一使用乐融融字体', () => {
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-panel,\s*\.game-page--v4 \.context-panel :where\(button, input, textarea, select, option\)\s*\{[^}]*font-family:\s*var\(--font-display\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-panel :where\(\.numeric-copy, input\[type='number'\]\)\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/su,
    )
  })
})
