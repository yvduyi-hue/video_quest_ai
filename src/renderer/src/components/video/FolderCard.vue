<script setup>
import { Delete, Folder, MoreFilled } from '@element-plus/icons-vue'

defineProps({
  title: { type: String, required: true },
  count: { type: [String, Number], default: 0 }
})

const emit = defineEmits(['open', 'delete'])

function onCommand(command) {
  if (command === 'delete') emit('delete')
}
</script>

<template>
  <article
    class="vq-folder-card"
    role="button"
    tabindex="0"
    :aria-label="`打开文件夹：${title}`"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="vq-folder-card__head">
      <span class="vq-folder-card__icon" aria-hidden="true">
        <el-icon :size="20"><Folder /></el-icon>
      </span>

      <el-dropdown trigger="click" placement="bottom-end" @command="onCommand">
        <button
          type="button"
          class="vq-folder-card__menu"
          aria-label="文件夹更多操作"
          @click.stop
          @keydown.stop
        >
          <el-icon :size="16"><MoreFilled /></el-icon>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="delete" :icon="Delete">删除文件夹</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <h3 class="vq-folder-card__title" :title="title">{{ title }}</h3>
    <p class="vq-folder-card__meta">{{ count }} 个视频</p>
  </article>
</template>

<style scoped>
.vq-folder-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px;
  background: var(--vq-bg-surface);
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-lg);
  cursor: pointer;
  transition:
    border-color var(--vq-duration-fast) var(--vq-ease),
    box-shadow var(--vq-duration-fast) var(--vq-ease),
    transform var(--vq-duration-fast) var(--vq-ease);
}

.vq-folder-card:hover {
  border-color: var(--vq-primary-soft);
  box-shadow: var(--vq-shadow-sm);
  transform: translateY(-1px);
}

.vq-folder-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.vq-folder-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--vq-radius-md);
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-folder-card__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--vq-radius-sm);
  background: transparent;
  color: var(--vq-text-placeholder);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--vq-duration-fast) var(--vq-ease),
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.vq-folder-card:hover .vq-folder-card__menu,
.vq-folder-card__menu:focus-visible {
  opacity: 1;
}

.vq-folder-card__menu:hover {
  background: var(--vq-bg-subtle);
  color: var(--vq-text-secondary);
}

.vq-folder-card__title {
  margin: 14px 0 0;
  overflow: hidden;
  font-size: var(--vq-font-size-lg);
  line-height: var(--vq-line-height-lg);
  font-weight: 600;
  color: var(--vq-text-title);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-folder-card__meta {
  margin: 4px 0 0;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
}
</style>
