/**
 * 游戏答题记录 / 统计 / 错题本（主进程）
 *
 * 职责：
 * 1. recordAnswer：每次作答（答对/答错）写入 game_history（每题一行，session_id 归组）；
 *    答错时按 question_id 合并写入 wrong_question_book（重复答错 wrong_count+1，仅手动删除/清空）。
 * 2. 数据看板：getStats（总闯关次数等）。
 * 3. 闯关历史：listHistory（按 session_id 聚合）/ clearHistory。
 * 4. 错题本：listWrong（可按难度/大纲/知识点筛选）/ deleteWrong / clearWrong。
 *
 * 时间字段 created_at 均为毫秒时间戳；source_time 为题目原文时间点（秒），用于跳转播放页定位。
 */
import { runSql, allSql, getSql } from '../services/dbService.js'

/** 归一化成可写库的整数（null/undefined/空串/非法 → null，不把 null 误转为 0） */
function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** 0/1 布尔 → INTEGER */
function toBoolInt(v) {
  return v ? 1 : 0
}

/** "HH:MM:SS" / "MM:SS" / 纯秒数字符串 → 秒数；无法解析返回 null */
function parseClock(str) {
  if (str === null || str === undefined || str === '') return null
  const s = String(str).trim()
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(s) && !/^\d+$/.test(s)) return null
  const parts = s.split(':').map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return null
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

/**
 * 从题目 metadata JSON 字符串提取原文时间秒数：优先 source_time，回退解析 source_timestamp。
 * 用于错题本自身 source_time 为空（旧数据入库时未规整）时回查题目补全时间点。
 */
function metaToSeconds(metaStr) {
  if (!metaStr) return null
  let md
  try {
    md = JSON.parse(metaStr)
  } catch {
    return null
  }
  if (!md || typeof md !== 'object') return null
  if (md.source_time != null && md.source_time !== '') {
    const n = Math.trunc(Number(md.source_time))
    if (Number.isFinite(n)) return n
  }
  return parseClock(md.source_timestamp)
}

/**
 * 记录一次作答：写入答题历史；答错则合并进错题本
 * @param {Object} p { sessionId, userId, gameType, mode, questionId, questionText,
 *                      knowledgePoint, vid, difficulty, sourceTime, correct, chosenText, score }
 */
