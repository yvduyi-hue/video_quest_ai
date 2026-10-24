<script setup>
// 自定义标题栏：整条栏可通过 -webkit-app-region: drag 拖动窗口，按钮区域设为 no-drag
function minimize() {
  window.api.windowMinimize()
}
function toggleMaximize() {
  window.api.windowToggleMaximize()
}
function close() {
  window.api.windowClose()
}
</script>

<template>
  <div class="title-bar">
    <div class="window-controls">
      <button class="ctrl-btn" title="最小化" @click="minimize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 6h8" stroke="currentColor" />
        </svg>
      </button>
      <button class="ctrl-btn" title="最大化/还原" @click="toggleMaximize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
        </svg>
      </button>
      <button class="ctrl-btn close" title="关闭" @click="close">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.title-bar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  user-select: none;
  /* 关键：整条标题栏可拖动窗口 */
  -webkit-app-region: drag;
}

.window-controls {
  display: flex;
  height: 100%;
  /* 按钮区域不可拖动，否则点击事件被系统吞掉 */
  -webkit-app-region: no-drag;
}

.ctrl-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.ctrl-btn:hover {
  background: var(--el-fill-color);
}

.ctrl-btn.close:hover {
  background: #e81123;
  color: #fff;
}
</style>
