/**
 * 主进程登录会话与 Polyv 凭证解析
 *
 * 注册时把当时生效的 Polyv 凭证（除 AI 模型配置外）写入 sqlite user 表的 polyv_* 列，
 * 与该账号永久绑定；登录成功后载入本模块的内存会话，退出登录即清空。
 *
 * 之后所有 Polyv 接口都通过 getPolyvCreds() 取凭证，保证多账号之间不会串用密钥；
 * 未登录阶段（设置向导、注册）没有会话，此时回落到 config.json / 环境变量中的全局凭证。
 */
import { polyvConfig } from './config.js'

/** 凭证字段名（与 PolyvClient.config 一致）-> user 表列名 */
export const POLYV_CRED_COLUMNS = {
  baseUrl: 'polyv_base_url',
  userId: 'polyv_user_id',
  secretKey: 'polyv_secret_key',
  writeToken: 'polyv_write_token',
  readToken: 'polyv_read_token',
  appId: 'polyv_app_id',
  appSecret: 'polyv_app_secret'
}

/**
 * user 表行 -> 凭证对象
 * @param {Object} row sqlite 查出的 user 行
 */
export function credsFromRow(row = {}) {
  const creds = {}
  for (const [key, column] of Object.entries(POLYV_CRED_COLUMNS)) {
    creds[key] = row[column] ?? ''
  }
  return creds
}

/**
 * 凭证对象 -> user 表列值对象（用于 INSERT / UPDATE），缺省字段写空串
 * @param {Object} creds 凭证对象
 */
export function credsToColumns(creds = {}) {
  const columns = {}
  for (const [key, column] of Object.entries(POLYV_CRED_COLUMNS)) {
    columns[column] = creds[key] ?? ''
  }
  return columns
}

// 当前会话：{ user: 登录用户信息（不含密钥）, polyv: 该用户绑定的 Polyv 凭证 }
let session = null

/** 登录成功后写入会话 */
export function setSession(next) {
  session = next || null
}

/** 读取当前会话（未登录为 null） */
export function getSession() {
  return session
}

/** 退出登录：清空内存会话 */
export function clearSession() {
  session = null
}

/**
 * 当前生效的 Polyv 凭证。
 * 登录会话中的绑定凭证优先；会话缺失（未登录）或某字段为空（老库用户未绑定）时，
 * 逐字段回落 config.json / 环境变量，保证设置向导与注册流程可用。
 * @returns {Object} 含 baseUrl/userId/secretKey/writeToken/readToken/appId/appSecret 的凭证对象
 */
export function getPolyvCreds() {
  const merged = { ...polyvConfig }
  const bound = session?.polyv
  if (!bound) return merged
  for (const key of Object.keys(POLYV_CRED_COLUMNS)) {
    if (bound[key]) merged[key] = bound[key]
  }
  return merged
}

export default { credsFromRow, credsToColumns, setSession, getSession, clearSession, getPolyvCreds }