export async function recordAnswer(p = {}) {
  const sessionId = String(p.sessionId || '').trim()
  if (!sessionId) return { ok: false, errMsg: 'sessionId 为空' }
  const correct = !!p.correct
  const now = Date.now()

  const r = await runSql(
    `INSERT INTO game_history
       (session_id, user_id, game_type, mode, question_id, question_text, knowledge_point,
        vid, difficulty, source_time, is_correct, cumulative_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      toIntOrNull(p.userId),
      p.gameType || 'marble',
      p.mode === 'endless' ? 'endless' : 'normal',
      toIntOrNull(p.questionId),
      p.questionText || '',
      p.knowledgePoint || '',
      p.vid || '',
      toIntOrNull(p.difficulty),
      toIntOrNull(p.sourceTime),
      toBoolInt(correct),
      toIntOrNull(p.score) || 0,
      now
    ]
  )

  // 答错：合并进错题本（question_id 存在才记，便于题目删除后仍能按快照展示）
  if (!correct && p.questionId != null && toIntOrNull(p.questionId) != null) {
    const questionId = toIntOrNull(p.questionId)
    await runSql(
      `INSERT INTO wrong_question_book
         (user_id, question_id, question_text, knowledge_point, vid, difficulty,
          source_time, wrong_count, last_chosen, first_wrong_at, last_wrong_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET
         wrong_count = wrong_count + 1,
         last_chosen = excluded.last_chosen,
         last_wrong_at = excluded.last_wrong_at,
         question_text = excluded.question_text,
         knowledge_point = excluded.knowledge_point,
         vid = excluded.vid,
         difficulty = excluded.difficulty,
         source_time = excluded.source_time`,
      [
        toIntOrNull(p.userId),
        questionId,
        p.questionText || '',
        p.knowledgePoint || '',
        p.vid || '',
        toIntOrNull(p.difficulty),
        toIntOrNull(p.sourceTime),
        p.chosenText ? JSON.stringify({ text: String(p.chosenText) }) : null,
        now,
        now
      ]
    )
  }

  return { ok: true, id: r.lastID }
}

/** 数据看板统计：总闯关次数（去重 session）为主，附带答题/正确/错题概览 */
export async function getStats() {
  const agg = await getSql(
    `SELECT
       COUNT(DISTINCT session_id) AS sessions,
       COUNT(*)                   AS answers,
       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correctAnswers,
       MAX(cumulative_score)      AS bestScore
     FROM game_history`
  )
  const wrong = await getSql(
    `SELECT COUNT(*) AS wrongQuestions, COALESCE(SUM(wrong_count), 0) AS wrongTotal
     FROM wrong_question_book`
  )
  const answers = agg?.answers || 0
  const correctAnswers = agg?.correctAnswers || 0
  return {
    sessions: agg?.sessions || 0,
    answers,
    correctAnswers,
    accuracy: answers ? Math.round((correctAnswers / answers) * 100) : 0,
    bestScore: agg?.bestScore || 0,
    wrongQuestions: wrong?.wrongQuestions || 0,
    wrongTotal: wrong?.wrongTotal || 0
  }
}

/**
 * 闯关历史：按 session_id 聚合，返回每次闯关的概览
 * @param {number} limit 最近多少局，默认 50
 */
export async function listHistory(limit = 50) {
  const rows = await allSql(
    `SELECT
       session_id,
       mode,
       game_type        AS gameType,
       COUNT(*)         AS total,
       SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS passed,
       MAX(cumulative_score) AS score,
       MIN(created_at)  AS startedAt,
       MAX(created_at)  AS endedAt
     FROM game_history
     GROUP BY session_id
     ORDER BY endedAt DESC
     LIMIT ?`,
    [Math.max(1, Math.min(200, Number(limit) || 50))]
  )
  return rows.map((row) => ({
    sessionId: row.session_id,
    gameType: row.gameType,
    mode: row.mode,
    total: row.total || 0,
    passed: row.passed || 0,
    score: row.score || 0,
    startedAt: row.startedAt,
    endedAt: row.endedAt
  }))
}

/** 清空全部答题历史（不影响错题本） */
export async function clearHistory() {
  const r = await runSql('DELETE FROM game_history')
  return { ok: true, changes: r.changes }
}

/** 错题本行 → 驼峰；last_chosen JSON 还原；source_time 为空时回查关联题目 metadata 补全 */
function hydrateWrong(row) {
  let chosen
  try {
    chosen = JSON.parse(row.last_chosen || '{}')?.text || ''
  } catch {
    chosen = ''
  }
  // 时间点以关联题目的 metadata 为准（题目 source_time / source_timestamp 才是权威来源）；
  // metadata 无法解析（题目已删除）时才回落错题本存的快照值
  const derived = metaToSeconds(row.q_metadata)
  const sourceTime = derived != null ? derived : row.source_time
  return {
    id: row.id,
    questionId: row.question_id,
    questionText: row.question_text || '',
    knowledgePoint: row.knowledge_point || '',
    vid: row.vid || '',
    difficulty: row.difficulty ?? null,
    sourceTime,
    wrongCount: row.wrong_count || 0,
    lastChosen: chosen,
    firstWrongAt: row.first_wrong_at,
    lastWrongAt: row.last_wrong_at
  }
}

/**
 * 错题列表：可按难度 / 大纲 vid / 知识点关键词筛选，按最近答错时间倒序
 * @param {{difficulty?:number, vid?:string, keyword?:string}} filters vid: ''=全部, 'none'=未关联, 其他=具体
 */
export async function listWrong(filters = {}) {
  const where = []
  const params = []
  const diff = Number(filters.difficulty) || 0
  if (diff > 0) {
    where.push('w.difficulty = ?')
    params.push(diff)
  }
  if (filters.vid === 'none') {
    where.push("(w.vid IS NULL OR w.vid = '')")
  } else if (filters.vid) {
    where.push('w.vid = ?')
    params.push(String(filters.vid))
  }
  const kw = String(filters.keyword || '').trim()
  if (kw) {
    where.push('(w.question_text LIKE ? OR w.knowledge_point LIKE ?)')
    params.push(`%${kw}%`, `%${kw}%`)
  }
  const sql = `SELECT w.*, q.metadata AS q_metadata
     FROM wrong_question_book w
     LEFT JOIN quiz_question q ON q.id = w.question_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY w.last_wrong_at DESC, w.wrong_count DESC`
  const rows = await allSql(sql, params)
  return rows.map(hydrateWrong)
}

/** 按错题本行 id 删除一条错题 */
export async function deleteWrong(id) {
  const numId = Number(id)
  if (!Number.isFinite(numId) || numId <= 0) return { ok: false, errMsg: '错题 id 非法' }
  const r = await runSql('DELETE FROM wrong_question_book WHERE id = ?', [numId])
  if (!r.changes) return { ok: false, errMsg: '错题不存在或已被删除' }
  return { ok: true, id: numId }
}

/** 清空错题本 */
export async function clearWrong() {
  const r = await runSql('DELETE FROM wrong_question_book')
  return { ok: true, changes: r.changes }
}
