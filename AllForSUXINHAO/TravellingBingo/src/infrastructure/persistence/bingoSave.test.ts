import { webcrypto } from 'node:crypto'

import { z } from 'zod'

import {
  BINGO_SAVE_FORMAT,
  BINGO_SAVE_MIME_TYPE,
  BINGO_SAVE_SCHEMA_VERSION,
  BingoSaveError,
  createBingoSave,
  createBingoSaveBlob,
  downloadBingoSave,
  importBingoSave,
  MAX_BINGO_SAVE_BYTES,
  stableStringify,
} from './bingoSave'

const payloadSchema = z.strictObject({
  playerName: z.string().min(1),
  apples: z.number().int().nonnegative(),
  settings: z.strictObject({
    music: z.boolean(),
  }),
})

const payload = {
  playerName: '信号灯',
  apples: 18,
  settings: { music: false },
}

const cryptoDependencies = { subtle: webcrypto.subtle }
const exportedAt = Date.UTC(2026, 7, 8, 8, 9, 10)

async function createValidSave() {
  return createBingoSave(
    {
      gameVersion: '0.1.0-demo',
      exportedAt,
      payload,
    },
    payloadSchema,
    cryptoDependencies,
  )
}

function expectBingoError(code: BingoSaveError['code']) {
  return expect.objectContaining({
    name: 'BingoSaveError',
    code,
    message: expect.any(String),
  })
}

