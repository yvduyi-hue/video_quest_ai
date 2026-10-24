<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { trimForm } from '../utils/formInput.js'

const router = useRouter()

// Polyv 配置项
const form = reactive({
  userId: '',
  secretKey: '',
  writeToken: '',
  appId: '',
  appSecret: ''
})

// 点击“下一步”：用输入的凭证请求 userSpaceInfo 端点，响应打印到控制台
async function nextStep() {
  // 提交前规整：凭证一律去掉首尾空格（粘贴常带空格/换行），再参与签名与落库
  trimForm(form)
  console.log('设置参数：', { ...form })
  // AppID / AppSecret 为必填项
  if (!form.appId || !form.appSecret) {
    ElMessage.warning('请填写 AppID 和 AppSecret')
    return
  }
  try {
    const res = await window.api.polyvEndpoint({
      endpoint: 'userSpaceInfo',
      method: 'GET',
      config: { ...form }
    })
    console.log('userSpaceInfo 响应：', res)
    if (res && res.isSuccess) {
      // 验证通过：将 Polyv 三项凭证写入 config.json（主进程热更新配置），再进入模型设置页
      const saved = await window.api.saveConfig(JSON.stringify({ ...form }, null, 2))
      if (!saved.success) {
        ElMessage.error(`配置保存失败：${saved.error}`)
        return
      }
      router.push('/model')
    } else {
      ElMessage.error(`验证失败：${res ? res.message : '接口无响应'}`)
    }
  } catch (e) {
    console.error('userSpaceInfo 请求失败：', e)
    ElMessage.error('请求失败，请检查网络或凭证')
  }
}
</script>

<template>
  <div class="settings-page">
    <!-- 顶部欢迎标题（两行） -->
    <header class="welcome">
      <h1 class="hello">Hello，欢迎使用 VideoQuestAI</h1>
      <p class="sub">在开始之前需要完成几个小设置</p>
    </header>

    <!-- 底部配置输入区 -->
    <el-form class="config-form" label-position="top" size="large">
      <!-- 这组 Polyv 凭证会写入 config.json，并作为注册时绑定到每个账号的凭证 -->
      <p class="bind-tip">
        以下 Polyv
        配置将在注册时与账号绑定写入本地数据库，每个应用账号使用自己绑定的凭证请求保利威接口
      </p>
      <el-form-item label="UserId">
        <el-input v-model="form.userId" placeholder="请输入 Polyv UserId" clearable />
      </el-form-item>
      <el-form-item label="SecretKey">
        <el-input v-model="form.secretKey" placeholder="请输入 SecretKey" show-password clearable />
      </el-form-item>
      <el-form-item label="WriteToken">
        <el-input
          v-model="form.writeToken"
          placeholder="请输入 WriteToken"
          show-password
          clearable
        />
      </el-form-item>
      <el-form-item label="AppID">
        <el-input v-model="form.appId" placeholder="请输入 AppID" clearable />
      </el-form-item>
      <el-form-item label="AppSecret">
        <el-input v-model="form.appSecret" placeholder="请输入 AppSecret" show-password clearable />
      </el-form-item>

      <div class="actions">
        <el-button type="primary" class="next-btn" @click="nextStep">下一步</el-button>
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  box-sizing: border-box;
}

.welcome {
  text-align: center;
  margin-bottom: 40px;
}

.welcome .hello {
  font-size: 28px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin: 0 0 12px;
}

.welcome .sub {
  font-size: 16px;
  color: var(--el-text-color-regular);
  margin: 0;
}

.config-form {
  width: 100%;
  max-width: 460px;
}

.bind-tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin: -8px 0 16px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.next-btn {
  min-width: 140px;
}
</style>
