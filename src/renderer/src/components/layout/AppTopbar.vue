<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, List } from '@element-plus/icons-vue'
import { uploadStore } from '../../stores/uploadStore.js'
import UserMenu from './UserMenu.vue'
import WindowControls from './WindowControls.vue'
import UploadTaskPanel from '../video/UploadTaskPanel.vue'

defineProps({
  user: { type: Object, default: null }
})

const emit = defineEmits(['logout', 'settings'])

const route = useRoute()

const SECTION_TITLES = {
  'video-manage': '视频管理',
  'quiz-bank': '互动题库',
  'level-play': '关卡游玩',
  'system-setting': '系统设置'
}

const sectionTitle = computed(() => SECTION_TITLES[route.name] || '教学空间')

// 双击顶栏空白处切换最大化，行为与原生窗口一致；按钮/菜单区域不触发
function onDblClick(event) {
  if (event.target.closest('button, a, .el-dropdown, .el-popover, .el-badge')) return
  window.api?.windowToggleMaximize?.()
}
</script>

<template>
  <header class="vq-topbar vq-drag" @dblclick="onDblClick">
    <div class="vq-topbar__crumb">
      <span class="vq-topbar__space">教学空间</span>
      <el-icon class="vq-topbar__sep" :size="14" aria-hidden="true">
        <ArrowRight />
      </el-icon>
      <span class="vq-topbar__current">{{ sectionTitle }}</span>
    </div>

    <div class="vq-topbar__actions vq-no-drag">
      <el-popover
        placement="bottom-end"
        :width="380"
        trigger="click"
        popper-class="vq-upload-popper"
      >
        <template #reference>
          <button
            type="button"
            class="vq-topbar__action"
            :aria-label="`上传任务，${uploadStore.activeCount} 个进行中`"
            title="上传任务"
          >
            <el-badge
              :value="uploadStore.activeCount"
              :hidden="uploadStore.activeCount === 0"
              :max="99"
              class="vq-topbar__badge"
            >
              <el-icon :size="19" aria-hidden="true"><List /></el-icon>
            </el-badge>
            <span class="vq-topbar__action-label">上传任务</span>
          </button>
        </template>
        <UploadTaskPanel />
      </el-popover>

      <UserMenu :user="user" @logout="emit('logout')" @settings="emit('settings')" />

      <span class="vq-topbar__divider" aria-hidden="true"></span>
      <WindowControls />
    </div>
  </header>
</template>

<style scoped>
.vq-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  height: var(--vq-topbar-h);
  padding: 0 0 0 24px;
  background: var(--vq-bg-surface);
  border-bottom: 1px solid var(--vq-border);
  user-select: none;
}

.vq-topbar__crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--vq-font-size-md);
  color: var(--vq-text-tertiary);
}

.vq-topbar__space {
  white-space: nowrap;
}

.vq-topbar__sep {
  flex-shrink: 0;
  color: var(--vq-text-placeholder);
}

.vq-topbar__current {
  overflow: hidden;
  color: var(--vq-text-title);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-topbar__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  flex-shrink: 0;
}

.vq-topbar__action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 10px;
  border: none;
  border-radius: var(--vq-radius-md);
  background: transparent;
  color: var(--vq-text-secondary);
  font-size: var(--vq-font-size-md);
  cursor: pointer;
  transition:
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.vq-topbar__action:hover {
  background: var(--vq-bg-hover);
  color: var(--vq-text-title);
}

.vq-topbar__badge :deep(.el-badge__content) {
  top: 2px;
  right: 6px;
  height: 15px;
  min-width: 15px;
  padding: 0 4px;
  border: none;
  font-size: 10px;
  line-height: 15px;
}

.vq-topbar__divider {
  width: 1px;
  height: 22px;
  margin: 0 6px;
  background: var(--vq-border);
}

@media (max-width: 899px) {
  .vq-topbar {
    padding-left: 16px;
  }

  .vq-topbar__space,
  .vq-topbar__sep {
    display: none;
  }

  .vq-topbar__action-label {
    display: none;
  }

  .vq-topbar__action {
    padding: 0 8px;
  }
}

@media (max-width: 719px) {
  .vq-topbar__crumb {
    display: none;
  }
}
</style>

<style>
/* Teleport 到 body 的上传任务弹层，使用全局类名保证样式生效 */
.vq-upload-popper.el-popover.el-popper {
  padding: 14px 16px;
  border-radius: var(--vq-radius-lg);
  border-color: var(--vq-border);
  box-shadow: var(--vq-shadow-md);
}
</style>
