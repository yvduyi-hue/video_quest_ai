<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const registering = ref(false)
// 项目 Logo（public/images/logo.jpg）：用 document.baseURI 解析，兼容 dev 与打包后 file://
const logoUrl = new URL('images/logo.jpg', document.baseURI).href

// 当前生效的 Polyv UserId：注册后该套凭证（除 AI 模型配置）会与本账号绑定写入本地 sqlite
const polyvUserId = ref('')

onMounted(async () => {
  try {
    const creds = await window.api.getPolyvCredentials()
    polyvUserId.value = creds?.userId || ''
  } catch (e) {
    console.warn('读取当前 Polyv 凭证失败：', e)
  }
})

// 注册表单：账号、密码、昵称
const form = reactive({
  account: '',
  password: '',
  nickname: ''
})

// 提交注册：主进程调 addCate 创建分类，并将用户信息与当前 Polyv 凭证一起写入本地 sqlite
async function register() {
  if (!form.account || !form.password || !form.nickname) {
    ElMessage.warning('请填写账号、密码、昵称')
    return
  }
  registering.value = true
  try {
    const res = await window.api.registerUser({ ...form })
    console.log('注册响应：', res)
    if (res.success) {
      ElMessage.success(
        `注册成功：${res.nickname}（已绑定 Polyv UserId：${res.polyvUserId || '未设置'}）`
      )
      router.push('/login')
    } else {
      ElMessage.error(res.error)
    }
  } finally {
    registering.value = false
  }
}
</script>

<template>
  <div class="register-page">
    <el-form class="register-form" label-position="top" size="large">
      <div class="register-logo">
        <img :src="logoUrl" alt="Video Quest AI" />
      </div>
      <h2 class="title">注册Video Quest AI</h2>
      <!-- 告知用户：注册会把当前 Polyv 凭证绑定到新账号 -->
      <p class="bind-tip">
        注册后当前 Polyv 凭证（UserId：{{ polyvUserId || '未设置' }}）将与本账号绑定，
        后续所有保利威接口均使用该账号绑定的凭证
      </p>
      <el-form-item label="账号">
        <el-input v-model="form.account" placeholder="请输入账号" clearable />
      </el-form-item>
      <el-form-item label="密码">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="请输入密码"
          show-password
          clearable
        />
      </el-form-item>
      <el-form-item label="昵称">
        <el-input v-model="form.nickname" placeholder="请输入昵称" clearable />
      </el-form-item>
      <div class="actions">
        <el-button link type="primary" @click="router.push('/login')">返回登录</el-button>
        <el-button type="primary" :loading="registering" @click="register">注册</el-button>
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.register-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.register-form {
  width: 100%;
  max-width: 360px;
}

/* Logo 原图四周留白较大：容器裁切并放大，取中心图案作为方形应用图标 */
.register-logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
}

.register-logo img {
  width: 100%;
  height: 100%;
  display: block;
  transform: scale(2.2);
}

.title {
  text-align: center;
  color: var(--el-color-primary);
  margin: 0 0 24px;
}

.bind-tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin: -12px 0 18px;
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
}
</style>
