<template>
  <button
    class="vq-btn"
    :class="[`vq-btn--${variant}`, { 'is-full': fullWidth, 'is-loading': loading }]"
    :disabled="disabled || loading"
  >
    <VqIcon v-if="icon && !loading" :name="icon" :size="16" />
    <span v-if="loading">加载中...</span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import VqIcon from './VqIcon.vue'
import type { VqButtonProps } from '../../types/vq'

withDefaults(defineProps<VqButtonProps>(), {
  variant: 'primary',
  fullWidth: false,
  loading: false,
  disabled: false,
})
</script>

<style scoped>
.vq-btn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  height: 44px;
  border-radius: var(--vq-radius-sm);
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: 0.2s;
}
.vq-btn--primary {
  background: var(--vq-primary);
  color: white;
}
.vq-btn--primary:hover:not(:disabled) {
  background: var(--vq-primary-dark);
}
.vq-btn--primary:active:not(:disabled) {
  background: var(--vq-primary-darker);
}
.vq-btn--outline {
  background: #fff;
  color: var(--vq-text-main);
  border: 1px solid var(--vq-border-base);
}
.vq-btn--outline:hover:not(:disabled) {
  background: var(--vq-bg-hover);
}
.vq-btn.is-full {
  width: 100%;
}
.vq-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
