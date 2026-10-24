<script setup>
import { useRoute } from 'vue-router'
import { VideoCamera, Collection, Trophy, Setting } from '@element-plus/icons-vue'
import BrandLogo from '../common/BrandLogo.vue'
import SidebarNavItem from './SidebarNavItem.vue'

const route = useRoute()

const navItems = [
  { to: '/main/video', label: '视频管理', icon: VideoCamera },
  { to: '/main/quiz', label: '互动题库', icon: Collection },
  { to: '/main/level', label: '关卡游玩', icon: Trophy },
  { to: '/main/setting', label: '系统设置', icon: Setting }
]

function isActive(to) {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <aside class="vq-sidebar" aria-label="侧边栏">
    <div class="vq-sidebar__brand">
      <BrandLogo />
    </div>

    <nav class="vq-sidebar__nav" aria-label="主导航">
      <div class="vq-sidebar__section">教学空间</div>
      <SidebarNavItem
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :label="item.label"
        :icon="item.icon"
        :active="isActive(item.to)"
      />
    </nav>

    <div class="vq-sidebar__foot" aria-hidden="true">
      <span class="vq-sidebar__foot-line"></span>
      <span class="vq-sidebar__foot-text">VideoQuest AI</span>
    </div>
  </aside>
</template>

<style scoped>
.vq-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: var(--vq-sidebar-w);
  height: 100%;
  background: var(--vq-bg-surface);
  border-right: 1px solid var(--vq-border);
  overflow: hidden;
  transition: width var(--vq-duration-base) var(--vq-ease);
}

.vq-sidebar__brand {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: var(--vq-topbar-h);
  padding: 0 18px;
  border-bottom: 1px solid transparent;
}

.vq-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  min-height: 0;
}

.vq-sidebar__section {
  padding: 6px 12px 8px;
  font-size: var(--vq-font-size-xs);
  font-weight: 500;
  color: var(--vq-text-placeholder);
  letter-spacing: 0.04em;
}

.vq-sidebar__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding: 16px 24px 20px;
  min-width: 0;
}

.vq-sidebar__foot-line {
  width: 12px;
  height: 1px;
  flex-shrink: 0;
  background: var(--vq-border);
}

.vq-sidebar__foot-text {
  overflow: hidden;
  font-size: var(--vq-font-size-xs);
  color: var(--vq-text-placeholder);
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (max-width: 1099px) {
  .vq-sidebar {
    width: var(--vq-sidebar-w-collapsed);
  }

  .vq-sidebar__brand {
    justify-content: center;
    padding: 0;
  }

  .vq-sidebar__brand :deep(.vq-brand__text) {
    display: none;
  }

  .vq-sidebar__nav {
    padding: 10px 10px;
  }

  .vq-sidebar__section {
    display: none;
  }

  .vq-sidebar__foot {
    justify-content: center;
    padding: 16px 0 20px;
  }

  .vq-sidebar__foot-text,
  .vq-sidebar__foot-line {
    display: none;
  }
}
</style>
