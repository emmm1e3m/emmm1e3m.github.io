import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createInitialGameState } from '@/domain'

import { TaskBoard } from './TaskBoard'

describe('TaskBoard', () => {
  it('用勾号标记完成项，不重复显示完成叙述并保留无障碍进度', () => {
    const game = createInitialGameState({ now: 1_000, seed: 'task-board-copy' })
    game.tasks.active[0].progress = game.tasks.active[0].target

    const { container } = render(<TaskBoard game={game} />)
    const completedMarker = container.querySelector('.task-list li.is-complete .task-number')

    expect(completedMarker).toHaveTextContent('√')
    expect(completedMarker).not.toHaveTextContent('好')
    expect(screen.queryByText(/已经完成|收好啦/u)).not.toBeInTheDocument()
    expect(screen.getByLabelText('进度 已完成')).toBeInTheDocument()
  })
})
