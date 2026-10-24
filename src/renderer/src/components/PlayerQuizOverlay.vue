<script setup>
/**
 * 播放页「到点互动」浮层：直接复用关卡游玩的两个 Phaser 场景（弹珠打靶 / 拼图连线）
 *
 * 由 PlayerView 在视频走到 quiz_question 的时间点时挂出来，铺在播放器区域之上：
 *   - 必须答对才能继续播放：全部答对 → emit('done', { status: 'passed' })；
 *   - 第一次答错 / 时间耗尽立即结束本局 → emit('done', { status: 'wrong' | 'timeout' })，
 *     由父组件回退若干秒重新观看，重新走到该时间点会再次出题。
 * 作答记录与关卡页同一套字段，统一走 gameRecordAnswer 写 game_history（答错自动并进错题本）。
 */
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import Phaser from 'phaser'
import MarbleShooterScene, { W, H } from '../games/MarbleShooterScene.js'
import PuzzleMatchScene from '../games/PuzzleMatchScene.js'

const props = defineProps({
  // marble | match
  gameKey: { type: String, default: 'marble' },
  // 本次要作答的题目（弹珠一题；连线可带邻近时间点的题凑成多对）
  questions: { type: Array, default: () => [] },
  // 互动点文案（时间点 + 知识点），连线玩法没有单题题干时用
  pointLabel: { type: String, default: '' }
})
const emit = defineEmits(['done'])

// 两个玩法的场景类、事件前缀与「就绪判据」不同：都要等场景 create 建好对象后由本组件主动开局
const GAMES = {
  marble: {
    name: '弹珠打靶',
    tip: '拖拽弹弓发射弹珠，打中正确选项即答对',
    sceneClass: MarbleShooterScene,
    sceneKey: 'MarbleShooterScene',
    prefix: 'mbs',
    ready: (sc) => !!sc.ball,
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } }
  },
  match: {
    name: '拼图连线',
    tip: '把左侧概念与右侧正确解释连线，连到混淆项即算答错',
    sceneClass: PuzzleMatchScene,
    sceneKey: 'PuzzleMatchScene',
    prefix: 'mtc',
    ready: (sc) => !!sc.lineGfx,
    physics: null
  }
}
const conf = GAMES[props.gameKey] || GAMES.marble

const phase = ref('loading')
const hud = reactive({ timeLeft: 0, questionText: '' })

const gameEl = ref(null)
let game = null
let startIv = null
let failTimer = null
let settled = false

/** 本局只结算一次：答错后场景还在播动画并可能再抛事件，一律忽略 */
function settle(status, extra = {}) {
  if (settled) return
  settled = true
  emit('done', {
    status,
    gameKey: props.gameKey,
    questionIds: props.questions.map((q) => Number(q.id)).filter((n) => Number.isFinite(n)),
    ...extra
  })
}

function startEngine() {
  const config = {
    type: Phaser.AUTO,
    parent: gameEl.value,
    backgroundColor: '#1e2633',
    width: W,
    height: H,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [conf.sceneClass]
  }
  // 连线玩法是纯指针交互，不需要物理引擎
  if (conf.physics) config.physics = conf.physics
  game = new Phaser.Game(config)

  const p = conf.prefix
  game.events.on(`${p}:state`, onState)
  game.events.on(`${p}:phase`, onPhase)
  game.events.on(`${p}:answer`, onAnswer)
  game.events.once(`${p}:created`, ensureStart)
  startIv = setInterval(ensureStart, 80)
  // 长时间没能建好场景（渲染/初始化异常）就退出互动，别让视频一直卡在暂停
  failTimer = setTimeout(() => {
    if (!ensureStart()) settle('error', { reason: 'scene' })
  }, 3000)
}

function ensureStart() {
  const sc = game && game.scene.getScene(conf.sceneKey)
  if (!(sc && conf.ready(sc))) return false
  if (startIv) {
    clearInterval(startIv)
    startIv = null
  }
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
  phase.value = 'playing'
  // 观看互动固定用普通模式：只考这一批题，答完即结束
  sc.startGame(props.questions, 'normal')
  return true
}

function onState(s) {
  hud.timeLeft = s.timeLeft
  hud.questionText = s.questionText || ''
}

// 场景上报一次作答 → 写入答题历史；第一次答错就结束本局（交回视频去回看重学）
function onAnswer(a) {
  window.api?.gameRecordAnswer?.(a)?.catch?.((e) => console.error('记录互动答题失败：', e))
  if (!a.correct) settle('wrong', { chosenText: a.chosenText || '' })
}

function onPhase({ phase: p, payload = {} }) {
  if (p === 'win') settle('passed')
  else if (p === 'lose') settle('timeout', { reason: payload.reason || 'time' })
}

onMounted(startEngine)

onBeforeUnmount(() => {
  if (startIv) {
    clearInterval(startIv)
    startIv = null
  }
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
  if (game) {
    game.destroy(true)
    game = null
  }
})
</script>

<template>
  <div class="pq-root">
    <!-- Phaser 画布容器 -->
    <div ref="gameEl" class="pq-canvas"></div>

    <!-- 顶部信息条：纯展示，不能拦截指针（拖拽弹弓/连线都在画布上） -->
    <div class="pq-head">
      <el-tag type="warning" effect="dark" size="small">{{ conf.name }}</el-tag>
      <span class="pq-q">{{ hud.questionText || props.pointLabel }}</span>
      <span class="pq-time" :class="{ danger: hud.timeLeft <= 5 }">{{ hud.timeLeft }}s</span>
    </div>

    <div class="pq-tip">
      {{ conf.tip }} ·
      答对才能继续播放，答错或时间用完会退回上一段重新观看（不想被拦可在右侧大纲下方关闭）
    </div>

    <div v-if="phase === 'loading'" class="pq-loading">
      <el-icon class="is-loading" :size="30"><Loading /></el-icon>
      <span>正在准备互动题…</span>
    </div>
  </div>
</template>

<style scoped>
.pq-root {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: #1e2633;
  overflow: hidden;
}

.pq-canvas {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.pq-head,
.pq-tip {
  pointer-events: none;
}

.pq-head {
  position: absolute;
  top: 6px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 6;
}

.pq-q {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: #e8ecf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pq-time {
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  color: #ffd36b;
}

.pq-time.danger {
  color: #ff6b6b;
}

.pq-tip {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: min(1000px, 94%);
  text-align: center;
  font-size: 12px;
  line-height: 1.6;
  color: #7f8a9b;
  z-index: 6;
}

.pq-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #b9c2d0;
  background: #1e2633;
  z-index: 8;
}
</style>
