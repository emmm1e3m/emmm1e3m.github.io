import { render, screen } from '@testing-library/react'

import { DataPanel } from './DataPanel'

describe('DataPanel', () => {
  it('使用简洁的数据胶囊和开发中标题，不显示空状态玩法说明', () => {
    render(<DataPanel />)

    expect(screen.getByText('数据')).toHaveClass('paper-tag')
    expect(screen.getByRole('heading', { name: '刷播与冲热（开发中）' })).toBeInTheDocument()
    expect(screen.queryByText('二楼电脑 · 数据')).not.toBeInTheDocument()
    expect(screen.queryByText('玩法说明')).not.toBeInTheDocument()
  })

  it('运行组入口居中并明确前往字母建设站', () => {
    render(<DataPanel groupUrl="https://example.com/group" />)

    const link = screen.getByRole('link', { name: /前往字母建设站/u })
    expect(link).toHaveAttribute('href', 'https://example.com/group')
    expect(link.closest('aside')).toHaveClass('reality-group-card--centered')
  })
})
