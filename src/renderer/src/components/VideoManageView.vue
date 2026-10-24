<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ChatDotSquare,
  Document,
  Folder,
  FolderAdd,
  Grid,
  List,
  Search,
  Upload,
  VideoCamera,
  WarningFilled
} from '@element-plus/icons-vue'
import { userStore } from '../stores/userStore.js'
import { uploadStore } from '../stores/uploadStore.js'
import PageHeader from './common/PageHeader.vue'
import SectionHeader from './common/SectionHeader.vue'
import StatCard from './common/StatCard.vue'
import EmptyState from './common/EmptyState.vue'
import FolderCard from './video/FolderCard.vue'
import VideoCard from './video/VideoCard.vue'
import FolderCreateDialog from './video/FolderCreateDialog.vue'

// 登录用户的根分类 id（注册时创建的 VideoQuestAI_User_ 分类）
const rootCataid = computed(() => userStore.user?.categoryId)

const router = useRouter()

const loading = ref(false)
// 当前目录下的子分类列表
const items = ref([])
// 当前目录下的已上传视频列表（search-videos 返回的 contents）
const videos = ref([])
// 面包屑路径：[{ cataid, name }]，首项固定为"根路径"
const breadcrumbs = ref([])

// ---------------- 视频筛选 / 排序 / 视图 ----------------
// 搜索与筛选只作用于当前文件夹已加载的视频，不改变后端返回的数据
const searchKeyword = ref('')
const statusFilter = ref('all')
const sortBy = ref('newest')
const viewMode = ref('grid')

// 页面级错误提示：加载失败时用行内提示替代只弹 toast，便于重试
const loadError = ref('')

// 当前文件夹内题目统计（真实数据，来自 quiz_question 表）
const quizQuestions = ref([])

// 新建文件夹弹窗
const folderDialogVisible = ref(false)
const folderSubmitting = ref(false)

// 本地已记录的字幕状态映射 { [vid]: 'creating' | 'done' }（源自 sqlite，供详情弹窗 tag 判断）
const subtitleStatus = ref({})
// 返回 undefined(未创建) / 'creating'(生成中) / 'done'(已生成)
function subtitleState(vid) {
  return vid ? subtitleStatus.value[String(vid)] : undefined
}
// 用 [{ vid, status }] 列表重建映射
function refreshSubtitleMap(list) {
  const map = {}
  for (const it of list || []) {
    if (it && it.vid) map[String(it.vid)] = it.status || 'creating'
  }
  subtitleStatus.value = map
}

// 课件判定映射 { [vid]: 1=课件 | 0=非课件 }（源自 video_outline.is_courseware，未判定则无键）
const coursewareMap = ref({})
// 是否为“非课件”（仅显式判定为 0 时返回 true；未判定/课件返回 false）
function isNotCourseware(vid) {
  return vid != null && coursewareMap.value[String(vid)] === 0
}
// 拉取已判定课件性列表，重建映射
async function loadCourseware() {
  try {
    const list = await window.api.videoOutlineCoursewareList()
    const map = {}
    for (const it of list || []) {
      if (it && it.vid) map[String(it.vid)] = Number(it.isCourseware)
    }
    coursewareMap.value = map
  } catch (e) {
    console.error('读取课件判定列表失败：', e)
  }
}

// 字幕状态对应的 tag 颜色与文案
function subtitleTagType(state) {
  if (state === 'done') return 'success'
  if (state === 'creating') return 'warning'
  return 'info'
}
function subtitleText(state) {
  if (state === 'done') return '已生成智能字幕'
  if (state === 'creating') return '智能字幕生成中'
  return '未创建智能字幕'
}

// 当前所在文件夹 id：面包屑最后一项（根路径时即注册获得的 category_id）
const currentCataid = computed(() => {
  const last = breadcrumbs.value[breadcrumbs.value.length - 1]
  return last && last.cataid !== undefined ? last.cataid : rootCataid.value
})

// ---------------- 展示派生数据（全部来自当前已加载的真实数据） ----------------
const STATUS_GROUPS = {
  published: { label: '已发布', tone: 'success' },
  processing: { label: '处理中', tone: 'warning' },
  pending: { label: '待处理', tone: 'neutral' },
  failed: { label: '异常', tone: 'danger' }
}

function statusGroup(status) {
  const s = Number(status)
  if (s === 60 || s === 61) return 'published'
  if (s === 40 || s === 51 || s === -1) return 'failed'
  if (s === 6 || s === 10 || s === 20 || s === 50) return 'processing'
  return 'pending'
}

function creationTimeMs(video) {
  const raw = String(video?.basicInfo?.creationTime || '').replace(/-/g, '/')
  const time = Date.parse(raw)
  return Number.isFinite(time) ? time : 0
}

function formatTotalDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total < 60) return total > 0 ? '不足 1 分钟' : '0 分钟'
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分钟`
}

const totalDuration = computed(() =>
  videos.value.reduce((sum, video) => {
    const duration = Number(video?.basicInfo?.duration)
    return sum + (Number.isFinite(duration) && duration > 0 ? duration : 0)
  }, 0)
)

const subtitleDoneCount = computed(
  () => videos.value.filter((video) => subtitleState(video.vid) === 'done').length
)
const subtitleCreatingCount = computed(
  () => videos.value.filter((video) => subtitleState(video.vid) === 'creating').length
)
const folderVideoTotal = computed(() =>
  items.value.reduce((sum, folder) => {
    const count = Number(folder?.videos)
    return sum + (Number.isFinite(count) && count > 0 ? count : 0)
  }, 0)
)

const quizStats = computed(() => {
  const currentVids = new Set(videos.value.map((video) => String(video.vid)))
  const related = quizQuestions.value.filter(
    (question) => question?.vid && currentVids.has(String(question.vid))
  )
  return {
    count: related.length,
    linkedVideos: new Set(related.map((question) => String(question.vid))).size
  }
})

const statsLoading = computed(() => loading.value && !videos.value.length && !items.value.length)

const filteredVideos = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const list = videos.value.filter((video) => {
    const group = statusGroup(video?.basicInfo?.status)
    if (statusFilter.value !== 'all' && group !== statusFilter.value) return false
    if (!keyword) return true
    const info = video?.basicInfo || {}
    const haystack = [info.title, info.tags, info.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })

  const sorted = [...list]
  if (sortBy.value === 'oldest') {
    sorted.sort((a, b) => creationTimeMs(a) - creationTimeMs(b))
  } else if (sortBy.value === 'title') {
    sorted.sort((a, b) =>
      String(a?.basicInfo?.title || '').localeCompare(String(b?.basicInfo?.title || ''), 'zh-CN')
    )
  } else if (sortBy.value === 'duration') {
    sorted.sort((a, b) => Number(b?.basicInfo?.duration || 0) - Number(a?.basicInfo?.duration || 0))
  } else {
    sorted.sort((a, b) => creationTimeMs(b) - creationTimeMs(a))
  }
  return sorted
})

const isFiltering = computed(() => !!searchKeyword.value.trim() || statusFilter.value !== 'all')

function resetVideoFilters() {
  searchKeyword.value = ''
  statusFilter.value = 'all'
}

function subtitleTone(state) {
  if (state === 'done') return 'success'
  if (state === 'creating') return 'warning'
  return 'neutral'
}

// 把列表接口的 basicInfo 映射为卡片展示字段，避免卡片组件重复业务判断
function videoCardProps(video) {
  const info = video?.basicInfo || {}
  const group = statusGroup(info.status)
  const subtitle = subtitleState(video?.vid)
  return {
    title: info.title || '（无标题）',
    coverUrl: info.coverURL || info.thumbnailURL || '',
    duration: formatDuration(info.duration),
    statusLabel: STATUS_GROUPS[group].label,
    statusTone: STATUS_GROUPS[group].tone,
    subtitleLabel: subtitleText(subtitle),
    subtitleTone: subtitleTone(subtitle),
    courseware: isNotCourseware(video?.vid),
    meta: info.creationTime || '',
    playable: group === 'published'
  }
}

// 当前文件夹题目统计：只读取一次，切换文件夹时按 vid 重新计算
async function loadQuizQuestions() {
  try {
    const list = await window.api.quizList()
    quizQuestions.value = Array.isArray(list) ? list : []
  } catch (e) {
    console.error('读取题目统计失败：', e)
    quizQuestions.value = []
  }
}

function retryLoad() {
  fetchCata(currentCataid.value)
}

// 从响应中提取"当前分类的子分类列表"
// Polyv cataJson 可能返回请求分类本身（含 nodes），也可能直接返回子分类数组
function extractChildren(res, requestedCataid) {
  const list = res?.originData?.data
  if (!Array.isArray(list)) return []
  const self = list.find((c) => String(c.cataid) === String(requestedCataid))
  if (self) return Array.isArray(self.nodes) ? self.nodes : []
  return list
}

// 加载指定文件夹：并行获取子分类与其下的已上传视频
async function fetchCata(cataid) {
  if (cataid === undefined || cataid === null || cataid === '') {
    ElMessage.error('未获取到用户分类ID，请重新登录')
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    const [cateRes, videoRes] = await Promise.all([
      window.api.polyvEndpoint({
        endpoint: 'getUserCateContent',
        method: 'GET',
        params: { cataid: String(cataid) },
        // 官方约束：ptime 参与签名，cataid 不参与（仅随请求发送）
        signExclude: ['cataid']
      }),
      window.api.polyvEndpoint({
        endpoint: 'searchVideo',
        method: 'GET',
        params: {
          cateId: String(cataid),
          filters: 'basicInfo',
          // 仅当前文件夹（不含子分类）的视频
          containSubCate: 'false',
          page: '1',
          pageSize: '1000',
          sort: 'creationTimeDesc'
        }
        // 按官方示例，search-videos 的业务参数均参与签名，故不传 signExclude
      })
    ])
    console.log('cataJson 响应：', cateRes)
    console.log('search-videos 响应：', videoRes)

    if (cateRes && cateRes.isSuccess) {
      items.value = extractChildren(cateRes, cataid)
    } else {
      items.value = []
      loadError.value = `获取文件夹失败：${cateRes ? cateRes.message : '接口无响应'}`
    }

    if (videoRes && videoRes.isSuccess) {
      // search-videos 仍会返回回收站中的视频（status=-1），列表与统计中排除已删除项
      const contents = videoRes.originData?.data?.contents ?? []
      videos.value = contents.filter((item) => Number(item?.basicInfo?.status) !== -1)
    } else {
      videos.value = []
      loadError.value =
        loadError.value || `获取视频列表失败：${videoRes ? videoRes.message : '接口无响应'}`
    }
    // 先展示已有的课件判定（非课件右上角黄色 tag）
    loadCourseware()
    // 后台同步智能字幕（不阻塞列表 loading）：未记录的先查询、无则创建，完成后刷新本地集合
    syncSubtitles()
  } catch (e) {
    items.value = []
    videos.value = []
    console.error('加载文件夹内容异常：', e)
    loadError.value = '加载失败，请检查网络后重试'
  } finally {
    loading.value = false
  }
}

// 同步当前列表视频的智能字幕：把 { vid, title } 交给主进程批量 ensure（去重、跳过已记录），
// 字幕完成后主进程会基于完整字幕 + 标题调 AI 生成视频大纲（title 供 AI 参考）
async function syncSubtitles() {
  const items = videos.value
    .map((v) => ({ vid: v.vid, title: v.basicInfo?.title }))
    .filter((it) => it.vid)
  if (!items.length) return
  try {
    const res = await window.api.smartSubtitleEnsure(items)
    if (res && Array.isArray(res.recorded)) refreshSubtitleMap(res.recorded)
    // 字幕/AI 判定完成后重拉课件性，新鲜判定的非课件即时标出
    await loadCourseware()
  } catch (e) {
    console.error('同步智能字幕失败：', e)
  }
}

// 进入某个子分类
function openFolder(cata) {
  breadcrumbs.value.push({ cataid: cata.cataid, name: cata.cataname })
  resetVideoFilters()
  fetchCata(cata.cataid)
}

// 点击面包屑回退到某一层
function goToCrumb(index) {
  if (index === breadcrumbs.value.length - 1) return
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  resetVideoFilters()
  fetchCata(breadcrumbs.value[index].cataid)
}

// 新建文件夹：复用注册时的 addCate 接口，parentid 为当前所在文件夹 id
function openFolderDialog() {
  const parentId = currentCataid.value
  if (parentId === undefined || parentId === null || parentId === '') {
    ElMessage.error('未获取到当前文件夹ID，请重新登录')
    return
  }
  folderDialogVisible.value = true
}

async function createFolder(name) {
  const folderName = String(name || '').trim()
  if (!folderName) {
    ElMessage.warning('请输入文件夹名称')
    return
  }
  const parentId = currentCataid.value
  if (parentId === undefined || parentId === null || parentId === '') {
    ElMessage.error('未获取到当前文件夹ID，请重新登录')
    return
  }
  folderSubmitting.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'addCate',
      method: 'POST',
      params: { cataname: folderName, parentid: String(parentId) }
    })
    console.log('addCate 响应：', res)
    if (res && res.isSuccess) {
      ElMessage.success('文件夹创建成功')
      folderDialogVisible.value = false
      await fetchCata(parentId)
    } else {
      ElMessage.error(`创建失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('新建文件夹异常：', e)
    ElMessage.error('创建失败，请检查网络')
  } finally {
    folderSubmitting.value = false
  }
}

