/**
 * 保利威智能字幕（v4 接口，主进程）
 *
 * 与既有 v2 OpenAPI 的 SHA1 签名不同，v4 走独立的 MD5 签名体系：
 * - 公共参数用 appId / timestamp（不是 userid / ptime），密钥用 appSecret
 * - sign = MD5(appSecret + 参数按 key 名字典序、以「参数名+参数值」直接拼接 + appSecret)，转 32 位大写
 *   （已用真实接口验证：create 仅对 URL 参数 appId+timestamp 签名，body 不参与；link 需带 vid）
 * - 有效期 30 分钟
 *
 * 本模块还负责本地 sqlite（smart_subtitle 表）的记录与「查询-则记录 / 无则创建」编排。
 */
import CryptoJS from 'crypto-js'
import { getPolyvCreds } from './session.js'
import { netRequest } from '../services/netService.js'
import { runSql, allSql, getSql } from '../services/dbService.js'
import { generateAndRecord, isOutlineRecorded } from './outlineService.js'

const CREATE_URL = 'https://api.polyv.net/vod/v4/smart-subtitle/create'
const LINK_URL = 'https://api.polyv.net/vod/v4/smart-subtitle/subtitle-link/get'
const GET_URL = 'https://api.polyv.net/vod/v4/smart-subtitle/get'

/** 字幕任务/生成状态 */
export const SUBTITLE_STATUS = {
  CREATING: 'creating', // 任务已建，字幕内容仍在生成（get 返回 56812）
  DONE: 'done' // 字幕已生成（get 返回成功）
}

// get 接口错误码：任务不存在/已删除，需重建；字幕生成中
const ERR_TASK_NOT_FOUND = 56810
const ERR_TASK_GENERATING = 56812

/** 参与签名的参数：剔除空值，按参数名字典序，以「参数名+参数值」直接拼接（无分隔符） */
function concatKV(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== null && params[k] !== undefined)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('')
}

/** 32 位大写 MD5 签名：appSecret 夹在拼接串两端 */
function md5Sign(signParams, appSecret) {
  const raw = `${appSecret}${concatKV(signParams)}${appSecret}`
  return CryptoJS.MD5(raw).toString(CryptoJS.enc.Hex).toUpperCase()
}

function credError() {
  const { appId, appSecret } = getPolyvCreds()
  if (!appId || !appSecret) {
    return { ok: false, errMsg: '未配置 AppID / AppSecret，请先在设置界面填写' }
  }
  return null
}

/** netRequest 响应里取业务 JSON（无论 HTTP 状态码，data 都是解析后的响应体） */
function pickBody(resp) {
  return resp && typeof resp.data === 'object' && resp.data !== null ? resp.data : null
}

function isSuccessBody(body) {
  return body && (body.success === true || Number(body.code) === 200)
}

/**
 * 查询视频字幕链接
 * @returns {Promise<{ok:boolean, list?:Array, errCode?:number, errMsg?:string}>}
 */
export async function querySubtitleLink(vid) {
  const credErr = credError()
  if (credErr) return credErr
  const { appId, appSecret } = getPolyvCreds()
  const timestamp = String(Date.now())
  const sign = md5Sign({ appId, timestamp, vid }, appSecret)
  const url =
    `${LINK_URL}?appId=${encodeURIComponent(appId)}` +
    `&timestamp=${timestamp}&vid=${encodeURIComponent(vid)}&sign=${sign}`
  const resp = await netRequest({ url, method: 'GET' })
  const body = pickBody(resp)
  if (!body) return { ok: false, errMsg: (resp && resp.error) || '查询字幕接口无响应' }
  if (isSuccessBody(body)) {
    return { ok: true, list: Array.isArray(body.data) ? body.data : [] }
  }
  return {
    ok: false,
    errCode: body.error?.code,
    errMsg: body.error?.desc || body.status || '查询字幕失败'
  }
}

/**
 * 创建智能字幕任务（不允许重复任务：repetitionEnabled=N）
 * @returns {Promise<{ok:boolean, taskId?:number, errCode?:number, errMsg?:string}>}
 */
