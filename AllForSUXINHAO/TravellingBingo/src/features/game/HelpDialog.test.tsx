import { fireEvent, render, screen } from '@testing-library/react'

import { HelpDialog } from './HelpDialog'

describe('HelpDialog', () => {
  it('使用介绍角标并保留明确的取消后果说明', () => {
    const onClose = vi.fn()

    render(<HelpDialog open onClose={onClose} />)

    expect(screen.getByText(/铲铲饼屋的小纸条/u)).toHaveTextContent('ℹ️铲铲饼屋的小纸条')
    expect(screen.getByText(/点房间空白处可以查看当前任务和饼狗的兴趣。/u)).toBeVisible()
    expect(screen.getByText('中途取消不会增加天数，带出的补给也不会退回。')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '知道啦' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
