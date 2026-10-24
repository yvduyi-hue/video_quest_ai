<template>
  <div class="vq-folder-card">
    <div class="card-head">
      <h4>{{ title }}</h4>
      <VqIcon name="dots-three" :size="16" class="menu-icon" @click="$emit('menuClick')" />
    </div>
    <div class="meta">{{ count }} 个视频</div>
  </div>
</template>

<script setup lang="ts">
import VqIcon from '../vq-base/VqIcon.vue'
import type { VqFolderCardProps } from '../../types/vq'

defineProps<VqFolderCardProps>()
defineEmits(['menuClick'])
</script>

<style scoped>
.vq-folder-card {
  border: 1px solid var(--vq-border-base);
  border-radius: var(--vq-radius-md);
  padding: 16px;
  background: #fff;
  transition: box-shadow 0.2s;
}
.vq-folder-card:hover {
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-head h4 {
  margin: 0;
  font-size: 15px;
  color: var(--vq-text-title);
}
.menu-icon {
  cursor: pointer;
  color: var(--vq-text-secondary);
}
.meta {
  font-size: 13px;
  color: var(--vq-text-secondary);
  margin-top: 6px;
}
</style>
