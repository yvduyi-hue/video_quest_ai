<script setup>
import { nextTick, ref, watch } from 'vue'
import { Close, FolderAdd } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'submit'])

const name = ref('')
const inputRef = ref(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = ''
    nextTick(() => inputRef.value?.focus())
  }
)

function close() {
  if (props.loading) return
  emit('update:modelValue', false)
}

function submit() {
  const value = name.value.trim()
  if (!value || props.loading) return
  emit('submit', value)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    width="min(440px, calc(100vw - 48px))"
    class="vq-folder-create-dialog"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="!loading"
    align-center
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="vq-folder-dialog__head">
        <span class="vq-folder-dialog__icon" aria-hidden="true">
          <el-icon :size="20"><FolderAdd /></el-icon>
        </span>
        <div class="vq-folder-dialog__head-text">
          <h3>新建文件夹</h3>
          <p>创建新分类，用于整理各类学科或章节视频</p>
        </div>
        <button
          type="button"
          class="vq-folder-dialog__close"
          aria-label="关闭新建文件夹弹窗"
          :disabled="loading"
          @click="close"
        >
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </div>
    </template>

    <div class="vq-folder-dialog__body">
      <label class="vq-folder-dialog__label" for="vq-folder-name">文件夹名称</label>
      <el-input
        id="vq-folder-name"
        ref="inputRef"
        v-model="name"
        maxlength="50"
        show-word-limit
        clearable
        placeholder="请输入文件夹名称，例如：物理力学实验"
        @keyup.enter="submit"
      />
    </div>

    <template #footer>
      <div class="vq-folder-dialog__footer">
        <el-button :disabled="loading" @click="close">取消</el-button>
        <el-button type="primary" :loading="loading" :disabled="!name.trim()" @click="submit">
          创建文件夹
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.vq-folder-create-dialog :deep(.el-dialog__header) {
  margin: 0;
  padding: 22px 22px 0;
}

.vq-folder-create-dialog :deep(.el-dialog__body) {
  padding: 18px 22px 6px;
}

.vq-folder-create-dialog :deep(.el-dialog__footer) {
  padding: 12px 22px 20px;
}

.vq-folder-dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.vq-folder-dialog__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--vq-radius-md);
  color: var(--vq-primary);
  background: var(--vq-primary-light);
}

.vq-folder-dialog__head-text {
  flex: 1;
  min-width: 0;
}

.vq-folder-dialog__head-text h3 {
  margin: 0;
  font-size: var(--vq-font-size-xl);
  line-height: var(--vq-line-height-xl);
  font-weight: 600;
  color: var(--vq-text-title);
}

.vq-folder-dialog__head-text p {
  margin: 3px 0 0;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
}

.vq-folder-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--vq-radius-sm);
  background: transparent;
  color: var(--vq-text-tertiary);
  cursor: pointer;
}

.vq-folder-dialog__close:hover {
  background: var(--vq-bg-subtle);
  color: var(--vq-text-title);
}

.vq-folder-dialog__close:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.vq-folder-dialog__label {
  display: block;
  margin-bottom: 8px;
  font-size: var(--vq-font-size-md);
  font-weight: 500;
  color: var(--vq-text-main);
}

.vq-folder-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
