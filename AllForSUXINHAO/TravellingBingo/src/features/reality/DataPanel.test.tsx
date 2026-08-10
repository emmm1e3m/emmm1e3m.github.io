import { render, screen } from '@testing-library/react'

import { DataPanel } from './DataPanel'
import gameV4Styles from '../game/game-v4.css?raw'
import realityStyles from './reality.css?raw'

describe('DataPanel', () => {
  it('只展示尚在开发的冲热入口', () => {
    render(<DataPanel />)

    expect(screen.getByRole('heading', { name: '冲热刷播，奖品多多' })).toBeInTheDocument()
    expect(screen.queryByText(/冲热功能还在准备中/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/需要参与实际运行时/u)).not.toBeInTheDocument()
    expect(screen.queryByText('玩法说明')).not.toBeInTheDocument()
    expect(screen.queryByText('认真刷播')).not.toBeInTheDocument()
  })

  it('运行组入口居中并明确前往字母建设站', () => {
    render(<DataPanel groupUrl="https://example.com/group" />)

    const link = screen.getByRole('link', { name: /前往字母建设站/u })
    expect(link).toHaveAttribute('href', 'https://example.com/group')
    expect(link.closest('aside')).toHaveClass('reality-group-card--centered')
    expect(realityStyles).toMatch(
      /\.reality-group-card--centered \.reality-primary-link\s*\{[^}]*align-self:\s*center;[^}]*margin-inline:\s*auto;/su,
    )
    expect(gameV4Styles).toMatch(
      /\.reality-group-card--centered\s+\.reality-primary-link\s*\{[^}]*justify-self:\s*center;[^}]*width:\s*min\(100%,\s*16rem\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.reality-context-panel \.reality-group-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/su,
    )
  })
})
