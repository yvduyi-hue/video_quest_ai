/**
 * 互动题库（主进程）
 *
 * 职责：
 * 1. 从 video_outline 表列出「已有大纲数据」的视频，供渲染层选择
 * 2. 取某视频的大纲内容，交给本地已配置的大模型（OpenAI chat/completions 兼容格式）生成结构化题目
 * 3. 生成的题目落库到 quiz_question 表（关联来源 vid）；手动创建的题目 vid 留空
 * 4. 从 sqlite 读取题目列表返回渲染层展示
 *
 * AI 接口配置与 outlineService 一致：config.json 中的 modelUrl / apiKey / modelName。
 */
import { polyvConfig } from './config.js'
import { netRequest } from '../services/netService.js'
import { runSql, allSql } from '../services/dbService.js'
import { getOutlineRow } from './outlineService.js'

// AI 生成题目耗时较长，单独放宽超时（2 分钟），避免沿用默认 10s 被截断
const AI_TIMEOUT = 120000

// 系统提示词：游戏化互动教学设计专家，严格约束输出为纯 JSON 数组
const SYSTEM_PROMPT = `你是一个专业的游戏化互动教学设计专家。你的任务是根据用户提供的长视频大纲或字幕文本，提取核心知识点，并生成可以直接用于互动游戏关卡的结构化题目数据。

【生成规则】
1. 举一反三：不要局限于大纲原文的直接复述，而应吃透大纲所讲授的知识点与教学思想，据此变换情境、材料、案例或考查角度，生成考查同一知识能力的新题目。题目要有迁移性和应用性，类似举一反三的拓展题；但所考查的知识必须源自大纲教学内容，不得偏离主题或凭空捏造与课程无关的内容。
2. 选项原子化：选项文本必须是完整、独立的句子，不能依赖上下文（比如不要用“以上都对”、“选项A”），这样是为了后续能够适配“连线题”或“拖拽题”。
3. 迷惑性设计：错误选项（distractors）必须包含常见的认知误区或根据知识内容合理编造，不能过于荒谬。
4. 时间戳关联：必须在 metadata 中提供该题所依据知识点对应的原文时间戳或段落序号，方便用户回看。

【输出格式要求】
必须且只能输出符合以下 JSON Schema 格式的纯 JSON 数组，不要包含任何 Markdown 标记（如 \`\`\`json ），不要包含任何解释性文字。

Schema 结构如下：
[
  {
    "knowledge_point": "提炼的核心知识点名称",
    "question_text": "具体的题干描述",
    "options": [
      {"id": "opt_1", "text": "完整的选项内容1", "is_correct": true},
      {"id": "opt_2", "text": "完整的选项内容2", "is_correct": false},
      {"id": "opt_3", "text": "完整的选项内容3", "is_correct": false},
      {"id": "opt_4", "text": "完整的选项内容4", "is_correct": false}
    ],
    "explanation": "详细的答案解析",
    "difficulty": 3,
    "metadata": {
      "source_timestamp": "对应的时间戳，如 12:30 或段落2",
      "tags": ["标签1", "标签2"]
    },
    "gameplay_payload": {
      "type": "MCQ",
      "settings": {
        "time_limit": 15,
        "show_explanation": true
      }
    }
  }
]

注意：
- difficulty 为题目难度，必须是 1-5 范围内的整数（1 最简单，5 最难），请根据题目综合判断填写。
- 当前 gameplay_payload.type 请固定输出为 "MCQ"（单选题）。
- time_limit 请根据题目难度在 10-30 秒之间自行设定。`

/** 用户消息：给出视频标题与大纲文本，并指定需生成的题目数量 */
function buildUserPrompt(title, outlineText, count) {
  return `请吃透以下视频大纲所讲授的知识点，并举一反三地生成互动题目（不要照搬原文，而是变换情境与考查角度生成新的、有迁移性的题目），严格按系统提示中的 JSON 数组结构输出（只输出合法 JSON 数组，不要 Markdown 代码围栏或额外解释）。

【生成数量】
请生成 ${count} 道题目。

【视频标题】
${title || '（未提供）'}

【视频大纲内容】
${outlineText}`
}

