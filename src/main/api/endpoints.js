/**
 * Polyv 接口端点（对应 Java 版 PolyvEndpoint.java）
 *
 * 端点中的 {user_id} 等凭证占位符会在 PolyvClient.format() 中自动替换，
 * {p} 为位置参数占位符。
 *
 * 用法：
 *   import { polyv, endpoints } from '../api'
 *   await polyv.post(endpoints.addCate, { cataName: '分类名' })
 *   await polyv.get(endpoints.searchVideo, { pageNum: '1', pageSize: '20' })
 */
const BASE_URL = 'https://api.polyv.net'

// 创建分类
export const addCate = BASE_URL + '/v2/video/{user_id}/addCata'

// 删除分类（{user_id} 由 PolyvClient.format() 替换，cataid 作为请求参数传入并参与签名）
export const deleteCata = BASE_URL + '/v2/video/{user_id}/deleteCata'

// 删除视频（vids 逗号分隔批量，最多 500 个；userid/ptime/vids 均参与签名）
export const delVideos = BASE_URL + '/v2/video/del-videos'

// 搜索视频
export const searchVideo = BASE_URL + '/v2/video/search-videos'

// 查询视频详情（{user_id} 由 PolyvClient.format() 替换，vid 作为请求参数传入，支持逗号分隔最多 100 个）
export const getVideoInfo = BASE_URL + '/v2/video/{user_id}/get-video-info'

// 修改视频信息（{user_id} 由 format 替换；vid 必填，title/tag/describ 选填，业务参数均参与签名）
export const updateVideoInfo = BASE_URL + '/v2/video/{user_id}/video-info'

// 移动视频到指定分类（{user_id} 由 format 替换；vids 逗号分隔、cataid 目标分类，与 userid/ptime 一同参与签名）
export const changeCata = BASE_URL + '/v2/video/{user_id}/changeCata'

// 查询账号的空间流量使用
export const userSpaceInfo = BASE_URL + '/v2/user/{user_id}/main'

// 获取分类及子分类（{user_id} 由 PolyvClient.format() 替换，cataid 作为请求参数传入）
export const getUserCateContent = BASE_URL + '/v2/video/{user_id}/cataJson'

export const polyvEndpoints = {
  BASE_URL,
  addCate,
  deleteCata,
  delVideos,
  searchVideo,
  getVideoInfo,
  updateVideoInfo,
  changeCata,
  userSpaceInfo,
  getUserCateContent
}

export default polyvEndpoints
