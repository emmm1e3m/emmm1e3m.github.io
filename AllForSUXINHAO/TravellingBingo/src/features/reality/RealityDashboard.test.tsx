import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { DataPanel } from './DataPanel'
import { RealityDashboard } from './RealityDashboard'
import { REALITY_PANEL_IDS } from './types'

function DashboardHarness() {
  const [activePanelId, setActivePanelId] = useState<string>(REALITY_PANEL_IDS.data)
  return (
    <RealityDashboard
      activePanelId={activePanelId}
      onPanelChange={setActivePanelId}
      panels={[
        {
          id: REALITY_PANEL_IDS.data,
          label: '数据',
          location: '二楼电脑',
          content: <p>数据区域内容</p>,
        },
        {
          id: REALITY_PANEL_IDS.work,
          label: '工作',
          location: '一楼电脑',
          content: <p>工作区域内容</p>,
        },
        {
          id: REALITY_PANEL_IDS.recordPlayer,
          label: '唱片机',
          location: '音乐角落',
          content: <p>唱片机区域内容</p>,
        },
      ]}
    />
  )
}

describe('RealityDashboard', () => {
  it('以受控 panel slot 组合数据、工作和唱片机入口', () => {
    render(<DashboardHarness />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByText('REAL LIFE')).not.toBeInTheDocument()
    expect(screen.getByText(/每度过完整的 10 分钟/u)).toHaveTextContent('1🍎')
    expect(screen.getByRole('tab', { name: /数据/u })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('数据区域内容')).toBeVisible()
    expect(screen.getByText('工作区域内容')).not.toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: /唱片机/u }))

    expect(screen.getByRole('tab', { name: /唱片机/u })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('唱片机区域内容')).toBeVisible()
  })

  it('标签支持方向键循环移动焦点并切换受控面板', () => {
    render(<DashboardHarness />)
    const dataTab = screen.getByRole('tab', { name: /数据/u })
    dataTab.focus()

    fireEvent.keyDown(dataTab, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: /工作/u })).toHaveFocus()
    expect(screen.getByText('工作区域内容')).toBeVisible()
  })
})

describe('DataPanel', () => {
  it('按现实玩法文案展示刷播、冲热与沉浸式使用方法提示，并提供固定运行组外链', () => {
    const onGroupLinkClick = vi.fn()
    const { container } = render(<DataPanel onGroupLinkClick={onGroupLinkClick} />)

    expect(screen.getByRole('heading', { name: '认真刷播' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '全力冲热' })).toBeVisible()
    expect(screen.getByText('在该页面中直接开始刷播（无需但是建议加入运行组）')).toBeVisible()
    expect(
      screen.getByText('在该页面中启动冲热任务（需要加入运行组，与最新版插件配合使用）'),
    ).toBeVisible()
    expect(screen.getAllByText('使用方法')).toHaveLength(2)
    expect(screen.getAllByText('具体步骤很快会补到这里。')).toHaveLength(2)
    expect(
      screen.queryByText(/网页不会|不计算苹果|外部状态|功能占位|待后续开发/u),
    ).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: /打开运行组页面/u })
    expect(link).toHaveAttribute('href', 'https://www.weibo.com/u/7878664767')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    fireEvent.click(link)
    expect(onGroupLinkClick).toHaveBeenCalledOnce()
    expect(container.querySelector('select')).toBeNull()
  })

  it('展示通过属性传入的当前状态', () => {
    render(
      <DataPanel
        stream={{ statusLabel: '运行中', detail: '运行组返回的刷播说明' }}
        trend={{ statusLabel: '等待开始', detail: '运行组返回的冲热说明' }}
      />,
    )

    expect(screen.getByText('运行中')).toBeVisible()
    expect(screen.getByText('运行组返回的刷播说明')).toBeVisible()
    expect(screen.getByText('等待开始')).toBeVisible()
  })
})
