<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  badge: { type: String, default: '' }
})
</script>

<template>
  <header class="vq-page-header">
    <div class="vq-page-header__main">
      <div class="vq-page-header__title-row">
        <h1 class="vq-page-header__title">{{ title }}</h1>
        <span v-if="badge" class="vq-page-header__badge">{{ badge }}</span>
      </div>
      <p v-if="description" class="vq-page-header__desc">{{ description }}</p>
    </div>

    <div v-if="$slots.actions" class="vq-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.vq-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}

.vq-page-header__main {
  min-width: 0;
}

.vq-page-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.vq-page-header__title {
  margin: 0;
  font-size: var(--vq-font-size-3xl);
  line-height: var(--vq-line-height-3xl);
  font-weight: 600;
  color: var(--vq-text-title);
  letter-spacing: -0.01em;
}

.vq-page-header__badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--vq-radius-pill);
  background: var(--vq-primary-light);
  color: var(--vq-primary);
  font-size: var(--vq-font-size-sm);
  font-weight: 500;
  white-space: nowrap;
}

.vq-page-header__desc {
  margin: 8px 0 0;
  font-size: var(--vq-font-size-base);
  line-height: var(--vq-line-height-base);
  color: var(--vq-text-secondary);
}

.vq-page-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .vq-page-header__title {
    font-size: var(--vq-font-size-2xl);
    line-height: var(--vq-line-height-2xl);
  }

  .vq-page-header__actions {
    width: 100%;
  }
}
</style>
