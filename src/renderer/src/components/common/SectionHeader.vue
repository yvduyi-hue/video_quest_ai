<script setup>
defineProps({
  title: { type: String, required: true },
  count: { type: [String, Number], default: '' },
  description: { type: String, default: '' }
})
</script>

<template>
  <div class="vq-section-header">
    <div class="vq-section-header__main">
      <div class="vq-section-header__title-row">
        <h2 class="vq-section-header__title">{{ title }}</h2>
        <span v-if="count !== ''" class="vq-section-header__count">{{ count }}</span>
      </div>
      <p v-if="description" class="vq-section-header__desc">{{ description }}</p>
    </div>

    <div v-if="$slots.actions" class="vq-section-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.vq-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.vq-section-header__main {
  min-width: 0;
}

.vq-section-header__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vq-section-header__title {
  margin: 0;
  font-size: var(--vq-font-size-xl);
  line-height: var(--vq-line-height-xl);
  font-weight: 600;
  color: var(--vq-text-title);
}

.vq-section-header__count {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: var(--vq-radius-pill);
  background: var(--vq-bg-subtle);
  color: var(--vq-text-tertiary);
  font-size: var(--vq-font-size-xs);
  font-weight: 500;
  white-space: nowrap;
}

.vq-section-header__desc {
  margin: 4px 0 0;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
}

.vq-section-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .vq-section-header__actions {
    width: 100%;
  }
}
</style>
