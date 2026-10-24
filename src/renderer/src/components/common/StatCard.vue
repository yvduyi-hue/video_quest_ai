<script setup>
defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  tone: { type: String, default: 'blue' },
  progress: { type: Number, default: null }
})
</script>

<template>
  <div class="vq-stat-card">
    <div class="vq-stat-card__icon" :class="`is-${tone}`" aria-hidden="true">
      <el-icon :size="20"><component :is="icon" /></el-icon>
    </div>

    <div class="vq-stat-card__body">
      <div class="vq-stat-card__label">{{ label }}</div>
      <div class="vq-stat-card__value">{{ value }}</div>
      <div v-if="hint" class="vq-stat-card__hint">{{ hint }}</div>

      <div
        v-if="progress !== null"
        class="vq-stat-card__progress"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span
          class="vq-stat-card__progress-bar"
          :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
        ></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vq-stat-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  background: var(--vq-bg-surface);
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-lg);
}

.vq-stat-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--vq-radius-md);
}

.vq-stat-card__icon.is-blue {
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-stat-card__icon.is-purple {
  color: var(--vq-purple);
  background: var(--vq-purple-bg);
}

.vq-stat-card__icon.is-green {
  color: var(--vq-success);
  background: var(--vq-success-bg);
}

.vq-stat-card__icon.is-amber {
  color: var(--vq-warning);
  background: var(--vq-warning-bg);
}

.vq-stat-card__body {
  min-width: 0;
  flex: 1;
}

.vq-stat-card__label {
  overflow: hidden;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-stat-card__value {
  margin-top: 2px;
  font-size: var(--vq-font-size-2xl);
  line-height: 1.2;
  font-weight: 600;
  color: var(--vq-text-title);
  font-variant-numeric: tabular-nums;
}

.vq-stat-card__hint {
  margin-top: 2px;
  overflow: hidden;
  font-size: var(--vq-font-size-xs);
  line-height: var(--vq-line-height-xs);
  color: var(--vq-text-tertiary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-stat-card__progress {
  width: 100%;
  height: 4px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: var(--vq-radius-pill);
  background: var(--vq-bg-subtle);
}

.vq-stat-card__progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--vq-primary);
}
</style>
