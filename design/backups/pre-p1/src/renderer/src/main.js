import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createRouter, createWebHashHistory } from 'vue-router'

import './assets/main.css'
import './styles/element/index.scss'

import App from './App.vue'
import LoginView from './components/LoginView.vue'
import SettingsView from './components/SettingsView.vue'
import ModelView from './components/ModelView.vue'
import RegisterView from './components/RegisterView.vue'
import MainView from './components/MainView.vue'
import VideoManageView from './components/VideoManageView.vue'
import PlayerView from './components/PlayerView.vue'
import QuizBankView from './components/QuizBankView.vue'
import LevelPlayView from './components/LevelPlayView.vue'
import MarbleShooterView from './components/MarbleShooterView.vue'
import PuzzleMatchView from './components/PuzzleMatchView.vue'
import SystemSettingView from './components/SystemSettingView.vue'
import { userStore } from './stores/userStore.js'

async function checkHasConfig() {
  try {
    return await window.api.hasConfig()
  } catch {
    return false
  }
}

// 启动时从主进程内存恢复登录会话（应用重启后主进程会话已清空，此处返回 null）
async function restoreSession() {
  try {
    const user = await window.api.getCurrentUser()
    userStore.setUser(user || null)
  } catch {
    userStore.clear()
  }
}

// 自动登录：config.json 记录了 autoLogin 凭据时，启动自动比对登录，成功则直接进入主界面
async function tryAutoLogin() {
  try {
    const readRes = await window.api.readFile('config.json')
    if (!readRes || !readRes.success || !readRes.content) return
    let config
    try {
      config = JSON.parse(readRes.content)
    } catch {
      return
    }
    const al = config.autoLogin
    if (!al || !al.enabled || !al.account || !al.password) return
    const res = await window.api.loginUser({ account: al.account, password: al.password })
    if (res && res.success) userStore.setUser(res.user)
    else userStore.clear()
  } catch {
    userStore.clear()
  }
}

async function bootstrap() {
  // 启动时读取默认可写路径下的 config.json：有 -> 登录页，无 -> 设置页
  const hasConfig = await checkHasConfig()
  await restoreSession()
  // 内存无会话且开启了自动登录时，尝试用 config 中的凭据直接登录
  if (!userStore.isLogin) await tryAutoLogin()

  const router = createRouter({
    // Electron 生产环境走 file:// 协议，必须用 hash 模式
    history: createWebHashHistory(),
    routes: [
      {
        path: '/',
        redirect: () => (userStore.isLogin ? '/main' : hasConfig ? '/login' : '/settings')
      },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/model', name: 'model', component: ModelView },
      { path: '/register', name: 'register', component: RegisterView },
      // 顶层路由：由视频管理详情跳转进入，全屏铺满内容区播放
      { path: '/player', name: 'player', component: PlayerView, meta: { requiresAuth: true } },
      // 顶层路由：关卡游玩的小游戏全屏界面（Phaser），从 /main/level 跳转进入
      {
        path: '/game/marble',
        name: 'marble-game',
        component: MarbleShooterView,
        meta: { requiresAuth: true }
      },
      {
        path: '/game/match',
        name: 'match-game',
        component: PuzzleMatchView,
        meta: { requiresAuth: true }
      },
      {
        path: '/main',
        component: MainView,
        meta: { requiresAuth: true },
        redirect: '/main/video',
        children: [
          { path: 'video', name: 'video-manage', component: VideoManageView },
          { path: 'quiz', name: 'quiz-bank', component: QuizBankView },
          { path: 'level', name: 'level-play', component: LevelPlayView },
          { path: 'setting', name: 'system-setting', component: SystemSettingView }
        ]
      }
    ]
  })

  // 路由守卫：未登录不能进入主界面；已登录回访登录页则直接进主界面
  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !userStore.isLogin) {
      return '/login'
    }
    if (to.path === '/login' && userStore.isLogin) {
      return '/main'
    }
  })

  const app = createApp(App)
  app.use(ElementPlus, { locale: zhCn })
  app.use(router)
  app.mount('#app')
}

bootstrap()
