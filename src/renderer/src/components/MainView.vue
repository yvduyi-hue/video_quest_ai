<script setup>
// 主界面应用壳：左侧导航 + 顶部工具栏 + 子路由内容。
// 路由、登录守卫、窗口 IPC、用户状态、上传任务状态与退出登录逻辑均保持不变。
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userStore } from '../stores/userStore.js'
import AppSidebar from './layout/AppSidebar.vue'
import AppTopbar from './layout/AppTopbar.vue'

const route = useRoute()
const router = useRouter()

// 当前登录用户（主进程内存会话，缓存在 userStore）
const user = computed(() => userStore.user)

// 进入主界面时把窗口设为 1200×700，仅本次应用会话执行一次：
// 从播放页/游戏页返回主界面时不再重置用户手动调整过的窗口尺寸。
// 使用 sessionStorage 而不是组件内变量，确保 MainView 卸载重挂后仍然生效。
const WINDOW_SIZE_KEY = 'vq-main-window-sized'
onMounted(() => {
  try {
    if (sessionStorage.getItem(WINDOW_SIZE_KEY)) return
    sessionStorage.setItem(WINDOW_SIZE_KEY, '1')
  } catch (e) {
    console.warn('读取窗口尺寸标记失败：', e)
  }
  window.api?.windowSetSize?.(1200, 700)
})

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

function openSettings() {
  router.push('/main/setting')
}
</script>

<template>
  <div class="vq-app">
    <AppSidebar />

    <div class="vq-app__body">
      <AppTopbar :user="user" @logout="logout" @settings="openSettings" />

      <main class="vq-main">
        <router-view v-slot="{ Component }">
          <transition name="vq-page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.vq-app {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--vq-bg-page);
}

.vq-app__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.vq-main {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--vq-bg-page);
}
</style>
