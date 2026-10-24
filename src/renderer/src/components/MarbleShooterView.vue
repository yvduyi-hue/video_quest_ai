<script setup>
// 弹珠打靶游戏界面：Phaser 画布 + DOM 覆盖层（HUD / 解析 / 结算 / 提示）
// 题目在本地 sqlite，进入时按路由参数（模式/数量/难度/大纲）筛选、去重、随机取样
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh, Loading } from '@element-plus/icons-vue'
import Phaser from 'phaser'
import MarbleShooterScene, { W, H } from '../games/MarbleShooterScene.js'

const route = useRoute()
const router = useRouter()

// ---------------- 路由参数解析 ----------------
const mode = route.query.mode === 'endless' ? 'endless' : 'normal'
// 题目来源范围：'' = 题库按难度/大纲筛选；'wrong' = 错题专项闯关（只取错题本题目）
const scope = route.query.scope === 'wrong' ? 'wrong' : ''
// 无尽挑战：不按数量截断，直接加载全部（若选了大纲/难度则先按选择过滤）；普通按配置数量随机取样
const count = mode === 'endless' ? Number.POSITIVE_INFINITY : Number(route.query.count) || 10
const difficulty = Number(route.query.difficulty) || 0 // 0=不限
const vid = route.query.vid || '' // ''=全部，'none'=未关联，其他=具体大纲 vid

// ---------------- 界面状态 ----------------
// loading | playing | explain | win | lose | error
const phase = ref('loading')
const hud = reactive({
  index: 0,
  total: 0,
  timeLeft: 0,
  lives: null,
  score: 0,
  questionText: '',
  knowledgePoint: '',
  difficulty: null
})
const explain = reactive({ correctText: '', explanation: '' })
const result = reactive({
  reason: '',
  win: false,
  score: 0,
  passed: 0,
  total: 0,
  timeLeft: 0
})

const gameEl = ref(null)
let game = null
let startIv = null

// ---------------- 题目筛选 / 去重 / 随机 ----------------
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function valid(q) {
  return (
    q &&
    Array.isArray(q.options) &&
    q.options.length > 0 &&
    q.options.some((o) => o && o.is_correct)
  )
}

async function prepare() {
  try {
    const all = await window.api.quizList()
    let pool = (Array.isArray(all) ? all : []).filter(valid)
    if (scope === 'wrong') {
      // 错题专项闯关：只取错题本中、且题库里仍存在的题目（不限数量）
      const wrongList = await window.api.wrongBookList({})
      const wrongIds = new Set(
        (Array.isArray(wrongList) ? wrongList : []).map((w) => Number(w.questionId))
      )
      pool = pool.filter((q) => wrongIds.has(Number(q.id)))
    } else {
      if (difficulty > 0) pool = pool.filter((q) => Number(q.difficulty) === difficulty)
      if (vid === 'none') pool = pool.filter((q) => !q.vid)
      else if (vid) pool = pool.filter((q) => q.vid === vid)
    }
    // 题目 id 天然唯一，随机取样即不重复；错题专项不截断，其余按可用数量
    pool = shuffle(pool)
    if (scope !== 'wrong') pool = pool.slice(0, count)
    if (!pool.length) {
      phase.value = 'error'
      return
    }
    startEngine(pool)
  } catch (e) {
    console.error('加载题目失败：', e)
    phase.value = 'error'
  }
}

function startEngine(questions) {
  let started = false
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameEl.value,
    backgroundColor: '#1e2633',
    width: W,
    height: H,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: [MarbleShooterScene]
  })
  game.events.on('mbs:state', onState)
  game.events.on('mbs:phase', onPhase)
  game.events.on('mbs:answer', onAnswer)

  // 场景 create 完成后（ball 已创建）由 Vue 主动开局，不依赖 registry 注入
  const ensureStart = () => {
    if (started) return true
    const sc = scene()
    if (sc && sc.ball) {
      started = true
      sc.startGame(questions, mode)
      phase.value = 'playing'
      if (startIv) {
        clearInterval(startIv)
        startIv = null
      }
      return true
    }
    return false
  }
  game.events.once('mbs:created', ensureStart)
  startIv = setInterval(ensureStart, 80)
  // 若长时间未能创建场景（渲染/初始化异常），降级为错误提示
  setTimeout(() => {
    if (!ensureStart() && startIv) {
      clearInterval(startIv)
      startIv = null
      if (phase.value === 'loading') phase.value = 'error'
    }
  }, 2500)
}

