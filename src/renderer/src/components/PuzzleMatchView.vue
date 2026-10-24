<script setup>
// 拼图连线游戏界面：Phaser 画布 + DOM 覆盖层（HUD / 结算 / 提示）
// 题目在本地 sqlite，进入时按路由参数（模式/数量/难度/大纲）筛选、去重、随机取样
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh, Loading } from '@element-plus/icons-vue'
import Phaser from 'phaser'
import PuzzleMatchScene, { W, H } from '../games/PuzzleMatchScene.js'

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
// loading | playing | win | lose | error
const phase = ref('loading')
const hud = reactive({
  matched: 0,
  total: 0,
  round: 0,
  rounds: 0,
  timeLeft: 0,
  lives: null,
  score: 0,
  difficulty: null
})
const result = reactive({ reason: '', win: false, score: 0, passed: 0, total: 0, timeLeft: 0 })

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

// 左列取知识点（缺则题干），右列取正确选项文本，二者都要有文本才能成对
function conceptOf(q) {
  return String(q?.knowledgePoint || q?.questionText || '').trim()
}

function explanationOf(q) {
  const opts = Array.isArray(q?.options) ? q.options : []
  const hit = opts.find((o) => o && o.is_correct && String(o.text || '').trim())
  return String(hit?.text || '').trim()
}

// 该题可用的混淆项（非正确项、且文案不等于正确解释）个数
function distractorCount(q) {
  const opts = Array.isArray(q?.options) ? q.options : []
  const correct = explanationOf(q)
  return opts.filter(
    (o) => o && !o.is_correct && String(o.text || '').trim() && String(o.text).trim() !== correct
  ).length
}

