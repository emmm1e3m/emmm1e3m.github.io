import type { ChangeEvent } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite } from '@/components/MascotSprite'

export interface ImportPreview {
  fileName: string
  exportedAt: number
  gameVersion: string
  apples: number
  collectionCount: number
  activityLabel: string
  debug: boolean
}

interface TitleScreenProps {
  loading: boolean
  available: boolean
  error: string | null
  importPreview: ImportPreview | null
  debugUnlocked: boolean
  onStart: () => void
  onFile: (file: File) => void
  onConfirmImport: () => void
  onCancelImport: () => void
  onRetryCatalog: () => void
  onTitleActivate: () => void
}

function formatExportTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function TitleScreen({
  loading,
  available,
  error,
  importPreview,
  debugUnlocked,
  onStart,
  onFile,
  onConfirmImport,
  onCancelImport,
  onRetryCatalog,
  onTitleActivate,
}: TitleScreenProps) {
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (file) onFile(file)
    event.currentTarget.value = ''
  }

  return (
    <main className="title-page">
      <div className="title-page__grain" aria-hidden="true" />
      <section className="title-shell" aria-labelledby="game-title">
        <div className="title-copy">
          <p className="title-kicker">献给苏新皓与信号灯的离线收集游戏</p>
          <h1 className="title-heading" id="game-title" aria-label="旅行饼狗">
            <button
              className="title-logo"
              type="button"
              onClick={onTitleActivate}
              aria-label="旅行饼狗，连续激活五次可打开隐藏门牌"
            >
              <span className="title-logo__eyebrow">TRAVELLING BINGO</span>
              <span className="title-logo__main">旅行饼狗</span>
              <span className="title-logo__stroke" aria-hidden="true">
                旅行饼狗
              </span>
            </button>
          </h1>
          <p className="title-lede">
            把便当装进背包，陪饼狗从铲铲饼屋出发，把每一次喜欢都收进收藏墙。
          </p>

          {importPreview ? (
            <section className="import-card" aria-label="存档摘要">
              <div className="import-card__heading">
                <span className="paper-tag">找到一只回家的饼狗</span>
                {importPreview.debug && <span className="debug-chip">DEBUG</span>}
              </div>
              <strong>{importPreview.fileName}</strong>
              <dl>
                <div>
                  <dt>导出时间</dt>
                  <dd>{formatExportTime(importPreview.exportedAt)}</dd>
                </div>
                <div>
                  <dt>苹果</dt>
                  <dd>{importPreview.apples} 个</dd>
                </div>
                <div>
                  <dt>收藏</dt>
                  <dd>{importPreview.collectionCount} 件</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{importPreview.activityLabel}</dd>
                </div>
              </dl>
              <div className="button-row">
                <button
                  className="paper-button paper-button--primary"
                  type="button"
                  onClick={onConfirmImport}
                >
                  带它回家
                </button>
                <button className="paper-button" type="button" onClick={onCancelImport}>
                  换一个文件
                </button>
              </div>
            </section>
          ) : (
            <div className="title-actions">
              <button
                className="paper-button paper-button--primary paper-button--large"
                type="button"
                disabled={loading || !available}
                onClick={onStart}
              >
                {loading ? '正在整理收藏墙…' : available ? '开始新旅程' : '收藏目录暂不可用'}
              </button>
              <label
                className="paper-button paper-button--large"
                aria-disabled={loading || !available}
              >
                读取 .bingo 存档
                <input
                  className="visually-hidden"
                  type="file"
                  accept=".bingo,application/octet-stream,application/json"
                  disabled={loading || !available}
                  onChange={handleFile}
                />
              </label>
            </div>
          )}

          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {!available && !loading && error && (
            <button className="paper-button retry-button" type="button" onClick={onRetryCatalog}>
              重新整理收藏目录
            </button>
          )}
          <p className="save-promise">
            <span aria-hidden="true">🎒</span> 存档只在你手里，不上传、不登录。
          </p>
          <div className="title-meta">
            <span>Demo 0.1</span>
            <span>TOP 登陆少年 C 位 · 唯一 ACE 苏新皓</span>
            {debugUnlocked && <span className="debug-chip">DEBUG 已解锁</span>}
          </div>
        </div>

        <div className="title-visual" aria-label="铲铲饼屋预览">
          <picture>
            <source
              srcSet={`${publicAsset('assets/game/chan-chan-house-960.webp')} 960w, ${publicAsset('assets/game/chan-chan-house-1536.webp')} 1536w`}
              sizes="(max-width: 900px) 100vw, 58vw"
            />
            <img
              src={publicAsset('assets/game/chan-chan-house-960.webp')}
              alt="阳光下的两层铲铲饼屋"
              width="960"
              height="640"
            />
          </picture>
          <MascotSprite pose="idle" className="title-mascot" />
          <span className="title-sticker title-sticker--one">72 min</span>
          <span className="title-sticker title-sticker--two">🍎 出发！</span>
        </div>
      </section>
      <footer className="title-footer">
        非官方、非商业粉丝作品 · 所有游戏素材均按授权口径使用
      </footer>
    </main>
  )
}
