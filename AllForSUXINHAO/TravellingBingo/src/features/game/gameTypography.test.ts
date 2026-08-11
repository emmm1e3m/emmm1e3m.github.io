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

  it('信息栏正文、表单和列表使用奶糖体，标题与主按钮使用乐融融', () => {
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-panel\s*\{[^}]*font-family:\s*var\(--font-ui\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.context-panel\s*:where\(p, small, label, input, textarea, select, option, \.panel-intro\),[^}]*:where\(ol, ul\) :where\(li, button, strong, span, small\)\s*\{[^}]*font-family:\s*var\(--font-ui\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.context-panel\s*:where\(h2, h3, h4, \.paper-tag, \.paper-button--primary, strong\)\s*\{[^}]*font-family:\s*var\(--font-display\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.context-panel :where\(ol, ul\) strong,[^}]*\.context-panel \.apple-amount__number\s*\{[^}]*font-family:\s*var\(--font-display\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.context-panel :where\(\.numeric-copy, input\[type='number'\]\)\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/su,
    )
  })

  it('衣架购买按钮保持 44px 触控高度', () => {
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.miracle-panel__offer button\s*\{[^}]*min-height:\s*44px;/su,
    )
  })
})
