<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userStore } from '../stores/userStore.js'

const route = useRoute()
const router = useRouter()

// 项目 Logo（public/images/logo.jpg）：用 document.baseURI 解析，兼容 dev 与打包后 file://
const logoUrl = new URL('images/logo.jpg', document.baseURI).href

// 当前登录用户（主进程内存会话，缓存在 userStore）
const user = computed(() => userStore.user)
// 导航高亮：匹配当前子路由路径
const activePath = computed(() => route.path)
// 头像为空时显示昵称首字母
const avatarText = computed(() => {
  const name = user.value?.nickname || user.value?.account || ''
  return name ? name.charAt(0).toUpperCase() : '?'
})

// 进入主界面：窗口放大到 1200*700
onMounted(() => {
  window.api.windowSetSize(1200, 700)
})

function minimize() {
  window.api.windowMinimize()
}
function toggleMaximize() {
  window.api.windowToggleMaximize()
}
function close() {
  window.api.windowClose()
}

// 退出登录：清除本地自动登录凭据、清空主进程内存会话并回到登录页
// （saveConfig 会整体覆盖 config.json，故先读原配置再清除 autoLogin 字段后回写）
async function clearAutoLogin() {
  try {
    const readRes = await window.api.readFile('config.json')
    if (!readRes || !readRes.success || !readRes.content) return
    let config
    try {
      config = JSON.parse(readRes.content)
    } catch {
      return
    }
    if (!config.autoLogin || !config.autoLogin.enabled) return
    config.autoLogin = { enabled: false, account: '', password: '' }
    await window.api.saveConfig(JSON.stringify(config, null, 2))
  } catch (e) {
    console.error('清除自动登录配置失败：', e)
  }
}

async function logout() {
  await clearAutoLogin()
  await window.api.logoutUser()
  userStore.clear()
  router.push('/login')
}
</script>

<template>
  <div class="main-layout">
    <!-- 顶部 AppBar：左应用名，右用户信息与窗口控制 -->
    <header class="app-bar">
      <div class="app-brand">
        <span class="app-logo"><img :src="logoUrl" alt="Video Quest AI" /></span>
        <div class="app-title">Video Quest AI</div>
      </div>

      <div class="app-bar-right">
        <el-dropdown trigger="click" class="user-dropdown">
          <div class="user-info">
            <el-avatar :size="30" :src="user?.avatar || undefined">{{ avatarText }}</el-avatar>
            <span class="nickname">{{ user?.nickname || user?.account }}</span>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <div class="window-controls">
          <button class="ctrl-btn" title="最小化" @click="minimize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 6h8" stroke="currentColor" />
            </svg>
          </button>
          <button class="ctrl-btn" title="最大化/还原" @click="toggleMaximize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
            </svg>
          </button>
          <button class="ctrl-btn close" title="关闭" @click="close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- 下方：左导航 + 右路由内容 -->
    <el-container class="main-body">
      <el-aside width="200px" class="nav-aside">
        <el-menu :default-active="activePath" router class="nav-menu">
          <el-menu-item index="/main/video">视频管理</el-menu-item>
          <el-menu-item index="/main/quiz">互动题库</el-menu-item>
          <el-menu-item index="/main/level">关卡游玩</el-menu-item>
          <el-menu-item index="/main/setting">系统设置</el-menu-item>
        </el-menu>
      </el-aside>

      <el-main class="content-main">
        <router-view v-slot="{ Component }">
          <transition name="page-slide" mode="out-in">
            <component :is="Component" :key="$route.path" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </div>
</template>

<style scoped>
.main-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* AppBar：整条可拖动窗口，交互区域设为 no-drag */
.app-bar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 16px;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  user-select: none;
  -webkit-app-region: drag;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Logo 原图四周留白较大：用容器裁切并放大，让图案填满 28px 图标区 */
.app-logo {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.app-logo img {
  width: 100%;
  height: 100%;
  display: block;
  transform: scale(2.2);
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.app-bar-right {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
}

.user-dropdown {
  outline: none;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}

.user-info .nickname {
  font-size: 14px;
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.ctrl-btn:hover {
  background: var(--el-fill-color);
}

.ctrl-btn.close:hover {
  background: #e81123;
  color: #fff;
}

.main-body {
  flex: 1;
  min-height: 0;
}

.nav-aside {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  overflow-y: auto;
}

.nav-menu {
  border-right: none;
}

.content-main {
  padding: 0;
  overflow-y: auto;
  background: var(--el-bg-color-page);
}
</style>
