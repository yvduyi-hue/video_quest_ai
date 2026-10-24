<script setup>
// 关卡游玩：数据看板 + 错题本 / 闯关历史 / 错题专项闯关入口 + 游戏卡片（弹珠打靶、拼图连线）
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Aim,
  Right,
  DataAnalysis,
  Notebook,
  Clock,
  VideoPlay,
  Delete,
  Refresh,
  Search,
  Connection,
  ArrowDown
} from '@element-plus/icons-vue'

const router = useRouter()

// ---------------- 游戏列表 ----------------
// available=false 的为后续扩展占位卡片
const games = [
  {
    key: 'marble',
    name: '弹珠打靶',
    desc: '拖拽弹弓发射弹珠，击中正确选项的靶子碎裂通关',
    icon: Aim,
    color: '#0071fe',
    available: true
  },
  {
    key: 'match',
    name: '拼图连线',
    desc: '把左侧概念与右侧解释连线配对，全部配对正确即通关',
    icon: Connection,
    color: '#7c4dff',
    available: true
  }
]

// 玩法 key → 小游戏路由，错题专项闯关也按此表跳转
const GAME_PATHS = { marble: '/game/marble', match: '/game/match' }

function pathOf(key) {
  return GAME_PATHS[key] || GAME_PATHS.marble
}

// 题库 game_history.game_type → 玩法名（早期记录无该字段时归为弹珠打靶）
function gameTypeName(type) {
  return type === 'match' ? '拼图连线' : '弹珠打靶'
}

// 当前选中的玩法：开局弹窗与错题专项闯关都以此为默认
const currentGame = ref(games[0])

function onGameClick(game) {
  if (!game.available) {
    ElMessage.info('该玩法即将上线，敬请期待')
    return
  }
  currentGame.value = game
  openSetup()
}

// ---------------- 开局配置 ----------------
const setupVisible = ref(false)
const outlineVideos = ref([])

const form = ref({
  mode: 'normal', // normal | endless
  count: 10,
  difficulty: 0, // 0=不限（随机）
  vid: '' // ''=全部（随机），'none'=未关联，其他=具体大纲
})

async function loadOutlineVideos() {
  try {
    const list = await window.api.quizOutlineVideos()
    outlineVideos.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('获取大纲视频列表失败：', e)
  }
}

function openSetup() {
  form.value = { mode: 'normal', count: 10, difficulty: 0, vid: '' }
  setupVisible.value = true
  if (!outlineVideos.value.length) loadOutlineVideos()
}

function startGame() {
  const f = form.value
  const count = f.mode === 'endless' ? 0 : f.count
  router.push({
    path: pathOf(currentGame.value.key),
    query: {
      mode: f.mode,
      count,
      difficulty: f.difficulty,
      vid: f.vid
    }
  })
}

// ---------------- 通用格式化 ----------------
// 难度星星
function stars(d) {
  const n = Math.min(5, Math.max(0, Math.round(Number(d) || 0)))
  return '★'.repeat(n) || '—'
}

