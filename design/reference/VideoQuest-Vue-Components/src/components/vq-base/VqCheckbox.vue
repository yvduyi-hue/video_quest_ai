<template>
  <label class="vq-checkbox" :class="{ 'is-disabled': disabled }">
    <input type="checkbox" v-model="model" :disabled="disabled" />
    <span class="label-text">{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
import type { VqCheckboxProps } from '../../types/vq'

withDefaults(defineProps<VqCheckboxProps>(), { disabled: false })

const model = defineModel<boolean>({ default: false })
</script>

<style scoped>
.vq-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: var(--vq-text-secondary);
  user-select: none;
}
.vq-checkbox.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.vq-checkbox input {
  accent-color: var(--vq-primary);
  width: 16px;
  height: 16px;
  cursor: inherit;
}
</style>
