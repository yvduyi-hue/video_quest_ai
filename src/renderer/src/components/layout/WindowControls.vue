<script setup>
// 统一的 Electron 无边框窗口控制按钮。
// 主界面顶栏与非主界面 TitleBar 共用，避免两套实现。
function minimize() {
  window.api?.windowMinimize?.()
}

function toggleMaximize() {
  window.api?.windowToggleMaximize?.()
}

function close() {
  window.api?.windowClose?.()
}
</script>

<template>
  <div class="vq-window-controls" role="group" aria-label="窗口控制">
    <button
      type="button"
      class="vq-window-btn"
      title="最小化"
      aria-label="最小化"
      @click="minimize"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2.5 6h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>
    </button>
    <button
      type="button"
      class="vq-window-btn"
      title="最大化 / 还原"
      aria-label="最大化或还原窗口"
      @click="toggleMaximize"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect
          x="2.75"
          y="2.75"
          width="6.5"
          height="6.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
    </button>
    <button
      type="button"
      class="vq-window-btn vq-window-btn--close"
      title="关闭"
      aria-label="关闭窗口"
      @click="close"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2.5 2.5l7 7M9.5 2.5l-7 7"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.vq-window-controls {
  display: flex;
  align-items: stretch;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.vq-window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--vq-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.vq-window-btn:hover {
  background: var(--vq-bg-subtle);
  color: var(--vq-text-title);
}

.vq-window-btn:active {
  background: var(--vq-border-light);
}

.vq-window-btn--close:hover {
  background: #e81123;
  color: #fff;
}

.vq-window-btn--close:active {
  background: #c50f1f;
  color: #fff;
}
</style>
