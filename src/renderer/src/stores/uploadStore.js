/**
 * Polyv 视频上传状态（模块单例，响应式共享，风格同 userStore.js）
 *
 * SDK 实例与任务列表保存在模块级：主界面切路由会重新挂载 VideoManageView，
 * 放在组件内会中断已开始的上传，放在这里则任务与进度全程保留。
 *
 * 鉴权：上传 SDK 用的 sign/hash 与 OpenAPI 的 SHA1 签名算法不同
 * （sign=MD5(secretKey+ptime)、hash=MD5(ptime+writeToken)，均为小写），
 * 凭证只存在主进程，这里通过 window.api.polyvUploadAuth() 取用。
 */
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import PlvVideoUpload from '@polyv/vod-upload-js-sdk'

/** 授权信息 3 分钟内有效，按官方示例提前到 2.5 分钟刷新一次 */
const AUTH_REFRESH_INTERVAL = 3 * 50 * 1000

/** 任务状态 */
export const TASK_STATUS = {
  WAITING: 'waiting',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  FAILED: 'failed'
}

/** 任务状态对应的展示文案 */
export const TASK_STATUS_TEXT = {
  [TASK_STATUS.WAITING]: '排队中',
  [TASK_STATUS.UPLOADING]: '上传中',
  [TASK_STATUS.SUCCESS]: '已完成',
  [TASK_STATUS.FAILED]: '失败'
}

// SDK 实例与授权轮询定时器：模块私有，不进 reactive
let uploader = null
let authTimer = null

export const uploadStore = reactive({
  /** 上传任务列表，元素结构见 buildTask() */
  tasks: [],
  /** 已上传成功的视频数：视频管理页 watch 它来刷新当前目录 */
  succeedCount: 0,

  /** 仍在进行（排队或上传中）的任务数，用于角标提示 */
  get activeCount() {
    return this.tasks.filter(
      (t) => t.status === TASK_STATUS.WAITING || t.status === TASK_STATUS.UPLOADING
    ).length
  },

  /**
   * 创建上传任务并开始上传
   * @param {Array<{file: File, title?: string, desc?: string}>} files 待上传文件，标题与描述逐文件填写
   * @param {Object} meta 本批次共用的文件信息
   * @param {string} meta.tag 标签，允许为空
   * @param {string|number} meta.cataid 上传目录（当前所在文件夹，不由用户指定）
   * @returns {Promise<number>} 实际创建成功的任务数
   */
  async addTasks(files, { tag = '', cataid } = {}) {
    if (!files?.length) return 0
    if (cataid === undefined || cataid === null || cataid === '') {
      throw new Error('未获取到当前文件夹ID，请重新登录')
    }

    const instance = getUploader()
    // SDK 用 userData 生成任务标识并在 init 时鉴权，必须先拿到有效授权信息
    await refreshAuth()
    startAuthTimer()

    // luping 固定开启课件优化、keepsource 固定转码、不传 state，均不暴露给用户
    const created = []
    for (const item of files) {
      const fileSetting = {
        title: item.title || item.file.name,
        // 描述允许为空，与标题一样逐文件取值
        desc: item.desc || '',
        cataid: String(cataid),
        tag,
        luping: 1,
        keepsource: 0
      }
      // 文件重复（code 110）、类型不支持（code 111）等由 Error 事件提示，此处返回 null
      const manager = instance.addFile(item.file, fileEvents(), fileSetting)
      if (!manager) continue
      this.tasks.push(buildTask(manager.id, fileSetting, item.file))
      created.push(manager.id)
    }

    // addFile 只入队不启动；逐个 resumeFile 开始，避免 startAll 连带唤醒之前暂停的旧任务
    created.forEach((id) => instance.resumeFile(id))
    return created.length
  },

  /** 暂停单个任务（SDK 记录断点，再次 resume 走断点续传） */
  pauseTask(id) {
    uploader?.stopFile(id)
  },

  /** 继续/重试单个任务 */
  async resumeTask(id) {
    if (!uploader) return
    // 距上次取授权信息可能已超过 3 分钟，续传前先刷新 sign/hash
    await refreshAuth()
    startAuthTimer()
    uploader.resumeFile(id)
  },

  /** 从队列与界面移除单个任务 */
  removeTask(id) {
    uploader?.removeFile(id)
    const index = this.tasks.findIndex((t) => t.id === id)
    if (index > -1) this.tasks.splice(index, 1)
    if (!this.tasks.length) stopAuthTimer()
  }
})

