<script setup>
import {
  ArrowRight,
  Delete,
  Edit,
  MoreFilled,
  Rank,
  VideoCamera,
  VideoPlay
} from '@element-plus/icons-vue'

defineProps({
  title: { type: String, required: true },
  coverUrl: { type: String, default: '' },
  duration: { type: String, default: '--:--' },
  statusLabel: { type: String, default: '状态未知' },
  statusTone: { type: String, default: 'neutral' },
  subtitleLabel: { type: String, default: '未创建智能字幕' },
  subtitleTone: { type: String, default: 'neutral' },
  courseware: { type: Boolean, default: false },
  meta: { type: String, default: '' },
  playable: { type: Boolean, default: false },
  view: { type: String, default: 'grid' }
})

const emit = defineEmits(['detail', 'edit', 'move', 'delete', 'play'])

function onCommand(command) {
  if (command === 'play') emit('play')
  else if (command === 'edit') emit('edit')
  else if (command === 'move') emit('move')
  else if (command === 'delete') emit('delete')
}
</script>

<template>
  <article
    class="vq-video-card"
    :class="[`is-${view}`, { 'is-playable': playable }]"
    role="button"
    tabindex="0"
    :aria-label="`查看视频详情：${title}`"
    @click="emit('detail')"
    @keydown.enter.self.prevent="emit('detail')"
    @keydown.space.self.prevent="emit('detail')"
  >
    <div class="vq-video-card__cover">
      <el-image v-if="coverUrl" class="vq-video-card__image" :src="coverUrl" fit="cover" lazy>
        <template #error>
          <div class="vq-video-card__fallback" aria-hidden="true">
            <el-icon :size="26"><VideoCamera /></el-icon>
            <span>暂无封面</span>
          </div>
        </template>
      </el-image>
      <div v-else class="vq-video-card__fallback" aria-hidden="true">
        <el-icon :size="26"><VideoCamera /></el-icon>
        <span>暂无封面</span>
      </div>

      <span class="vq-video-card__status" :class="`is-${statusTone}`">{{ statusLabel }}</span>

      <button
        v-if="playable"
        type="button"
        class="vq-video-card__play"
        title="播放视频"
        aria-label="播放视频"
        @click.stop="emit('play')"
      >
        <el-icon :size="20"><VideoPlay /></el-icon>
      </button>

      <span class="vq-video-card__duration">{{ duration }}</span>
    </div>

    <div class="vq-video-card__body">
      <div class="vq-video-card__title-row">
        <h3 class="vq-video-card__title" :title="title">{{ title }}</h3>

        <el-dropdown trigger="click" placement="bottom-end" @command="onCommand">
          <button
            type="button"
            class="vq-video-card__menu"
            aria-label="视频更多操作"
            @click.stop
            @keydown.stop
          >
            <el-icon :size="16"><MoreFilled /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="playable" command="play" :icon="VideoPlay">
                播放
              </el-dropdown-item>
              <el-dropdown-item command="edit" :icon="Edit">编辑</el-dropdown-item>
              <el-dropdown-item command="move" :icon="Rank">移动</el-dropdown-item>
              <el-dropdown-item command="delete" :icon="Delete" divided>删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="vq-video-card__meta">
        <span class="vq-video-card__date">{{ meta || '时间未知' }}</span>
        <span v-if="courseware" class="vq-video-card__courseware">非课件</span>
      </div>

      <div class="vq-video-card__foot">
        <span class="vq-video-card__subtitle" :class="`is-${subtitleTone}`">
          <span class="vq-video-card__dot" aria-hidden="true"></span>
          {{ subtitleLabel }}
        </span>
        <button type="button" class="vq-video-card__detail" @click.stop="emit('detail')">
          查看详情
          <el-icon :size="13"><ArrowRight /></el-icon>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.vq-video-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--vq-bg-surface);
  border: 1px solid var(--vq-border);
  border-radius: var(--vq-radius-lg);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color var(--vq-duration-fast) var(--vq-ease),
    box-shadow var(--vq-duration-fast) var(--vq-ease),
    transform var(--vq-duration-fast) var(--vq-ease);
}

.vq-video-card:hover {
  border-color: var(--vq-primary-soft);
  box-shadow: var(--vq-shadow-md);
  transform: translateY(-2px);
}

.vq-video-card__cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--vq-bg-subtle);
  overflow: hidden;
}

.vq-video-card__image {
  display: block;
  width: 100%;
  height: 100%;
}

