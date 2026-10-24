<template>
  <div class="layout">
    <aside>
      <VqUserPill name="王老师" role="创作者" />
      <VqNavItem icon="video" label="视频管理" active />
      <VqNavItem icon="folder-plus" label="文件夹" />
    </aside>
    <main>
      <div class="toolbar">
        <VqSearchBar v-model="keyword" class="search" />
        <VqSelect v-model="sortVal" :options="sortOptions" />
        <VqButton variant="primary" icon="upload" @click="openUpload">上传视频</VqButton>
        <VqButton variant="outline" icon="folder-plus" @click="newFolder">新建文件夹</VqButton>
      </div>

      <h3>文件夹</h3>
      <div class="folder-grid">
        <VqFolderCard
          v-for="item in folderList"
          :key="item.title"
          v-bind="item"
          @menu-click="openMenu(item.title)"
        />
      </div>

      <h3>视频</h3>
      <div class="video-grid">
        <VqVideoCard
          v-for="item in videoList"
          :key="item.title"
          v-bind="item"
          @menu-click="openMenu(item.title)"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VqUserPill from '../src/components/vq-layout/VqUserPill.vue'
import VqNavItem from '../src/components/vq-layout/VqNavItem.vue'
import VqSearchBar from '../src/components/vq-base/VqSearchBar.vue'
import VqSelect from '../src/components/vq-base/VqSelect.vue'
import VqButton from '../src/components/vq-base/VqButton.vue'
import VqFolderCard from '../src/components/vq-card/VqFolderCard.vue'
import VqVideoCard from '../src/components/vq-card/VqVideoCard.vue'
import type { VqFolderCardProps, VqVideoCardProps } from '../src/types/vq'

const keyword = ref('')
const sortVal = ref('time')
const sortOptions = [
  { label: '最新', value: 'time' },
  { label: '名称', value: 'name' },
]

const folderList = ref<VqFolderCardProps[]>([
  { title: '分支剧情教学', count: 12 },
  { title: '嵌入式考核案例', count: 8 },
  { title: '多模态 AI 反馈', count: 5 },
])

const videoList = ref<VqVideoCardProps[]>([
  { title: '第一章：互动学习之旅', coverUrl: '', duration: '08:32', status: 'published' },
  { title: '第二章：分支引擎实战', coverUrl: '', duration: '12:05', status: 'processing' },
  { title: '第三章：AI 反馈配置', coverUrl: '', duration: '06:47', status: 'pending' },
])

const openUpload = () => {}
const newFolder = () => {}
const openMenu = (name: string) => console.log('open menu:', name)
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}
aside {
  width: 220px;
  border-right: 1px solid var(--vq-border-base);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
main {
  flex: 1;
  padding: 20px 24px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.toolbar .search {
  flex: 1;
  max-width: 320px;
}
h3 {
  margin: 20px 0 10px;
  font-size: 15px;
  color: var(--vq-text-title);
}
.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
</style>
