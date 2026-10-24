<template>
  <div class="vq-video-card">
    <div class="cover">
      <img :src="coverUrl" alt="cover" />
      <span class="status" :class="`status--${status}`">{{ statusText }}</span>
      <span class="time">{{ duration }}</span>
    </div>
    <div class="card-foot">
      <h4>{{ title }}</h4>
      <VqIcon name="dots-three" :size="16" class="menu-icon" @click="$emit('menuClick')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VqIcon from '../vq-base/VqIcon.vue'
import type { VqVideoCardProps, VideoStatus } from '../../types/vq'

const props = defineProps<VqVideoCardProps>()
defineEmits(['menuClick'])

const statusMap: Record<VideoStatus, string> = {
  published: '已发布',
  processing: '生成中',
  pending: '待处理',
}
const statusText = computed(() => statusMap[props.status])
</script>

<style scoped>
.vq-video-card {
  border: 1px solid var(--vq-border-base);
  border-radius: var(--vq-radius-md);
  overflow: hidden;
  background: #fff;
  transition: box-shadow 0.2s;
}
.vq-video-card:hover {
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
}
.cover {
  position: relative;
  background: #f2f4f7;
}
.cover img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
.status,
.time {
  position: absolute;
  font-size: 12px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border-radius: 4px;
}
.status--processing {
  background: rgba(122, 90, 248, 0.9);
}
.status--pending {
  background: rgba(71, 84, 103, 0.9);
}
.status {
  top: 8px;
  left: 8px;
}
.time {
  bottom: 8px;
  right: 8px;
}
.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
}
.card-foot h4 {
  margin: 0;
  font-size: 14px;
  color: var(--vq-text-title);
}
.menu-icon {
  cursor: pointer;
  color: var(--vq-text-secondary);
}
</style>
