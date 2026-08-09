import { fireEvent, render, screen } from '@testing-library/react'

import { HelpDialog } from './HelpDialog'

describe('HelpDialog', () => {
  it('使用介绍角标并保留明确的取消后果说明', () => {
    const onClose = vi.fn()

    render(<HelpDialog open onClose={onClose} />)

    expect(screen.getByText('铲铲饼屋的小纸条')).toBeVisible()
    expect(screen.getByText(/点房间空白处可以查看当前任务和饼狗的兴趣。/u)).toBeVisible()
    expect(screen.getByText('中途取消不会增加天数，带出的补给也不会退回。')).toBeVisible()
    expect(screen.getByRole('heading', { name: '收藏记忆' })).toBeVisible()
    expect(
      screen.getByText(
        '完成任务会得到🍎；🍎可以向冰箱中补充道具。和饼狗留下的记忆会被保存在收藏墙。',
      ),
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '知道啦' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('现实维度沿用饼屋小纸条标题并简要介绍两种用途', () => {
    render(<HelpDialog open world="reality" onClose={vi.fn()} />)

    expect(screen.getByText('铲铲饼屋的小纸条')).toBeVisible()
    expect(screen.getByText('既可以刷播与冲热，也可以为工作与学习计时。')).toBeVisible()
    expect(
      screen.getByText(
        '每10分钟可以积攒1🍎。回到饼屋时，请确认现实里的事情是否认真完成。认真完成会带回全部苹果，否则只带回一半。',
      ),
    ).toBeVisible()
    expect(screen.queryByText('现实维度的小纸条')).not.toBeInTheDocument()
  })
})
