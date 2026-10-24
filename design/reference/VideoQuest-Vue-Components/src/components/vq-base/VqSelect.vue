<template>
  <div class="vq-select" tabindex="0" @click="open = !open" @blur="open = false">
    <span class="label" :class="{ 'is-placeholder': !currentLabel }">
      {{ currentLabel || placeholder }}
    </span>
    <div v-if="open" class="dropdown" @click.stop>
      <div
        v-for="opt in options"
        :key="opt.value"
        class="option"
        :class="{ 'is-active': opt.value === model }"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  options: { label: string; value: string }[]
  placeholder?: string
}>()

const model = defineModel<string>({ default: '' })
const open = ref(false)

const currentLabel = computed(
  () => props.options.find((o) => o.value === model.value)?.label ?? ''
)

function select(value: string) {
  model.value = value
  open.value = false
}
</script>

<style scoped>
.vq-select {
  position: relative;
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border: 1px solid var(--vq-border-base);
  border-radius: var(--vq-radius-sm);
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  color: var(--vq-text-main);
  user-select: none;
}
.label.is-placeholder {
  color: var(--vq-text-placeholder);
}
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--vq-border-base);
  border-radius: var(--vq-radius-sm);
  z-index: 9;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
}
.option {
  padding: 8px 12px;
}
.option:hover {
  background: var(--vq-bg-hover);
}
.option.is-active {
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}
</style>
