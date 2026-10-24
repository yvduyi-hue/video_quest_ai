<script setup>
import logoMark from '../../assets/brand/logo-mark.png'

defineProps({
  size: { type: String, default: 'md' },
  showText: { type: Boolean, default: true },
  subtitle: { type: String, default: 'AI EDUCATION' }
})

const sizeMap = { sm: 28, md: 32, lg: 36 }
</script>

<template>
  <div class="vq-brand" :class="`vq-brand--${size}`">
    <img
      class="vq-brand__mark"
      :style="{
        width: `${sizeMap[size] || sizeMap.md}px`,
        height: `${sizeMap[size] || sizeMap.md}px`
      }"
      :src="logoMark"
      alt="VideoQuest"
      draggable="false"
    />
    <div v-if="showText" class="vq-brand__text">
      <strong class="vq-brand__name">VideoQuest</strong>
      <span v-if="subtitle" class="vq-brand__subtitle">{{ subtitle }}</span>
    </div>
  </div>
</template>

<style scoped>
.vq-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  user-select: none;
}

.vq-brand__mark {
  display: block;
  flex-shrink: 0;
  border-radius: 9px;
  object-fit: contain;
}

.vq-brand__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.vq-brand__name {
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  color: var(--vq-text-title);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.vq-brand__subtitle {
  font-size: 9px;
  font-weight: 600;
  line-height: 12px;
  color: var(--vq-text-placeholder);
  letter-spacing: 0.14em;
  white-space: nowrap;
}
</style>
