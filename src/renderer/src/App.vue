<script setup>
// 顶部自定义可拖动标题栏 + 其余区域全部为路由出口
// 启动时根据 config.json 是否存在自动重定向到 /login 或 /settings（见 main.js 路由）
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import TitleBar from './components/TitleBar.vue'

const route = useRoute()
// 主界面（/main）自带 AppBar 与窗口控制，隐藏全局标题栏避免双顶栏
const showTitleBar = computed(() => !route.path.startsWith('/main'))
// 顶层路由出口按一级匹配路径缓存，子路由切换不重新挂载 MainView
const topLevelKey = computed(() => route.matched[0]?.path ?? route.path)
</script>

<template>
  <div class="app-shell">
    <TitleBar v-if="showTitleBar" />
    <main class="app-main">
      <!-- 路由切换动画：新旧页面滑入滑出 -->
      <router-view v-slot="{ Component }">
        <transition name="page-slide" mode="out-in">
          <component :is="Component" :key="topLevelKey" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

<style>
/* 路由跳转动画（非 scoped，作用于 transition 类名） */
.page-slide-enter-active,
.page-slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.page-slide-enter-from {
  opacity: 0;
  transform: translateX(48px);
}

.page-slide-leave-to {
  opacity: 0;
  transform: translateX(-48px);
}
</style>
