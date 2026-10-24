import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  /** 写本地文件：filePath 为空或无权限时自动落到默认可写路径（userData） */
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  /** 读本地文件：规则同上 */
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  /** 获取默认可写目录 */
  getDefaultDir: () => ipcRenderer.invoke('file:default-dir'),
  /** 启动时判断默认可写路径下是否存在 config.json */
  hasConfig: () => ipcRenderer.invoke('app:has-config'),
  /** 保存配置（写 config.json 并热更新主进程 polyv 配置） */
  saveConfig: (content) => ipcRenderer.invoke('config:save', content),
  /** 无边框窗口控制 */
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  /** 设置窗口尺寸 */
  windowSetSize: (width, height) => ipcRenderer.send('window:set-size', width, height),
  /** 通用网络请求（主进程执行）：传入 { url, method, params, json, headers }，返回统一格式 { success, status?, data?, error? } */
  request: (options) => ipcRenderer.invoke('net:request', options),
  /** 通用 Polyv 端点请求（签名/凭证由主进程处理，默认用登录用户绑定的凭证）：{ endpoint, method, params, config? } */
  polyvEndpoint: (options) => ipcRenderer.invoke('polyv:endpoint', options),
  /** 上传 SDK 鉴权信息：由主进程用登录用户绑定的凭证算出 { userid, ptime, sign, hash } */
  polyvUploadAuth: () => ipcRenderer.invoke('polyv:upload-auth'),
  /** 智能字幕：获取本地已记录字幕的 vid 列表 */
  smartSubtitleRecordedVids: () => ipcRenderer.invoke('smart-subtitle:recorded-vids'),
  /** 智能字幕：为单个视频创建字幕任务（上传完成后调用），成功则落库 */
  smartSubtitleCreate: (vid) => ipcRenderer.invoke('smart-subtitle:create', vid),
  /** 智能字幕：批量同步（未记录的先查询、无则创建），返回 { recorded: vid[] } */
  smartSubtitleEnsure: (vids) => ipcRenderer.invoke('smart-subtitle:ensure', vids),
  /** 注册用户：创建 Polyv 用户分类，并将用户信息与当时生效的 Polyv 凭证一起写入本地 sqlite（主进程执行） */
  registerUser: (info) => ipcRenderer.invoke('user:register', info),
  /** 登录：本地 sqlite 比对，成功后用户信息与其绑定的 Polyv 凭证保存在主进程内存 */
  loginUser: (info) => ipcRenderer.invoke('user:login', info),
  /** 获取当前登录用户（内存会话，未登录返回 null） */
  getCurrentUser: () => ipcRenderer.invoke('user:current'),
  /** 退出登录：清空主进程内存会话及其绑定的 Polyv 凭证 */
  logoutUser: () => ipcRenderer.invoke('user:logout'),
  /** 当前生效的 Polyv 凭证：登录用户绑定的优先，未登录回落 config.json */
  getPolyvCredentials: () => ipcRenderer.invoke('user:polyv-credentials'),
  /** 保存 Polyv 凭证到登录用户绑定列并热更新内存会话；UserId 与绑定值不同时仅返回 userIdChanged */
  savePolyvCredentials: (creds) => ipcRenderer.invoke('user:polyv-credentials:save', creds),
  /** 互动题库：获取已有大纲数据的视频列表 */
  quizOutlineVideos: () => ipcRenderer.invoke('quiz:outline-videos'),
  /** 互动题库：从 sqlite 加载题目列表 */
  quizList: () => ipcRenderer.invoke('quiz:list'),
  /** 互动题库：手动创建一道题目（不关联视频） */
  quizCreateManual: (payload) => ipcRenderer.invoke('quiz:create-manual', payload),
  /** 互动题库：依据视频大纲调 AI 生成题目并落库（count 为期望数量，默认 10） */
  quizGenerate: (vid, count) => ipcRenderer.invoke('quiz:generate', vid, count),
  /** 互动题库：更新一道已有题目（编辑 AI 生成或手动创建的题目） */
  quizUpdate: (payload) => ipcRenderer.invoke('quiz:update', payload),
  /** 互动题库：删除一道题目 */
  quizDelete: (id) => ipcRenderer.invoke('quiz:delete', id),
  /** 视频大纲：按 vid 查询 video_outline 表已有记录（无则返回 null），用于播放页展示大纲面板 */
  videoOutlineGet: (vid) => ipcRenderer.invoke('video-outline:get', vid),
  /** 视频大纲：列出已判定课件性的记录 [{ vid, isCourseware }]，供视频卡片标注“非课件” */
  videoOutlineCoursewareList: () => ipcRenderer.invoke('video-outline:courseware-list'),
  /** 视频大纲：编辑视频信息后同步更新本地 video_outline 的标题（仅已存在行） */
  videoOutlineUpdateTitle: (payload) => ipcRenderer.invoke('video-outline:update-title', payload),
  /** 游戏：记录一次作答（答错自动合并进错题本），userId 由主进程会话补充 */
  gameRecordAnswer: (payload) => ipcRenderer.invoke('game:record-answer', payload),
  /** 游戏：数据看板统计（总闯关次数/答题/正确率/错题数等） */
  gameStats: () => ipcRenderer.invoke('game:stats'),
  /** 游戏：闯关历史（按 session 聚合，默认最近 50 局） */
  gameHistory: (limit) => ipcRenderer.invoke('game:history', limit),
  /** 游戏：清空答题历史 */
  gameHistoryClear: () => ipcRenderer.invoke('game:history:clear'),
  /** 错题本：列表（可按 {difficulty, vid, keyword} 筛选） */
  wrongBookList: (filters) => ipcRenderer.invoke('game:wrong-book:list', filters),
  /** 错题本：删除一条 */
  wrongBookDelete: (id) => ipcRenderer.invoke('game:wrong-book:delete', id),
  /** 错题本：清空 */
  wrongBookClear: () => ipcRenderer.invoke('game:wrong-book:clear')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
