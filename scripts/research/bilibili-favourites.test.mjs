import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  FAVOURITE_SOURCES,
  parseArguments,
  parseFavouriteText,
  validateFavouriteFiles,
} from './sync-bilibili-favourites.mjs'

test('只发布两个指定收藏夹的静态 BV 清单', async () => {
  assert.deepEqual(
    FAVOURITE_SOURCES.map(({ id }) => id),
    [3682220021, 3986840044],
  )
  const results = await validateFavouriteFiles()
  assert.equal(results.length, 2)
  for (const { source, bvids } of results) {
    assert.ok(bvids.length > 0, `${source.id}.txt 不能为空`)
    assert.equal(new Set(bvids).size, bvids.length)
    assert.equal(await readFile(source.path, 'utf8'), `${bvids.join('\n')}\n`)
  }
})

test('静态清单拒绝空文件、非法 BV、重复项和非 LF 结尾', () => {
  const source = FAVOURITE_SOURCES[0]
  assert.throws(() => parseFavouriteText('', source), /末尾必须有换行/u)
  assert.throws(() => parseFavouriteText('\n', source), /不能为空/u)
  assert.throws(() => parseFavouriteText('BV-invalid\n', source), /不是有效 BV 号/u)
  assert.throws(() => parseFavouriteText('BV1xx411c7mD\nBV1xx411c7mD\n', source), /重复/u)
  assert.throws(() => parseFavouriteText('BV1xx411c7mD\r\n', source), /LF 换行/u)
})

test('只有显式 --refresh 才联网刷新收藏夹', () => {
  assert.deepEqual(parseArguments([]), { refresh: false })
  assert.deepEqual(parseArguments(['--refresh']), { refresh: true })
  assert.throws(() => parseArguments(['--online']), /未知参数/u)
})
