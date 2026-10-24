<script setup>
// 互动题库：左上角“创建题目”“通过大纲生成”，题目列表来自本地 sqlite
// 列表采用紧凑可折叠行 + 搜索/筛选 + 分页，便于题目增多后快速收纳与管理
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, MagicStick, Delete, Check, Edit, ArrowRight, Search } from '@element-plus/icons-vue'

// ---------------- 题目列表（来自 sqlite） ----------------
const loading = ref(false)
const questions = ref([])

async function loadQuestions() {
  loading.value = true
  try {
    const list = await window.api.quizList()
    questions.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('加载题目列表失败：', e)
    ElMessage.error('加载题目列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadQuestions()
  loadOutlineVideos()
})

// 选项序号 → A/B/C/D
function optionLabel(index) {
  return String.fromCharCode(65 + index)
}

// 难度星星：1-5 对应 1-5 颗实心星
function stars(d) {
  const n = Math.min(5, Math.max(0, Math.round(Number(d) || 0)))
  return '★'.repeat(n)
}

// 某题的标签（metadata.tags）
function tagsOf(q) {
  return Array.isArray(q.metadata?.tags) ? q.metadata.tags : []
}

// ---------------- 收纳 / 筛选 / 分页 ----------------
const searchKeyword = ref('')
// 难度筛选：0=全部，1-5 精确匹配
const filterDifficulty = ref(0)
// 来源筛选：all=全部，manual=手动创建，ai=大纲生成（关联视频）
const filterSource = ref('all')
// 大纲（关联视频）筛选：all=全部，none=未关联，其他为具体 vid
const filterVid = ref('all')
const currentPage = ref(1)
const pageSize = ref(12)
// 已展开的题目 id 集合（默认全部收起，实现“收纳”）
const expandedIds = ref([])

const filteredQuestions = computed(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  return questions.value.filter((q) => {
    if (filterDifficulty.value && Number(q.difficulty) !== filterDifficulty.value) return false
    if (filterSource.value !== 'all' && sourceOf(q) !== filterSource.value) return false
    if (filterVid.value === 'none') {
      if (q.vid) return false
    } else if (filterVid.value !== 'all' && q.vid !== filterVid.value) {
      return false
    }
    if (kw) {
      const hay = [q.knowledgePoint, q.questionText, ...tagsOf(q)].join(' ').toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

const total = computed(() => filteredQuestions.value.length)

const pagedQuestions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredQuestions.value.slice(start, start + pageSize.value)
})

function isExpanded(id) {
  return expandedIds.value.includes(id)
}

function toggleExpand(id) {
  const i = expandedIds.value.indexOf(id)
  if (i === -1) expandedIds.value.push(id)
  else expandedIds.value.splice(i, 1)
}

const allExpanded = computed(
  () => pagedQuestions.value.length > 0 && pagedQuestions.value.every((q) => isExpanded(q.id))
)

function toggleExpandAll() {
  expandedIds.value = allExpanded.value ? [] : pagedQuestions.value.map((q) => q.id)
}

// 筛选条件变化回到第一页
function onFilterChange() {
  currentPage.value = 1
}

// 列表变短（筛选/删除）时收敛当前页，避免停留在空白页
watch(filteredQuestions, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

/** 删除题目（二次确认） */
async function deleteQuestion(q) {
  const preview = (q.questionText || '').slice(0, 20)
  try {
    await ElMessageBox.confirm(`确定删除题目「${preview}…」吗？删除后不可恢复。`, '删除题目', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    })
  } catch {
    return
  }
  try {
    const res = await window.api.quizDelete(q.id)
    if (res && res.ok) {
      ElMessage.success('题目已删除')
      await loadQuestions()
    } else {
      ElMessage.error(`删除失败：${res ? res.errMsg : '接口无响应'}`)
    }
  } catch (e) {
    console.error('删除题目异常：', e)
    ElMessage.error('删除失败')
  }
}

// ---------------- 大纲（关联视频）列表 ----------------
// 供创建/编辑时选择关联大纲，以及列表“按大纲分类”筛选使用
const outlineVideos = ref([])

async function loadOutlineVideos() {
  try {
    const list = await window.api.quizOutlineVideos()
    outlineVideos.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('获取大纲视频列表失败：', e)
  }
}

/** 根据 vid 取大纲（视频）标题，找不到时回退短 vid */
function outlineTitle(vid) {
  if (!vid) return ''
  const hit = outlineVideos.value.find((v) => v.vid === vid)
  return hit ? hit.title || '（无标题）' : String(vid).slice(0, 12)
}

// 来源：优先看 metadata.source，旧数据回退“有 vid 视为 ai”
function sourceOf(q) {
  return q.metadata?.source || (q.vid ? 'ai' : 'manual')
}

// ---------------- 通过大纲生成 ----------------
const genDialogVisible = ref(false)
const genLoadingList = ref(false)
const selectedVid = ref('')
const generating = ref(false)
// 期望生成的题目数量，默认 10
const genCount = ref(10)

async function openGenDialog() {
  genDialogVisible.value = true
  selectedVid.value = ''
  genCount.value = 10
  genLoadingList.value = true
  await loadOutlineVideos()
  if (!outlineVideos.value.length) {
    ElMessage.info('暂无带大纲数据的视频')
  }
  genLoadingList.value = false
}

function pickVideo(vid) {
  selectedVid.value = vid
}

async function doGenerate() {
  if (!selectedVid.value) {
    ElMessage.warning('请先选择一个视频')
    return
  }
  generating.value = true
  try {
    const res = await window.api.quizGenerate(selectedVid.value, genCount.value)
    if (res && res.ok) {
      ElMessage.success(`已生成 ${res.count} 道题目`)
      genDialogVisible.value = false
      await loadQuestions()
    } else {
      ElMessage.error(`生成失败：${res ? res.errMsg : '接口无响应'}`)
    }
  } catch (e) {
    console.error('AI 生成题目异常：', e)
    ElMessage.error('生成失败，请检查网络或模型配置')
  } finally {
    generating.value = false
  }
}

// ---------------- 手动创建 / 编辑题目 ----------------
const createDialogVisible = ref(false)
const submitting = ref(false)
// 编辑模式：为 null 时是新建，为题目 id 时是编辑（新建/编辑复用同一弹窗与表单）
const editingId = ref(null)
// 编辑时保留原题目未展示在表单中的字段（gameplayPayload），保存时原样回写
const editingGameplayPayload = ref(null)
// 编辑时保留原来源（ai/manual），避免手动编辑 AI 题时来源被重置
const editingSource = ref(null)
const createForm = reactive({
  knowledgePoint: '',
  questionText: '',
  explanation: '',
  difficulty: 3,
  sourceTimestamp: '',
  tagsText: '',
  // 关联大纲（视频 vid），可为空
  vid: ''
})
// 选项：{ id, text, is_correct }，默认四个，正确答案用 is_correct 单选标记
const options = ref([
  { id: 'opt_1', text: '', is_correct: true },
  { id: 'opt_2', text: '', is_correct: false },
  { id: 'opt_3', text: '', is_correct: false },
  { id: 'opt_4', text: '', is_correct: false }
])
const correctIndex = ref(0)

function resetCreateForm() {
  editingId.value = null
  editingGameplayPayload.value = null
  editingSource.value = null
  createForm.knowledgePoint = ''
  createForm.questionText = ''
  createForm.explanation = ''
  createForm.difficulty = 3
  createForm.sourceTimestamp = ''
  createForm.tagsText = ''
  createForm.vid = ''
  options.value = [
    { id: 'opt_1', text: '', is_correct: true },
    { id: 'opt_2', text: '', is_correct: false },
    { id: 'opt_3', text: '', is_correct: false },
    { id: 'opt_4', text: '', is_correct: false }
  ]
  correctIndex.value = 0
}

function openCreateDialog() {
  resetCreateForm()
  createDialogVisible.value = true
}

/** 打开编辑弹窗：用卡片题目数据回填表单（可修改关联大纲，创建时间不变） */
function openEditDialog(q) {
  resetCreateForm()
  editingId.value = q.id
  editingGameplayPayload.value = q.gameplayPayload || null
  editingSource.value = q.metadata?.source || null
  createForm.knowledgePoint = q.knowledgePoint || ''
  createForm.questionText = q.questionText || ''
  createForm.explanation = q.explanation || ''
  createForm.difficulty = Number(q.difficulty) || 3
  createForm.sourceTimestamp = q.metadata?.source_timestamp || ''
  createForm.tagsText = tagsOf(q).join(',')
  createForm.vid = q.vid || ''
  const opts = Array.isArray(q.options) ? q.options : []
  options.value = (opts.length ? opts : [{}]).map((o, i) => ({
    id: o.id || `opt_${i + 1}`,
    text: o.text || '',
    is_correct: !!o.is_correct
  }))
  const ci = options.value.findIndex((o) => o.is_correct)
  correctIndex.value = ci === -1 ? 0 : ci
  // 新增选项的序号接续现有 id，避免 id 重复
  optionSeq = options.value.length
  // 回填完成后打开弹窗（新建/编辑复用同一弹窗）
  createDialogVisible.value = true
}

let optionSeq = 4
function addOption() {
  if (options.value.length >= 8) {
    ElMessage.warning('最多 8 个选项')
    return
  }
  optionSeq += 1
  options.value.push({ id: `opt_${optionSeq}`, text: '', is_correct: false })
}

function removeOption(index) {
  if (options.value.length <= 2) {
    ElMessage.warning('至少保留 2 个选项')
    return
  }
  options.value.splice(index, 1)
  // 删除后收敛正确答案下标
  if (correctIndex.value >= options.value.length) correctIndex.value = options.value.length - 1
}

async function submitCreate() {
  if (!createForm.questionText.trim()) {
    ElMessage.warning('请填写题干')
    return
  }
  const filled = options.value.filter((o) => o.text.trim())
  if (filled.length < 2) {
    ElMessage.warning('至少填写 2 个选项内容')
    return
  }
  // 以 correctIndex 指向的原始项为准标记正确答案
  const payload = {
    vid: (createForm.vid || '').trim() || null,
    knowledgePoint: createForm.knowledgePoint.trim(),
    questionText: createForm.questionText.trim(),
    options: options.value.map((o, i) => ({
      id: o.id,
      text: o.text.trim(),
      is_correct: i === correctIndex.value
    })),
    explanation: createForm.explanation.trim(),
    difficulty: Number(createForm.difficulty) || 3,
    metadata: {
      source_timestamp: createForm.sourceTimestamp.trim(),
      source: editingSource.value || 'manual',
      tags: createForm.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    },
    gameplayPayload: editingGameplayPayload.value || {
      type: 'MCQ',
      settings: { time_limit: 15, show_explanation: true }
    }
  }
  const isEdit = !!editingId.value
  submitting.value = true
  try {
    const res = isEdit
      ? await window.api.quizUpdate({ id: editingId.value, ...payload })
      : await window.api.quizCreateManual(payload)
    if (res && res.ok) {
      ElMessage.success(isEdit ? '题目已更新' : '题目已创建')
      createDialogVisible.value = false
      await loadQuestions()
    } else {
      ElMessage.error(`${isEdit ? '更新' : '创建'}失败：${res ? res.errMsg : '接口无响应'}`)
    }
  } catch (e) {
    console.error(isEdit ? '更新题目异常：' : '手动创建题目异常：', e)
    ElMessage.error(isEdit ? '更新失败' : '创建失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="quiz-bank">
    <!-- 顶部：操作按钮 + 搜索/筛选 -->
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">创建题目</el-button>
      <el-button type="primary" plain :icon="MagicStick" @click="openGenDialog">
        通过大纲生成
      </el-button>
      <span class="list-count">
        共 {{ questions.length }} 题<span v-if="total !== questions.length"
          >，筛选后 {{ total }} 题</span
        >
      </span>
    </div>

    <div class="filter-bar">
      <el-input
        v-model="searchKeyword"
        class="filter-search"
        placeholder="搜索知识点 / 题干 / 标签"
        clearable
        :prefix-icon="Search"
        @input="onFilterChange"
      />
      <el-select v-model="filterSource" class="filter-select" @change="onFilterChange">
        <el-option label="全部来源" value="all" />
        <el-option label="AI 生成" value="ai" />
        <el-option label="手动创建" value="manual" />
      </el-select>
      <el-select v-model="filterDifficulty" class="filter-select" @change="onFilterChange">
        <el-option label="全部难度" :value="0" />
        <el-option v-for="d in [1, 2, 3, 4, 5]" :key="d" :label="`${d} 星`" :value="d" />
      </el-select>
      <el-select
        v-model="filterVid"
        class="filter-outline"
        filterable
        placeholder="按大纲分类"
        @change="onFilterChange"
      >
        <el-option label="全部大纲" value="all" />
        <el-option label="未关联大纲" value="none" />
        <el-option
          v-for="v in outlineVideos"
          :key="v.vid"
          :label="v.title || '（无标题）'"
          :value="v.vid"
        />
      </el-select>
      <el-button
        text
        :icon="ArrowRight"
        :class="{ 'expand-all': allExpanded }"
        @click="toggleExpandAll"
      >
        {{ allExpanded ? '全部收起' : '全部展开' }}
      </el-button>
    </div>

    <!-- 题目列表（紧凑可折叠行） -->
    <div v-loading="loading" class="content">
      <el-empty v-if="!loading && !total" description="没有符合条件的题目" />
      <div v-else class="question-list">
        <div v-for="(q, idx) in pagedQuestions" :key="q.id" class="q-row">
          <div class="q-row-main" @click="toggleExpand(q.id)">
            <el-icon class="q-caret" :class="{ open: isExpanded(q.id) }"><ArrowRight /></el-icon>
            <span class="q-index">{{ (currentPage - 1) * pageSize + idx + 1 }}</span>
            <span class="q-kp-inline">{{ q.knowledgePoint || '（无知识点）' }}</span>
            <span class="q-text-inline">{{ q.questionText }}</span>
            <div class="q-inline-meta">
              <span class="q-difficulty" :title="'难度 ' + (q.difficulty ?? '--')">
                <span class="stars">{{ stars(q.difficulty) }}</span>
              </span>
              <el-tag
                v-if="q.vid"
                size="small"
                type="warning"
                effect="plain"
                class="q-outline-tag"
                :title="'关联大纲：' + outlineTitle(q.vid)"
              >
                {{ outlineTitle(q.vid) }}
              </el-tag>
              <el-tag v-else size="small" type="info" effect="plain">未关联</el-tag>
              <el-tag size="small" :type="sourceOf(q) === 'ai' ? 'success' : 'info'" effect="plain">
                {{ sourceOf(q) === 'ai' ? 'AI' : '手动' }}
              </el-tag>
            </div>
            <div class="q-row-actions" @click.stop>
              <el-button link type="primary" :icon="Edit" @click="openEditDialog(q)"
                >编辑</el-button
              >
              <el-button link type="danger" :icon="Delete" @click="deleteQuestion(q)"
                >删除</el-button
              >
            </div>
          </div>

          <div v-show="isExpanded(q.id)" class="q-row-detail">
            <ul class="q-options">
              <li
                v-for="(opt, i) in q.options"
                :key="opt.id || i"
                :class="['q-option', { correct: opt.is_correct }]"
              >
                <span class="opt-label">{{ optionLabel(i) }}</span>
                <span class="opt-text">{{ opt.text }}</span>
                <el-icon v-if="opt.is_correct" class="opt-check"><Check /></el-icon>
              </li>
            </ul>

            <div v-if="q.explanation" class="q-explain">
              <span class="explain-label">解析：</span>{{ q.explanation }}
            </div>
            <div class="q-detail-foot">
              <div class="q-tags">
                <el-tag
                  v-for="t in tagsOf(q)"
                  :key="t"
                  size="small"
                  effect="plain"
                  class="meta-tag"
                >
                  {{ t }}
                </el-tag>
              </div>
              <div v-if="q.metadata?.source_timestamp" class="q-source">
                原文位置：{{ q.metadata.source_timestamp }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="total > pageSize" class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[12, 24, 36]"
          layout="total, sizes, prev, pager, next"
          background
          small
        />
      </div>
    </div>

    <!-- 通过大纲生成弹窗 -->
    <el-dialog
      v-model="genDialogVisible"
      title="通过大纲生成题目"
      width="560px"
      :close-on-click-modal="false"
    >
      <div v-loading="genLoadingList" class="gen-body">
        <div class="gen-count-row">
          <span class="gen-tip"
            >选择一条已有大纲的视频，由 AI 依据其教学内容举一反三生成互动题目：</span
          >
          <div class="gen-count">
            <span class="gen-count-label">生成数量</span>
            <el-input-number v-model="genCount" :min="1" :max="50" :step="1" size="small" />
          </div>
        </div>
        <el-empty
          v-if="!genLoadingList && !outlineVideos.length"
          description="暂无带大纲数据的视频"
          :image-size="60"
        />
        <div v-else class="video-select">
          <div
            v-for="v in outlineVideos"
            :key="v.vid"
            :class="['video-row', { active: selectedVid === v.vid }]"
            @click="pickVideo(v.vid)"
          >
            <span class="video-title">{{ v.title || '（无标题）' }}</span>
            <span class="video-vid">{{ v.vid }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="genDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="generating"
          :disabled="!selectedVid"
          @click="doGenerate"
        >
          {{ generating ? 'AI 生成中…' : '生成题目' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 手动创建 / 编辑题目弹窗（新建与编辑复用） -->
    <el-dialog
      v-model="createDialogVisible"
      :title="editingId ? '编辑题目' : '创建题目'"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="知识点">
          <el-input
            v-model="createForm.knowledgePoint"
            placeholder="提炼的核心知识点名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="关联大纲（可留空）">
          <el-select
            v-model="createForm.vid"
            placeholder="选择关联的大纲视频，不选则为未关联"
            clearable
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="v in outlineVideos"
              :key="v.vid"
              :label="v.title || '（无标题）'"
              :value="v.vid"
            >
              <span>{{ v.title || '（无标题）' }}</span>
              <span class="opt-vid">{{ v.vid }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="题干" required>
          <el-input
            v-model="createForm.questionText"
            type="textarea"
            :rows="2"
            placeholder="请输入题干描述"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="选项（勾选其中一项为正确答案）" required>
          <div class="opt-editor">
            <div v-for="(opt, i) in options" :key="opt.id" class="opt-edit-row">
              <el-radio v-model="correctIndex" :value="i" class="opt-radio">
                {{ optionLabel(i) }}
              </el-radio>
              <el-input v-model="opt.text" placeholder="完整的选项内容" class="opt-input" />
              <el-button link type="danger" :icon="Delete" @click="removeOption(i)">删除</el-button>
            </div>
            <el-button link type="primary" :icon="Plus" @click="addOption">添加选项</el-button>
          </div>
        </el-form-item>

        <el-form-item label="答案解析">
          <el-input
            v-model="createForm.explanation"
            type="textarea"
            :rows="2"
            placeholder="详细的答案解析（选填）"
          />
        </el-form-item>

        <div class="form-row">
          <el-form-item label="题目难度" class="row-cell">
            <el-slider v-model="createForm.difficulty" :min="1" :max="5" :step="1" show-stops />
          </el-form-item>
          <el-form-item label="原文位置/时间戳" class="row-cell">
            <el-input
              v-model="createForm.sourceTimestamp"
              placeholder="如 12:30 或段落2"
              clearable
            />
          </el-form-item>
        </div>

        <el-form-item label="标签（多个用英文逗号分隔）">
          <el-input v-model="createForm.tagsText" placeholder="标签1,标签2" clearable />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.quiz-bank {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  box-sizing: border-box;
}

.toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
}

.list-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.filter-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
}

.filter-search {
  width: 260px;
}

.filter-select {
  width: 130px;
}

.filter-outline {
  width: 200px;
}

.q-outline-tag {
  max-width: 160px;
}

.q-outline-tag :deep(.el-tag__content) {
  display: inline-block;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.opt-vid {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.filter-bar .expand-all :deep(svg) {
  transition: transform 0.2s;
  transform: rotate(90deg);
}

.question-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}

.q-row {
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.q-row:last-child {
  border-bottom: none;
}

.q-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
}

.q-row-main:hover {
  background: var(--el-fill-color-light);
}

.q-caret {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
}

.q-caret.open {
  transform: rotate(90deg);
}

.q-index {
  flex-shrink: 0;
  width: 22px;
  text-align: right;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.q-kp-inline {
  flex-shrink: 0;
  max-width: 160px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.q-text-inline {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.q-inline-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.q-row-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.q-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-tag {
  --el-tag-text-color: var(--el-text-color-secondary);
}

.q-difficulty {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.q-difficulty .stars {
  color: #f5a623;
  letter-spacing: 1px;
}

.q-row-detail {
  padding: 4px 14px 14px 46px;
  background: var(--el-fill-color-lighter);
}

.q-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.q-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  font-size: 13px;
}

.q-option.correct {
  border-color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.opt-label {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.q-option.correct .opt-label {
  background: var(--el-color-success);
  color: #fff;
}

.opt-text {
  flex: 1;
  color: var(--el-text-color-primary);
}

.opt-check {
  color: var(--el-color-success);
}

.q-explain {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.explain-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.q-source {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.q-detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.pager {
  display: flex;
  justify-content: center;
  padding-top: 14px;
}

/* 通过大纲生成弹窗 */
.gen-tip {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.gen-count-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.gen-count {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.gen-count-label {
  font-size: 13px;
  color: var(--el-text-color-primary);
}

.video-select {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.video-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.video-row:last-child {
  border-bottom: none;
}

.video-row:hover {
  background: var(--el-fill-color-light);
}

.video-row.active {
  background: var(--el-color-primary-light-9);
}

.video-title {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-row.active .video-title {
  color: var(--el-color-primary);
  font-weight: 600;
}

.video-vid {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 手动创建选项编辑 */
.opt-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opt-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.opt-radio {
  flex-shrink: 0;
  width: 44px;
}

.opt-input {
  flex: 1;
}

.form-row {
  display: flex;
  gap: 20px;
}

.row-cell {
  flex: 1;
}
</style>
