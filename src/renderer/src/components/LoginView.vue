<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { userStore } from '../stores/userStore.js'

const router = useRouter()
const loading = ref(false)
// 项目 Logo（public/images/logo.jpg）：用 document.baseURI 解析，兼容 dev 与打包后 file://
const logoUrl = new URL('images/logo.jpg', document.baseURI).href
const form = reactive({
  account: '',
  password: ''
})
// 自动登录：勾选后登录成功将凭据记录到 config.json，下次启动自动登录
const autoLogin = ref(false)

// 读取并合并写回 config.json：勾选则保存凭据，取消则清除已存的自动登录信息
// （saveConfig 会整体覆盖 config.json，故先读原配置再合并 autoLogin 字段）
async function persistAutoLogin() {
  try {
    const readRes = await window.api.readFile('config.json')
    let config = {}
    if (readRes && readRes.success && readRes.content) {
      try {
        config = JSON.parse(readRes.content)
      } catch {
        config = {}
      }
    }
    config.autoLogin = autoLogin.value
      ? { enabled: true, account: form.account, password: form.password }
      : { enabled: false, account: '', password: '' }
    await window.api.saveConfig(JSON.stringify(config, null, 2))
  } catch (e) {
    console.error('保存自动登录配置失败：', e)
  }
}

// 登录：主进程从本地 sqlite 查找比对，成功后用户数据存内存并跳转主界面
async function login() {
  if (!form.account || !form.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const res = await window.api.loginUser({ ...form })
    console.log('登录响应：', res)
    if (res.success) {
      await persistAutoLogin()
      userStore.setUser(res.user)
      router.push('/main')
    } else {
      ElMessage.error(res.error)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-form class="login-form" label-position="top" size="large">
      <div class="login-logo">
        <img :src="logoUrl" alt="Video Quest AI" />
      </div>
      <h2 class="title">登录 Video Quest AI</h2>
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
      <div class="options-row">
        <el-checkbox v-model="autoLogin">自动登录</el-checkbox>
      </div>
      <div class="actions">
        <el-button link type="primary" @click="router.push('/settings')">返回设置</el-button>
        <div class="action-right">
          <el-button @click="router.push('/register')">注册</el-button>
          <el-button type="primary" :loading="loading" @click="login">登录</el-button>
        </div>
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-form {
  width: 100%;
  max-width: 360px;
}

/* Logo 原图四周留白较大：容器裁切并放大，取中心图案作为方形应用图标 */
.login-logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
}

.login-logo img {
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

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.action-right {
  display: flex;
  gap: 8px;
}

.options-row {
  margin: -8px 0 4px;
}
</style>
