import { render, screen } from '@testing-library/react'

import { DataPanel } from './DataPanel'
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
  })
})