.vq-video-card__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  color: var(--vq-text-placeholder);
  font-size: var(--vq-font-size-xs);
  background:
    radial-gradient(circle at 20% 20%, rgba(21, 94, 239, 0.12), transparent 48%),
    linear-gradient(135deg, #f2f5ff, #f7f8fb);
}

.vq-video-card__status {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--vq-radius-xs);
  font-size: var(--vq-font-size-xs);
  font-weight: 500;
  color: var(--vq-text-inverse);
  background: rgba(16, 24, 40, 0.62);
  backdrop-filter: blur(4px);
}

.vq-video-card__status.is-success {
  color: var(--vq-success-text);
  background: rgba(236, 253, 243, 0.94);
}

.vq-video-card__status.is-warning {
  color: var(--vq-warning-text);
  background: rgba(255, 250, 235, 0.95);
}

.vq-video-card__status.is-danger {
  color: var(--vq-danger-text);
  background: rgba(254, 243, 242, 0.95);
}

.vq-video-card__status.is-neutral {
  color: var(--vq-info-text);
  background: rgba(242, 244, 247, 0.95);
}

.vq-video-card__play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0 0 0 2px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  color: #fff;
  background: rgba(16, 24, 40, 0.5);
  backdrop-filter: blur(4px);
  cursor: pointer;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.92);
  transition:
    opacity var(--vq-duration-fast) var(--vq-ease),
    transform var(--vq-duration-fast) var(--vq-ease),
    background-color var(--vq-duration-fast) var(--vq-ease);
}

.vq-video-card:hover .vq-video-card__play,
.vq-video-card:focus-within .vq-video-card__play,
.vq-video-card__play:focus-visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.vq-video-card__play:hover {
  background: var(--vq-primary);
}

.vq-video-card__duration {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 7px;
  border-radius: var(--vq-radius-xs);
  color: #fff;
  background: rgba(16, 24, 40, 0.72);
  font-size: var(--vq-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.vq-video-card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 14px 16px 16px;
}

.vq-video-card__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.vq-video-card__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--vq-font-size-lg);
  line-height: var(--vq-line-height-lg);
  font-weight: 600;
  color: var(--vq-text-title);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-video-card__menu {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-top: -2px;
  padding: 0;
  border: none;
  border-radius: var(--vq-radius-sm);
  background: transparent;
  color: var(--vq-text-placeholder);
  cursor: pointer;
  transition:
    background-color var(--vq-duration-fast) var(--vq-ease),
    color var(--vq-duration-fast) var(--vq-ease);
}

.vq-video-card__menu:hover {
  background: var(--vq-bg-subtle);
  color: var(--vq-text-secondary);
}

.vq-video-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-size: var(--vq-font-size-sm);
  line-height: var(--vq-line-height-sm);
  color: var(--vq-text-tertiary);
}

.vq-video-card__courseware {
  padding: 1px 6px;
  border-radius: var(--vq-radius-xs);
  color: var(--vq-warning-text);
  background: var(--vq-warning-bg);
  font-size: var(--vq-font-size-xs);
}

.vq-video-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 12px;
}

.vq-video-card__subtitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  font-size: var(--vq-font-size-xs);
  color: var(--vq-text-tertiary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vq-video-card__dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vq-text-placeholder);
}

.vq-video-card__subtitle.is-success .vq-video-card__dot {
  background: var(--vq-success);
}

.vq-video-card__subtitle.is-warning .vq-video-card__dot {
  background: var(--vq-warning);
}

.vq-video-card__subtitle.is-success {
  color: var(--vq-success-text);
}

.vq-video-card__subtitle.is-warning {
  color: var(--vq-warning-text);
}

.vq-video-card__detail {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--vq-primary);
  font-size: var(--vq-font-size-xs);
  cursor: pointer;
}

.vq-video-card__detail:hover {
  text-decoration: underline;
}

.vq-video-card.is-list {
  flex-direction: row;
  align-items: stretch;
}

.vq-video-card.is-list .vq-video-card__cover {
  width: 240px;
  flex-shrink: 0;
  aspect-ratio: 16 / 9;
}

.vq-video-card.is-list .vq-video-card__body {
  justify-content: center;
  padding: 16px 18px;
}

.vq-video-card.is-list .vq-video-card__foot {
  margin-top: 12px;
  padding-top: 0;
}

@media (max-width: 767px) {
  .vq-video-card.is-list {
    flex-direction: column;
  }

  .vq-video-card.is-list .vq-video-card__cover {
    width: 100%;
  }
}
</style>