function scene() {
  return game && game.scene.getScene('MarbleShooterScene')
}

function onState(s) {
  hud.index = s.index
  hud.total = s.total
  hud.timeLeft = s.timeLeft
  hud.lives = s.lives
  hud.score = s.score
  hud.questionText = s.questionText
  hud.knowledgePoint = s.knowledgePoint
  hud.difficulty = s.difficulty
}

// 场景上报一次作答 → 写入答题历史（答错时主进程会自动合并进错题本）
function onAnswer(a) {
  window.api?.gameRecordAnswer?.(a)?.catch?.((e) => console.error('记录答题失败：', e))
}

function onPhase({ phase: p, payload = {} }) {
  if (p === 'explain') {
    explain.correctText = payload.correctText || ''
    explain.explanation = payload.explanation || ''
    phase.value = 'explain'
  } else if (p === 'win') {
    Object.assign(result, payload, { win: true })
    phase.value = 'win'
  } else if (p === 'lose') {
    Object.assign(result, payload, { win: false })
    phase.value = 'lose'
  }
}

function nextQuestion() {
  phase.value = 'playing'
  scene()?.continueAfterExplain()
}

function retry() {
  phase.value = 'playing'
  scene()?.retry()
}

function goBack() {
  router.push('/main/level')
}

function stars(d) {
  const n = Math.min(5, Math.max(0, Math.round(Number(d) || 0)))
  return '★'.repeat(n) || '—'
}

const loseReasonText = {
  time: '时间耗尽',
  lives: '生命耗尽',
  empty: '没有可用题目'
}

onMounted(prepare)

onBeforeUnmount(() => {
  if (startIv) {
    clearInterval(startIv)
    startIv = null
  }
  if (game) {
    game.destroy(true)
    game = null
  }
})
</script>

<template>
  <div class="mbs-root">
    <!-- Phaser 画布容器 -->
    <div ref="gameEl" class="game-canvas"></div>

    <!-- 顶部工具条 -->
    <div class="mbs-toolbar">
      <el-button text :icon="ArrowLeft" class="back-btn" @click="goBack">返回关卡</el-button>
      <el-tag :type="mode === 'endless' ? 'danger' : 'primary'" effect="dark" size="small">
        {{ mode === 'endless' ? '无尽挑战' : '普通模式' }}
      </el-tag>
    </div>

    <!-- HUD 数据条 -->
    <div v-show="phase !== 'error' && phase !== 'loading'" class="mbs-hud">
      <div class="hud-item">
        <span class="hud-label">时间</span>
        <span class="hud-val time" :class="{ danger: hud.timeLeft <= 5 }">{{ hud.timeLeft }}s</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">进度</span>
        <span class="hud-val">{{ Math.min(hud.index + 1, hud.total) }} / {{ hud.total }}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">分数</span>
        <span class="hud-val score">{{ hud.score }}</span>
      </div>
      <div v-if="mode === 'endless'" class="hud-item">
        <span class="hud-label">生命</span>
        <span class="hud-val lives">{{ '❤'.repeat(Math.max(0, hud.lives || 0)) || '—' }}</span>
      </div>
    </div>

    <!-- 题干条 -->
    <div v-show="phase === 'playing' || phase === 'explain'" class="mbs-question">
      <span v-if="hud.knowledgePoint" class="q-kp">{{ hud.knowledgePoint }}</span>
      <span class="q-diff">{{ stars(hud.difficulty) }}</span>
      <p class="q-text">{{ hud.questionText }}</p>
    </div>

    <!-- 操作提示 -->
    <div v-show="phase === 'playing'" class="mbs-hint">
      按住底部弹珠向后拖拽蓄力，松开发射 · 击中正确选项的靶子即可通过
    </div>

    <!-- 加载中 -->
    <div v-if="phase === 'loading'" class="mbs-overlay">
      <div class="overlay-card">
        <el-icon class="is-loading" :size="34"><Loading /></el-icon>
        <p>正在准备题目…</p>
      </div>
    </div>

    <!-- 答案解析 -->
    <div v-else-if="phase === 'explain'" class="mbs-overlay">
      <div class="overlay-card explain-card">
        <div class="explain-title">回答正确 🎯</div>
        <p class="explain-answer">{{ explain.correctText }}</p>
        <div class="explain-body">{{ explain.explanation }}</div>
        <el-button type="primary" size="large" @click="nextQuestion">下一题</el-button>
      </div>
    </div>

    <!-- 结算 -->
    <div v-else-if="phase === 'win' || phase === 'lose'" class="mbs-overlay">
      <div class="overlay-card result-card">
        <el-result
          :icon="result.win ? 'success' : 'error'"
          :title="result.win ? '挑战成功' : '挑战失败'"
          :sub-title="result.win ? '全部题目已答完' : loseReasonText[result.reason] || '再来一次'"
        >
          <template #extra>
            <div class="result-stats">
              <span
                >得分 <b>{{ result.score }}</b></span
              >
              <span
                >通过 <b>{{ result.passed }}</b> / {{ result.total }}</span
              >
              <span
                >剩余 <b>{{ result.timeLeft }}</b
                >s</span
              >
            </div>
            <div class="result-actions">
              <el-button :icon="Refresh" type="primary" @click="retry">再玩一次</el-button>
              <el-button @click="goBack">返回关卡</el-button>
            </div>
          </template>
        </el-result>
      </div>
    </div>

    <!-- 无题目 -->
    <div v-else-if="phase === 'error'" class="mbs-overlay">
      <div class="overlay-card">
        <el-result icon="warning" title="没有符合条件的题目">
          <template #sub-title>
            <p v-if="scope === 'wrong'">
              错题本为空，或其中题目已被删除。先去关卡页看看，或多练习几局积累错题。
            </p>
            <p v-else>当前筛选（难度 / 大纲）下题目不足，请返回调整或先在互动题库创建题目。</p>
          </template>
          <template #extra>
            <el-button type="primary" @click="goBack">返回关卡</el-button>
          </template>
        </el-result>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mbs-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 480px;
  background: #1e2633;
  overflow: hidden;
}

