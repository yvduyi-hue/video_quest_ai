/**
 * 本地 SQLite 数据服务（主进程）
 * 数据库文件放在默认可写路径（userData）下：video_quest.db
 * sqlite3 已针对 Electron rebuild（electron-builder install-app-deps）
 */
import sqlite3 from 'sqlite3'
import { join } from 'path'
import { getDefaultDir } from './fileService.js'

let db = null

// 建表语句数组：node-sqlite3 的 run 只执行首条语句，故多条 DDL 分开逐条执行
const DDL_STATEMENTS = [
  // 用户表：小写+下划线字段；password 存 MD5；category_id 绑定 Polyv 用户分类
  // polyv_* 列保存注册时生效的 Polyv 凭证（AI 模型配置不入表），登录后由主进程载入内存会话使用
  `CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    category_id INTEGER,
    polyv_base_url TEXT NOT NULL DEFAULT '',
    polyv_user_id TEXT NOT NULL DEFAULT '',
    polyv_secret_key TEXT NOT NULL DEFAULT '',
    polyv_write_token TEXT NOT NULL DEFAULT '',
    polyv_read_token TEXT NOT NULL DEFAULT '',
    polyv_app_id TEXT NOT NULL DEFAULT '',
    polyv_app_secret TEXT NOT NULL DEFAULT ''
  )`,
  // 智能字幕表：记录智能字幕任务及其状态（status：creating=任务已建但字幕生成中，done=字幕已生成）
  `CREATE TABLE IF NOT EXISTS smart_subtitle (
    vid TEXT PRIMARY KEY,
    task_id INTEGER,
    link TEXT,
    status TEXT NOT NULL DEFAULT 'creating',
    created_at INTEGER
  )`,
  // 视频大纲表：记录视频完整字幕内容与 AI 生成的视频大纲（vid 唯一，重复写入覆盖）
  // subtitles 存带时间戳的字幕纯文本，outline 存 AI 返回的 JSON 大纲字符串
  // is_courseware：AI 判定是否为教学课件（1=课件，0=非课件只存字幕不存大纲，NULL=未判定/历史数据）
  `CREATE TABLE IF NOT EXISTS video_outline (
    vid TEXT PRIMARY KEY,
    title TEXT,
    subtitles TEXT,
    outline TEXT,
    is_courseware INTEGER,
    created_at INTEGER,
    updated_at INTEGER
  )`,
  // 互动题库表：存放题目（AI 生成或手动创建）
  // vid 关联生成题目的来源视频，手动创建时为空；options/metadata/gameplay_payload 存 JSON 字符串
  `CREATE TABLE IF NOT EXISTS quiz_question (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vid TEXT,
    knowledge_point TEXT,
    question_text TEXT,
    options TEXT,
    explanation TEXT,
    metadata TEXT,
    gameplay_payload TEXT,
    difficulty INTEGER,
    created_at INTEGER
  )`,
  // 答题记录表：按“每题作答”粒度保存（答对/答错各一行），session_id 归组一次闯关，
  // 供数据看板统计（总闯关次数=COUNT(DISTINCT session_id)、正确率=SUM(is_correct)/COUNT(*)）与闯关历史列表聚合
  `CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id INTEGER,
    game_type TEXT NOT NULL DEFAULT 'marble',
    mode TEXT NOT NULL,
    question_id INTEGER,
    question_text TEXT,
    knowledge_point TEXT,
    vid TEXT,
    difficulty INTEGER,
    source_time INTEGER,
    is_correct INTEGER NOT NULL,
    cumulative_score INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  // 索引：按 session 聚合与按时间倒序读取历史
  `CREATE INDEX IF NOT EXISTS idx_game_history_session ON game_history(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_game_history_created ON game_history(created_at)`,
  // 错题本表：按 question_id 唯一合并（重复答错 wrong_count+1），冗余快照题目文本/知识点/vid/时间，
  // 题目被删除后仍可展示与跳回原文时间点
  `CREATE TABLE IF NOT EXISTS wrong_question_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    question_id INTEGER NOT NULL UNIQUE,
    question_text TEXT,
    knowledge_point TEXT,
    vid TEXT,
    difficulty INTEGER,
    source_time INTEGER,
    wrong_count INTEGER NOT NULL DEFAULT 1,
    last_chosen TEXT,
    first_wrong_at INTEGER,
    last_wrong_at INTEGER
  )`
]

// 兼容旧库的增量迁移：CREATE TABLE IF NOT EXISTS 不会给已存在的表补列，
// 故对老库尝试 ALTER ADD COLUMN；列已存在时 sqlite 报 duplicate column，忽略即可
const MIGRATIONS = [
  `ALTER TABLE smart_subtitle ADD COLUMN status TEXT NOT NULL DEFAULT 'creating'`,
  `ALTER TABLE video_outline ADD COLUMN is_courseware INTEGER`,
  `ALTER TABLE user ADD COLUMN polyv_base_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_user_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_secret_key TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_write_token TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_read_token TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_app_id TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user ADD COLUMN polyv_app_secret TEXT NOT NULL DEFAULT ''`
]

/** 获取（并懒加载打开）数据库连接；建表由 initDb 在启动时完成 */
export function getDb() {
  if (!db) {
    db = new sqlite3.Database(join(getDefaultDir(), 'video_quest.db'), (err) => {
      if (err) console.error('打开SQLite数据库失败：', err)
    })
  }
  return db
}

/**
 * 应用启动时初始化数据库并建表（带错误回调，失败不再被静默吞掉）
 * 逐条执行 DDL，任一失败即 reject
 */
export async function initDb() {
  const database = getDb()
  for (const sql of DDL_STATEMENTS) {
    await new Promise((resolve, reject) => {
      database.run(sql, (err) => (err ? reject(err) : resolve()))
    })
  }
  // 迁移逐条尝试，失败（多为 duplicate column）忽略，不影响启动
  for (const sql of MIGRATIONS) {
    await new Promise((resolve) => {
      database.run(sql, (err) => {
        if (err && !/duplicate column name/i.test(err.message)) {
          console.warn('SQLite迁移跳过：', err.message)
        }
        resolve()
      })
    })
  }
  console.log('SQLite已就绪：', join(getDefaultDir(), 'video_quest.db'))
  return database
}

/** Promise 化 run（INSERT/UPDATE/DELETE），返回 { lastID, changes } */
export function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

/** Promise 化 get（查询单行） */
export function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row || null)
    })
  })
}

/** Promise 化 all（查询多行） */
export function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}