/** 从 AI 返回文本中尽量提取合法 JSON 数组（剥掉可能的 ```json 围栏） */
function extractJsonArray(text) {
  if (!text) return null
  let t = String(text).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf('[')
  const last = t.lastIndexOf(']')
  if (first !== -1 && last > first) t = t.slice(first, last + 1)
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

/** 难度归一化：非法/越界收敛到 1-5 整数 */
function normalizeDifficulty(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

// ---------------- AI 出题时间戳规整与按知识点回退 ----------------

/** "HH:MM:SS" / "MM:SS" / 纯秒数 → 秒数；无法解析返回 null */
function parseTimeToSeconds(str) {
  if (str === null || str === undefined || str === '') return null
  // 允许“12:30”“段落 2”等非时间文本：仅当形如 数字[:数字...] 才解析
  const s = String(str).trim()
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(s) && !/^\d+$/.test(s)) return null
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

/** 秒数 → "HH:MM:SS" */
function secondsToClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** 解析大纲 JSON，扁平化出「归一化知识点 → 时间戳秒数」列表，供回退匹配 */
function buildKeyPointTimeIndex(outlineJsonStr) {
  const list = []
  if (!outlineJsonStr) return list
  let obj
  try {
    obj = JSON.parse(outlineJsonStr)
  } catch {
    return list
  }
  const chapters = Array.isArray(obj?.chapters) ? obj.chapters : []
  for (const ch of chapters) {
    for (const kp of Array.isArray(ch?.keyPoints) ? ch.keyPoints : []) {
      const sec = parseTimeToSeconds(kp?.timestamp ?? kp?.point)
      const point = String(kp?.point || '')
        .trim()
        .toLowerCase()
      if (point && sec !== null) list.push({ point, sec })
    }
  }
  return list
}

/** 按知识点文本回退匹配大纲时间戳：先全等、再包含关系 */
function lookupTimeByKnowledge(index, knowledgePoint) {
  const key = String(knowledgePoint || '')
    .trim()
    .toLowerCase()
  if (!key || !index.length) return null
  const exact = index.find((it) => it.point === key)
  if (exact) return exact.sec
  const partial = index.find((it) => it.point.includes(key) || key.includes(it.point))
  return partial ? partial.sec : null
}

/**
 * 规整单题 metadata 时间戳：
 * 1) source_timestamp 可解析 → 统一存秒数 source_time 并回写 "HH:MM:SS"；
 * 2) 不可解析/缺失 → 按 knowledge_point 回退匹配大纲 keyPoints 时间戳；
 * 3) 仍无 → source_time 为 null。不修改传入对象，返回新 metadata。
 */
function normalizeQuestionMetadataTime(metadata, knowledgePoint, kpIndex) {
  const md = { ...(metadata || {}) }
  let sec = parseTimeToSeconds(md.source_timestamp)
  if (sec === null) sec = lookupTimeByKnowledge(kpIndex, knowledgePoint)
  if (sec !== null) {
    md.source_time = sec
    md.source_timestamp = secondsToClock(sec)
  } else {
    md.source_time = null
  }
  return md
}

/**
 * 列出「已有大纲数据」的视频：video_outline 中 outline 非空的记录
 * @returns {Promise<Array<{vid:string,title:string,updated_at:number}>>}
 */
export function listOutlineVideos() {
  return allSql(
    `SELECT vid, title, updated_at FROM video_outline
     WHERE outline IS NOT NULL AND TRIM(outline) != ''
     ORDER BY updated_at DESC`
  )
}

/** 单行题目：把存库的 JSON 字符串字段还原为对象后再返回渲染层 */
function hydrateQuestion(row) {
  const parse = (s, fallback) => {
    if (s === null || s === undefined) return fallback
    try {
      return JSON.parse(s)
    } catch {
      return fallback
    }
  }
  const metadata = parse(row.metadata, {})
  // 兼容旧数据：metadata 缺 source_time（秒）但有 source_timestamp 时按时间戳补全，
  // 供游戏答题上报与错题本时间点跳转使用
  if (metadata && typeof metadata === 'object') {
    if (metadata.source_time == null || metadata.source_time === '') {
      const sec = parseTimeToSeconds(metadata.source_timestamp)
      if (sec !== null) metadata.source_time = sec
    }
  }
  return {
    id: row.id,
    vid: row.vid || '',
    knowledgePoint: row.knowledge_point || '',
    questionText: row.question_text || '',
    options: parse(row.options, []),
    explanation: row.explanation || '',
    difficulty: row.difficulty ?? null,
    metadata,
    gameplayPayload: parse(row.gameplay_payload, {}),
    createdAt: row.created_at
  }
}

/**
 * 从 sqlite 读取全部题目（按创建时间倒序）
 * @returns {Promise<Array<Object>>}
 */
export async function listQuestions() {
  const rows = await allSql('SELECT * FROM quiz_question ORDER BY created_at DESC, id DESC')
  return rows.map(hydrateQuestion)
}

/** 写入一道题目，返回入库后的完整题目对象 */
async function insertQuestion({
  vid = null,
  knowledgePoint,
  questionText,
  options,
  explanation,
  difficulty,
  metadata,
  gameplayPayload
}) {
  const now = Date.now()
  const r = await runSql(
    `INSERT INTO quiz_question
       (vid, knowledge_point, question_text, options, explanation, metadata, gameplay_payload, difficulty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vid ? String(vid) : null,
      knowledgePoint || '',
      questionText || '',
      JSON.stringify(options || []),
      explanation || '',
      JSON.stringify(metadata || {}),
      JSON.stringify(
        gameplayPayload || { type: 'MCQ', settings: { time_limit: 15, show_explanation: true } }
      ),
      normalizeDifficulty(difficulty),
      now
    ]
  )
  return {
    id: r.lastID,
    vid: vid ? String(vid) : '',
    knowledgePoint: knowledgePoint || '',
    questionText: questionText || '',
    options: options || [],
    explanation: explanation || '',
    difficulty: normalizeDifficulty(difficulty),
    metadata: metadata || {},
    gameplayPayload: gameplayPayload || {
      type: 'MCQ',
      settings: { time_limit: 15, show_explanation: true }
    },
    createdAt: now
  }
}

/**
 * 手动创建一道题目（可选关联大纲视频 vid，留空则不关联）
 * @param {Object} payload 渲染层传入的题目字段
 */
export async function createManualQuestion(payload = {}) {
  const questionText = String(payload.questionText || '').trim()
  if (!questionText) return { ok: false, errMsg: '题干不能为空' }
  const options = Array.isArray(payload.options) ? payload.options : []
  if (!options.length) return { ok: false, errMsg: '至少需要一个选项' }
  if (!options.some((o) => o && o.is_correct)) return { ok: false, errMsg: '必须标记一个正确答案' }
  // 手动创建固定标记来源为 manual（保留渲染层传入的其他 metadata）
  const metadata = { ...(payload.metadata || {}), source: 'manual' }
  const question = await insertQuestion({
    vid: payload.vid ? String(payload.vid) : null,
    knowledgePoint: payload.knowledgePoint,
    questionText,
    options,
    explanation: payload.explanation,
    difficulty: payload.difficulty,
    metadata,
    gameplayPayload: payload.gameplayPayload
  })
  return { ok: true, question }
}

/**
 * 按 id 更新一道已有题目（AI 生成或手动创建的均可编辑）
 * created_at 保持不变，vid（关联大纲，可为空）及其余字段以渲染层传入的 payload 覆盖
 * @param {Object} payload 含 id 及待更新字段
 * @returns {Promise<{ok:boolean, id?:number, errMsg?:string}>}
 */
export async function updateQuestion(payload = {}) {
  const id = Number(payload.id)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, errMsg: '题目 id 非法' }
  const questionText = String(payload.questionText || '').trim()
  if (!questionText) return { ok: false, errMsg: '题干不能为空' }
  const options = Array.isArray(payload.options) ? payload.options : []
  if (!options.length) return { ok: false, errMsg: '至少需要一个选项' }
  if (!options.some((o) => o && o.is_correct)) return { ok: false, errMsg: '必须标记一个正确答案' }
  const r = await runSql(
    `UPDATE quiz_question SET
       vid = ?, knowledge_point = ?, question_text = ?, options = ?, explanation = ?,
       metadata = ?, gameplay_payload = ?, difficulty = ?
     WHERE id = ?`,
    [
      payload.vid ? String(payload.vid) : null,
      payload.knowledgePoint || '',
      questionText,
      JSON.stringify(options || []),
      payload.explanation || '',
      JSON.stringify(payload.metadata || {}),
      JSON.stringify(
        payload.gameplayPayload || {
          type: 'MCQ',
          settings: { time_limit: 15, show_explanation: true }
        }
      ),
      normalizeDifficulty(payload.difficulty),
      id
    ]
  )
  if (!r.changes) return { ok: false, errMsg: '题目不存在或已被删除' }
  return { ok: true, id }
}

/**
 * 按 id 删除一道题目
 * @param {number|string} id
 * @returns {Promise<{ok:boolean, id?:number, errMsg?:string}>}
 */
export async function deleteQuestion(id) {
  const numId = Number(id)
  if (!Number.isFinite(numId) || numId <= 0) return { ok: false, errMsg: '题目 id 非法' }
  const r = await runSql('DELETE FROM quiz_question WHERE id = ?', [numId])
  if (!r.changes) return { ok: false, errMsg: '题目不存在或已被删除' }
  return { ok: true, id: numId }
}

/** 调用大模型生成题目数组 */
async function callAiForQuestions(title, outlineText, count) {
  const { modelUrl, apiKey, modelName } = polyvConfig
  if (!modelUrl || !modelName) {
    return { ok: false, errMsg: '未配置模型地址 / 模型名称，请先在完成度向导中设置 AI 接口' }
  }
  const headers = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const resp = await netRequest({
    url: modelUrl,
    method: 'POST',
    headers,
    timeout: AI_TIMEOUT,
    json: {
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(title, outlineText, count) }
      ],
      stream: false
    }
  })
  const content = resp?.data?.choices?.[0]?.message?.content
  if (resp && resp.success && content) {
    const arr = extractJsonArray(content)
    if (!arr) return { ok: false, errMsg: 'AI 返回内容无法解析为题目 JSON 数组' }
    return { ok: true, questions: arr }
  }
  return {
    ok: false,
    errMsg: resp?.data?.error?.message || resp?.error || 'AI 生成题目失败'
  }
}

/** 生成数量归一化：非法/越界收敛到 1-50 整数，缺省 10 */
function normalizeCount(v) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return 10
  return Math.min(50, Math.max(1, n))
}

/**
 * 依据某视频大纲生成题目并落库
 * @param {string} vid video_outline 中的视频 id
 * @param {number} [count] 期望生成的题目数量，默认 10
 * @returns {Promise<{ok:boolean, vid:string, count?:number, errMsg?:string}>}
 */
export async function generateQuestionsFromOutline(vid, count) {
  if (!vid) return { ok: false, errMsg: 'vid 为空' }
  const desired = normalizeCount(count)
  const row = await getOutlineRow(vid)
  if (!row || !row.outline || !String(row.outline).trim()) {
    return { ok: false, errMsg: '该视频没有可用大纲，无法生成题目' }
  }
  const ai = await callAiForQuestions(row.title, row.outline, desired)
  if (!ai.ok) return { ok: false, errMsg: ai.errMsg, vid }
  // 预先构建大纲知识点时间索引，供时间戳缺失/非法时按知识点回退
  const kpIndex = buildKeyPointTimeIndex(row.outline)
  let saved = 0
  for (const q of ai.questions) {
    if (!q || !q.question_text) continue
    // 超出期望数量则不再入库（AI 可能多返回）
    if (saved >= desired) break
    await insertQuestion({
      vid,
      knowledgePoint: q.knowledge_point,
      questionText: q.question_text,
      options: q.options,
      explanation: q.explanation,
      difficulty: q.difficulty,
      // AI 生成固定标记来源为 ai（保留大纲返回的其他 metadata）；时间戳规整/按知识点回退
      metadata: {
        ...normalizeQuestionMetadataTime(q.metadata, q.knowledge_point, kpIndex),
        source: 'ai'
      },
      gameplayPayload: q.gameplay_payload
    })
    saved++
  }
  if (!saved) return { ok: false, errMsg: 'AI 未返回有效题目', vid }
  return { ok: true, vid, count: saved }
}
