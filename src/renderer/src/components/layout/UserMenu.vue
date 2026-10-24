<script setup>
import { computed } from 'vue'
import { ArrowDown, Setting, SwitchButton } from '@element-plus/icons-vue'

const props = defineProps({
  user: { type: Object, default: null }
})

const emit = defineEmits(['logout', 'settings'])

const displayName = computed(() => {
  const user = props.user
  return user?.nickname || user?.account || '用户'
})

const avatarText = computed(() => {
  const name = displayName.value
  return name ? name.charAt(0).toUpperCase() : '?'
})

const avatarSrc = computed(() => props.user?.avatar || '')

function onCommand(command) {
  if (command === 'logout') emit('logout')
  else if (command === 'settings') emit('settings')
}
</script>

<template>
  <el-dropdown trigger="click" placement="bottom-end" @command="onCommand">
    <button
      type="button"
      class="vq-user-menu"
      :aria-label="`打开 ${displayName} 的用户菜单`"
      aria-haspopup="menu"
    >
      <el-avatar :size="30" :src="avatarSrc || undefined" class="vq-user-menu__avatar">
        {{ avatarText }}
      </el-avatar>
      <span class="vq-user-menu__meta">
        <span class="vq-user-menu__name">{{ displayName }}</span>
        <span class="vq-user-menu__role">已登录</span>
      </span>
      <el-icon class="vq-user-menu__caret" :size="12" aria-hidden="true">
        <ArrowDown />
      </el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="settings" :icon="Setting">系统设置</el-dropdown-item>
        <el-dropdown-item command="logout" :icon="SwitchButton" divided>退出登录</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.vq-user-menu {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 44px;
  max-width: 220px;
  padding: 0 8px;
  border: none;
  border-radius: var(--vq-radius-md);
  background: transparent;
  color: var(--vq-text-main);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color var(--vq-duration-fast) var(--vq-ease);
}

.vq-user-menu:hover {
  background: var(--vq-bg-hover);
}

.vq-user-menu__avatar {
  flex-shrink: 0;
  background: var(--vq-primary-light);
  color: var(--vq-primary);
  font-size: var(--vq-font-size-md);
  font-weight: 600;
}

.vq-user-menu__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  min-width: 0;
  line-height: 1.2;
}

.vq-user-menu__name {
  max-width: 132px;
  overflow: hidden;
  font-size: var(--vq-font-size-base);
  font-weight: 500;
  color: var(--vq-text-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vq-user-menu__role {
  font-size: var(--vq-font-size-xs);
  color: var(--vq-text-tertiary);
}

.vq-user-menu__caret {
  flex-shrink: 0;
  color: var(--vq-text-placeholder);
}

@media (max-width: 899px) {
  .vq-user-menu__meta,
  .vq-user-menu__caret {
    display: none;
  }

  .vq-user-menu {
    padding: 0 6px;
  }
}
</style>
