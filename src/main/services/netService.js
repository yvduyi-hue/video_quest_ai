/**
 * 通用网络请求服务（主进程）
 * 所有网络请求统一走这里：渲染进程通过 net:request IPC 传入
 * { url, method, params, json, headers }，响应数据在此统一规范化后返回。
 *
 * 统一响应格式：
 *   成功 -> { success: true, status: <http状态码>, data: <JSON解析后的响应体，非JSON时为原始文本> }
 *   失败 -> { success: false, error: <错误描述>, status?, data? }
 */
import requestUtil from '../api/requestUtil.js'
import { tryAcquire, isPolyvUrl } from './rateLimiter.js'

const METHODS = ['GET', 'POST', 'PUT', 'DELETE']

/**
 * 统一请求入口：参数校验 -> 发送请求 -> 规范化响应
 * @param {Object} options
 * @param {string} options.url 请求地址
 * @param {string} [options.method=GET] GET/POST/PUT/DELETE
 * @param {Object<string,string|number>} [options.params] 表单参数（GET 时作为查询参数）
 * @param {Object} [options.json] JSON 请求体（优先于 params）
 * @param {Object<string,string>} [options.headers] 请求头
 * @param {number} [options.timeout] 超时毫秒（缺省 10s），AI 生成等慢接口可传大值
 * @returns {Promise<Object>} 规范化响应
 */
export async function netRequest({
  url,
  method = 'GET',
  params = null,
  json = null,
  headers = null,
  timeout = null
}) {
  if (!url || typeof url !== 'string') {
    return { success: false, error: '请求地址为空' }
  }
  const m = String(method).toUpperCase()
  if (!METHODS.includes(m)) {
    return { success: false, error: `不支持的请求方法: ${method}` }
  }

  // 保利威接口频控：10 秒滑动窗口内最多 450 次；超限时不发送请求，
  // 放行时在此计数（后续无论成功/失败/异常都不回退），与官方限流口径一致
  if (isPolyvUrl(url)) {
    const quota = tryAcquire()
    if (!quota.allowed) {
      const sec = Math.ceil(quota.retryAfterMs / 1000)
      console.warn(`Polyv接口频控：10秒内已达450次，本次请求未发送，约 ${sec} 秒后可恢复`)
      return {
        success: false,
        error: `调用过于频繁：10秒内不能超过450次，请 ${sec} 秒后重试`,
        rateLimited: true,
        retryAfterMs: quota.retryAfterMs
      }
    }
  }

  const res = await requestUtil.invoke(url, m, params, json, headers, timeout)
  // invoke 重试一次后仍异常返回 null
  if (!res) {
    return { success: false, error: '请求失败' }
  }

  // 尝试按 JSON 解析响应体，失败则保留原始文本
  let data
  try {
    data = JSON.parse(res.body)
  } catch {
    data = res.body
  }

  if (!res.ok) {
    return {
      success: false,
      error: `HTTP ${res.status} ${res.statusText || ''}`.trim(),
      status: res.status,
      data
    }
  }
  return { success: true, status: res.status, data }
}
