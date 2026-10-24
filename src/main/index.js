import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFileIpc, getDefaultDir, writeLocalFile } from './services/fileService.js'
import { initDb, runSql, getSql } from './services/dbService.js'
import { netRequest } from './services/netService.js'
import { polyvConfig } from './api/config.js'
import {
  getPolyvCreds,
  setSession,
  getSession,
  clearSession,
  credsFromRow,
  credsToColumns,
  POLYV_CRED_COLUMNS
} from './api/session.js'
import PolyvClient from './api/polyvClient.js'
import { polyvEndpoints } from './api/endpoints.js'
import { listSubtitleStates, createAndRecord, ensureForVids } from './api/smartSubtitle.js'
import { getOutlineRow, listCoursewareStates, updateOutlineTitle } from './api/outlineService.js'
import {
  listOutlineVideos,
  listQuestions,
  createManualQuestion,
  updateQuestion,
  deleteQuestion,
  generateQuestionsFromOutline
} from './api/quizService.js'
import {
  recordAnswer,
  getStats,
  listHistory,
  clearHistory,
  listWrong,
  deleteWrong,
  clearWrong
} from './api/gameHistoryService.js'
import CryptoJS from 'crypto-js'
import icon from '../../resources/icon.png?asset'

function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // 无系统标题栏，由渲染进程 TitleBar.vue 自定义标题栏
    frame: false,
    // 应用图标：Windows 开发态任务栏、Linux 均使用资源图标（macOS 忽略此项，走 bundle 图标）
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 允许无任何用户操作（点击/按键）也能自动播放：进入播放页即自动起播
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 无边框窗口控制（自定义标题栏按钮）
  ipcMain.on('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.on('window:toggle-maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  // 设置窗口尺寸（登录后主界面放大到 1200*700）
  ipcMain.on('window:set-size', (e, width, height) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.setSize(Math.max(600, Number(width) || 1200), Math.max(400, Number(height) || 700))
    // 尺寸变化后居中，避免超出屏幕
    win.center()
  })

  // 本地文件读写 IPC（默认可写路径：userData）
  registerFileIpc()

  // 启动时初始化 SQLite 并建表，避免使用时才建表导致 no such table
  initDb().catch((err) => {
    console.error('数据库初始化失败，注册/登录相关功能可能不可用：', err)
  })

  // 启动路由判断：默认可写路径下存在 config.json 则进登录界面，否则进设置界面
  ipcMain.handle('app:has-config', () => {
    return existsSync(join(getDefaultDir(), 'config.json'))
  })

  // 保存配置：写入 config.json 并同步更新主进程内存中的 polyvConfig，polyv 客户端即时生效
  ipcMain.handle('config:save', async (_e, content) => {
    const result = await writeLocalFile('config.json', content)
    if (result.success) {
      try {
        Object.assign(polyvConfig, JSON.parse(content))
      } catch {
        console.error('config 内容不是合法 JSON，内存配置未更新')
      }
    }
    return result
  })

  // 通用网络请求 IPC：渲染进程传入 { url, method, params, json, headers }，主进程统一处理响应
  ipcMain.handle('net:request', async (_e, options = {}) => {
    return await netRequest(options)
  })

  // 通用 Polyv 端点请求：渲染进程只需指定端点名（如 userSpaceInfo/addCate），签名与凭证由主进程处理
  // signExclude：不参与签名但仍随请求发送的参数名列表（如 cataJson 的 cataid）
  // 凭证优先级：渲染层显式传入的 config（设置向导校验未落盘的输入）> 登录用户绑定凭证 > config.json
  ipcMain.handle(
    'polyv:endpoint',
    async (_e, { endpoint, method = 'GET', params = {}, config = {}, signExclude = [] } = {}) => {
      const url = polyvEndpoints[endpoint]
      if (!url) {
        return { isSuccess: false, code: -1, status: 'error', message: `未知端点: ${endpoint}` }
      }
      const client = new PolyvClient({ ...getPolyvCreds(), ...config, send: netRequest })
      // 端点中的 {user_id} 等占位符会被 PolyvClient.format() 自动替换
      return await client[method.toLowerCase()](url, params, { signExclude })
    }
  )

  // 上传 SDK 授权信息：sign=MD5(secretKey+ptime)、hash=MD5(ptime+writeToken)，均为小写
  // （注意：上传鉴权与 API 调用的 SHA1 签名不同），且需每 3 分钟内刷新
  ipcMain.handle('polyv:upload-auth', () => {
    const { userId, secretKey, writeToken } = getPolyvCreds()
    if (!userId || !secretKey || !writeToken) {
      return { error: '未配置 Polyv 上传凭证，请先在设置界面填写 UserId / SecretKey / WriteToken' }
    }
    const ptime = String(Date.now())
    const sign = CryptoJS.MD5(`${secretKey}${ptime}`).toString()
    const hash = CryptoJS.MD5(`${ptime}${writeToken}`).toString()
    return { userid: userId, ptime, sign, hash }
  })

  // 智能字幕（v4 MD5 签名，appId/appSecret）相关 IPC：签名与凭证均在主进程处理
  // 已记录的字幕状态列表 [{ vid, status }]（供渲染层初始化字幕 tag）
  ipcMain.handle('smart-subtitle:recorded-vids', async () => {
    try {
      return await listSubtitleStates()
    } catch (e) {
      console.error('读取智能字幕记录失败：', e)
      return []
    }
  })

  // 单个视频创建字幕任务（上传完成后调用），成功则落库
  ipcMain.handle('smart-subtitle:create', async (_e, vid) => {
    if (!vid) return { ok: false, errMsg: 'vid为空，无法创建字幕' }
    try {
      return await createAndRecord(vid)
    } catch (e) {
      console.error('创建智能字幕任务异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 批量同步：对未记录的 vid 先查询、有则记录、无则创建，返回最新的已记录 vid 列表
  ipcMain.handle('smart-subtitle:ensure', async (_e, vids) => {
    try {
      return { recorded: await ensureForVids(Array.isArray(vids) ? vids : []) }
    } catch (e) {
      console.error('同步智能字幕异常：', e)
      return { recorded: [], error: e.message }
    }
  })

  // 注册用户：先调 addCate 创建用户分类，成功后将用户存入本地 sqlite 并绑定 category_id
  // 注册时生效的全部 Polyv 凭证（除 AI 模型配置）一并写入 polyv_* 列，与该账号永久绑定
  ipcMain.handle('user:register', async (_e, { account, password, nickname } = {}) => {
    if (!account || !password || !nickname) {
      return { success: false, error: '账号、密码、昵称不能为空' }
    }
    try {
      // 账号唯一性检查
      const exists = await getSql('SELECT id FROM user WHERE account = ?', [account])
      if (exists) {
        return { success: false, error: '账号已存在' }
      }

      // 未登录阶段无会话，此处取 config.json / 环境变量中的 Polyv 凭证，后续请求均使用这份绑定凭证
      const creds = getPolyvCreds()

      // 等价 Java：polyvClient.post(PolyvEndpoint.addCate, Map.of("cataname", ..., "parentid", ...))
      // parentid 固定为 1，分类名固定前缀 VideoQuestAI_User_ + 账号
      // 签名/凭证占位符由 PolyvClient 处理后走统一 netRequest 发请求
      const client = new PolyvClient({ ...creds, send: netRequest })
      const polyvResponse = await client.post(polyvEndpoints.addCate, {
        cataname: `VideoQuestAI_User_${account}`,
        parentid: '1'
      })
      if (!polyvResponse || !polyvResponse.isSuccess) {
        return {
          success: false,
          error: `创建用户失败:${polyvResponse ? polyvResponse.message : 'Polyv接口无响应'}`
        }
      }

      // 等价 Java：polyvResponse.getOriginData().getJSONObject("data").getLongValue("cataid")
      const categoryId = polyvResponse.originData?.data?.cataid
      if (categoryId === undefined || categoryId === null) {
        return { success: false, error: '创建用户失败:响应中不包含cataid' }
      }

      // 用户入库，密码存 MD5（等价 passwordMd5），category_id 与新建分类绑定，polyv_* 列保存凭证
      const passwordMd5 = CryptoJS.MD5(password).toString()
      const credColumns = credsToColumns(creds)
      const columnNames = Object.values(POLYV_CRED_COLUMNS)
      const result = await runSql(
        `INSERT INTO user (account, password, nickname, avatar, category_id, ${columnNames.join(', ')})
         VALUES (?, ?, ?, ?, ?, ${columnNames.map(() => '?').join(', ')})`,
        [account, passwordMd5, nickname, '', categoryId, ...columnNames.map((c) => credColumns[c])]
      )
      return {
        success: true,
        userId: result.lastID,
        account,
        nickname,
        categoryId,
        polyvUserId: creds.userId
      }
    } catch (e) {
      console.error('注册用户异常：', e)
      return { success: false, error: `创建用户失败:${e.message}` }
    }
  })

  // 登录：本地 sqlite 查找账号并比对 MD5 密码，成功后用户信息与其绑定的 Polyv 凭证存入主进程内存
  ipcMain.handle('user:login', async (_e, { account, password } = {}) => {
    if (!account || !password) {
      return { success: false, error: '账号和密码不能为空' }
    }
    try {
      const row = await getSql('SELECT * FROM user WHERE account = ?', [account])
      if (!row) {
        return { success: false, error: '账号不存在，请先注册' }
      }
      const passwordMd5 = CryptoJS.MD5(password).toString()
      if (passwordMd5 !== row.password) {
        return { success: false, error: '密码错误' }
      }
      if (row.is_ban) {
        return { success: false, error: '账号已被禁用' }
      }

      // 凭证绑定：本次登录前无会话，getPolyvCreds() 即 config.json 中的全局凭证
      let creds = credsFromRow(row)
      if (!creds.userId) {
        // 本次改造前注册的老用户：用当前全局凭证补绑定一次，之后始终从该账号行读取
        const legacy = credsToColumns(getPolyvCreds())
        const columnNames = Object.values(POLYV_CRED_COLUMNS)
        await runSql(
          `UPDATE user SET ${columnNames.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          [...columnNames.map((c) => legacy[c]), row.id]
        )
        creds = credsFromRow(legacy)
      }

      // 会话中的用户信息不包含密钥，仅带出 Polyv UserId 供界面展示与比对
      const user = {
        id: row.id,
        account: row.account,
        nickname: row.nickname,
        avatar: row.avatar,
        categoryId: row.category_id,
        polyvUserId: creds.userId,
        polyvAppId: creds.appId
      }
      setSession({ user, polyv: creds })
      return { success: true, user }
    } catch (e) {
      console.error('登录异常：', e)
      return { success: false, error: `登录失败:${e.message}` }
    }
  })

  // 获取当前内存中的登录用户（未登录返回 null）
  ipcMain.handle('user:current', () => getSession()?.user ?? null)

  // 当前生效的 Polyv 凭证（登录用户绑定的优先，未登录回落 config.json），供系统设置界面回填
  ipcMain.handle('user:polyv-credentials', () => getPolyvCreds())

  // 保存 Polyv 凭证：凭证属于账号，因此只写回当前登录用户的绑定列并热更新内存会话
  // 若新 UserId 与登录账号绑定的不同，说明配置已指向另一个保利威账号：
  // 不改写原用户行（旧凭证仍属于它），返回 userIdChanged 由渲染层提示并退出登录
  ipcMain.handle('user:polyv-credentials:save', async (_e, creds = {}) => {
    const session = getSession()
    if (!session) return { bound: false, userIdChanged: false }
    if (creds.userId && session.polyv.userId && creds.userId !== session.polyv.userId) {
      return { bound: false, userIdChanged: true }
    }
    const columns = credsToColumns(creds)
    const columnNames = Object.values(POLYV_CRED_COLUMNS)
    await runSql(`UPDATE user SET ${columnNames.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...columnNames.map((c) => columns[c]),
      session.user.id
    ])
    session.polyv = credsFromRow(columns)
    session.user.polyvUserId = session.polyv.userId
    session.user.polyvAppId = session.polyv.appId
    return { bound: true, userIdChanged: false, user: session.user }
  })

  // ---------------- 互动题库 ----------------
  // 列出已有大纲数据的视频（供“通过大纲生成”选择）
  ipcMain.handle('quiz:outline-videos', async () => {
    try {
      return await listOutlineVideos()
    } catch (e) {
      console.error('读取大纲视频列表失败：', e)
      return []
    }
  })

  // 从 sqlite 加载题目列表
  ipcMain.handle('quiz:list', async () => {
    try {
      return await listQuestions()
    } catch (e) {
      console.error('读取题目列表失败：', e)
      return []
    }
  })

  // 手动创建题目（不关联视频）
  ipcMain.handle('quiz:create-manual', async (_e, payload) => {
    try {
      return await createManualQuestion(payload)
    } catch (e) {
      console.error('手动创建题目异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 依据视频大纲调 AI 生成题目并落库（count 为期望生成数量，默认 10）
  ipcMain.handle('quiz:generate', async (_e, vid, count) => {
    try {
      return await generateQuestionsFromOutline(vid, count)
    } catch (e) {
      console.error('AI 生成题目异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 更新一道已有题目（编辑 AI 生成或手动创建的题目）
  ipcMain.handle('quiz:update', async (_e, payload) => {
    try {
      return await updateQuestion(payload)
    } catch (e) {
      console.error('更新题目异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 删除一道题目
  ipcMain.handle('quiz:delete', async (_e, id) => {
    try {
      return await deleteQuestion(id)
    } catch (e) {
      console.error('删除题目异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // ---------------- 游戏答题记录 / 统计 / 错题本 ----------------
  // 记录一次作答（userId 以主进程内存会话为准，前端无需传）；答错自动合并进错题本
  ipcMain.handle('game:record-answer', async (_e, payload = {}) => {
    try {
      return await recordAnswer({ ...payload, userId: getSession()?.user?.id ?? null })
    } catch (e) {
      console.error('记录答题异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 数据看板统计
  ipcMain.handle('game:stats', async () => {
    try {
      return await getStats()
    } catch (e) {
      console.error('读取游戏统计失败：', e)
      return {
        sessions: 0,
        answers: 0,
        correctAnswers: 0,
        accuracy: 0,
        bestScore: 0,
        wrongQuestions: 0,
        wrongTotal: 0
      }
    }
  })

  // 闯关历史（按 session 聚合）
  ipcMain.handle('game:history', async (_e, limit) => {
    try {
      return await listHistory(limit)
    } catch (e) {
      console.error('读取闯关历史失败：', e)
      return []
    }
  })

  // 清空答题历史
  ipcMain.handle('game:history:clear', async () => {
    try {
      return await clearHistory()
    } catch (e) {
      console.error('清空答题历史异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 错题本列表（可按难度/大纲/关键词筛选）
  ipcMain.handle('game:wrong-book:list', async (_e, filters = {}) => {
    try {
      return await listWrong(filters)
    } catch (e) {
      console.error('读取错题本失败：', e)
      return []
    }
  })

  // 删除一条错题
  ipcMain.handle('game:wrong-book:delete', async (_e, id) => {
    try {
      return await deleteWrong(id)
    } catch (e) {
      console.error('删除错题异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 清空错题本
  ipcMain.handle('game:wrong-book:clear', async () => {
    try {
      return await clearWrong()
    } catch (e) {
      console.error('清空错题本异常：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  // 退出登录：清空内存会话（含其绑定的 Polyv 凭证）
  ipcMain.handle('user:logout', () => {
    clearSession()
    return { success: true }
  })

  // ---------------- 视频大纲 ----------------
  // 播放页按 vid 查询 video_outline 表已有记录（无则返回 null，由渲染层判断是否展示大纲面板）
  ipcMain.handle('video-outline:get', async (_e, vid) => {
    if (!vid) return null
    try {
      return await getOutlineRow(vid)
    } catch (e) {
      console.error('读取视频大纲失败：', e)
      return null
    }
  })

  // 视频列表用：列出已判定课件性的记录 [{ vid, isCourseware }]（1=课件，0=非课件），供卡片右上角“非课件”tag
  ipcMain.handle('video-outline:courseware-list', async () => {
    try {
      return await listCoursewareStates()
    } catch (e) {
      console.error('读取课件判定列表失败：', e)
      return []
    }
  })

  // 编辑视频信息后同步更新本地 video_outline 的标题（仅已存在行）
  ipcMain.handle('video-outline:update-title', async (_e, { vid, title } = {}) => {
    if (!vid) return { ok: false, errMsg: 'vid 为空' }
    try {
      const changes = await updateOutlineTitle(vid, title)
      return { ok: true, changes }
    } catch (e) {
      console.error('更新本地大纲标题失败：', e)
      return { ok: false, errMsg: e.message }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
