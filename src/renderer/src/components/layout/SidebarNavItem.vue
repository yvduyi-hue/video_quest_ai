<script setup>
defineProps({
  to: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: [Object, Function], required: true },
  active: { type: Boolean, default: false }
})
</script>

<template>
  <router-link
    :to="to"
    class="vq-sidebar-nav"
    :class="{ 'is-active': active }"
    :aria-current="active ? 'page' : undefined"
    :aria-label="label"
    :title="label"
  >
    <el-icon class="vq-sidebar-nav__icon" :size="20" aria-hidden="true">
      <component :is="icon" />
    </el-icon>
    <span class="vq-sidebar-nav__label">{{ label }}</span>
  </router-link>
</template>

<style scoped>
.vq-sidebar-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--vq-nav-item-h);
  padding: 0 12px;
  border-radius: var(--vq-radius-md);
  color: var(--vq-text-main);
  font-size: var(--vq-font-size-base);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.vq-sidebar-nav:hover {
  background: var(--vq-bg-hover);
  color: var(--vq-text-title);
}

.vq-sidebar-nav.is-active {
  background: var(--vq-primary-light);
  color: var(--vq-primary);
}

.vq-sidebar-nav.is-active:hover {
  background: var(--vq-primary-light);
  color: var(--vq-primary);
}

.vq-sidebar-nav__icon {
  flex-shrink: 0;
}

.vq-sidebar-nav__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1099px) {
  .vq-sidebar-nav {
    justify-content: center;
    padding: 0;
  }

  .vq-sidebar-nav__label {
    display: none;
  }
}
</style>