export async function createSubtitleTask(
  vid,
  { language = 'chinese', autoApplyEnabled = 'Y' } = {}
) {
  const credErr = credError()
  if (credErr) return credErr
  const { appId, appSecret } = getPolyvCreds()
  const timestamp = String(Date.now())
  // 仅对 URL 参数 appId+timestamp 签名，JSON body 不参与签名
  const sign = md5Sign({ appId, timestamp }, appSecret)
  const url =
    `${CREATE_URL}?appId=${encodeURIComponent(appId)}` + `&timestamp=${timestamp}&sign=${sign}`
  const resp = await netRequest({
    url,
    method: 'POST',
    json: { vid, language, autoApplyEnabled, repetitionEnabled: 'N' }
  })
  const body = pickBody(resp)
  if (!body) return { ok: false, errMsg: (resp && resp.error) || '创建字幕任务接口无响应' }
  if (isSuccessBody(body)) {
    return { ok: true, taskId: body.data }
  }
  return {
    ok: false,
    errCode: body.error?.code,
    errMsg: body.error?.desc || body.status || '创建字幕任务失败'
  }
}

/**
 * 查询字幕内容（以任务id为准，用于判定字幕是否生成完成）
 * @returns {Promise<{ok:boolean, data?:Object, errCode?:number, errMsg?:string}>}
 *   ok=true 表示字幕已生成（data 含 subtitles/link）；
 *   errCode=56812 表示仍在生成中；errCode=56810 表示任务不存在/已删除
 */
export async function getSubtitleContent(taskId) {
  const credErr = credError()
  if (credErr) return credErr
  const { appId, appSecret } = getPolyvCreds()
  const timestamp = String(Date.now())
  // get 的签名参数为 appId+timestamp+taskId
  const sign = md5Sign({ appId, timestamp, taskId: String(taskId) }, appSecret)
  const url =
    `${GET_URL}?appId=${encodeURIComponent(appId)}` +
    `&timestamp=${timestamp}&taskId=${encodeURIComponent(String(taskId))}&sign=${sign}`
  const resp = await netRequest({ url, method: 'GET' })
  const body = pickBody(resp)
  if (!body) return { ok: false, errMsg: (resp && resp.error) || '查询字幕内容接口无响应' }
  if (isSuccessBody(body)) {
    return { ok: true, data: body.data && typeof body.data === 'object' ? body.data : null }
  }
  return {
    ok: false,
    errCode: body.error?.code,
    errMsg: body.error?.desc || body.status || '查询字幕内容失败'
  }
}

// ---------------- 本地 sqlite 记录 ----------------

/** 写入/覆盖一条字幕记录（status 每次显式写入；taskId/link 为空时保留旧值） */
export function recordSubtitle({
  vid,
  taskId = null,
  link = null,
  status = SUBTITLE_STATUS.CREATING
}) {
  return runSql(
    `INSERT INTO smart_subtitle (vid, task_id, link, status, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(vid) DO UPDATE SET
       task_id = COALESCE(excluded.task_id, smart_subtitle.task_id),
       link = COALESCE(excluded.link, smart_subtitle.link),
       status = excluded.status`,
    [String(vid), taskId, link, status, Date.now()]
  )
}

/** 已记录的字幕状态列表：[{ vid, status }] */
export async function listSubtitleStates() {
  const rows = await allSql('SELECT vid, status FROM smart_subtitle')
  return rows.map((r) => ({ vid: r.vid, status: r.status || SUBTITLE_STATUS.CREATING }))
}

/** 读取单个 vid 的字幕记录（含 task_id/status） */
export function getSubtitleRow(vid) {
  return getSql('SELECT vid, task_id, link, status FROM smart_subtitle WHERE vid = ?', [
    String(vid)
  ])
}

// ---------------- 编排 ----------------

/**
 * 字幕已生成（done）后，若 video_outline 表尚无该 vid 的字幕+大纲，则用刚取到的字幕内容调 AI 生成大纲并落库。
 * 失败不阻断字幕主流程（仅记日志），下次 ensure 时会重试。
 * @param {string} vid
 * @param {string|null} title 视频标题（供 AI 参考）
 * @param {Object|null} subtitleData get 接口返回的 data（含 subtitles 数组）
 */
async function tryGenerateOutline(vid, title, subtitleData) {
  try {
    const r = await generateAndRecord(vid, title, subtitleData?.subtitles)
    if (!r.ok && !r.skipped) console.warn(`AI 生成视频大纲未成功 vid=${vid}: ${r.errMsg}`)
  } catch (e) {
    console.error(`AI 生成视频大纲异常 vid=${vid}:`, e.message)
  }
}

