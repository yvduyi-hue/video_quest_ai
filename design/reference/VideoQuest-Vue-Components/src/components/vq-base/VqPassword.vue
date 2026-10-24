<template>
  <div class="vq-input-wrap" :class="{ 'is-focus': isFocus }">
    <VqIcon name="lock" :size="20" class="prefix-icon" />
    <input
      class="vq-input"
      :type="showPwd ? 'text' : 'password'"
      :placeholder="placeholder"
      :disabled="disabled"
      v-model="model"
      @focus="isFocus = true"
      @blur="isFocus = false"
    />
    <VqIcon
      :name="showPwd ? 'eye-off' : 'eye'"
      :size="20"
      class="eye-icon"
      @click="showPwd = !showPwd"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VqIcon from './VqIcon.vue'

withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
  }>(),
  { placeholder: '', disabled: false }
)

const model = defineModel<string>({ default: '' })
const isFocus = ref(false)
const showPwd = ref(false)
</script>

<style scoped>
.vq-input-wrap {
  position: relative;
  height: 44px;
  border-radius: var(--vq-radius-sm);
  border: 1px solid var(--vq-border-base);
  background: #fff;
  display: flex;
  align-items: center;
  padding: 0 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.vq-input-wrap.is-focus {
  border-color: var(--vq-primary);
  box-shadow: 0 0 0 3px rgba(21, 94, 239, 0.15);
}
.prefix-icon {
  color: var(--vq-text-placeholder);
  margin-right: 8px;
  flex-shrink: 0;
}
.eye-icon {
  cursor: pointer;
  color: var(--vq-text-placeholder);
  flex-shrink: 0;
}
.vq-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  font-weight: 400;
  color: var(--vq-text-main);
  background: transparent;
  min-width: 0;
}
.vq-input::placeholder {
  color: var(--vq-text-placeholder);
}
</style>
