/**
 * 持久计数器采用饱和递增：到达安全整数上限后保持上限，避免下一次成功事件
 * 生成无法再次导出的状态。
 */
export function saturatingAddSafeCounter(value: number, increment: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(increment) ||
    increment < 0
  ) {
    throw new RangeError('持久计数器及增量必须是非负安全整数')
  }
  return increment > Number.MAX_SAFE_INTEGER - value ? Number.MAX_SAFE_INTEGER : value + increment
}

export function incrementSafeCounter(value: number): number {
  return saturatingAddSafeCounter(value, 1)
}
