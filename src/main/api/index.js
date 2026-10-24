/**
 * 统一出口：导出可直接调用的方法
 *
 * 用法：
 *   import { get, post, polyv, PolyvClient } from '@/main/api'  (按你的别名调整)
 *   await get('https://example.com/api')
 *   await polyv.get('/some/endpoint/{p}', { pageNum: '1' }, 'vid_xxx')
 */
import requestUtil, { GET, POST, PUT, DELETE } from './requestUtil.js'
import PolyvClient from './polyvClient.js'
import polyvConfig from './config.js'
import polyvEndpoints, { addCate, searchVideo, getVideoInfo } from './endpoints.js'

// ---- HTTP 直接可用方法 ----
export const get = requestUtil.get
export const getWithParams = requestUtil.getWithParams
export const post = requestUtil.post
export const put = requestUtil.put
export const del = requestUtil.delete
export const invoke = requestUtil.invoke

// ---- Polyv 直接可用方法（使用 config.js 中的默认配置实例化）----
// 注意：该实例走的是全局 config.json 凭证，不感知登录会话；
// 需要按登录用户绑定的凭证请求时，请用 session.js 的 getPolyvCreds() 自行构造 PolyvClient
export const polyv = new PolyvClient(polyvConfig)

/** 需要多账号/自定义配置时，用工厂方法创建独立客户端 */
export function createPolyvClient(config) {
  return new PolyvClient(config)
}

export { PolyvClient, requestUtil, polyvConfig, GET, POST, PUT, DELETE }

const endpoints = polyvEndpoints
export { polyvEndpoints, endpoints, addCate, searchVideo, getVideoInfo }

export default {
  get,
  getWithParams,
  post,
  put,
  del,
  invoke,
  polyv,
  createPolyvClient,
  endpoints
}
