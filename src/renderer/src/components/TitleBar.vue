<script setup>
// 非主界面（登录/设置/播放器等）的窗口标题栏：只保留拖拽与窗口控制。
// 窗口按钮统一使用 layout/WindowControls，避免两套实现。
import WindowControls from './layout/WindowControls.vue'

function onDblClick(event) {
  if (event.target.closest('button')) return
  window.api?.windowToggleMaximize?.()
}
</script>

<template>
  <div class="vq-titlebar vq-drag" @dblclick="onDblClick">
    <div class="vq-titlebar__spacer"></div>
    <WindowControls class="vq-titlebar__controls" />
  </div>
</template>

<style scoped>
.vq-titlebar {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  flex-shrink: 0;
  height: var(--vq-titlebar-h);
  background: var(--vq-bg-surface);
  border-bottom: 1px solid var(--vq-border);
  user-select: none;
}

.vq-titlebar__spacer {
  flex: 1;
  min-width: 0;
}

.vq-titlebar__controls {
  height: 100%;
}
</style>