/** 创建任务并在成功后落库为“创建中”；刚创建时尚未生成，直接记 creating */
export async function createAndRecord(vid) {
  const r = await createSubtitleTask(vid)
  if (r.ok) {
    await recordSubtitle({ vid, taskId: r.taskId ?? null, status: SUBTITLE_STATUS.CREATING })
    return { ok: true, vid, taskId: r.taskId, status: SUBTITLE_STATUS.CREATING }
  }
  return r
}

/**
 * 以 smart-subtitle/get 接口为准判定任务状态并回写本地：
 * 成功→done；56812→仍 generating（creating）；56810→任务不存在，重建。
 */
async function checkTaskAndUpdate(vid, taskId, fallbackLink = null, title = null) {
  const g = await getSubtitleContent(taskId)
  if (g.ok) {
    await recordSubtitle({
      vid,
      taskId,
      link: g.data?.link || fallbackLink || null,
      status: SUBTITLE_STATUS.DONE
    })
    // 字幕已生成：如本地尚无大纲则基于完整字幕调 AI 生成
    await tryGenerateOutline(vid, title, g.data)
    return { action: 'get', vid, ok: true, status: SUBTITLE_STATUS.DONE }
  }
  if (Number(g.errCode) === ERR_TASK_GENERATING) {
    await recordSubtitle({ vid, taskId, link: fallbackLink, status: SUBTITLE_STATUS.CREATING })
    return { action: 'get', vid, ok: true, status: SUBTITLE_STATUS.CREATING }
  }
  if (Number(g.errCode) === ERR_TASK_NOT_FOUND) {
    // 任务不存在/已删除，重新创建
    const c = await createAndRecord(vid)
    return { action: 'recreate', vid, ok: !!c.ok, status: c.status, errMsg: c.errMsg }
  }
  return { action: 'get', vid, ok: false, errMsg: g.errMsg }
}

/**
 * 确保某视频有字幕并同步状态（字幕 done 后基于完整字幕生成 AI 大纲）：
 * - done 且本地已有大纲 → 跳过；done 但缺大纲 → 拉一次字幕内容补生成大纲
 * - creating（已有 task_id）→ 调 get 刷新最新状态
 * - 未记录 → subtitle-link 拿 taskId：有则调 get 判定，无则创建（记 creating）
 * @param {string} vid
 * @param {string|null} [title] 视频标题（供 AI 大纲参考）
 */
export async function ensureOne(vid, title = null) {
  const row = await getSubtitleRow(vid)
  if (row && (row.status || SUBTITLE_STATUS.CREATING) === SUBTITLE_STATUS.DONE) {
    // 字幕已完成但大纲可能缺失（如上次 AI 失败），补生成一次
    if (row.task_id && !(await isOutlineRecorded(vid))) {
      const g = await getSubtitleContent(row.task_id)
      if (g.ok) await tryGenerateOutline(vid, title, g.data)
    }
    return { action: 'skip', vid, ok: true, status: SUBTITLE_STATUS.DONE }
  }
  if (row && row.task_id) {
    return await checkTaskAndUpdate(vid, row.task_id, row.link || null, title)
  }
  const q = await querySubtitleLink(vid)
  if (!q.ok) return { action: 'query', vid, ok: false, errMsg: q.errMsg }
  const item = (q.list || [])[0]
  if (item && item.taskId) {
    return await checkTaskAndUpdate(vid, item.taskId, item.link || null, title)
  }
  const c = await createAndRecord(vid)
  return { action: 'create', vid, ok: !!c.ok, status: c.status, errMsg: c.errMsg }
}

/**
 * 批量确保：对传入项逐个 ensure（done 跳过，尊重接口频率限制串行处理），
 * 返回处理完后本地全部字幕状态，供渲染层刷新字幕 tag。
 * @param {Array<string|{vid:string,title?:string}>} items 可传 vid 字符串，或 { vid, title } 对象
 */
export async function ensureForVids(items) {
  const todo = []
  const seen = new Set()
  for (const raw of items || []) {
    const isObj = raw && typeof raw === 'object'
    const vid = String((isObj ? raw.vid : raw) ?? '').trim()
    if (!vid || seen.has(vid)) continue
    seen.add(vid)
    todo.push({ vid, title: isObj ? (raw.title ?? null) : null })
  }
  for (const { vid, title } of todo) {
    try {
      const r = await ensureOne(vid, title)
      if (!r.ok) console.warn(`智能字幕处理失败(${r.action}) vid=${vid}: ${r.errMsg}`)
    } catch (e) {
      console.error(`智能字幕处理异常 vid=${vid}:`, e.message)
    }
  }
  return listSubtitleStates()
}
