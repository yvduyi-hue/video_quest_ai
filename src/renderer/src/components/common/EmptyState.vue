<script setup>
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})
</script>

<template>
  <div class="vq-empty-state" :class="{ 'is-compact': compact }">
    <div v-if="icon" class="vq-empty-state__icon" aria-hidden="true">
      <el-icon :size="compact ? 22 : 28"><component :is="icon" /></el-icon>
    </div>
    <div class="vq-empty-state__copy">
      <h3 class="vq-empty-state__title">{{ title }}</h3>
      <p v-if="description" class="vq-empty-state__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="vq-empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.vq-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 44px 20px;
  text-align: center;
}

.vq-empty-state.is-compact {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 16px 18px;
  text-align: left;
}

.vq-empty-state__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 2px;
  border-radius: var(--vq-radius-lg);
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-empty-state.is-compact .vq-empty-state__icon {
  width: 40px;
  height: 40px;
  margin-bottom: 0;
}

.vq-empty-state__copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.vq-empty-state.is-compact .vq-empty-state__copy {
  flex: 1;
  min-width: 200px;
  gap: 3px;
}

.vq-empty-state__title {
  margin: 0;
  font-size: var(--vq-font-size-lg);
  line-height: var(--vq-line-height-lg);
  font-weight: 600;
  color: var(--vq-text-title);
}

.vq-empty-state.is-compact .vq-empty-state__title {
  font-size: var(--vq-font-size-base);
  line-height: var(--vq-line-height-base);
}

.vq-empty-state__desc {
  max-width: 420px;
  margin: 0;
  font-size: var(--vq-font-size-md);
  line-height: var(--vq-line-height-md);
  color: var(--vq-text-tertiary);
}

.vq-empty-state.is-compact .vq-empty-state__desc {
  max-width: none;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
}

.vq-empty-state__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.vq-empty-state.is-compact .vq-empty-state__actions {
  margin-top: 0;
  margin-left: auto;
  justify-content: flex-end;
}
</style>
