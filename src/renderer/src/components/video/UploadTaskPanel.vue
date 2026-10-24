<script setup>
// 上传任务面板：主界面顶栏与（P2 之后）视频管理页共用。
// 所有状态与操作都来自 uploadStore，不在此组件里创建任务。
import { ElMessage } from 'element-plus'
import { uploadStore, TASK_STATUS, TASK_STATUS_TEXT } from '../../stores/uploadStore.js'

function progressStatus(status) {
  if (status === TASK_STATUS.SUCCESS) return 'success'
  if (status === TASK_STATUS.FAILED) return 'exception'
  return ''
}

function resumeTask(id) {
  uploadStore.resumeTask(id).catch((e) => {
    console.error('继续上传失败：', e)
    ElMessage.error(e.message || '继续上传失败')
  })
}

function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
}
</script>

<template>
  <div class="vq-upload-panel">
    <div class="vq-upload-panel__head">
      <span class="vq-upload-panel__title">上传任务</span>
      <span class="vq-upload-panel__count">共 {{ uploadStore.tasks.length }} 个</span>
    </div>

    <el-empty
      v-if="!uploadStore.tasks.length"
      description="暂无上传任务"
      :image-size="52"
      class="vq-upload-panel__empty"
    />

    <div v-else class="vq-upload-panel__list">
      <div v-for="task in uploadStore.tasks" :key="task.id" class="vq-upload-task">
        <div class="vq-upload-task__head">
          <span class="vq-upload-task__name" :title="task.fileName">{{ task.title }}</span>
          <span :class="['vq-upload-task__status', `is-${task.status}`]">
            {{ TASK_STATUS_TEXT[task.status] }}
          </span>
        </div>

        <el-progress
          :percentage="task.progress"
          :status="progressStatus(task.status)"
          :stroke-width="6"
        />

        <div class="vq-upload-task__foot">
          <span class="vq-upload-task__size">{{ formatSize(task.size) }}</span>
          <span class="vq-upload-task__ops">
            <el-button
              v-if="task.status === TASK_STATUS.UPLOADING"
              link
              type="primary"
              size="small"
              @click="uploadStore.pauseTask(task.id)"
            >
              暂停
            </el-button>
            <el-button
              v-else-if="task.status === TASK_STATUS.WAITING"
              link
              type="primary"
              size="small"
              @click="resumeTask(task.id)"
            >
              继续
            </el-button>
            <el-button link type="info" size="small" @click="uploadStore.removeTask(task.id)">
              移除
            </el-button>
          </span>
        </div>

        <div v-if="task.error" class="vq-upload-task__msg is-error">{{ task.error }}</div>
        <div v-else-if="task.vid" class="vq-upload-task__msg" :title="task.vid">
          vid: {{ task.vid }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vq-upload-panel {
  display: flex;
  flex-direction: column;
  max-height: 360px;
  margin: -4px 0;
}

.vq-upload-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0 10px;
}

.vq-upload-panel__title {
  font-size: var(--vq-font-size-base);
  font-weight: 600;
  color: var(--vq-text-title);
}

.vq-upload-panel__count {
  font-size: var(--vq-font-size-sm);
  color: var(--vq-text-tertiary);
}

.vq-upload-panel__empty {
  padding: 12px 0;
}

.vq-upload-panel__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 2px;
}

.vq-upload-task {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vq-upload-task__head,
.vq-upload-task__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: var(--vq-font-size-sm);
}

.vq-upload-task__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vq-text-title);
}

.vq-upload-task__status {
  flex-shrink: 0;
  color: var(--vq-text-tertiary);
}

.vq-upload-task__status.is-uploading {
  color: var(--vq-primary);
}

.vq-upload-task__status.is-success {
  color: var(--vq-success);
}

.vq-upload-task__status.is-failed {
  color: var(--vq-danger);
}

.vq-upload-task__size {
  color: var(--vq-text-tertiary);
}

.vq-upload-task__ops :deep(.el-button) {
  margin-left: 8px;
  padding: 0;
  font-size: var(--vq-font-size-sm);
}

.vq-upload-task__ops :deep(.el-button:first-child) {
  margin-left: 0;
}

.vq-upload-task__msg {
  overflow: hidden;
  font-size: var(--vq-font-size-sm);
  color: var(--vq-text-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vq-upload-task__msg.is-error {
  color: var(--vq-danger);
}
</style>
