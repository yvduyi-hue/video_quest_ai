/**
 * Polyv（保利威）点播 API 客户端（参考 Java 版 PolyvClient 设计，基于 axios 实现）
 *
 * 与 Java 版对应关系：
 * - ServerConfig.getPolyv()          ->  构造参数 polyvConfig 对象
 * - VodSignUtil.getSign(params, key)  ->  getSign(params, secretKey)（crypto-js SHA1）
 * - RequestUtil.get/post/put/delete   ->  requestUtil 中对应方法
 * - PolyvResponse                      ->  统一的 { isSuccess, code, status, message, originData }
 * - format(endpoint, args)             ->  format(endpoint, args)（{p} 占位符按顺序替换 + 凭证替换）
 *
 * 说明：签名按保利威官方 SHA1 签名生成规则实现：
 * 参数值非空的参数按参数名字典序排序，以 key=value&key=value 拼接，
 * 尾部追加 secretKey，计算 SHA1（UTF-8）后转大写。
 */
import CryptoJS from 'crypto-js'
import requestUtil from './requestUtil.js'

/**
 * 生成 Polyv 签名（官方 SHA1 签名生成规则）
 * 1. 剔除 sign 与空值参数，按参数名字典序排序
 * 2. key=value&key=value 拼接，尾部追加 secretKey（UTF-8）
 * 3. SHA1 结果转大写
 * @param {Object<string,string>} params 请求参数（含 userid/ptime，不含 sign）
 * @param {string} secretKey 密钥
 * @returns {string} 大写 SHA1 签名
 */
export function getSign(params, secretKey) {
  const queryStr = Object.keys(params)
    .filter(
      (k) => k !== 'sign' && params[k] !== null && params[k] !== undefined && params[k] !== ''
    )
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')

  const raw = `${queryStr}${secretKey}`
  return CryptoJS.SHA1(CryptoJS.enc.Utf8.parse(raw)).toString(CryptoJS.enc.Hex).toUpperCase()
}

/** Polyv 响应包装，等价于 Java 的 PolyvResponse */
function buildResponse({ isSuccess, code, status, message, originData }) {
  return { isSuccess, code, status, message, originData }
}

class PolyvClient {
  /**
   * @param {Object} polyvConfig Polyv 配置
   * @param {string} polyvConfig.userId
   * @param {string} polyvConfig.writeToken
   * @param {string} polyvConfig.readToken
   * @param {string} polyvConfig.secretKey
   * @param {string} polyvConfig.appId
   * @param {string} polyvConfig.appSecret
   * @param {string} [polyvConfig.baseUrl] 接口域名前缀，如 https://api.vodpolyv.com
   * @param {Function} [polyvConfig.send] 可选：注入统一发送函数（如主进程 netRequest），缺省用 requestUtil
   */
  constructor(polyvConfig = {}) {
    this.config = polyvConfig
    this.send = typeof polyvConfig.send === 'function' ? polyvConfig.send : null
  }

  get(endpoint, params, options) {
    return this.invoke(
      this.format(endpoint, options && options.formatArgs),
      requestUtil.GET,
      params,
      options
    )
  }

  post(endpoint, params, options) {
    return this.invoke(
      this.format(endpoint, options && options.formatArgs),
      requestUtil.POST,
      params,
      options
    )
  }

  put(endpoint, params, options) {
    return this.invoke(
      this.format(endpoint, options && options.formatArgs),
      requestUtil.PUT,
      params,
      options
    )
  }

  delete(endpoint, params, options) {
    return this.invoke(
      this.format(endpoint, options && options.formatArgs),
      requestUtil.DELETE,
      params,
      options
    )
  }