// 毫秒时间戳 → MMDD HH:mm
function formatTime(ts) {
  if (!ts) return '—'
  const dt = new Date(Number(ts))
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// 秒 → mm:ss（用于时间点按钮文案）
function clockFromSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const pad = (x) => String(x).padStart(2, '0')
  if (s >= 3600) {
    const hh = Math.floor(s / 3600)
    return `${hh}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
  }
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

// 大纲 vid → 标题
function outlineTitle(vid) {
  if (!vid) return ''
  const hit = outlineVideos.value.find((v) => String(v.vid) === String(vid))
  return hit ? hit.title || '（无标题）' : String(vid).slice(0, 12)
}

// ---------------- 数据看板 ----------------
const stats = reactive({ sessions: 0, answers: 0, accuracy: 0, wrongQuestions: 0 })

async function loadStats() {
  try {
    const s = await window.api.gameStats()
    if (s) Object.assign(stats, s)
  } catch (e) {
    console.error('读取游戏统计失败：', e)
  }
}

// ---------------- 错题本 ----------------
const wrongVisible = ref(false)
const wrongLoading = ref(false)
const wrongList = ref([])
const wrongFilters = reactive({ difficulty: 0, vid: '', keyword: '' })

async function loadWrong() {
  wrongLoading.value = true
  try {
    const list = await window.api.wrongBookList({
      difficulty: wrongFilters.difficulty,
      vid: wrongFilters.vid,
      keyword: wrongFilters.keyword.trim()
    })
    wrongList.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('读取错题本失败：', e)
    ElMessage.error('读取错题本失败')
  } finally {
    wrongLoading.value = false
  }
}

async function openWrong() {
  wrongVisible.value = true
  await loadOutlineVideos()
  await loadWrong()
}

// 有 vid 且有原文时间点才可跳转
function canJump(w) {
  return !!w.vid && w.sourceTime != null && Number.isFinite(Number(w.sourceTime))
}

function jumpToTime(w) {
  if (!canJump(w)) {
    ElMessage.warning('该题没有可跳转的原文时间点')
    return
  }
  router.push({
    path: '/player',
    query: { vid: String(w.vid), title: outlineTitle(w.vid), t: Number(w.sourceTime) }
  })
}

async function removeWrong(w) {
  try {
    const res = await window.api.wrongBookDelete(w.id)
    if (res && res.ok) {
      ElMessage.success('已移除该错题')
      await loadWrong()
      await loadStats()
    } else {
      ElMessage.error(`移除失败：${res ? res.errMsg : '接口无响应'}`)
    }
  } catch (e) {
    console.error('移除错题异常：', e)
    ElMessage.error('移除失败')
  }
}

async function clearWrongAll() {
  try {
    await ElMessageBox.confirm('确定清空整个错题本吗？清空后不可恢复。', '清空错题本', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    await window.api.wrongBookClear()
    ElMessage.success('错题本已清空')
    await loadWrong()
    await loadStats()
  } catch (e) {
    console.error('清空错题本异常：', e)
    ElMessage.error('清空失败')
  }
}

// 错题专项闯关：以错题本题目开局（普通模式，加载全部错题），按所选玩法进入
function startWrongChallenge(key = currentGame.value.key) {
  if (!stats.wrongQuestions) {
    ElMessage.info('错题本还是空的，先去闯关积累错题吧')
    return
  }
  router.push({
    path: pathOf(key),
    query: { scope: 'wrong', mode: 'normal' }
  })
}

// ---------------- 闯关历史 ----------------
const historyVisible = ref(false)
const historyLoading = ref(false)
const historyList = ref([])

async function loadHistory() {
  historyLoading.value = true
  try {
    const list = await window.api.gameHistory(50)
    historyList.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('读取闯关历史失败：', e)
    ElMessage.error('读取闯关历史失败')
  } finally {
    historyLoading.value = false
  }
}

async function openHistory() {
  historyVisible.value = true
  await loadHistory()
}

async function clearHistoryAll() {
  try {
    await ElMessageBox.confirm(
      '确定清空全部闯关历史吗？清空后不可恢复（不影响错题本）。',
      '清空历史',
      {
        type: 'warning',
        confirmButtonText: '清空',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }
  try {
    await window.api.gameHistoryClear()
    ElMessage.success('闯关历史已清空')
    await loadHistory()
    await loadStats()
  } catch (e) {
    console.error('清空闯关历史异常：', e)
    ElMessage.error('清空失败')
  }
}

onMounted(() => {
  loadOutlineVideos()
  loadStats()
})
</script>

<template>
  <div class="level-page">
    <div class="page-head">
      <h2>关卡游玩</h2>
      <p class="sub">基于互动题库题目生成的小游戏玩法，选择后开始挑战</p>
    </div>

    <!-- 数据看板 + 功能入口 -->
    <div class="board">
      <div class="board-stat">
        <div class="stat-icon">
          <el-icon :size="26"><DataAnalysis /></el-icon>
        </div>
        <div class="stat-main">
          <div class="stat-num">{{ stats.sessions }}</div>
          <div class="stat-label">总闯关次数</div>
        </div>
        <div class="stat-extra">
          <span
            >累计答题 <b>{{ stats.answers }}</b></span
          >
          <span
            >正确率 <b>{{ stats.accuracy }}%</b></span
          >
        </div>
      </div>
      <div class="board-actions">
        <el-button :icon="Notebook" @click="openWrong">错题本</el-button>
        <el-button :icon="Clock" @click="openHistory">闯关历史</el-button>
        <el-dropdown trigger="click" @command="startWrongChallenge">
          <el-button type="primary" plain :icon="Aim">
            错题专项闯关<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="g in games.filter((x) => x.available)"
                :key="g.key"
                :command="g.key"
              >
                {{ g.name }}专项练习
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="game-grid">
      <div
        v-for="g in games"
        :key="g.key"
        class="game-card"
        :class="{ disabled: !g.available }"
        @click="onGameClick(g)"
      >
        <div class="card-icon" :style="{ background: g.color }">
          <el-icon :size="30"><component :is="g.icon" /></el-icon>
        </div>
        <div class="card-body">
          <div class="card-title">
            {{ g.name }}
            <el-tag v-if="!g.available" size="small" type="info" effect="plain">敬请期待</el-tag>
          </div>
          <div class="card-desc">{{ g.desc }}</div>
        </div>
        <el-icon v-if="g.available" class="card-arrow"><Right /></el-icon>
      </div>
    </div>

    <!-- 开局配置弹窗（两种玩法共用同一套开局设置） -->
    <el-dialog v-model="setupVisible" :title="`${currentGame.name} · 开局设置`" width="440px">
      <el-form label-width="90px">
        <el-form-item label="游戏模式">
          <el-radio-group v-model="form.mode">
            <el-radio-button value="normal">普通</el-radio-button>
            <el-radio-button value="endless">无尽挑战</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.mode === 'normal'" label="题目数量">
          <el-select v-model="form.count" style="width: 100%">
            <el-option v-for="c in [5, 10, 15, 20]" :key="c" :label="`${c} 题`" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="题目数量">
          <span class="fixed-tip">无尽挑战：加载全部题目（如选了难度/大纲则按选择过滤）</span>
        </el-form-item>

        <el-form-item label="题目难度">
          <el-select v-model="form.difficulty" style="width: 100%">
            <el-option label="全部难度（随机）" :value="0" />
            <el-option v-for="d in [1, 2, 3, 4, 5]" :key="d" :label="`${d} 星`" :value="d" />
          </el-select>
        </el-form-item>

        <el-form-item label="题目大纲">
          <el-select v-model="form.vid" filterable placeholder="选择大纲" style="width: 100%">
            <el-option label="全部大纲（随机）" value="" />
            <el-option label="未关联大纲" value="none" />
            <el-option
              v-for="v in outlineVideos"
              :key="v.vid"
              :label="v.title || '（无标题）'"
              :value="v.vid"
            />
          </el-select>
        </el-form-item>

        <div class="form-note">
          难度与大纲均不选则从题库随机抽题；筛选题量不足时按实际可用数量出题，且不会重复。
        </div>
      </el-form>

      <template #footer>
        <el-button @click="setupVisible = false">取消</el-button>
        <el-button type="primary" @click="startGame">开始游戏</el-button>
      </template>
    </el-dialog>

    <!-- 错题本抽屉 -->
    <el-drawer v-model="wrongVisible" title="错题本" size="640px">
      <div class="drawer-tools">
        <el-select v-model="wrongFilters.difficulty" style="width: 120px" @change="loadWrong">
          <el-option label="全部难度" :value="0" />
          <el-option v-for="d in [1, 2, 3, 4, 5]" :key="d" :label="`${d} 星`" :value="d" />
        </el-select>
        <el-select
          v-model="wrongFilters.vid"
          placeholder="全部大纲"
          filterable
          style="width: 180px"
          @change="loadWrong"
        >
          <el-option label="全部大纲" value="" />
          <el-option label="未关联大纲" value="none" />
          <el-option
            v-for="v in outlineVideos"
            :key="v.vid"
            :label="v.title || '（无标题）'"
            :value="v.vid"
          />
        </el-select>
        <el-input
          v-model="wrongFilters.keyword"
          placeholder="搜索题干 / 知识点"
          style="flex: 1; min-width: 140px"
          clearable
          @keyup.enter="loadWrong"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <el-button :icon="Refresh" @click="loadWrong">刷新</el-button>
      </div>

      <div class="list-toolbar">
        <span class="list-count">共 {{ wrongList.length }} 道错题</span>
        <el-button
          type="danger"
          plain
          size="small"
          :icon="Delete"
          :disabled="!wrongList.length"
          @click="clearWrongAll"
        >
          清空错题本
        </el-button>
      </div>

      <div v-loading="wrongLoading" class="w-list">
        <el-empty v-if="!wrongLoading && !wrongList.length" description="还没有错题，继续加油！" />
        <div v-for="w in wrongList" :key="w.id" class="w-item">
          <div class="w-main">
            <div class="w-q" :title="w.questionText">{{ w.questionText }}</div>
            <div class="w-meta">
              <span v-if="w.knowledgePoint" class="w-kp">{{ w.knowledgePoint }}</span>
              <span class="w-diff">{{ stars(w.difficulty) }}</span>
              <el-tag size="small" type="danger" effect="plain">错 {{ w.wrongCount }} 次</el-tag>
              <span v-if="w.vid" class="w-src">{{ outlineTitle(w.vid) }}</span>
              <span class="w-last">{{ formatTime(w.lastWrongAt) }}</span>
            </div>
            <div v-if="w.lastChosen" class="w-chosen">最近错选：{{ w.lastChosen }}</div>
          </div>
          <div class="w-ops">
            <el-tooltip :disabled="canJump(w)" content="该题没有可跳转的原文时间点" placement="top">
              <el-button
                size="small"
                :icon="VideoPlay"
                type="primary"
                plain
                :disabled="!canJump(w)"
                @click="jumpToTime(w)"
              >
                {{ canJump(w) ? clockFromSec(w.sourceTime) : '无时间点' }}
              </el-button>
            </el-tooltip>
            <el-button size="small" :icon="Delete" @click="removeWrong(w)" />
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 闯关历史抽屉 -->
    <el-drawer v-model="historyVisible" title="闯关历史" size="480px">
      <div class="list-toolbar">
        <span class="list-count">最近 {{ historyList.length }} 局</span>
        <el-button
          type="danger"
          plain
          size="small"
          :icon="Delete"
          :disabled="!historyList.length"
          @click="clearHistoryAll"
        >
          清空历史
        </el-button>
      </div>
      <div v-loading="historyLoading" class="h-list">
        <el-empty v-if="!historyLoading && !historyList.length" description="暂无闯关记录" />
        <div v-for="h in historyList" :key="h.sessionId" class="h-item">
          <div class="h-line">
            <el-tag size="small" effect="plain" :type="h.gameType === 'match' ? 'success' : 'info'">
              {{ gameTypeName(h.gameType) }}
            </el-tag>
            <el-tag :type="h.mode === 'endless' ? 'danger' : 'primary'" size="small" effect="dark">
              {{ h.mode === 'endless' ? '无尽挑战' : '普通模式' }}
            </el-tag>
            <span class="h-score">{{ h.score }} 分</span>
            <span class="h-time">{{ formatTime(h.endedAt) }}</span>
          </div>
          <div class="h-sub">配对/答对 {{ h.passed }} / {{ h.total }} 题</div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.level-page {
  padding: 24px 28px;
  height: 100%;
  overflow-y: auto;
}

.page-head h2 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #303133;
}

.page-head .sub {
  margin: 0 0 18px;
  font-size: 14px;
  color: #909399;
}

/* 数据看板 */
.board {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px 20px;
  margin-bottom: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
}

.board-stat {
  display: flex;
  align-items: center;
  gap: 16px;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: #0071fe;
}

.stat-num {
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  color: #303133;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.stat-extra {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 16px;
  border-left: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: #909399;
}

.stat-extra b {
  color: var(--el-color-primary);
  font-size: 15px;
  margin: 0 2px;
}

.board-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}

.game-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.game-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.game-card.disabled {
  cursor: default;
  opacity: 0.7;
}

.game-card.disabled:hover {
  transform: none;
  box-shadow: none;
}

.card-icon {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.card-desc {
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.card-arrow {
  color: #c0c4cc;
}

.fixed-tip {
  color: #606266;
}

.form-note {
  margin-top: 4px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

/* 抽屉内通用 */
.drawer-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.list-count {
  font-size: 13px;
  color: #909399;
}

.w-list,
.h-list {
  min-height: 200px;
}

.w-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.w-main {
  flex: 1;
  min-width: 0;
}

.w-q {
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.w-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.w-kp {
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.w-diff {
  color: #e6a23c;
}

.w-chosen {
  margin-top: 4px;
  font-size: 12px;
  color: #c45656;
}

.w-ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.h-item {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.h-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.h-score {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.h-time {
  margin-left: auto;
  font-size: 12px;
  color: #909399;
}

.h-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
}
</style>