.game-canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}

/* 底部信息层不得拦截指针事件，否则会盖住弹拖拽区导致拖不动/无法发射 */
.mbs-hud,
.mbs-question,
.mbs-hint {
  pointer-events: none;
}

.mbs-toolbar {
  position: absolute;
  top: 8px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 5;
}

.mbs-toolbar :deep(.back-btn) {
  color: #fff;
}

.mbs-hud {
  position: absolute;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 28px;
  padding: 8px 22px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 22px;
  z-index: 5;
}

.hud-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.hud-label {
  font-size: 13px;
  color: #b9c2d0;
}

.hud-val {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.hud-val.time.danger {
  color: #ff6b6b;
}

.hud-val.score {
  color: #ffd36b;
}

.hud-val.lives {
  color: #ff6b6b;
  letter-spacing: 2px;
}

.mbs-question {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, 92%);
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 12px;
  color: #fff;
  z-index: 4;
}

.mbs-question .q-kp {
  display: inline-block;
  margin-right: 10px;
  padding: 1px 8px;
  font-size: 12px;
  border-radius: 6px;
  background: var(--el-color-primary);
  vertical-align: middle;
}

.mbs-question .q-diff {
  color: #ffd36b;
  font-size: 13px;
  vertical-align: middle;
}

.mbs-question .q-text {
  margin: 6px 0 0;
  font-size: 16px;
  line-height: 1.5;
}

.mbs-hint {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #7f8a9b;
  z-index: 4;
}

.mbs-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 15, 25, 0.55);
  z-index: 10;
}

.overlay-card {
  background: #fff;
  border-radius: 14px;
  padding: 24px 32px;
  min-width: 360px;
  max-width: 560px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.overlay-card p {
  color: #606266;
}

.explain-card .explain-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-color-success);
  margin-bottom: 12px;
}

.explain-card .explain-answer {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}

.explain-card .explain-body {
  font-size: 14px;
  color: #606266;
  line-height: 1.7;
  text-align: left;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 18px;
  max-height: 220px;
  overflow: auto;
}

.result-stats {
  display: flex;
  justify-content: center;
  gap: 22px;
  margin-bottom: 16px;
  color: #606266;
  font-size: 14px;
}

.result-stats b {
  color: var(--el-color-primary);
  font-size: 18px;
  margin-left: 4px;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