  /**
   * 统一调用：加时间戳与签名 -> 拼 query -> 发请求 -> 包装响应
   * @param {string} endpoint 接口路径（可含 {p} 及凭证占位符）或完整 URL
   * @param {string} method requestUtil.GET/POST/PUT/DELETE
   * @param {Object<string,string>} [params] 业务参数
   * @param {Object} [options] 调用选项
   * @param {string[]} [options.signExclude] 不参与签名但仍随请求发送的参数名（如 cataJson 的 cataid）
   */
  async invoke(endpoint, method, params, options = {}) {
    const url = this.resolveUrl(endpoint)
    const requestParams = { ...(params || {}), ptime: String(Date.now()) }

    // 公共参数 userid：参与签名并随请求发送（官方签名规则要求）
    if (!requestParams.userid && this.config.userId) {
      requestParams.userid = this.config.userId
    }

    // 部分端点要求某些业务参数不参与签名（如 cataJson：ptime 参与、cataid 不参与），
    // 从签名参数集中剔除这些 key，但它们仍保留在 requestParams 中随请求发送
    const exclude = options.signExclude || []
    const signParams = { ...requestParams }
    for (const k of exclude) delete signParams[k]

    let sign
    try {
      sign = getSign(signParams, this.config.secretKey)
    } catch (e) {
      console.error('获取Polyv签名失败', e)
      return null
    }
    requestParams.sign = sign

    // 与 Java 一致：GET 走 url?query；其余 method 用原始 params 作表单体，签名拼在 url 上
    const query = Object.entries(requestParams)
      .map(([k, v]) => `${urlEncode(k)}=${urlEncode(v)}`)
      .join('&')
    const signedUrl = url.includes('?') ? `${url}&${query}` : `${url}?${query}`

    let response
    if (this.send) {
      // 统一发送函数（如 netRequest）：约定返回 { success, status, data, error }
      // 与 Java 一致：非 GET 时原始 params 仍作为表单体随签名 URL 发送
      const res = await this.send(
        method === requestUtil.GET
          ? { url: signedUrl, method }
          : { url: signedUrl, method, params: params || {} }
      )
      if (!res || !res.success) {
        console.error('Polyv接口调用失败:', res && res.error)
        return null
      }
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? null)
      response = { ok: true, status: res.status, body }
    } else {
      switch (method) {
        case requestUtil.GET:
          response = await requestUtil.get(signedUrl)
          break
        case requestUtil.POST:
          response = await requestUtil.post(signedUrl, params || {})
          break
        case requestUtil.PUT:
          response = await requestUtil.put(signedUrl, params || {})
          break
        case requestUtil.DELETE:
          response = await requestUtil.delete(signedUrl, params || {})
          break
        default:
          throw new Error(`Unsupported method: ${method}`)
      }
    }

    if (response == null) {
      console.error('Polyv接口调用失败，响应为空')
      return null
    }

    const polyvResponse = response.body
    if (!polyvResponse) {
      console.error('Polyv接口调用失败，响应为空')
      return null
    }

    let responseJson
    try {
      responseJson = JSON.parse(polyvResponse)
    } catch {
      console.error('Polyv接口调用失败，响应值不为JSON')
      return null
    }
    if (typeof responseJson !== 'object' || responseJson === null || Array.isArray(responseJson)) {
      console.error('Polyv接口调用失败，响应值不为JSON')
      return null
    }

    if (!Object.prototype.hasOwnProperty.call(responseJson, 'code')) {
      return buildResponse({
        isSuccess: false,
        code: -1,
        status: 'error',
        message: 'Polyv接口调用失败，响应值不包含code字段',
        originData: responseJson
      })
    }

    const code = Number(responseJson.code)
    if (code === 200) {
      return buildResponse({
        isSuccess: true,
        code,
        status: 'success',
        message: responseJson.message,
        originData: responseJson
      })
    }
    if (code === 500) {
      return buildResponse({
        isSuccess: false,
        code,
        status: 'fail',
        message: responseJson.message,
        originData: responseJson
      })
    }
    return buildResponse({
      isSuccess: false,
      code,
      status: 'error',
      message: responseJson.message,
      originData: null
    })
  }

  resolveUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) return endpoint
    const base = this.config.baseUrl || ''
    if (!base) return endpoint
    return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`
  }

  /**
   * 替换凭证占位符 + {p} 位置参数，等价 Java format()
   * @param {string} endpoint
   * @param {string[]} args
   */
  format(endpoint, args) {
    // 与 Java String.replace 一致：全量替换凭证占位符
    let result = String(endpoint)
      .replaceAll('{user_id}', this.config.userId ?? '')
      .replaceAll('{write_token}', this.config.writeToken ?? '')
      .replaceAll('{read_token}', this.config.readToken ?? '')
      .replaceAll('{secret_key}', this.config.secretKey ?? '')
      .replaceAll('{app_id}', this.config.appId ?? '')
      .replaceAll('{app_secret}', this.config.appSecret ?? '')

    if (!args || args.length === 0) return result

    let argIndex = 0
    let placeholderIndex = 0
    while (
      (placeholderIndex = result.indexOf('{p}', placeholderIndex)) !== -1 &&
      argIndex < args.length
    ) {
      const replacement = String(args[argIndex])
      result = result.slice(0, placeholderIndex) + replacement + result.slice(placeholderIndex + 3)
      placeholderIndex += replacement.length
      argIndex++
    }
    return result
  }
}

function urlEncode(s) {
  if (s === null || s === undefined) return ''
  return encodeURIComponent(String(s))
}

export default PolyvClient
