/**
 * 视频时间码工具（主进程与渲染进程共用）
 *
 * 约定：只把真正的 MM:SS / HH:MM:SS 视为可跳转的时间点；
 * “段落2”“第3章”“12分30秒”等自然语言位置一律返回空字符串，
 * 由调用方决定是否回退到“按知识点匹配大纲”或只提供“回看视频”。
 */

// 先匹配 HH:MM:SS，再匹配 MM:SS；前后不能再接数字/冒号，避免从 "100:00" 中截出 "00:00"
const TIME_CODE_PATTERN = /(?<![\d:])(?:\d{1,2}:\d{1,2}:\d{2}|\d{1,2}:\d{2})(?![\d:])/g

/** 判断匹配到的时间码各段是否在合理范围（分钟允许 0-99，便于 90:00 这类长视频） */
function isReasonableTimeCode(code) {
  const parts = code.split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isInteger(n) || n < 0)) return false
  if (parts.length === 3) {
    const [hh, mm, ss] = parts
    return hh <= 99 && mm <= 59 && ss <= 59
  }
  if (parts.length === 2) {
    const [mm, ss] = parts
    return mm <= 99 && ss <= 59
  }
  return false
}

/**
 * 从任意文本中提取第一个合法时间码并原样返回（如 "00:12:30"、"12:30"）。
 * 找不到合法时间码时返回空字符串。
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function normalizeTimeCode(value) {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/：/g, ':').trim()
  if (!text) return ''
  const matches = text.match(TIME_CODE_PATTERN) || []
  for (const code of matches) {
    if (isReasonableTimeCode(code)) return code
  }
  return ''
}

/** 是否为可跳转的合法时间码 */
export function isValidTimeCode(value) {
  return normalizeTimeCode(value) !== ''
}

/**
 * 时间码转秒数；非法时间码返回 null（与“00:00 的 0 秒”区分开）。
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parseTimeCodeToSeconds(value) {
  const code = normalizeTimeCode(value)
  if (!code) return null
  const parts = code.split(':').map((p) => Number(p))
  if (parts.length === 3) {
    const [hh, mm, ss] = parts
    return hh * 3600 + mm * 60 + ss
  }
  const [mm, ss] = parts
  return mm * 60 + ss
}