function valid(q) {
  return !!conceptOf(q) && !!explanationOf(q)
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
    // 概念或解释文本重复会让连线出现多解，按两侧文本各去重一次
    const seenConcept = new Set()
    const seenExplain = new Set()
    pool = pool.filter((q) => {
      const c = conceptOf(q)
      const e = explanationOf(q)
      if (seenConcept.has(c) || seenExplain.has(e)) return false
      seenConcept.add(c)
      seenExplain.add(e)
      return true
    })
    // 右侧需要「每题一个正确解释 + 一个混淆项」：优先用自带错误选项的题，
    // 不够一屏时才退回全量（场景会借其他题的错误选项顶替）
    const withDecoy = pool.filter((q) => distractorCount(q) > 0)
    if (withDecoy.length >= 2) pool = withDecoy
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
    scene: [PuzzleMatchScene]
  })
  game.events.on('mtc:state', onState)
  game.events.on('mtc:phase', onPhase)
  game.events.on('mtc:answer', onAnswer)

  // 场景 create 完成后（卡片层已建）由 Vue 主动开局，不依赖 registry 注入
  const ensureStart = () => {
    if (started) return true
    const sc = scene()
    if (sc && sc.lineGfx) {
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
  game.events.once('mtc:created', ensureStart)
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
  return game && game.scene.getScene('PuzzleMatchScene')
}

function onState(s) {
  hud.matched = s.matched
  hud.total = s.total
  hud.round = s.round
  hud.rounds = s.rounds
  hud.timeLeft = s.timeLeft
  hud.lives = s.lives
  hud.score = s.score
  hud.difficulty = s.difficulty
}

// 场景上报一次配对作答 → 写入答题历史（答错时主进程会自动合并进错题本）
function onAnswer(a) {
  window.api?.gameRecordAnswer?.(a)?.catch?.((e) => console.error('记录答题失败：', e))
}

function onPhase({ phase: p, payload = {} }) {
  if (p === 'win') {
    Object.assign(result, payload, { win: true })
    phase.value = 'win'
  } else if (p === 'lose') {
    Object.assign(result, payload, { win: false })
    phase.value = 'lose'
  }
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
  <div class="mtc-root">
    <!-- Phaser 画布容器 -->
    <div ref="gameEl" class="game-canvas"></div>

    <!-- 顶部工具条 -->
    <div class="mtc-toolbar">
      <el-button text :icon="ArrowLeft" class="back-btn" @click="goBack">返回关卡</el-button>
      <el-tag :type="mode === 'endless' ? 'danger' : 'primary'" effect="dark" size="small">
        {{ mode === 'endless' ? '无尽挑战' : '普通模式' }}
      </el-tag>
    </div>

    <!-- HUD 数据条 -->
    <div v-show="phase !== 'error' && phase !== 'loading'" class="mtc-hud">
      <div class="hud-item">
        <span class="hud-label">时间</span>
        <span class="hud-val time" :class="{ danger: hud.timeLeft <= 5 }">{{ hud.timeLeft }}s</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">已配对</span>
        <span class="hud-val">{{ hud.matched }} / {{ hud.total }}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">分组</span>
        <span class="hud-val">{{ hud.round }} / {{ hud.rounds }}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">分数</span>
        <span class="hud-val score">{{ hud.score }}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">本组难度</span>
        <span class="hud-val diff">{{ stars(hud.difficulty) }}</span>
      </div>
      <div v-if="mode === 'endless'" class="hud-item">
        <span class="hud-label">生命</span>
        <span class="hud-val lives">{{ '❤'.repeat(Math.max(0, hud.lives || 0)) || '—' }}</span>
      </div>
    </div>

    <!-- 玩法提示（不得拦截指针事件，否则会盖住连线拖拽区） -->
    <div v-show="phase === 'playing'" class="mtc-hint">
      左侧每张概念要从右侧选出自己的正确解释：右侧每个题目给一个正确项 +
      一个混淆项（张数是左侧两倍） · 可点选（先左后右）也可直接拖拽 ·
      连到混淆项会记一次答错并被划掉排除，本组左侧全部配对后自动进下一组
    </div>

    <!-- 加载中 -->
    <div v-if="phase === 'loading'" class="mtc-overlay">
      <div class="overlay-card">
        <el-icon class="is-loading" :size="34"><Loading /></el-icon>
        <p>正在准备题目…</p>
      </div>
    </div>

    <!-- 结算 -->
    <div v-else-if="phase === 'win' || phase === 'lose'" class="mtc-overlay">
      <div class="overlay-card result-card">
        <el-result
          :icon="result.win ? 'success' : 'error'"
          :title="result.win ? '挑战成功' : '挑战失败'"
          :sub-title="
            result.win ? '全部概念与解释已配对' : loseReasonText[result.reason] || '再来一次'
          "
        >
          <template #extra>
            <div class="result-stats">
              <span
                >得分 <b>{{ result.score }}</b></span
              >
              <span
                >配对 <b>{{ result.passed }}</b> / {{ result.total }}</span
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
    <div v-else-if="phase === 'error'" class="mtc-overlay">
      <div class="overlay-card">
        <el-result icon="warning" title="没有符合条件的题目">
          <template #sub-title>
            <p v-if="scope === 'wrong'">
              错题本为空，或其中题目已被删除。先去关卡页看看，或多练习几局积累错题。
            </p>
            <p v-else>
              当前筛选（难度 / 大纲）下可配对的题目不足（需要知识点或题干文本、正确选项文本，
              最好还带一个错误选项作混淆项），请返回调整或先在互动题库补充题目。
            </p>
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
.mtc-root {
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

/* HUD 与提示层不得拦截指针事件，否则会盖住卡片连线区 */
.mtc-hud,
.mtc-hint {
  pointer-events: none;
}

.mtc-toolbar {
  position: absolute;
  top: 8px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 5;
}

.mtc-toolbar :deep(.back-btn) {
  color: #fff;
}

.mtc-hud {
  position: absolute;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 26px;
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

.hud-val.diff {
  color: #e6a23c;
  letter-spacing: 1px;
}

.hud-val.lives {
  color: #ff6b6b;
  letter-spacing: 2px;
}

.mtc-hint {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: min(1000px, 94%);
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #7f8a9b;
  z-index: 4;
}

.mtc-overlay {
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
