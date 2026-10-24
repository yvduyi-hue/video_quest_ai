/**
 * HTTP 请求工具类（参考 Java 版 RequestUtil 设计，基于 axios 实现）
 *
 * 与 Java 版对应关系：
 * - OkHttpClient 连接池/超时  ->  axios 实例 + keepAlive Agent（连接 5s，读写 10s）
 * - invoke 失败重试一次        ->  isRetry 参数控制重试一次
 * - Map<String,String> params  ->  普通对象（键值均为字符串，表单体/查询参数）
 * - JSONObject jsonObject      ->  任意可序列化对象（JSON 请求体）
 * - okhttp3.Response           ->  { status, statusText, ok, headers, body, data() }
 */
import axios from 'axios'
import http from 'http'
import https from 'https'

export const GET = 'GET'
export const POST = 'POST'
export const DELETE = 'DELETE'
export const PUT = 'PUT'

// 对应 Java: connectTimeout(5s) / readTimeout(10s) / writeTimeout(10s) + ConnectionPool keepAlive
const instance = axios.create({
  timeout: 10000,
  httpAgent: new http.Agent({ keepAlive: true, timeout: 5000 }),
  httpsAgent: new https.Agent({ keepAlive: true, timeout: 5000 }),
  // 与 okhttp 行为一致：状态码不抛异常，由调用方自行判断
  validateStatus: () => true,
  responseType: 'text',
  responseEncoding: 'utf8'
})

/**
 * 通用请求入口
 * @param {string} url 请求地址
 * @param {string} method GET/POST/PUT/DELETE
 * @param {Object<string,string>} [params] 表单参数（application/x-www-form-urlencoded），GET 时作为查询参数
 * @param {Object} [json] JSON 请求体（application/json），优先级高于 params
 * @param {Object<string,string>} [headers] 请求头
 * @param {number} [timeout] 单次请求超时（毫秒），缺省沿用实例的 10s；AI 生成等慢接口可传大值
 * @param {boolean} [isRetry] 内部使用：是否已经重试过
 * @returns {Promise<Object|null>} 响应对象，失败（重试后仍异常）返回 null
 */
export async function invoke(
  url,
  method,
  params = null,
  json = null,
  headers = null,
  timeout = null,
  isRetry = false
) {
  try {
    const config = {
      url,
      method: method.toLowerCase(),
      headers: { ...(headers || {}) }
    }
    // 显式传入超时则覆盖实例默认（AI 生成大纲等长耗时接口需要更长的读超时）
    if (typeof timeout === 'number' && timeout > 0) config.timeout = timeout

    if (json != null) {
      config.headers['Content-Type'] = 'application/json; charset=utf-8'
      config.data = json
    } else if (params != null) {
      if (method === GET) {
        config.params = params
      } else {
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded'
        config.data = new URLSearchParams(params).toString()
      }
    }

    const res = await instance.request(config)
    // 模拟 okhttp Response：body 惰性读取
    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.status >= 200 && res.status < 300,
      headers: res.headers,
      body: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
      data() {
        return this.body
      },
      close() {}
    }
  } catch (e) {
    // 对应 Java：异常时重试一次，仍失败返回 null
    if (!isRetry) {
      return invoke(url, method, params, json, headers, timeout, true)
    }
    console.error(`请求失败: ${method} ${url}`, e.message)
    return null
  }
}

export function get(url, headers = null) {
  return invoke(url, GET, null, null, headers)
}

export function getWithParams(url, params, headers = null) {
  return invoke(url, GET, params, null, headers)
}

/** POST：data 为字符串值对象时按表单发送，否则按 JSON 发送 */
export function post(url, data = null, headers = null) {
  if (data != null && !isFormParams(data)) {
    return invoke(url, POST, null, data, headers)
  }
  return invoke(url, POST, data, null, headers)
}

export function put(url, data = null, headers = null) {
  if (data != null && !isFormParams(data)) {
    return invoke(url, PUT, null, data, headers)
  }
  return invoke(url, PUT, data, null, headers)
}

export function del(url, data = null, headers = null) {
  if (data != null && !isFormParams(data)) {
    return invoke(url, DELETE, null, data, headers)
  }
  return invoke(url, DELETE, data, null, headers)
}

// 所有值都是字符串/数字则视为表单参数，否则视为 JSON 体
function isFormParams(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false
  return Object.values(obj).every((v) => typeof v === 'string' || typeof v === 'number')
}

const requestUtil = { GET, POST, PUT, DELETE, invoke, get, getWithParams, post, put, delete: del }

export default requestUtil
