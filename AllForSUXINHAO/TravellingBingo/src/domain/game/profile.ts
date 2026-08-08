export const MIN_DISPLAY_NAME_LENGTH = 1
export const MAX_DISPLAY_NAME_LENGTH = 16

/** 按 Unicode code point 计数；先 trim，避免仅由空白构成的名字进入存档。 */
export function normalizeDisplayName(value: string): string {
  const normalized = value.trim()
  const length = [...normalized].length
  if (length < MIN_DISPLAY_NAME_LENGTH || length > MAX_DISPLAY_NAME_LENGTH) {
    throw new RangeError(
      `用户名必须包含 ${MIN_DISPLAY_NAME_LENGTH}–${MAX_DISPLAY_NAME_LENGTH} 个字符`,
    )
  }
  return normalized
}

export function isValidDisplayName(value: string): boolean {
  try {
    return normalizeDisplayName(value) === value
  } catch {
    return false
  }
}
