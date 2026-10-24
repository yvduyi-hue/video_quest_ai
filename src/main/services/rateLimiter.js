/**
 * 保利威接口调用频率限制（主进程）
 *
 * 规则：滑动窗口 10 秒内最多 450 次调用；请求实际发出时计数（无论成功还是失败都 +1），
 * 窗口内已达 450 次则本次不发送请求，需等待最早一次调用滑出 10 秒窗口后再试。
 *
 * 覆盖范围：所有走 netRequest 且命中 isPolyvUrl 的请求 ——
 * v2 OpenAPI（PolyvClient send=netRequest）、v4 智能字幕（smartSubtitle）、注册 addCate 等。
 * 在 netService 入口统一拦截，新增 Polyv 调用点无需再接入。
 */
const WINDOW_MS = 10_000
const MAX_CALLS = 450

// 窗口内每次成功领取额度的时间戳（升序），超出窗口的从队首剔除
const callTimestamps = []

/**
 * 申请一次调用额度：滑动窗口计数，未超限则立即记录本次调用（计数+1）
 * @returns {{allowed: true} | {allowed: false, retryAfterMs: number}}
 *   被拒时不计数，retryAfterMs 为最早一次调用滑出窗口、恢复可发送的等待毫秒数
 */
export function tryAcquire() {
  const now = Date.now()
  // 剔除滑出窗口的旧记录，剩下的都是最近 10 秒内的调用
  while (callTimestamps.length && now - callTimestamps[0] >= WINDOW_MS) {
    callTimestamps.shift()
  }
  if (callTimestamps.length >= MAX_CALLS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - callTimestamps[0]) }
  }
  callTimestamps.push(now)
  return { allowed: true }
}

/** Polyv 接口域名判断（v2 OpenAPI / v4 智能字幕均为 api.polyv.net） */
export function isPolyvUrl(url) {
  return /\/\/api\.polyv\.net\//i.test(String(url || ''))
}
