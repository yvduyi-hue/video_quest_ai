<template>
  <div
    class="vq-brand-logo"
    :style="{ width: sizeMap[size] + 'px', height: sizeMap[size] + 'px' }"
  >
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- TODO: 后续替换成从设计稿切出来的正式 logo svg -->
      <rect width="36" height="36" rx="9" fill="#155EEF" />
      <circle cx="18" cy="18" r="10" fill="#FFFFFF" />
      <path d="M15.5 13.5 23 18l-7.5 4.5v-9Z" fill="#155EEF" />
    </svg>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: 'md' | 'sm'
  }>(),
  { size: 'md' }
)

const sizeMap = { md: 36, sm: 28 } as const
</script>

<style scoped>
.vq-brand-logo {
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.vq-brand-logo:hover {
  opacity: 0.85;
}
</style>
