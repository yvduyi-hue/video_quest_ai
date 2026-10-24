<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Folder, VideoCamera, List, Upload, Delete, MoreFilled } from '@element-plus/icons-vue'
import { userStore } from '../stores/userStore.js'
import { uploadStore, TASK_STATUS, TASK_STATUS_TEXT } from '../stores/uploadStore.js'

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
      ElMessage.error(`获取分类失败：${cateRes ? cateRes.message : '接口无响应'}`)
    }

    if (videoRes && videoRes.isSuccess) {
      videos.value = videoRes.originData?.data?.contents ?? []
    } else {
      videos.value = []
    }
    // 先展示已有的课件判定（非课件右上角黄色 tag）
    loadCourseware()
    // 后台同步智能字幕（不阻塞列表 loading）：未记录的先查询、无则创建，完成后刷新本地集合
    syncSubtitles()
  } catch (e) {
    items.value = []
    videos.value = []
    console.error('加载文件夹内容异常：', e)
    ElMessage.error('加载失败，请检查网络')
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
  fetchCata(cata.cataid)
}

// 点击面包屑回退到某一层
function goToCrumb(index) {
  if (index === breadcrumbs.value.length - 1) return
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1)
  fetchCata(breadcrumbs.value[index].cataid)
}

// 新建文件夹：复用注册时的 addCate 接口，parentid 为当前所在文件夹 id
async function newFolder() {
  const parentId = currentCataid.value
  if (parentId === undefined || parentId === null || parentId === '') {
    ElMessage.error('未获取到当前文件夹ID，请重新登录')
    return
  }
  let name
  try {
    const r = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空'
    })
    name = r.value
  } catch {
    return // 用户取消
  }
  loading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'addCate',
      method: 'POST',
      params: { cataname: name, parentid: String(parentId) }
    })
    console.log('addCate 响应：', res)
    if (res && res.isSuccess) {
      ElMessage.success('文件夹创建成功')
      await fetchCata(parentId)
    } else {
      ElMessage.error(`创建失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('新建文件夹异常：', e)
    ElMessage.error('创建失败，请检查网络')
  } finally {
    loading.value = false
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

// 删除视频：调 del-videos（vids 逗号分隔），成功后从当前列表移除该项
async function removeVideo(v) {
  const vid = v.vid
  if (!vid) {
    ElMessage.warning('该视频缺少vid，无法删除')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定彻底删除视频“${v.basicInfo?.title || '（无标题）'}”吗？删除后不可恢复。`,
      '删除视频',
      { type: 'warning', confirmButtonText: '彻底删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户取消
  }
  loading.value = true
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'delVideos',
      method: 'POST',
      // deleteType=2 为彻底删除（不进回收站），同样参与签名
      params: { vids: String(vid), deleteType: '2' }
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

// 卡片···下拉命令：编辑打开弹窗；移动打开分类选择弹窗
function onVideoCommand(cmd, v) {
  if (cmd === 'edit') openEditVideo(v)
  else if (cmd === 'move') openMoveVideo(v)
}

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

// 悬浮图标面板：进度条 status 取值
function progressStatus(status) {
  if (status === TASK_STATUS.SUCCESS) return 'success'
  if (status === TASK_STATUS.FAILED) return 'exception'
  return ''
}

// 继续/重试一个已暂停或失败的任务（store 里会先刷新授权信息，可能失败）
function resumeTask(id) {
  uploadStore.resumeTask(id).catch((e) => {
    console.error('继续上传失败：', e)
    ElMessage.error(e.message || '继续上传失败')
  })
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
function playVideo() {
  const vid = detailVideo.value?.vid
  if (!vid) {
    ElMessage.warning('未获取到vid，无法播放')
    return
  }
  detailVisible.value = false
  router.push({
    path: '/player',
    query: {
      vid,
      title: detailBasic.value.title || '',
      cover: detailBasic.value.coverURL || detailBasic.value.thumbnailURL || ''
    }
  })
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
  fetchCata(rootCataid.value)
})
</script>

<template>
  <div class="video-manage">
    <!-- 顶部：面包屑路径 -->
    <div class="crumb-bar">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item v-for="(c, i) in breadcrumbs" :key="c.cataid ?? i">
          <span :class="['crumb', { active: i === breadcrumbs.length - 1 }]" @click="goToCrumb(i)">
            {{ c.name }}
          </span>
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <!-- 操作按钮 -->
    <div class="toolbar">
      <el-button type="primary" plain @click="newFolder">新建文件夹</el-button>
      <el-button type="primary" plain @click="openUploadDialog">上传视频</el-button>

      <!-- 上传视频右侧的小图标：鼠标悬浮显示当前上传任务与进度 -->
      <el-popover placement="bottom-start" trigger="hover" :width="380">
        <template #reference>
          <el-badge
            :value="uploadStore.activeCount"
            :hidden="uploadStore.activeCount === 0"
            class="task-badge"
          >
            <el-icon class="task-entry" :size="20"><List /></el-icon>
          </el-badge>
        </template>
        <div class="task-panel">
          <div class="task-panel-title">上传任务（{{ uploadStore.tasks.length }}）</div>
          <el-empty v-if="!uploadStore.tasks.length" description="暂无上传任务" :image-size="52" />
          <div v-else class="task-list">
            <div v-for="task in uploadStore.tasks" :key="task.id" class="task-item">
              <div class="task-head">
                <span class="task-name" :title="task.fileName">{{ task.title }}</span>
                <span :class="['task-status', task.status]">{{
                  TASK_STATUS_TEXT[task.status]
                }}</span>
              </div>
              <el-progress :percentage="task.progress" :status="progressStatus(task.status)" />
              <div class="task-foot">
                <span>{{ formatSize(task.size) }}</span>
                <span class="task-ops">
                  <el-button
                    v-if="task.status === TASK_STATUS.UPLOADING"
                    link
                    type="primary"
                    size="small"
                    @click="uploadStore.pauseTask(task.id)"
                  >
                    暂停
                  </el-button>
                  <el-button
                    v-else-if="task.status === TASK_STATUS.WAITING"
                    link
                    type="primary"
                    size="small"
                    @click="resumeTask(task.id)"
                  >
                    继续
                  </el-button>
                  <el-button link type="info" size="small" @click="uploadStore.removeTask(task.id)">
                    移除
                  </el-button>
                </span>
              </div>
              <div v-if="task.error" class="task-msg task-error">{{ task.error }}</div>
              <div v-else-if="task.vid" class="task-msg task-vid" :title="task.vid">
                vid: {{ task.vid }}
              </div>
            </div>
          </div>
        </div>
      </el-popover>
    </div>

    <!-- 文件夹内容 -->
    <div v-loading="loading" class="content">
      <el-empty
        v-if="!loading && items.length === 0 && videos.length === 0"
        description="该目录为空"
      />

      <!-- 子文件夹 -->
      <div v-if="items.length" class="section">
        <div class="section-title">文件夹</div>
        <div class="folder-grid">
          <div
            v-for="cata in items"
            :key="cata.cataid"
            class="folder-item"
            @click="openFolder(cata)"
          >
            <el-icon
              class="del-entry"
              :size="16"
              title="删除文件夹"
              @click.stop="removeFolder(cata)"
            >
              <Delete />
            </el-icon>
            <el-icon class="folder-icon" :size="40"><Folder /></el-icon>
            <div class="folder-name" :title="cata.cataname">{{ cata.cataname }}</div>
            <div class="folder-count">{{ cata.videos ?? 0 }} 个视频</div>
          </div>
        </div>
      </div>

      <!-- 视频列表 -->
      <div v-if="videos.length" class="section">
        <div class="section-title">视频（{{ videos.length }}）</div>
        <div class="video-grid">
          <div v-for="v in videos" :key="v.vid" class="video-card" @click="openVideoDetail(v)">
            <div class="video-thumb">
              <el-image :src="v.basicInfo?.coverURL || v.basicInfo?.thumbnailURL" fit="cover" lazy>
                <template #error>
                  <div class="thumb-error">
                    <el-icon :size="28"><VideoCamera /></el-icon>
                  </div>
                </template>
              </el-image>
              <span class="video-duration">{{ formatDuration(v.basicInfo?.duration) }}</span>
              <!-- 非课件：右上角常驻黄色 tag（AI 判定为教学课件则不显示） -->
              <el-tag
                v-if="isNotCourseware(v.vid)"
                class="courseware-tag"
                type="warning"
                size="small"
                effect="dark"
              >
                非课件
              </el-tag>
              <el-icon class="del-entry" :size="16" title="删除视频" @click.stop="removeVideo(v)">
                <Delete />
              </el-icon>
              <!-- 右下角··：悬浮出现“编辑 / 移动” -->
              <el-dropdown
                class="more-entry"
                trigger="hover"
                placement="bottom-end"
                @command="(cmd) => onVideoCommand(cmd, v)"
              >
                <el-icon class="more-icon" :size="16" title="更多操作" @click.stop>
                  <MoreFilled />
                </el-icon>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="move">移动</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="video-info">
              <div class="video-title" :title="v.basicInfo?.title">
                {{ v.basicInfo?.title || '（无标题）' }}
              </div>
              <div class="video-meta">
                <span>{{ v.basicInfo?.creationTime || '' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 上传视频弹窗：左侧选文件、右侧编辑选中文件的标题与描述 -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="上传视频"
      width="720px"
      :close-on-click-modal="false"
    >
      <div class="pick-bar">
        <el-button :icon="Upload" @click="pickFiles">选择视频文件</el-button>
        <span class="pick-tip">已选 {{ selectedFiles.length }} 个，将上传到当前目录</span>
      </div>

      <div class="pick-body">
        <!-- 左：待上传列表，点击切换选中 -->
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

        <!-- 右：仅选中项可编辑，未选中时不展示输入框 -->
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

    <!-- 隐藏的原生文件选择控件，由弹窗内按钮触发 -->
    <input
      ref="fileInputRef"
      type="file"
      class="file-input"
      multiple
      :accept="VIDEO_ACCEPT"
      @change="onFilePicked"
    />

    <!-- 编辑视频信息弹窗：修改标题 / 标签 / 描述，提交走 video-info -->
    <el-dialog
      v-model="editVisible"
      title="编辑视频信息"
      width="520px"
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

    <!-- 移动视频弹窗：分类树从“根路径”起逐层懒加载，点击任意分类作为目标后提交 changeCata -->
    <el-dialog v-model="moveVisible" title="移动视频" width="460px" :close-on-click-modal="false">
      <div class="move-tip">
        将视频「{{ moveVideo?.title }}」移动到：
        <span v-if="moveTargetName" class="move-target">{{ moveTargetName }}</span>
        <span v-else class="move-target empty">（请选择目标分类）</span>
      </div>
      <!-- 懒加载分类树：根节点为“根路径”，展开时按 cataid 拉取子分类；点击节点选择目标 -->
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

    <!-- 视频详情弹窗：点击视频卡片后按 vid 调 get-video-info，点空白处可关闭 -->
    <el-dialog
      v-model="detailVisible"
      title="视频详情"
      width="780px"
      class="detail-dialog"
      :close-on-click-modal="true"
    >
      <div v-loading="detailLoading" class="detail-body">
        <!-- 概要：封面 + 标题 + 状态 + 关键数据 -->
        <div class="detail-head">
          <el-image
            class="detail-cover"
            :src="detailBasic.coverURL || detailBasic.thumbnailURL"
            fit="cover"
          >
            <template #error>
              <div class="thumb-error">
                <el-icon :size="28"><VideoCamera /></el-icon>
              </div>
            </template>
          </el-image>
          <div class="detail-head-info">
            <div class="detail-title">{{ detailBasic.title || '（无标题）' }}</div>
            <div class="detail-sub">
              <span>时长 {{ formatDuration(detailBasic.duration) }}</span>
              <span>大小 {{ formatSize(detailBasic.size) }}</span>
            </div>
            <div class="detail-tags">
              <el-tag :type="videoStatusType(detailBasic.status)" size="small">
                {{ videoStatusText(detailBasic.status) }}
              </el-tag>
              <!-- 智能字幕状态：未创建 / 生成中 / 已生成（以本地 sqlite 记录为准） -->
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
          <!-- 官方文档标注 metaData.bitrate 单位为 bps（示例值更接近 kbps），此处原样展示接口值 -->
          <el-descriptions-item label="码率">{{ detailMeta.bitrate ?? '--' }}</el-descriptions-item>
          <el-descriptions-item label="源文件">
            {{ formatSize(detailMeta.size) }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-block">
          <div class="section-title">转码信息（{{ transcodeList.length }}）</div>
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
  display: flex;
  flex-direction: column;
  padding: 16px 20px;
  box-sizing: border-box;
}

.crumb-bar {
  flex-shrink: 0;
  padding: 4px 0 12px;
}

.crumb {
  cursor: pointer;
  color: var(--el-color-primary);
}

.crumb.active {
  color: var(--el-text-color-primary);
  cursor: default;
}

.toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
}

/* 上传任务入口图标 */
.task-badge {
  margin-left: 6px;
}

.task-entry {
  color: var(--el-color-primary);
  cursor: pointer;
  vertical-align: middle;
}

/* 上传弹窗 */
.file-input {
  display: none;
}

.pick-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.pick-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 左侧选文件 + 右侧编辑的双栏布局 */
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
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

.file-row:hover {
  background: var(--el-fill-color-light);
}

.file-row.active {
  background: var(--el-color-primary-light-9);
}

.file-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.file-row-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row.active .file-row-name {
  color: var(--el-color-primary);
  font-weight: 600;
}

.file-row-size {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.edit-pane {
  flex: 1;
  min-width: 0;
  padding: 12px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}

.edit-source {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

/* 悬浮任务进度面板 */
.task-panel {
  max-height: 320px;
  overflow-y: auto;
}

.task-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 10px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-head,
.task-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.task-head {
  margin-bottom: 4px;
}

.task-foot {
  margin-top: 2px;
  color: var(--el-text-color-secondary);
}

.task-ops :deep(.el-button) {
  margin-left: 6px;
  padding: 0;
  font-size: 12px;
}

.task-name {
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-status.uploading {
  color: var(--el-color-primary);
}

.task-status.success {
  color: var(--el-color-success);
}

.task-status.failed {
  color: var(--el-color-danger);
}

.task-status.waiting {
  color: var(--el-text-color-secondary);
}

.task-error {
  color: var(--el-color-danger);
}

.task-msg {
  margin-top: 2px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-vid {
  color: var(--el-text-color-secondary);
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.folder-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}

.folder-item:hover {
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-color-primary);
}

.folder-icon {
  color: var(--el-color-primary);
}

.folder-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 12px;
}

.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.video-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}

.video-card:hover {
  box-shadow: var(--el-box-shadow-light);
}

.video-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--el-fill-color-light);
}

.video-thumb .el-image {
  width: 100%;
  height: 100%;
}

.thumb-error {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.video-duration {
  position: absolute;
  left: 6px;
  bottom: 8px;
  padding: 1px 6px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
}

/* 卡片右下角“···”更多入口：常驻显示（与时长居左错开） */
.more-entry {
  position: absolute;
  right: 6px;
  bottom: 8px;
  z-index: 3;
  line-height: 0;
}

.more-icon {
  padding: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.more-icon:hover {
  background: var(--el-color-primary);
}

/* 卡片右上角删除入口：默认隐藏，hover 卡片时淡入 */
.del-entry {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  padding: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.del-entry:hover {
  background: var(--el-color-danger);
}

.folder-item:hover .del-entry,
.video-card:hover .del-entry {
  opacity: 1;
}

/* 非课件黄色 tag：左上角常驻 */
.courseware-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
}

.video-info {
  padding: 8px 10px;
}

.video-title {
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 视频详情弹窗 */
.detail-dialog :deep(.el-dialog__body) {
  max-height: 58vh;
  overflow-y: auto;
}

.detail-head {
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}

.detail-cover {
  flex-shrink: 0;
  width: 240px;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-fill-color-light);
}

.detail-head-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-vid {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-sub {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.detail-desc {
  margin-bottom: 16px;
}

.detail-desc :deep(.el-descriptions__label) {
  width: 90px;
}

.detail-block {
  margin-bottom: 16px;
}

/* 移动视频弹窗：顶部提示 + 懒加载分类树 */
.move-tip {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
}

.move-target {
  color: var(--el-color-primary);
  font-weight: 600;
}

.move-target.empty {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.move-tree {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 6px;
}
</style>
