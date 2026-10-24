# VideoQuest Vue Components

VideoQuest 设计稿对应的 Vue 3 组件包（TypeScript + `<script setup>`）。

## 目录结构

```
VideoQuest-Vue-Components/
├── src/
│   ├── components/
│   │   ├── vq-base/        # 基础组件
│   │   │   ├── VqBrandLogo.vue   品牌 Logo
│   │   │   ├── VqIcon.vue        图标（内置 12 个常用图标）
│   │   │   ├── VqInput.vue       文本/邮箱输入框
│   │   │   ├── VqPassword.vue    密码输入框（带可见性切换）
│   │   │   ├── VqCheckbox.vue    复选框
│   │   │   ├── VqButton.vue      按钮（primary / outline）
│   │   │   ├── VqLink.vue        链接文字
│   │   │   ├── VqSearchBar.vue   搜索框
│   │   │   └── VqSelect.vue      下拉选择
│   │   ├── vq-layout/      # 布局组件
│   │   │   ├── VqNavItem.vue     侧边导航项
│   │   │   └── VqUserPill.vue    用户信息条
│   │   └── vq-card/        # 卡片组件
│   │       ├── VqFolderCard.vue  文件夹卡片
│   │       └── VqVideoCard.vue   视频卡片（含状态/时长角标）
│   ├── assets/
│   │   ├── icons/          # 后续从设计稿切出的 svg 图标放这里
│   │   └── css/tokens.css  # 设计变量（颜色/圆角/字体），需在入口 main.ts 引入
│   └── types/vq.d.ts       # 公共 TS 类型
└── demo/
    ├── Login.vue           # 登录页示例
    └── VideoManage.vue     # 视频管理页示例
```

## 使用方法

1. 把 `src/` 整个目录拷进你的 Vue 3 项目（要求 Vue ≥ 3.4，使用了 `defineModel`）。
2. 在入口文件引入设计变量：

```ts
// main.ts
import './assets/css/tokens.css'
```

3. 按需引入组件：

```vue
<script setup lang="ts">
import VqButton from '@/components/vq-base/VqButton.vue'
import VqInput from '@/components/vq-base/VqInput.vue'
</script>

<template>
  <VqInput v-model="email" type="email" prefix-icon="mail" placeholder="请输入邮箱" />
  <VqButton variant="primary" full-width icon="upload" @click="onUpload">上传视频</VqButton>
</template>
```

## 组件速览

| 组件 | v-model | 关键 Props |
| --- | --- | --- |
| VqInput | `string` | `type` / `placeholder` / `prefixIcon` / `disabled` |
| VqPassword | `string` | `placeholder` / `disabled` |
| VqCheckbox | `boolean` | `label` / `disabled` |
| VqButton | — | `variant: 'primary' \| 'outline'` / `fullWidth` / `icon` / `loading` / `disabled` |
| VqSearchBar | `string` | `placeholder` |
| VqSelect | `string` | `options: {label, value}[]` / `placeholder` |
| VqNavItem | — | `icon` / `label` / `active` |
| VqUserPill | — | `avatar` / `name` / `role` |
| VqFolderCard | — | `title` / `count`，事件 `menuClick` |
| VqVideoCard | — | `title` / `coverUrl` / `duration` / `status: 'published' \| 'processing' \| 'pending'`，事件 `menuClick` |
| VqIcon | — | `name`（内置：mail / lock / eye / eye-off / upload / folder-plus / search / dots-three / video / wechat / github / school）/ `size` / `color` |

## 备注

- `VqBrandLogo` 目前是占位 logo，后续替换为设计稿切出的正式 SVG。
- 设计稿切出的 svg 图标统一放 `src/assets/icons/`，需要时可在 `VqIcon.vue` 的 `paths` 表里注册。
- demo 下两个页面是使用示例，直接替换到项目路由里即可预览效果。
