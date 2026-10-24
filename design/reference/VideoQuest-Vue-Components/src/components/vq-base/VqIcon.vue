<template>
  <span class="vq-icon" :style="{ color, fontSize: size + 'px' }">
    <svg
      viewBox="0 0 24 24"
      :width="size"
      :height="size"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      v-html="paths[name] || ''"
    />
  </span>
</template>

<script setup lang="ts">
import type { IconName } from '../../types/vq'

withDefaults(
  defineProps<{
    name: IconName | string
    size?: number
    color?: string
  }>(),
  { size: 20, color: '' }
)

// 描边类图标继承 svg 默认 stroke；实心图标单独写 fill="currentColor" stroke="none"
const paths: Record<string, string> = {
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off':
    '<path d="m3 3 18 18"/><path d="M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.2 4.2M6.6 6.6C3.8 8.6 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.8-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 20h16"/>',
  'folder-plus':
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 11v6M9 14h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  'dots-three':
    '<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></g>',
  video:
    '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  wechat:
    '<g fill="currentColor" stroke="none"><path d="M8.5 3C4.9 3 2 5.5 2 8.6c0 1.8 1 3.4 2.5 4.5L4 15.5l2.7-1.4c.6.2 1.2.3 1.8.3h.4a6 6 0 0 1-.2-1.6c0-3 2.9-5.4 6.4-5.4h.3C14.7 4.9 11.9 3 8.5 3Z"/><path d="M22 13.6c0-2.6-2.5-4.6-5.6-4.6s-5.6 2-5.6 4.6 2.5 4.6 5.6 4.6c.6 0 1.2-.1 1.8-.3l2.4 1.2-.5-2.1a4.5 4.5 0 0 0 1.9-3.4Z"/></g>',
  github:
    '<g fill="currentColor" stroke="none"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85V21c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></g>',
  school:
    '<path d="m12 3 10 5-10 5L2 8Z"/><path d="M6 10.5V15c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/>',
}
</script>

<style scoped>
.vq-icon {
  display: inline-flex;
  align-items: center;
  line-height: 0;
}
</style>
