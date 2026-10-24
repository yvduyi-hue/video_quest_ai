<template>
  <div class="vq-nav-item" :class="{ active }">
    <VqIcon :name="icon" :size="20" />
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import VqIcon from '../vq-base/VqIcon.vue'
import type { VqNavItemProps } from '../../types/vq'

withDefaults(defineProps<VqNavItemProps>(), { active: false })
</script>

<style scoped>
.vq-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border-radius: var(--vq-radius-sm);
  cursor: pointer;
  color: var(--vq-text-main);
  font-size: 14px;
  transition: background 0.2s;
}
.vq-nav-item:hover {
  background: var(--vq-bg-hover);
}
.vq-nav-item.active {
  background: var(--vq-primary-light);
  color: var(--vq-primary);
}
</style>