// 删除文件夹：调 deleteCata（cataid 参与签名），成功后从当前列表移除该项
async function removeFolder(cata) {
  try {
    await ElMessageBox.confirm(
      `确定删除文件夹“${cata.cataname}”吗？删除后将进入回收站。`,
      '删除文件夹',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  loading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'deleteCata',
      method: 'POST',
      params: { cataid: String(cata.cataid) }
    })
    console.log('deleteCata 响应：', res)
    if (res && res.isSuccess) {
      ElMessage.success('文件夹已删除')
      items.value = items.value.filter((c) => String(c.cataid) !== String(cata.cataid))
    } else {
      ElMessage.error(`删除失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('删除文件夹异常：', e)
    ElMessage.error('删除失败，请检查网络')
  } finally {
    loading.value = false
  }
}

// 删除视频：调 del-videos（vids 逗号分隔），删除到回收站后从当前列表移除该项。
// 说明：当前 Polyv 账号/接口对显式 deleteType（1 或 2）均返回 deleteType illegal，
// 因此使用接口默认删除方式（官方默认 1：进入回收站），避免删除按钮完全不可用。
async function removeVideo(v) {
  const vid = v.vid
  if (!vid) {
    ElMessage.warning('该视频缺少vid，无法删除')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除视频“${v.basicInfo?.title || '（无标题）'}”吗？删除后将进入回收站。`,
      '删除视频',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  loading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'delVideos',
      method: 'POST',
      params: { vids: String(vid) }
    })
    console.log('del-videos 响应：', res)
    if (res && res.isSuccess) {
      ElMessage.success('视频已删除')
      videos.value = videos.value.filter((item) => String(item.vid) !== String(vid))
      // 若详情弹窗正开着该视频，一并关掉避免展示已删数据
      if (detailVideo.value?.vid === vid) detailVisible.value = false
    } else {
      ElMessage.error(`删除失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('删除视频异常：', e)
    ElMessage.error('删除失败，请检查网络')
  } finally {
    loading.value = false
  }
}

// ---------------- 修改视频信息（卡片右下··· → 编辑） ----------------
const editVisible = ref(false)
const editLoading = ref(false)
const editSubmitting = ref(false)
// 表单：vid 为定位视频、title/tag/describ 对应接口参数（describ 为官方拼写）
const editForm = reactive({ vid: '', title: '', tag: '', describ: '' })

// 卡片菜单会直接触发 edit / move / delete，由下面的弹窗与删除流程分别处理

// 打开编辑弹窗：先用列表 basicInfo 兜底，再拉 get-video-info 回填准确的标题/标签/描述
async function openEditVideo(v) {
  if (!v?.vid) {
    ElMessage.warning('该视频缺少vid，无法编辑')
    return
  }
  editForm.vid = v.vid
  editForm.title = v.basicInfo?.title || ''
  editForm.tag = v.basicInfo?.tags || ''
  editForm.describ = v.basicInfo?.description || ''
  editVisible.value = true
  editLoading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'getVideoInfo',
      method: 'GET',
      params: { vid: String(v.vid) }
    })
    if (res && res.isSuccess) {
      const list = Array.isArray(res.originData?.data) ? res.originData.data : []
      const info = list.find((d) => String(d.vid) === String(v.vid)) || list[0]
      const basic = info?.basicInfo || {}
      editForm.title = basic.title ?? editForm.title
      editForm.tag = basic.tags ?? editForm.tag
      editForm.describ = basic.description ?? editForm.describ
    }
  } catch (e) {
    console.error('获取视频信息失败：', e)
  } finally {
    editLoading.value = false
  }
}

// 提交修改：调 video-info（POST），仅对有值的 title/tag/describ 提交，成功后刷新当前目录
async function submitEditVideo() {
  if (!editForm.vid) return
  const title = editForm.title.trim()
  if (!title) {
    ElMessage.warning('标题不能为空')
    return
  }
  editSubmitting.value = true
  try {
    const params = { vid: String(editForm.vid), title }
    const tag = editForm.tag.trim()
    const describ = editForm.describ.trim()
    if (tag) params.tag = tag
    if (describ) params.describ = describ
    const res = await window.api.polyvEndpoint({
      endpoint: 'updateVideoInfo',
      method: 'POST',
      params
    })
    console.log('video-info 修改响应：', res)
    if (res && res.isSuccess) {
      // 同步更新本地 video_outline 的标题（若该视频已入库字幕/大纲），失败不阻断主流程
      try {
        await window.api.videoOutlineUpdateTitle({ vid: editForm.vid, title })
      } catch (e) {
        console.error('更新本地大纲标题失败：', e)
      }
      ElMessage.success('视频信息已更新')
      editVisible.value = false
      await fetchCata(currentCataid.value)
    } else {
      ElMessage.error(`保存失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('修改视频信息异常：', e)
    ElMessage.error('保存失败，请检查网络')
  } finally {
    editSubmitting.value = false
  }
}

// ---------------- 移动视频到指定分类（卡片··· → 移动） ----------------
const moveVisible = ref(false)
const moveSubmitting = ref(false)
// 待移动视频：{ vid, title }；目标分类：cataid + 展示名
const moveVideo = ref(null)
const moveTargetCataid = ref(null)
const moveTargetName = ref('')

function openMoveVideo(v) {
  if (!v?.vid) {
    ElMessage.warning('该视频缺少vid，无法移动')
    return
  }
  moveVideo.value = { vid: v.vid, title: v.basicInfo?.title || '（无标题）' }
  moveTargetCataid.value = null
  moveTargetName.value = ''
  moveVisible.value = true
}

// 懒加载分类树：根节点为“根路径”（rootCataid），子节点按 cataid 调 cataJson 获取
// 与列表一致：ptime 参与签名、cataid 不参与（仅随请求发送）
function loadCataNode(node, resolve) {
  if (node.level === 0) {
    resolve([{ cataid: rootCataid.value, cataname: '根路径' }])
    return
  }
  const cataid = node.data.cataid
  window.api
    .polyvEndpoint({
      endpoint: 'getUserCateContent',
      method: 'GET',
      params: { cataid: String(cataid) },
      signExclude: ['cataid']
    })
    .then((res) => {
      const children = extractChildren(res, cataid)
      resolve(children.map((c) => ({ cataid: c.cataid, cataname: c.cataname })))
    })
    .catch((e) => {
      console.error('加载分类子项失败：', e)
      resolve([])
    })
}

// 选中一个分类作为目标（当前所在分类不可选，避免原地移动）
function onMoveNodeClick(data) {
  if (String(data.cataid) === String(currentCataid.value)) {
    ElMessage.info('视频当前就在该分类中')
    return
  }
  moveTargetCataid.value = data.cataid
  moveTargetName.value = data.cataname
}

// 提交移动：调 changeCata（POST，业务参数 vids/cataid 均参与签名），成功后刷新当前目录
async function submitMove() {
  const vid = moveVideo.value?.vid
  if (!vid) return
  if (moveTargetCataid.value === null || moveTargetCataid.value === undefined) {
    ElMessage.warning('请先选择目标分类')
    return
  }
  moveSubmitting.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'changeCata',
      method: 'POST',
      params: { vids: String(vid), cataid: String(moveTargetCataid.value) }
    })
    console.log('changeCata 移动响应：', res)
    if (res && res.isSuccess) {
      ElMessage.success(`已移动到“${moveTargetName.value}”`)
      moveVisible.value = false
      await fetchCata(currentCataid.value)
    } else {
      ElMessage.error(`移动失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('移动视频异常：', e)
    ElMessage.error('移动失败，请检查网络')
  } finally {
    moveSubmitting.value = false
  }
}

// 上传视频：SDK 默认支持的媒体类型（不含纯音频），与 acceptedMimeType 保持一致
const VIDEO_ACCEPT = '.mp4,.mov,.avi,.flv,.f4v,.wmv,.3gp,.rmvb,.mkv,.mpg,.webm,.m4v,.ts,.mts'

const uploadDialogVisible = ref(false)
const submitting = ref(false)
const fileInputRef = ref(null)
// 待上传文件列表，每行各自维护 title / desc；这里需要深层响应式才能回写编辑
// （File 不是可代理类型，Vue 会原样返回，不会被包成 proxy）
const selectedFiles = ref([])
// 当前选中行下标，-1 表示未选中，此时右侧编辑区不可用
const selectedIndex = ref(-1)
// 标签为本批次共用信息；上传目录 cataid 取当前目录，luping=1、keepsource=0 由 store 固定
const uploadForm = reactive({ tag: '' })

// 文件行唯一 key，避免同名文件重选时 v-for 错乱
let rowSeq = 0

// 选中的文件行，供编辑区双向绑定
const activeFile = computed(() => selectedFiles.value[selectedIndex.value] ?? null)

function openUploadDialog() {
  uploadDialogVisible.value = true
}

function resetUploadDialog() {
  selectedFiles.value = []
  selectedIndex.value = -1
  uploadForm.tag = ''
}

// “选择视频文件”按钮 -> 触发页面底部隐藏的 input[type=file]
function pickFiles() {
  fileInputRef.value?.click()
}

function onFilePicked(e) {
  const picked = Array.from(e.target.files || [])
  if (picked.length) {
    // 同名同大小视为重复选择，先在前端去重（SDK 也会以 code 110 拦下重复文件）
    const merged = [...selectedFiles.value]
    for (const file of picked) {
      if (merged.some((row) => row.name === file.name && row.size === file.size)) continue
      // 标题默认取本地文件名，描述默认为空，都可分别修改
      merged.push({
        uid: ++rowSeq,
        file,
        name: file.name,
        size: file.size,
        title: file.name,
        desc: ''
      })
    }
    selectedFiles.value = merged
    // 新增行追加在末尾，原有选中项下标不变；首次选择时默认选中第一个
    if (selectedIndex.value === -1) selectedIndex.value = 0
  }
  // 清空控件值，否则取消后再次选中同一文件不会触发 change
  e.target.value = ''
}

function removePicked(index) {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index)
  const last = selectedFiles.value.length - 1
  if (last === -1) {
    selectedIndex.value = -1
    return
  }
  // 删的是选中行之前的行则前移一位；删的是选中行或已越界则收敛到最后一行
  if (index < selectedIndex.value) selectedIndex.value -= 1
  if (selectedIndex.value > last) selectedIndex.value = last
}

async function submitUpload() {
  if (!selectedFiles.value.length) {
    ElMessage.warning('请先选择要上传的视频文件')
    return
  }
  submitting.value = true
  try {
    const count = await uploadStore.addTasks(
      // 标题/描述逐文件取值，标题被清空时回退为本地文件名
      selectedFiles.value.map((row) => ({
        file: row.file,
        title: row.title.trim() || row.name,
        desc: row.desc.trim()
      })),
      { tag: uploadForm.tag.trim(), cataid: currentCataid.value }
    )
    if (count > 0) {
      ElMessage.success(`已创建 ${count} 个上传任务`)
      uploadDialogVisible.value = false
      resetUploadDialog()
    }
  } catch (e) {
    console.error('创建上传任务失败：', e)
    ElMessage.error(e.message || '创建上传任务失败')
  } finally {
    submitting.value = false
  }
}

// 文件大小可读化，如 12.30 MB
function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}

// 有视频上传成功后刷新当前目录，让新视频出现在列表里
watch(
  () => uploadStore.succeedCount,
  () => {
    if (currentCataid.value) fetchCata(currentCataid.value)
  }
)

// 时长（秒）格式化为 mm:ss / hh:mm:ss
function formatDuration(sec) {
  const s = Number(sec)
  if (!Number.isFinite(s) || s < 0) return '--:--'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
}

// ---------------- 视频详情（get-video-info） ----------------
const detailVisible = ref(false)
const detailLoading = ref(false)
// 接口返回的单个视频对象：{ vid, basicInfo, metaData, transcodeInfos, snapshotInfo }
const detailVideo = ref(null)

// basicInfo.status 官方含义
const VIDEO_STATUS_TEXT = {
  '-1': '已删除',
  10: '等待编码',
  20: '正在编码',
  40: '编码失败',
  50: '等待审核',
  51: '审核不通过',
  60: '已发布',
  61: '已发布',
  6: '转码中'
}

// transcodeInfos.definition 官方含义
const DEFINITION_TEXT = { SOURCE: '原清晰度', LD: '普清', SD: '标清', HD: '高清' }

const detailBasic = computed(() => detailVideo.value?.basicInfo ?? {})
const detailMeta = computed(() => detailVideo.value?.metaData ?? {})
const transcodeList = computed(() =>
  Array.isArray(detailVideo.value?.transcodeInfos) ? detailVideo.value.transcodeInfos : []
)
// tags 为逗号分隔的字符串
const tagList = computed(() =>
  String(detailBasic.value.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
)
const resolutionText = computed(() => {
  const { width, height } = detailMeta.value
  return width && height ? `${width} x ${height}` : '--'
})

function videoStatusText(status) {
  if (status === undefined || status === null || status === '') return '状态未知'
  return VIDEO_STATUS_TEXT[String(status)] || `未知状态(${status})`
}

function videoStatusType(status) {
  const s = Number(status)
  if (s === 60 || s === 61) return 'success'
  if (s === 10 || s === 20 || s === 50) return 'warning'
  if (s === 40 || s === 51 || s === -1) return 'danger'
  return 'info'
}

// 仅“已发布”（60/61）的视频能在线播放
const canPlay = computed(() => {
  const s = Number(detailBasic.value.status)
  return s === 60 || s === 61
})

// 跳转顶层 /player 路由，携带 vid、标题与封面图
function playVideoItem(video) {
  const vid = video?.vid
  if (!vid) {
    ElMessage.warning('未获取到vid，无法播放')
    return
  }
  const info = video.basicInfo || {}
  router.push({
    path: '/player',
    query: {
      vid: String(vid),
      title: info.title || '',
      cover: info.coverURL || info.thumbnailURL || ''
    }
  })
}

function playVideo() {
  if (!detailVideo.value?.vid) {
    ElMessage.warning('未获取到vid，无法播放')
    return
  }
  detailVisible.value = false
  playVideoItem(detailVideo.value)
}

// 详情请求序号：快速切换不同卡片时只认最后一次请求的结果
let detailSeq = 0

// 点击视频卡片：先用列表已有的 basicInfo 兜底展示，再拉完整详情
async function openVideoDetail(video) {
  if (!video?.vid) {
    ElMessage.warning('该视频缺少vid，无法查看详情')
    return
  }
  const seq = ++detailSeq
  detailVideo.value = { vid: video.vid, basicInfo: video.basicInfo ?? {} }
  detailVisible.value = true
  detailLoading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'getVideoInfo',
      method: 'GET',
      // 官方参数：vid（可逗号分隔多个，最多100个），ptime/sign 由主进程补充
      params: { vid: String(video.vid) }
    })
    if (seq !== detailSeq) return
    console.log('get-video-info 响应：', res)
    if (res && res.isSuccess) {
      const list = Array.isArray(res.originData?.data) ? res.originData.data : []
      const info = list.find((d) => String(d.vid) === String(video.vid)) || list[0]
      if (info) {
        detailVideo.value = info
      } else {
        ElMessage.warning('接口未返回该视频的详细信息')
      }
    } else {
      ElMessage.error(`获取视频详情失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    if (seq !== detailSeq) return
    console.error('获取视频详情异常：', e)
    ElMessage.error('获取视频详情失败，请检查网络')
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

onMounted(() => {
  breadcrumbs.value = [{ cataid: rootCataid.value, name: '根路径' }]
  // 先用本地已记录的字幕 vid 渲染 tag，避免等网络同步才能显示
  window.api
    .smartSubtitleRecordedVids()
    .then((list) => refreshSubtitleMap(list))
    .catch((e) => console.error('读取智能字幕记录失败：', e))
  loadQuizQuestions()
  fetchCata(rootCataid.value)
})
</script>

<template>
  <div class="video-manage">
    <PageHeader
      title="视频管理"
      description="管理教学视频，维护智能字幕与互动内容。"
      :badge="statsLoading ? '' : `${items.length + videos.length} 项内容`"
    >
      <template #actions>
        <el-button size="large" :icon="FolderAdd" @click="openFolderDialog">新建文件夹</el-button>
        <el-button size="large" type="primary" :icon="Upload" @click="openUploadDialog">
          上传视频
        </el-button>
      </template>
    </PageHeader>

    <nav class="vq-breadcrumb" aria-label="文件夹路径">
      <span class="vq-breadcrumb__home" aria-hidden="true">
        <el-icon :size="15"><Folder /></el-icon>
      </span>
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.cataid ?? index">
        <button
          type="button"
          class="vq-breadcrumb__item"
          :class="{ 'is-current': index === breadcrumbs.length - 1 }"
          :disabled="index === breadcrumbs.length - 1"
          :aria-current="index === breadcrumbs.length - 1 ? 'page' : undefined"
          @click="goToCrumb(index)"
        >
          {{ crumb.name }}
        </button>
        <span v-if="index < breadcrumbs.length - 1" class="vq-breadcrumb__sep" aria-hidden="true">
          /
        </span>
      </template>
    </nav>

    <div class="stat-grid">
      <StatCard
        :icon="VideoCamera"
        tone="blue"
        label="视频总数"
        :value="statsLoading ? '—' : videos.length"
        :hint="`总时长 ${formatTotalDuration(totalDuration)}`"
      />
      <StatCard
        :icon="Folder"
        tone="purple"
        label="文件夹"
        :value="statsLoading ? '—' : items.length"
        :hint="folderVideoTotal ? `子文件夹共 ${folderVideoTotal} 个视频` : '当前目录'"
      />
      <StatCard
        :icon="Document"
        tone="green"
        label="智能字幕"
        :value="statsLoading ? '—' : subtitleDoneCount"
        :hint="`生成中 ${subtitleCreatingCount} 部`"
        :progress="videos.length ? Math.round((subtitleDoneCount / videos.length) * 100) : null"
      />
      <StatCard
        :icon="ChatDotSquare"
        tone="amber"
        label="互动题目"
        :value="statsLoading ? '—' : quizStats.count"
        :hint="`关联 ${quizStats.linkedVideos} 部视频`"
      />
    </div>

    <div v-if="loadError && (items.length || videos.length)" class="load-error" role="alert">
      <el-icon :size="16" aria-hidden="true"><WarningFilled /></el-icon>
      <span class="load-error__message">{{ loadError }}</span>
      <el-button link type="primary" @click="retryLoad">重试</el-button>
    </div>

    <div v-loading="loading && (items.length > 0 || videos.length > 0)" class="video-content">
      <div
        v-if="loading && !items.length && !videos.length"
        class="loading-skeleton"
        aria-label="正在加载视频内容"
      >
        <div v-for="n in 3" :key="n" class="skeleton-card" aria-hidden="true">
          <div class="skeleton-card__cover"></div>
          <div class="skeleton-card__line is-wide"></div>
          <div class="skeleton-card__line"></div>
        </div>
      </div>

      <div v-else-if="!items.length && !videos.length && loadError" class="page-empty">
        <EmptyState :icon="WarningFilled" title="内容加载失败" :description="loadError">
          <template #actions>
            <el-button type="primary" @click="retryLoad">重新加载</el-button>
          </template>
        </EmptyState>
      </div>

      <div v-else-if="!items.length && !videos.length" class="page-empty">
        <EmptyState
          :icon="VideoCamera"
          title="这个文件夹还是空的"
          description="新建文件夹整理内容，或直接上传教学视频。"
        >
          <template #actions>
            <el-button :icon="FolderAdd" @click="openFolderDialog">新建文件夹</el-button>
            <el-button type="primary" :icon="Upload" @click="openUploadDialog">上传视频</el-button>
          </template>
        </EmptyState>
      </div>

      <template v-else>
        <section v-if="items.length" class="video-section">
          <SectionHeader title="我的文件夹" :count="items.length" />
          <div class="folder-grid">
            <FolderCard
              v-for="folder in items"
              :key="folder.cataid"
              :title="folder.cataname"
              :count="folder.videos ?? 0"
              @open="openFolder(folder)"
              @delete="removeFolder(folder)"
            />
          </div>
        </section>

        <section class="video-section">
          <SectionHeader
            title="视频"
            :count="isFiltering ? `${filteredVideos.length} / ${videos.length}` : videos.length"
          >
            <template #actions>
              <div class="video-toolbar">
                <el-input
                  v-model="searchKeyword"
                  class="video-toolbar__search"
                  size="large"
                  placeholder="搜索视频名称 / 标签"
                  clearable
                  :prefix-icon="Search"
                />
                <el-select
                  v-model="statusFilter"
                  class="video-toolbar__select"
                  size="large"
                  aria-label="筛选视频状态"
                >
                  <el-option label="全部状态" value="all" />
                  <el-option label="已发布" value="published" />
                  <el-option label="处理中" value="processing" />
                  <el-option label="待处理" value="pending" />
                  <el-option label="异常" value="failed" />
                </el-select>
                <el-select
                  v-model="sortBy"
                  class="video-toolbar__select"
                  size="large"
                  aria-label="视频排序"
                >
                  <el-option label="最新上传" value="newest" />
                  <el-option label="最早上传" value="oldest" />
                  <el-option label="按标题" value="title" />
                  <el-option label="按时长" value="duration" />
                </el-select>
                <div class="view-toggle" role="group" aria-label="视图切换">
                  <button
                    type="button"
                    class="view-toggle__btn"
                    :class="{ 'is-active': viewMode === 'grid' }"
                    :aria-pressed="viewMode === 'grid'"
                    title="网格视图"
                    @click="viewMode = 'grid'"
                  >
                    <el-icon :size="16"><Grid /></el-icon>
                  </button>
                  <button
                    type="button"
                    class="view-toggle__btn"
                    :class="{ 'is-active': viewMode === 'list' }"
                    :aria-pressed="viewMode === 'list'"
                    title="列表视图"
                    @click="viewMode = 'list'"
                  >
                    <el-icon :size="16"><List /></el-icon>
                  </button>
                </div>
              </div>
            </template>
          </SectionHeader>

          <div v-if="!videos.length" class="section-empty">
            <EmptyState
              compact
              :icon="VideoCamera"
              title="当前文件夹暂无视频"
              description="上传视频后，这里会显示封面、字幕状态与互动入口。"
            >
              <template #actions>
                <el-button size="large" type="primary" :icon="Upload" @click="openUploadDialog">
                  上传视频
                </el-button>
              </template>
            </EmptyState>
          </div>

          <div v-else-if="!filteredVideos.length" class="section-empty">
            <EmptyState
              compact
              :icon="Search"
              title="没有匹配的视频"
              description="换个关键词，或清除状态筛选后再试。"
            >
              <template #actions>
                <el-button @click="resetVideoFilters">清除筛选</el-button>
              </template>
            </EmptyState>
          </div>

          <div v-else class="video-grid" :class="`is-${viewMode}`">
            <VideoCard
              v-for="video in filteredVideos"
              :key="video.vid"
              v-bind="videoCardProps(video)"
              :view="viewMode"
              @detail="openVideoDetail(video)"
              @edit="openEditVideo(video)"
              @move="openMoveVideo(video)"
              @delete="removeVideo(video)"
              @play="playVideoItem(video)"
            />
          </div>
        </section>
      </template>
    </div>

    <FolderCreateDialog
      v-model="folderDialogVisible"
      :loading="folderSubmitting"
      @submit="createFolder"
    />

    <el-dialog
      v-model="uploadDialogVisible"
      width="min(760px, calc(100vw - 48px))"
      class="vq-video-dialog vq-upload-dialog"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="vq-dialog-head">
          <span class="vq-dialog-head__icon" aria-hidden="true">
            <el-icon :size="20"><Upload /></el-icon>
          </span>
          <div class="vq-dialog-head__text">
            <h3>上传视频</h3>
            <p>支持 MP4 / MOV / WebM 等格式，标题与描述可逐文件修改</p>
          </div>
        </div>
      </template>

      <div class="pick-bar">
        <el-button :icon="Upload" @click="pickFiles">选择视频文件</el-button>
        <span class="pick-tip">已选 {{ selectedFiles.length }} 个，将上传到当前目录</span>
      </div>

      <div class="pick-body">
        <div class="file-list">
          <div
            v-for="(row, i) in selectedFiles"
            :key="row.uid"
            :class="['file-row', { active: i === selectedIndex }]"
            @click="selectedIndex = i"
          >
            <div class="file-row-main">
              <span class="file-row-name" :title="row.title || row.name">
                {{ row.title || row.name }}
              </span>
              <span class="file-row-size">{{ formatSize(row.size) }}</span>
            </div>
            <el-button link type="danger" size="small" @click.stop="removePicked(i)">
              移除
            </el-button>
          </div>
          <el-empty v-if="!selectedFiles.length" description="尚未选择文件" :image-size="52" />
        </div>

        <div class="edit-pane">
          <template v-if="activeFile">
            <div class="edit-source" :title="activeFile.name">源文件：{{ activeFile.name }}</div>
            <el-form label-position="top">
              <el-form-item label="标题">
                <el-input
                  v-model="activeFile.title"
                  placeholder="请输入视频标题"
                  maxlength="100"
                  show-word-limit
                  clearable
                />
              </el-form-item>
              <el-form-item label="描述">
                <el-input
                  v-model="activeFile.desc"
                  type="textarea"
                  :rows="4"
                  maxlength="500"
                  show-word-limit
                  placeholder="选填"
                />
              </el-form-item>
            </el-form>
          </template>
          <el-empty v-else description="请先在左侧选择文件" :image-size="60" />
        </div>
      </div>

      <el-form label-position="top" class="upload-form">
        <el-form-item label="标签">
          <el-input
            v-model="uploadForm.tag"
            placeholder="多个标签用英文逗号分隔，本次全部视频共用，可留空"
            clearable
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitUpload">开始上传</el-button>
      </template>
    </el-dialog>

    <input
      ref="fileInputRef"
      type="file"
      class="file-input"
      multiple
      :accept="VIDEO_ACCEPT"
      @change="onFilePicked"
    />

    <el-dialog
      v-model="editVisible"
      title="编辑视频信息"
      width="min(520px, calc(100vw - 48px))"
      class="vq-video-dialog vq-edit-dialog"
      :close-on-click-modal="false"
    >
      <div v-loading="editLoading">
        <el-form label-position="top">
          <el-form-item label="标题" required>
            <el-input
              v-model="editForm.title"
              placeholder="请输入视频标题"
              maxlength="100"
              show-word-limit
              clearable
            />
          </el-form-item>
          <el-form-item label="标签">
            <el-input
              v-model="editForm.tag"
              placeholder="多个标签用英文逗号分隔，可留空"
              clearable
            />
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="editForm.describ"
              type="textarea"
              :rows="4"
              maxlength="500"
              show-word-limit
              placeholder="选填"
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSubmitting" @click="submitEditVideo">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="moveVisible"
      title="移动视频"
      width="min(480px, calc(100vw - 48px))"
      class="vq-video-dialog vq-move-dialog"
      :close-on-click-modal="false"
    >
      <div class="move-tip">
        将视频「{{ moveVideo?.title }}」移动到：
        <span v-if="moveTargetName" class="move-target">{{ moveTargetName }}</span>
        <span v-else class="move-target empty">（请选择目标分类）</span>
      </div>
      <el-tree
        class="move-tree"
        lazy
        :load="loadCataNode"
        :props="{ label: 'cataname', children: 'children', isLeaf: 'leaf' }"
        node-key="cataid"
        highlight-current
        :expand-on-click-node="false"
        @node-click="onMoveNodeClick"
      />
      <template #footer>
        <el-button @click="moveVisible = false">取消</el-button>
        <el-button type="primary" :loading="moveSubmitting" @click="submitMove">移动</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="detailVisible"
      title="视频详情"
      width="min(900px, calc(100vw - 48px))"
      class="vq-video-dialog vq-detail-dialog"
      :close-on-click-modal="true"
    >
      <div v-loading="detailLoading" class="detail-body">
        <div class="detail-head">
          <el-image
            class="detail-cover"
            :src="detailBasic.coverURL || detailBasic.thumbnailURL"
            fit="cover"
          >
            <template #error>
              <div class="thumb-error">
                <el-icon :size="28"><VideoCamera /></el-icon>
                <span>暂无封面</span>
              </div>
            </template>
          </el-image>

          <div class="detail-head-info">
            <div class="detail-title">{{ detailBasic.title || '（无标题）' }}</div>
            <div v-if="detailVideo?.vid" class="detail-vid" :title="detailVideo.vid">
              vid: {{ detailVideo.vid }}
            </div>
            <div class="detail-sub">
              <span>时长 {{ formatDuration(detailBasic.duration) }}</span>
              <span>大小 {{ formatSize(detailBasic.size) }}</span>
            </div>
            <div class="detail-tags">
              <el-tag :type="videoStatusType(detailBasic.status)" size="small">
                {{ videoStatusText(detailBasic.status) }}
              </el-tag>
              <el-tag :type="subtitleTagType(subtitleState(detailVideo?.vid))" size="small">
                {{ subtitleText(subtitleState(detailVideo?.vid)) }}
              </el-tag>
              <el-tag v-for="t in tagList" :key="t" type="info" size="small">{{ t }}</el-tag>
            </div>
          </div>
        </div>

        <el-descriptions :column="2" border size="small" title="基础信息" class="detail-desc">
          <el-descriptions-item label="创建时间">
            {{ detailBasic.creationTime || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ detailBasic.updateTime || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="视频描述" :span="2">
            {{ detailBasic.description || '（无描述）' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-descriptions :column="3" border size="small" title="视频信息" class="detail-desc">
          <el-descriptions-item label="分辨率">{{ resolutionText }}</el-descriptions-item>
          <el-descriptions-item label="容器格式">
            {{ detailMeta.format || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="编码格式">
            {{ detailMeta.codec || '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="帧率">
            {{ detailMeta.fps ? `${detailMeta.fps} fps` : '--' }}
          </el-descriptions-item>
          <el-descriptions-item label="码率">{{ detailMeta.bitrate ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="源文件">
            {{ formatSize(detailMeta.size) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-block">
          <div class="detail-block__title">转码信息（{{ transcodeList.length }}）</div>
          <el-table v-if="transcodeList.length" :data="transcodeList" size="small" border>
            <el-table-column label="清晰度">
              <template #default="{ row }">
                {{ DEFINITION_TEXT[row.definition] || row.definition || '--' }}
              </template>
            </el-table-column>
            <el-table-column label="格式" prop="format" width="70" />
            <el-table-column label="分辨率" width="110">
              <template #default="{ row }">
                {{ row.width && row.height ? `${row.width} x ${row.height}` : '--' }}
              </template>
            </el-table-column>
            <el-table-column label="码率" width="90">
              <template #default="{ row }">
                {{ row.bitrate == null ? '--' : `${row.bitrate} kbps` }}
              </template>
            </el-table-column>
            <el-table-column label="时长" width="80">
              <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
            </el-table-column>
            <el-table-column label="大小" width="100">
              <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
            </el-table-column>
            <el-table-column label="加密" width="60">
              <template #default="{ row }">{{ row.encrypt ? '是' : '否' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.status === 'normal' ? 'success' : 'danger'" size="small">
                  {{ row.status === 'normal' ? '正常' : '不可用' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无转码信息" :image-size="52" />
        </div>
      </div>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button v-if="canPlay" type="primary" @click="playVideo">播放视频</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.video-manage {
  height: 100%;
  overflow-y: auto;
  padding: 24px 28px 40px;
  box-sizing: border-box;
}

/* ---------- 面包屑 ---------- */
.vq-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 10px 0 20px;
  font-size: var(--vq-font-size-md);
}

.vq-breadcrumb__item {
  padding: 2px 4px;
  border: none;
  border-radius: var(--vq-radius-xs);
  background: transparent;
  color: var(--vq-text-secondary);
  font-size: inherit;
  cursor: pointer;
}

.vq-breadcrumb__home {
  display: inline-flex;
  align-items: center;
  color: var(--vq-text-placeholder);
}

.vq-breadcrumb__item:hover:not(:disabled) {
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-breadcrumb__item.is-current {
  color: var(--vq-text-title);
  font-weight: 600;
  cursor: default;
}

.vq-breadcrumb__sep {
  color: var(--vq-text-placeholder);
}

/* ---------- 指标卡 ---------- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

/* ---------- 加载失败提示 ---------- */
.load-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 10px 14px;
  border: 1px solid #fecdca;
  border-radius: var(--vq-radius-md);
  color: var(--vq-danger-text);
  background: var(--vq-danger-bg);
  font-size: var(--vq-font-size-md);
}

.load-error__message {
  flex: 1;
  min-width: 0;
}

/* ---------- 内容区 ---------- */
.video-content {
  min-height: 260px;
}

.video-section + .video-section {
  margin-top: 28px;
}

.folder-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.video-grid {
  display: grid;
  gap: 20px;
}

.video-grid.is-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.video-grid.is-list {
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

/* ---------- 筛选工具栏 ---------- */
.video-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.video-toolbar__search {
  width: 220px;
}

.video-toolbar__select {
  width: 128px;
}

.view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 40px;
  padding: 3px;
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-sm);
  background: var(--vq-bg-surface);
}

.view-toggle__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--vq-radius-xs);
  background: transparent;
  color: var(--vq-text-tertiary);
  cursor: pointer;
  transition:
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.view-toggle__btn:hover {
  background: var(--vq-bg-hover);
  color: var(--vq-text-title);
}

.view-toggle__btn.is-active {
  background: var(--vq-primary-light);
  color: var(--vq-primary);
}

/* ---------- 空状态 ---------- */
.page-empty,
.section-empty {
  border: 1px dashed var(--vq-border);
  border-radius: var(--vq-radius-lg);
  background: var(--vq-bg-surface);
}

.page-empty {
  margin-top: 4px;
}

.section-empty {
  margin-top: 4px;
}

/* ---------- 骨架屏 ---------- */
.loading-skeleton {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.skeleton-card {
  padding: 0 0 16px;
  overflow: hidden;
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-lg);
  background: var(--vq-bg-surface);
}

.skeleton-card__cover {
  aspect-ratio: 16 / 9;
  background: linear-gradient(90deg, #f2f4f7 25%, #eaecf0 37%, #f2f4f7 63%);
  background-size: 400% 100%;
  animation: vq-skeleton 1.4s ease infinite;
}

.skeleton-card__line {
  height: 10px;
  margin: 14px 16px 0;
  border-radius: var(--vq-radius-pill);
  background: linear-gradient(90deg, #f2f4f7 25%, #eaecf0 37%, #f2f4f7 63%);
  background-size: 400% 100%;
  animation: vq-skeleton 1.4s ease infinite;
}

.skeleton-card__line.is-wide {
  width: 62%;
  height: 14px;
}

@keyframes vq-skeleton {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

/* ---------- 弹窗通用 ---------- */
.vq-video-dialog {
  overflow: hidden;
  border-radius: var(--vq-radius-xl);
}

.vq-video-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 20px 24px 0;
}

.vq-video-dialog :deep(.el-dialog__body) {
  padding: 16px 24px;
}

.vq-video-dialog :deep(.el-dialog__footer) {
  padding: 12px 24px 20px;
  border-top: 1px solid var(--vq-border-light);
}

.vq-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.vq-dialog-head__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--vq-radius-md);
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-dialog-head__text h3 {
  margin: 0;
  font-size: var(--vq-font-size-xl);
  line-height: var(--vq-line-height-xl);
  font-weight: 600;
  color: var(--vq-text-title);
}

.vq-dialog-head__text p {
  margin: 3px 0 0;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
}

/* ---------- 上传弹窗 ---------- */
.vq-upload-dialog :deep(.el-dialog__body) {
  max-height: 64vh;
  overflow-y: auto;
}

.pick-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.pick-tip {
  font-size: var(--vq-font-size-sm);
  color: var(--vq-text-tertiary);
}

.pick-body {
  display: flex;
  gap: 16px;
  height: 300px;
}

.file-list {
  flex-shrink: 0;
  width: 280px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-md);
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: var(--vq-radius-sm);
  cursor: pointer;
}

.file-row:hover {
  background: var(--vq-bg-hover);
}

.file-row.active {
  background: var(--vq-primary-light);
}

.file-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.file-row-name {
  overflow: hidden;
  font-size: var(--vq-font-size-md);
  color: var(--vq-text-title);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.file-row.active .file-row-name {
  color: var(--vq-primary);
  font-weight: 600;
}

.file-row-size {
  font-size: var(--vq-font-size-xs);
  color: var(--vq-text-tertiary);
}

.edit-pane {
  flex: 1;
  min-width: 0;
  padding: 12px;
  overflow-y: auto;
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-md);
}

.edit-source {
  margin-bottom: 10px;
  overflow: hidden;
  font-size: var(--vq-font-size-sm);
  color: var(--vq-text-tertiary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.file-input {
  display: none;
}

/* ---------- 编辑 / 移动 ---------- */
.vq-edit-dialog :deep(.el-dialog__body),
.vq-move-dialog :deep(.el-dialog__body) {
  max-height: 64vh;
  overflow-y: auto;
}

.move-tip {
  margin-bottom: 10px;
  font-size: var(--vq-font-size-md);
  line-height: var(--vq-line-height-md);
  color: var(--vq-text-secondary);
}

.move-target {
  color: var(--vq-primary);
  font-weight: 600;
}

.move-target.empty {
  color: var(--vq-text-tertiary);
  font-weight: 400;
}

.move-tree {
  max-height: 320px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-md);
}

/* ---------- 详情弹窗 ---------- */
.vq-detail-dialog :deep(.el-dialog__body) {
  max-height: calc(100vh - 270px);
  overflow-y: auto;
}

.detail-head {
  display: flex;
  gap: 16px;
  margin-bottom: 18px;
}

.detail-cover {
  flex-shrink: 0;
  width: 260px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--vq-radius-md);
  background: var(--vq-bg-subtle);
}

.thumb-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  color: var(--vq-text-placeholder);
  font-size: var(--vq-font-size-xs);
  background: linear-gradient(135deg, #f2f5ff, #f7f8fb);
}

.detail-head-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-title {
  overflow: hidden;
  font-size: var(--vq-font-size-xl);
  line-height: var(--vq-line-height-xl);
  font-weight: 600;
  color: var(--vq-text-title);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail-vid {
  overflow: hidden;
  font-size: var(--vq-font-size-xs);
  color: var(--vq-text-placeholder);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail-sub {
  display: flex;
  gap: 14px;
  font-size: var(--vq-font-size-sm);
  color: var(--vq-text-tertiary);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-desc {
  margin-bottom: 18px;
}

.detail-desc :deep(.el-descriptions__label) {
  width: 90px;
}

.detail-desc :deep(.el-descriptions__title) {
  font-size: var(--vq-font-size-base);
  font-weight: 600;
  color: var(--vq-text-title);
}

.detail-block {
  margin-bottom: 8px;
}

.detail-block__title {
  margin-bottom: 10px;
  font-size: var(--vq-font-size-base);
  font-weight: 600;
  color: var(--vq-text-title);
}

/* ---------- 响应式 ---------- */
@media (max-width: 1099px) {
  .video-manage {
    padding: 20px 20px 32px;
  }

  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .folder-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .video-grid.is-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loading-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .video-toolbar {
    justify-content: flex-start;
    width: 100%;
  }

  .video-toolbar__search {
    flex: 1;
    min-width: 180px;
    width: auto;
  }

  .folder-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .video-manage {
    padding: 16px 16px 28px;
  }

  .stat-grid,
  .video-grid.is-grid,
  .loading-skeleton {
    grid-template-columns: minmax(0, 1fr);
  }

  .folder-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .video-toolbar__select {
    flex: 1;
    min-width: 120px;
    width: auto;
  }

  .detail-head {
    flex-direction: column;
  }

  .detail-cover {
    width: 100%;
  }

  .pick-body {
    flex-direction: column;
    height: auto;
  }

  .file-list {
    width: 100%;
    max-height: 160px;
  }

  .edit-pane {
    min-height: 200px;
  }

  .vq-video-dialog :deep(.el-dialog__header) {
    padding: 16px 18px 0;
  }

  .vq-video-dialog :deep(.el-dialog__body) {
    padding: 14px 18px;
  }

  .vq-video-dialog :deep(.el-dialog__footer) {
    padding: 10px 18px 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-card__cover,
  .skeleton-card__line {
    animation: none;
  }
}
</style>

<style>
/* Dialog 使用 Teleport 渲染到 body，用全局类名兜底，避免 scoped 属性丢失导致尺寸不生效 */
.vq-video-dialog .el-dialog__header {
  margin: 0;
  padding: 20px 24px 0;
}

.vq-video-dialog .el-dialog__body {
  padding: 16px 24px;
}

.vq-video-dialog .el-dialog__footer {
  padding: 12px 24px 20px;
  border-top: 1px solid var(--vq-border-light);
}

.vq-detail-dialog .el-dialog__body {
  max-height: calc(100vh - 270px);
  overflow-y: auto;
}

.vq-upload-dialog .el-dialog__body {
  max-height: 64vh;
  overflow-y: auto;
}

.vq-edit-dialog .el-dialog__body,
.vq-move-dialog .el-dialog__body {
  max-height: 64vh;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .vq-video-dialog .el-dialog__header {
    padding: 16px 18px 0;
  }

  .vq-video-dialog .el-dialog__body {
    padding: 14px 18px;
  }

  .vq-video-dialog .el-dialog__footer {
    padding: 10px 18px 16px;
  }
}
</style>