describe('.bingo 存档持久化', () => {
  it('稳定排序所有对象键，同时保持数组顺序', () => {
    expect(
      stableStringify({
        z: [{ b: 2, a: 1 }],
        2: 'two',
        10: 'ten',
        a: { b: 2, a: 1 },
      }),
    ).toBe('{"10":"ten","2":"two","a":{"a":1,"b":2},"z":[{"a":1,"b":2}]}')
  })

  it('导出 UTF-8 规范 JSON、SHA-256 base64url 摘要和可读摘要', async () => {
    const exported = await createValidSave()
    const parsed = JSON.parse(exported.text) as Record<string, unknown>

    expect(exported.text).toContain('信号灯')
    expect(exported.byteLength).toBe(new TextEncoder().encode(exported.text).byteLength)
    expect(exported.fileName).toMatch(/^travelling-bingo-\d{8}-\d{6}\.bingo$/u)
    expect(parsed.format).toBe(BINGO_SAVE_FORMAT)
    expect(parsed.schemaVersion).toBe(BINGO_SAVE_SCHEMA_VERSION)
    expect(exported.save.integrity).toEqual({
      algorithm: 'SHA-256',
      digest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    })
    expect(exported.summary).toEqual({
      format: BINGO_SAVE_FORMAT,
      schemaVersion: BINGO_SAVE_SCHEMA_VERSION,
      gameVersion: '0.1.0-demo',
      exportedAt,
      exportedAtIso: new Date(exportedAt).toISOString(),
      byteLength: exported.byteLength,
      digest: exported.save.integrity.digest,
    })
  })

  it('有效存档往返后返回已校验 payload 与导入摘要', async () => {
    const exported = await createValidSave()
    const imported = await importBingoSave(exported.text, payloadSchema, cryptoDependencies)

    expect(imported.payload).toEqual(payload)
    expect(imported.save).toEqual(exported.save)
    expect(imported.summary.byteLength).toBe(exported.byteLength)
    expect(imported.summary.digest).toBe(exported.save.integrity.digest)
  })

  it('对象键顺序和空白变化不影响摘要验证', async () => {
    const exported = await createValidSave()
    const parsed = JSON.parse(exported.text) as Record<string, unknown>
    const reordered = JSON.stringify(
      {
        integrity: parsed.integrity,
        payload: parsed.payload,
        exportedAt: parsed.exportedAt,
        gameVersion: parsed.gameVersion,
        schemaVersion: parsed.schemaVersion,
        format: parsed.format,
      },
      null,
      2,
    )

    await expect(
      importBingoSave(reordered, payloadSchema, cryptoDependencies),
    ).resolves.toMatchObject({
      payload,
    })
  })

  it('拒绝内容被修改但摘要未更新的存档', async () => {
    const exported = await createValidSave()
    const parsed = JSON.parse(exported.text) as {
      payload: typeof payload
    }
    parsed.payload.apples += 1

    await expect(
      importBingoSave(stableStringify(parsed), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('INTEGRITY_MISMATCH'))
  })

  it('严格拒绝顶层及 payload 中的未知字段', async () => {
    const exported = await createValidSave()
    const withUnknownTopLevel = {
      ...(JSON.parse(exported.text) as Record<string, unknown>),
      unexpected: true,
    }
    const withUnknownPayload = JSON.parse(exported.text) as {
      payload: Record<string, unknown>
    }
    withUnknownPayload.payload.unexpected = true

    await expect(
      importBingoSave(stableStringify(withUnknownTopLevel), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('SCHEMA_INVALID'))
    await expect(
      importBingoSave(stableStringify(withUnknownPayload), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('SCHEMA_INVALID'))
  })

  it('明确拒绝未来版本和非本游戏格式', async () => {
    const exported = await createValidSave()
    const futureVersion = {
      ...(JSON.parse(exported.text) as Record<string, unknown>),
      schemaVersion: BINGO_SAVE_SCHEMA_VERSION + 1,
    }
    const wrongFormat = {
      ...(JSON.parse(exported.text) as Record<string, unknown>),
      format: 'other-game-save',
    }

    await expect(
      importBingoSave(stableStringify(futureVersion), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('FUTURE_VERSION'))
    await expect(
      importBingoSave(stableStringify(wrongFormat), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('INVALID_FORMAT'))
  })

  it('拒绝无效 UTF-8、无效 JSON 和超过 1 MiB 的文件', async () => {
    await expect(
      importBingoSave(new Uint8Array([0xc3, 0x28]), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('INVALID_UTF8'))
    await expect(importBingoSave('{', payloadSchema, cryptoDependencies)).rejects.toEqual(
      expectBingoError('INVALID_JSON'),
    )
    await expect(
      importBingoSave('好'.repeat(MAX_BINGO_SAVE_BYTES), payloadSchema, cryptoDependencies),
    ).rejects.toEqual(expectBingoError('FILE_TOO_LARGE'))

    const oversizedPayloadSchema = z.strictObject({ padding: z.string() })
    await expect(
      createBingoSave(
        {
          gameVersion: '0.1.0-demo',
          exportedAt,
          payload: { padding: 'a'.repeat(MAX_BINGO_SAVE_BYTES) },
        },
        oversizedPayloadSchema,
        cryptoDependencies,
      ),
    ).rejects.toEqual(expectBingoError('FILE_TOO_LARGE'))
  })

  it('创建正确 MIME 的 Blob，并通过可注入浏览器环境触发下载', async () => {
    const exported = await createValidSave()
    const blob = createBingoSaveBlob(exported.text)
    const createObjectURL = vi.fn(() => 'blob:travelling-bingo')
    const revokeObjectURL = vi.fn()
    const scheduleCleanup = vi.fn((callback: () => void) => callback())
    let clickedFileName = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedFileName = this.download
    })

    const downloadedBlob = downloadBingoSave(exported, {
      document,
      urlApi: { createObjectURL, revokeObjectURL },
      scheduleCleanup,
    })

    expect(blob.type).toBe(BINGO_SAVE_MIME_TYPE)
    expect(blob.size).toBe(exported.byteLength)
    expect(downloadedBlob.type).toBe(BINGO_SAVE_MIME_TYPE)
    expect(clickedFileName).toBe(exported.fileName)
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:travelling-bingo')
    expect(scheduleCleanup).toHaveBeenCalledOnce()
    click.mockRestore()
  })
})
