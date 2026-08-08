import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import type { CollectibleItem, ContentCatalog } from '@/content'
import { createInitialGameState, type GameState } from '@/domain'

import { GameHome, type PanelId } from './GameHome'

const postcard = {
  id: 'postcard-2025-01-0001',
  category: 'postcard',
  title: '测试明信片',
  alt: '测试明信片照片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/test.webp',
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/postcard' },
} as unknown as CollectibleItem

const catalog: ContentCatalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
}

function collectedGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'album-modal-test', debug: false })
  return {
    ...game,
    collections: {
      [postcard.id]: {
        id: postcard.id,
        firstObtainedAt: 1_000,
        duplicateCount: 0,
      },
    },
  }
}

function GameHarness() {
  const [panel, setPanel] = useState<PanelId>('status')
  return (
    <GameHome
      game={collectedGame()}
      catalog={catalog}
      now={1_000}
      panel={panel}
      dirty
      debugDurationMs={10_000}
      reward={null}
      onPanel={setPanel}
      onAction={vi.fn()}
      onExit={vi.fn()}
      onBackup={vi.fn()}
      onDebugDuration={vi.fn()}
      onDismissReward={vi.fn()}
    />
  )
}

async function openAlbum() {
  const opener = screen.getAllByRole('button', { name: '打开收藏墙' })[0]
  opener.focus()
  fireEvent.click(opener)
  const dialog = await screen.findByRole('dialog', { name: '一路捡到的喜欢' })
  const close = within(dialog).getByRole('button', { name: '关闭收藏墙' })
  await waitFor(() => expect(close).toHaveFocus())
  return { opener, dialog, close }
}

describe('收藏墙模态框', () => {
  it('圈定焦点、Escape 关闭并将焦点还给入口', async () => {
    const { container } = render(<GameHarness />)
    const { opener, dialog, close } = await openAlbum()
    const card = within(dialog).getByRole('button', { name: /测试明信片/u })
    const backgroundHeader = container.querySelector('.game-hud')

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(backgroundHeader).toHaveAttribute('inert')

    card.focus()
    fireEvent.keyDown(card, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(card).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
    expect(backgroundHeader).not.toHaveAttribute('inert')
  })

  it('详情打开时只圈定最上层焦点，关闭后回到原卡片', async () => {
    render(<GameHarness />)
    const { dialog } = await openAlbum()
    const card = within(dialog).getByRole('button', { name: /测试明信片/u })
    card.focus()
    fireEvent.click(card)

    const detail = await screen.findByRole('dialog', { name: '测试明信片' })
    const detailClose = within(detail).getByRole('button', { name: '关闭详情' })
    const sourceLink = within(detail).getByRole('link', { name: /查看素材来源/u })
    await waitFor(() => expect(detailClose).toHaveFocus())
    expect(dialog.querySelector('.album-header')).toHaveAttribute('inert')

    sourceLink.focus()
    fireEvent.keyDown(sourceLink, { key: 'Tab' })
    expect(detailClose).toHaveFocus()

    fireEvent.keyDown(detail, { key: 'Escape' })
    await waitFor(() => expect(detail).not.toBeInTheDocument())
    await waitFor(() => expect(card).toHaveFocus())
    expect(screen.getByRole('dialog', { name: '一路捡到的喜欢' })).toBeInTheDocument()
  })
})