function buildTask(id, fileSetting, file) {
  return {
    id,
    title: fileSetting.title,
    fileName: file.name,
    size: file.size,
    progress: 0,
    status: TASK_STATUS.WAITING,
    vid: '',
    error: ''
  }
}

/** 首次使用时才创建 SDK 实例，未配置凭证时也不会有轮询开销 */
function getUploader() {
  if (uploader) return uploader
  uploader = new PlvVideoUpload({
    region: 'line1',
    events: {
      Error: (err) => {
        console.error('上传 SDK 错误：', err)
        ElMessage.error(`上传出错（${err.code}）：${err.message}`)
      },
      UploadComplete: () => {
        console.info('全部上传任务已完成')
        stopAuthTimer()
      }
    }
  })
  return uploader
}

/** 单个文件的进度回调，按 uploaderid 回写到任务记录上 */
function fileEvents() {
  return {
    FileStarted: (info) => {
      const task = findTask(info.uploaderid)
      if (task) {
        task.status = TASK_STATUS.UPLOADING
        task.progress = 0
      }
    },
    FileProgress: (info) => {
      const task = findTask(info.uploaderid)
      if (task) {
        task.status = TASK_STATUS.UPLOADING
        // 进度到 1 与上传完成之间仍有差距，未完成前最多显示 99%
        task.progress = Math.min(99, Math.round((info.progress || 0) * 100))
      }
    },
    FileSucceed: (info) => {
      const task = findTask(info.uploaderid)
      if (task) {
        task.status = TASK_STATUS.SUCCESS
        task.progress = 100
        task.vid = info.fileData?.vid || ''
      }
      uploadStore.succeedCount++
      // 上传完成后为视频创建智能字幕任务（repetitionEnabled=N，主进程签名并落库）。
      // 此时视频可能仍在转码（非已发布），create 或返回 56800，失败不阻断；
      // 视频管理页加载列表时会通过 smartSubtitleEnsure 兜底再查/再建。
      const vid = task?.vid
      if (vid) {
        window.api
          .smartSubtitleCreate(vid)
          .then((r) => {
            if (r && !r.ok) console.warn(`智能字幕创建未成功 vid=${vid}: ${r.errMsg}`)
          })
          .catch((e) => console.error('创建智能字幕任务异常：', e))
      }
    },
    FileFailed: (info) => {
      const task = findTask(info.uploaderid)
      const message = info.errData?.message || info.errData?.type || '上传失败'
      if (task) {
        task.status = TASK_STATUS.FAILED
        task.error = message
      }
      ElMessage.error(`《${task ? task.title : info.fileData?.title}》上传失败：${message}`)
    },
    FileStopped: (info) => {
      const task = findTask(info.uploaderid)
      if (task) task.status = TASK_STATUS.WAITING
    }
  }
}

function findTask(id) {
  return uploadStore.tasks.find((t) => t.id === id)
}

async function refreshAuth() {
  const auth = await window.api.polyvUploadAuth()
  // 凭证不完整时主进程返回 { error }，sign/hash 缺一上传必失败
  if (!auth || auth.error || !auth.userid) {
    stopAuthTimer()
    throw new Error(
      (auth && auth.error) ||
        '未配置 Polyv 上传凭证，请先在设置界面填写 UserId / SecretKey / WriteToken'
    )
  }
  getUploader().updateUserData(auth)
}

function startAuthTimer() {
  stopAuthTimer()
  authTimer = setInterval(() => {
    refreshAuth().catch((e) => {
      console.error('刷新上传鉴权信息失败：', e)
      stopAuthTimer()
    })
  }, AUTH_REFRESH_INTERVAL)
}

function stopAuthTimer() {
  if (!authTimer) return
  clearInterval(authTimer)
  authTimer = null
}

export default uploadStore
