<script setup>
/**
 * 视频播放页：由视频管理详情弹窗的“播放视频”按钮跳转而来（/player?vid=xxx&title=xxx&cover=xxx）
 *
 * 播放器为保利威 Web 播放器（Polyv Vod Player Desktop），官方是 <script src> 引入，
 * 这里把脚本下载到本地 src/renderer/public/polyv/player.js：
 * 构建时 Vite 会原样拷贝到 out/renderer/polyv/，生产环境走 file:// 也不再依赖外链。
 * 播放器内部接口地址会按 location.protocol 判断，file:// 下会归到 https:，因此本地加载可正常取流。
 *
 * 若 video_outline 表中已有该 vid 的大纲数据（outline 字段为 JSON 字符串），
 * 则在播放器右侧展示视频大纲，按当前播放进度实时高亮所在章节/知识点并自动滚动跟随；
 * 大纲面板右上角提供“自动跟随视频”开关，关闭后停止自动滚动（高亮仍跟随进度）。
 *
 * 有大纲且该 vid 在 quiz_question 表里有能定位时间点的题目时，播放到题目时间点会暂停视频，
 * 随机弹出关卡页的两个小游戏（弹珠打靶 / 拼图连线）做随堂互动：答对才继续播放，
 * 答错（或时间耗尽）就退回该时间点前若干秒重新观看，重新走到该点会再出题；
 * 大纲面板底部可手动开启/关闭该互动（默认开启）。
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Loading } from '@element-plus/icons-vue'
import PlayerQuizOverlay from './PlayerQuizOverlay.vue'

// 用 document.baseURI 解析相对路径：dev 得到 http://localhost:5173/polyv/player.js，
// 生产得到 file:///.../out/renderer/polyv/player.js
const PLAYER_SCRIPT = new URL('polyv/player.js', document.baseURI).href

// 官方提示：不要在带 animation/transform 的元素内初始化播放器（会导致全屏样式错乱），
// 而 App.vue 的路由切换动画正好会给本页根节点加 transform，故等动画（0.25s）结束后再创建
const PLAYER_INIT_DELAY = 300

// 轮询播放进度：保利威播放器没有对外暴露稳定的 timeupdate 事件，官方示例也是定时读 j2s_getCurrentTime()
const TIME_POLL_INTERVAL = 500

// ---------------- 到点互动答题参数 ----------------
// 互动点时间点后多少秒触发（播放中留出一点余量，也避免 seek 未完成就重复弹题）
const TRIGGER_AFTER_SEC = 1
// 答错/超时后往前回退多少秒重新观看
const REWATCH_BACK_SEC = 10
// 回退后延迟解除占用：等 seek 生效，避免轮询读到的旧进度立刻把同一个互动点再弹一次
const QUIZ_REARM_DELAY_MS = 1500
// 拖进度条时跳得太远的互动点不追补出题，直接算错过
const QUIZ_MISSED_GRACE_SEC = 20
// 连线玩法一屏凑几对（只考 1 对太单调），从邻近时间点且未答过的题里补
const MATCH_GROUP_SIZE = 3
const MATCH_GROUP_WINDOW_SEC = 180

const route = useRoute()
const router = useRouter()

const vid = computed(() => String(route.query.vid || ''))
const title = computed(() => String(route.query.title || ''))
const cover = computed(() => String(route.query.cover || ''))
// 可选的定位时间点（秒）：由错题/历史的“时间点按钮”通过 query.t 传入，播放开始后自动 seek 一次
const seekToSec = computed(() => {
  const n = Number(route.query.t)
  return Number.isFinite(n) && n > 0 ? n : 0
})

// 无 vid 或初始化/播放出错时用覆盖层给出可读提示，避免整页黑屏
const failed = ref(false)
const failTip = ref('')
let player = null
let scriptPromise = null
let initTimer = null
let pollTimer = null
let seekedOnce = false

/** 脚本只需注入一次，重复进出播放页复用 window.polyvPlayer */
function loadPlayerScript() {
  if (window.polyvPlayer) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = PLAYER_SCRIPT
      el.onload = resolve
      el.onerror = () => {
        scriptPromise = null
        reject(new Error('本地播放器脚本加载失败'))
      }
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

async function createPlayer() {
  if (!vid.value) {
    markFailed('缺少视频vid，请从视频管理页重新选择视频')
    return
  }
  try {
    await loadPlayerScript()
    seekedOnce = false
    player = window.polyvPlayer({
      // wrap 必须是一个已存在的容器选择器，全屏由播放器自身控件触发
      wrap: '#polyv-player',
      width: '100%',
      height: '100%',
      vid: vid.value,
      // 主进程已设置 autoplayPolicy: 'no-user-gesture-required'，无需用户操作即可自动播放
      autoplay: true,
      // 用接口返回的封面图做播放前背景
      loading_bg_img: cover.value || false,
      allowFullscreen: true,
      pictureInPicture: true,
      showHd: true,
      speed: [0.5, 1, 1.25, 1.5, 2],
      lang: 'zh_CN'
    })
    bindPlayerEvents()
    startTimePolling()
  } catch (e) {
    console.error('播放器初始化失败：', e)
    markFailed(e.message || '播放器初始化失败')
  }
}

function bindPlayerEvents() {
  if (!player?.on) return
  player.on('s2j_onPlayStart', () => {
    console.info('视频开始播放：', vid.value)
    // 带定位时间点进入：开始播放后 seek 到目标秒数（仅一次，延迟等播放器就绪）
    if (seekToSec.value > 0 && !seekedOnce) {
      seekedOnce = true
      setTimeout(() => {
        try {
          player?.j2s_seekVideo?.(seekToSec.value)
        } catch (e) {
          console.warn('定位播放时间点失败：', e)
        }
      }, 300)
    }
  })
  player.on('s2j_onPlayerError', (info) => {
    console.error('播放器错误：', info)
    markFailed(info?.message || info?.msg || '视频播放失败，请确认视频已发布且转码完成')
  })
}

/** 定时读取播放器当前播放时间（秒），用于驱动大纲高亮/滚动跟随 */
function startTimePolling() {
  stopTimePolling()
  pollTimer = setInterval(() => {
    const t = player?.j2s_getCurrentTime?.()
    if (t == null || Number.isNaN(Number(t))) return
    currentTimeSec.value = Number(t)
  }, TIME_POLL_INTERVAL)
}

function stopTimePolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function markFailed(message) {
  failed.value = true
  failTip.value = message
}

// ---------------- 播放器基本控制（互动题弹出/结算时用到） ----------------

function pauseVideo() {
  try {
    player?.j2s_pauseVideo?.()
  } catch (e) {
    console.warn('暂停视频失败：', e)
  }
}

function playVideo() {
  try {
    player?.j2s_playVideo?.()
  } catch (e) {
    console.warn('继续播放失败：', e)
  }
}

/** 跳转到指定秒数（播放器内部为异步，失败不阻断互动流程） */
function seekVideo(sec) {
  try {
    player?.j2s_seekVideo?.(sec)
  } catch (e) {
    console.warn('跳转播放位置失败：', e)
  }
}

function retry() {
  destroyPlayer()
  failed.value = false
  failTip.value = ''
  createPlayer()
}

function destroyPlayer() {
  clearTimeout(initTimer)
  stopTimePolling()
  // 互动浮层里的 Phaser 随本页一起收掉，避免残留定时器继续弹题
  clearTimeout(rearmTimer)
  rearmTimer = null
  activeQuiz.value = null
  quizBusy = false
  try {
    player?.destroy?.()
  } catch (e) {
    console.warn('销毁播放器失败：', e)
  }
  player = null
}

function goBack() {
  // 用 push 而非 back，保证无历史记录时也能回到视频管理页
  router.push('/main/video')
}

// ---------------- 视频大纲（video_outline 表） ----------------

const outlineLoading = ref(false)
const outlineError = ref('')
/** 解析后的大纲对象：{ videoInfo, chapters: [] }，无数据则为 null */
const outline = ref(null)
/** 当前播放进度（秒），由轮询播放器 j2s_getCurrentTime 得到 */
const currentTimeSec = ref(0)
/** 是否自动跟随视频滚动，右上角开关可取消 */
const autoFollow = ref(true)
/** 大纲滚动容器引用 */
const outlinePanelRef = ref(null)

const hasOutline = computed(() => !!(outline.value && Array.isArray(outline.value.chapters)))

/** "HH:MM:SS" 或 "MM:SS" 转秒数（无法解析返回 0） */
function parseTimeToSeconds(str) {
  if (!str) return 0
  const parts = String(str)
    .trim()
    .split(':')
    .map((p) => Number(p))
  if (parts.some((n) => Number.isNaN(n))) return 0
  if (parts.length >= 3) {
    const [hh, mm, ss] = parts
    return hh * 3600 + mm * 60 + ss
  }
  if (parts.length === 2) {
    const [mm, ss] = parts
    return mm * 60 + ss
  }
  return Number(parts[0]) || 0
}

/** 扁平化所有章节/知识点时间点，按时间排序，用于实时定位当前进度对应的大纲条目 */
const timelineMarkers = computed(() => {
  if (!hasOutline.value) return []
  const markers = []
  outline.value.chapters.forEach((ch, ci) => {
    markers.push({
      time: parseTimeToSeconds(ch.startTime),
      type: 'chapter',
      chapterIndex: ci,
      pointIndex: -1,
      key: `chapter-${ci}`
    })
    ;(ch.keyPoints || []).forEach((kp, pi) => {
      markers.push({
        time: parseTimeToSeconds(kp.timestamp),
        type: 'point',
        chapterIndex: ci,
        pointIndex: pi,
        key: `point-${ci}-${pi}`
      })
    })
  })
  return markers.sort((a, b) => a.time - b.time)
})

/** 当前进度命中的标记（时间 <= 当前播放时间的最后一个标记） */
const activeMarker = computed(() => {
  const markers = timelineMarkers.value
  if (!markers.length) return null
  let found = null
  for (const m of markers) {
    if (m.time <= currentTimeSec.value + 0.5) found = m
    else break
  }
  return found || markers[0]
})

const activeChapterIndex = computed(() =>
  activeMarker.value ? activeMarker.value.chapterIndex : -1
)

/** 展开/收起的章节（默认全部展开关键知识点） */
const expandedChapters = ref([])
watch(
  () => outline.value,
  () => {
    expandedChapters.value = hasOutline.value ? outline.value.chapters.map((_, i) => i) : []
  },
  { immediate: true }
)

function toggleChapter(index) {
  const pos = expandedChapters.value.indexOf(index)
  if (pos === -1) expandedChapters.value.push(index)
  else expandedChapters.value.splice(pos, 1)
}

/** 大纲条目变化时（且开启自动跟随）滚动到可视区域 */
watch(activeMarker, async (marker) => {
  if (!marker || !autoFollow.value) return
  await nextTick()
  const panel = outlinePanelRef.value
  if (!panel) return
  // 若该条目所属章节被折叠，先展开
  if (!expandedChapters.value.includes(marker.chapterIndex)) {
    expandedChapters.value.push(marker.chapterIndex)
    await nextTick()
  }
  const el = panel.querySelector(`[data-marker-key="${marker.key}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

/** 开启自动跟随时，立即滚动到当前位置 */
watch(autoFollow, async (on) => {
  if (!on || !activeMarker.value) return
  await nextTick()
  const panel = outlinePanelRef.value
  const el = panel?.querySelector(`[data-marker-key="${activeMarker.value.key}"]`)
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

async function loadOutline() {
  outline.value = null
  outlineError.value = ''
  currentTimeSec.value = 0
  if (!vid.value) return
  outlineLoading.value = true
  try {
    const row = await window.api.videoOutlineGet(vid.value)
    if (row && row.outline) {
      try {
        outline.value = JSON.parse(row.outline)
      } catch {
        outlineError.value = '大纲数据解析失败，可能不是合法 JSON'
      }
    }
  } catch (e) {
    console.error('加载视频大纲失败：', e)
    outlineError.value = e.message || '加载视频大纲失败'
  } finally {
    outlineLoading.value = false
  }
}

// 已在播放页时切换 vid（例如后续支持列表连播）走 changeVid，避免重建实例；同时重新加载大纲
watch(vid, (next) => {
  if (!next) return
  loadOutline()
  loadQuizPoints()
  if (!player) return
  failed.value = false
  player.changeVid({ vid: next, autoplay: true })
})

// ---------------- 到点互动答题（复用关卡页两个小游戏） ----------------

// 开启状态默认开，仅当该 vid 有大纲且题库里有带时间点的题时才会真的拦下播放
const quizEnabled = ref(true)
const quizError = ref('')
/** 互动点列表：[{ time, question }]，按时间点升序 */
const quizPoints = ref([])
/** 当前弹出的互动：{ gameKey, index, time, questions, pointLabel }，null 表示没弹 */
const activeQuiz = ref(null)
/** 每次弹题自增，用作浮层组件的 key 强制重建 Phaser 实例 */
const quizSeq = ref(0)
const answeredCount = ref(0)
/** 本视频全部可用题目（连线玩法从中凑邻近题） */
let quizPool = []
/** 已答对的题 id，不再重复出题 */
let answeredIds = new Set()
/** quizPoints 的扫描指针 */
let quizCursor = 0
/** 互动进行中（已暂停等作答），避免轮重复弹题 */
let quizBusy = false
let rearmTimer = null

/** 题目可作互动：有正确选项文本，且 metadata.source_time 能定位到秒（主进程从 source_timestamp 补出） */
function quizUsable(q) {
  const t = Number(q?.metadata?.source_time)
  const correct = (Array.isArray(q?.options) ? q.options : []).some(
    (o) => o && o.is_correct && String(o.text || '').trim()
  )
  return correct && Number.isFinite(t) && t >= 0
}

async function loadQuizPoints() {
  quizPoints.value = []
  quizError.value = ''
  quizPool = []
  answeredIds = new Set()
  answeredCount.value = 0
  quizCursor = 0
  quizBusy = false
  activeQuiz.value = null
  clearTimeout(rearmTimer)
  rearmTimer = null
  if (!vid.value) return
  try {
    const all = await window.api.quizList()
    quizPool = (Array.isArray(all) ? all : []).filter(
      (q) => String(q.vid || '') === vid.value && quizUsable(q)
    )
    quizPoints.value = quizPool
      .map((q) => ({ time: Number(q.metadata.source_time), question: q }))
      .sort((a, b) => a.time - b.time)
  } catch (e) {
    console.error('加载互动题目失败：', e)
    quizError.value = e.message || '加载互动题目失败'
  }
}

/** 秒转 mm:ss，用于互动点文案 */
function formatSec(sec) {
  const n = Math.max(0, Math.round(Number(sec) || 0))
  const mm = Math.floor(n / 60)
  const ss = String(n % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** 连线卡片的唯一性 key：概念（知识点/题干）+ 正确解释，重复则连线会出现多解 */
function matchKey(q) {
  const concept = String(q?.knowledgePoint || q?.questionText || '').trim()
  const correct = (Array.isArray(q?.options) ? q.options : []).find((o) => o && o.is_correct)?.text
  return `${concept}||${String(correct || '').trim()}`
}

/**
 * 拼图连线凑组：以当前互动点题目为主，按时间距离补邻近且未答过的题，
 * 凑到 MATCH_GROUP_SIZE 对为止（左侧多张概念、右侧每张对应一个正确项 + 一个混淆项）
 */
function buildMatchGroup(q) {
  const base = Number(q.metadata.source_time)
  const group = [q]
  const seen = new Set([matchKey(q)])
  const near = quizPool
    .filter((it) => it !== q && !answeredIds.has(Number(it.id)))
    .sort(
      (a, b) =>
        Math.abs(Number(a.metadata.source_time) - base) -
        Math.abs(Number(b.metadata.source_time) - base)
    )
  for (const it of near) {
    if (group.length >= MATCH_GROUP_SIZE) break
    if (Math.abs(Number(it.metadata.source_time) - base) > MATCH_GROUP_WINDOW_SEC) break
    const key = matchKey(it)
    if (seen.has(key)) continue
    seen.add(key)
    group.push(it)
  }
  return group
}

/** 进度的轮询值驱动：走到未答过的互动点就暂停播放并弹出小游戏 */
function maybeTriggerQuiz(t) {
  // 没有大纲时面板底部没有开关可关，为避免看不了视频，仅在“有大纲 + 有题”时才拦下播放
  if (!quizEnabled.value || !hasOutline.value || quizBusy || activeQuiz.value) return
  while (quizCursor < quizPoints.value.length) {
    const point = quizPoints.value[quizCursor]
    if (t < point.time + TRIGGER_AFTER_SEC) break // 还没到，等进度走到
    quizCursor += 1
    if (answeredIds.has(Number(point.question.id))) continue
    // 拖进度条一下跳过去了，不追补出题
    if (t - point.time > QUIZ_MISSED_GRACE_SEC) continue
    openQuiz(point, quizCursor - 1)
    return
  }
}

function openQuiz(point, index) {
  const gameKey = Math.random() < 0.5 ? 'marble' : 'match'
  quizBusy = true
  pauseVideo()
  const question = point.question
  activeQuiz.value = {
    gameKey,
    index,
    time: point.time,
    questions: gameKey === 'marble' ? [question] : buildMatchGroup(question),
    pointLabel: `${formatSec(point.time)} · ${question.knowledgePoint || question.questionText}`
  }
  quizSeq.value += 1
}

/**
 * 一局互动结束：
 *   passed → 记下本轮作答题目（不再重复出题）并从暂停位置继续播放
 *   wrong/timeout → 不计完成，退回该时间点前几秒重看，重新走到该点会再次弹题
 *   error → 场景初始化异常，不拦播放也不回退，直接看下一个互动点
 */
function onQuizDone(res) {
  const quiz = activeQuiz.value
  activeQuiz.value = null
  if (!quiz) return
  if (res.status === 'passed') {
    ;(res.questionIds || []).forEach((id) => answeredIds.add(Number(id)))
    answeredCount.value = answeredIds.size
    quizBusy = false
    playVideo()
    return
  }
  if (res.status === 'error') {
    console.warn('互动小游戏初始化失败，跳过本题：', res.reason)
    quizBusy = false
    playVideo()
    return
  }
  // 答错/时间耗尽：本题不算完成，扫描指针退回该互动点，回退重看后走到同一时间点会再出题
  quizCursor = Math.max(0, Number(quiz.index) || 0)
  seekVideo(Math.max(0, quiz.time - REWATCH_BACK_SEC))
  playVideo()
  // seek 生效需要时间，延迟解除占用，避免旧进度立刻把同一个点再弹一次
  clearTimeout(rearmTimer)
  rearmTimer = setTimeout(() => {
    rearmTimer = null
    quizBusy = false
  }, QUIZ_REARM_DELAY_MS)
}

watch(currentTimeSec, (t) => maybeTriggerQuiz(Number(t)))

// 关闭开关是“互动卡住不能看”的逃生口：正在弹出的互动直接收掉并恢复播放
watch(quizEnabled, (on) => {
  if (on) return
  if (activeQuiz.value) {
    activeQuiz.value = null
    clearTimeout(rearmTimer)
    rearmTimer = null
    quizBusy = false
    playVideo()
  }
})

/** 大纲底部开关旁的状态文案 */
const quizStatusText = computed(() => {
  if (quizError.value) return quizError.value
  if (!quizPoints.value.length) return '该视频的题目没有时间定位点，无法随堂出题'
  const done = `已完成 ${answeredCount.value} / ${quizPoints.value.length}`
  return activeQuiz.value ? `正在进行第 ${activeQuiz.value.index + 1} 个互动点 · ${done}` : done
})

const hasQuiz = computed(() => quizPoints.value.length > 0)

onMounted(() => {
  initTimer = setTimeout(createPlayer, PLAYER_INIT_DELAY)
  loadOutline()
  loadQuizPoints()
})

onBeforeUnmount(destroyPlayer)
</script>

<template>
  <div class="player-page">
    <div class="player-bar">
      <el-button :icon="ArrowLeft" text @click="goBack">返回</el-button>
      <span class="player-title" :title="title">{{ title || '视频播放' }}</span>
      <span class="player-vid" :title="vid">{{ vid }}</span>
    </div>

    <div class="player-body">
      <div class="player-stage">
        <!-- 播放器要求容器常驻，失败态用覆盖层而不是 v-if 移除节点 -->
        <div id="polyv-player" class="player-mount"></div>
        <!-- 到点互动：铺在播放器之上，作答期间视频已暂停 -->
        <PlayerQuizOverlay
          v-if="activeQuiz"
          :key="quizSeq"
          :game-key="activeQuiz.gameKey"
          :questions="activeQuiz.questions"
          :point-label="activeQuiz.pointLabel"
          @done="onQuizDone"
        />
        <div v-if="failed" class="player-fallback">
          <el-result icon="warning" title="无法播放" :sub-title="failTip">
            <template #extra>
              <el-button @click="goBack">返回视频管理</el-button>
              <el-button type="primary" @click="retry">重新加载</el-button>
            </template>
          </el-result>
        </div>
      </div>

      <aside v-if="hasOutline" class="outline-panel">
        <div class="outline-head">
          <span class="outline-title">视频大纲</span>
          <div class="outline-follow">
            <span class="follow-label">自动跟随视频</span>
            <el-switch v-model="autoFollow" size="small" />
          </div>
        </div>
        <div ref="outlinePanelRef" class="outline-scroll">
          <div v-if="outline.videoInfo?.summary" class="outline-summary">
            {{ outline.videoInfo.summary }}
          </div>

          <div
            v-for="(chapter, ci) in outline.chapters"
            :key="chapter.index ?? ci"
            class="outline-chapter"
            :class="{ active: ci === activeChapterIndex }"
          >
            <div
              class="chapter-head"
              :data-marker-key="`chapter-${ci}`"
              :class="{ 'chapter-active': ci === activeChapterIndex }"
              @click="toggleChapter(ci)"
            >
              <div class="chapter-index">{{ ci + 1 }}</div>
              <div class="chapter-head-main">
                <div class="chapter-title">{{ chapter.title }}</div>
                <div class="chapter-time">{{ chapter.startTime }} ~ {{ chapter.endTime }}</div>
              </div>
              <el-icon class="chapter-arrow" :class="{ open: expandedChapters.includes(ci) }">
                <ArrowRight />
              </el-icon>
            </div>

            <div v-show="expandedChapters.includes(ci)" class="chapter-body">
              <p v-if="chapter.overview" class="chapter-overview">{{ chapter.overview }}</p>
              <div
                v-for="(kp, pi) in chapter.keyPoints || []"
                :key="kp.point + pi"
                class="keypoint"
                :data-marker-key="`point-${ci}-${pi}`"
                :class="{
                  'keypoint-active':
                    ci === activeMarker?.chapterIndex &&
                    pi === activeMarker?.pointIndex &&
                    activeMarker?.type === 'point'
                }"
              >
                <div class="keypoint-head">
                  <span class="keypoint-title">{{ kp.point }}</span>
                  <span class="keypoint-time">{{ kp.timestamp }}</span>
                </div>
                <div class="keypoint-detail">{{ kp.detail }}</div>
                <div v-if="kp.tags && kp.tags.length" class="keypoint-tags">
                  <el-tag v-for="t in kp.tags" :key="t" size="small" type="info">{{ t }}</el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 大纲底部：到点互动开关（默认开启，关闭后不再拦下播放） -->
        <div class="outline-foot">
          <div class="quiz-row">
            <div class="quiz-row-main">
              <span class="quiz-label">到点互动答题</span>
              <span class="quiz-sub">{{ quizStatusText }}</span>
            </div>
            <el-switch v-model="quizEnabled" size="small" :disabled="!hasQuiz" />
          </div>
          <p class="quiz-desc">
            播放到题目时间点会暂停，随机弹出「弹珠打靶 / 拼图连线」，答对才继续播放；答错自动退回
            {{ REWATCH_BACK_SEC }} 秒重新观看。
          </p>
        </div>
      </aside>

      <aside v-else-if="outlineLoading" class="outline-panel outline-empty">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>正在加载大纲…</span>
      </aside>

      <aside v-else-if="outlineError" class="outline-panel outline-empty">
        <el-result icon="info" :sub-title="outlineError" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.player-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 20px 16px;
  box-sizing: border-box;
}

.player-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
}

.player-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-vid {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.player-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.player-mount {
  width: 100%;
  height: 100%;
}

.player-fallback {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
}

.outline-panel {
  flex-shrink: 0;
  width: 340px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.outline-empty {
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 20px;
}

.outline-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.outline-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.outline-follow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.follow-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.outline-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px;
}

.outline-summary {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
}

.outline-chapter {
  margin-bottom: 8px;
}

.chapter-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.chapter-head:hover {
  background: var(--el-fill-color-light);
}

.chapter-active {
  background: var(--el-color-primary-light-9);
}

.chapter-index {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  font-size: 12px;
  border-radius: 50%;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.chapter-active .chapter-index {
  background: var(--el-color-primary);
  color: #fff;
}

.chapter-head-main {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.chapter-arrow {
  flex-shrink: 0;
  transition: transform 0.2s;
  color: var(--el-text-color-secondary);
}

.chapter-arrow.open {
  transform: rotate(90deg);
}

.chapter-body {
  padding: 4px 8px 8px 28px;
}

.chapter-overview {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.keypoint {
  padding: 6px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  border-left: 2px solid transparent;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.keypoint-active {
  background: var(--el-color-primary-light-9);
  border-left-color: var(--el-color-primary);
}

.keypoint-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.keypoint-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.keypoint-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.keypoint-detail {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  margin-top: 2px;
}

.keypoint-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

/* 大纲底部：到点互动开关 */
.outline-foot {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
}

.quiz-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.quiz-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quiz-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.quiz-sub {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.quiz-desc {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
</style>
