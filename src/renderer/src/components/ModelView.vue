<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  needsChatCompletionsSuffix,
  normalizeChatCompletionsUrl,
  trimForm
} from '../utils/formInput.js'

const router = useRouter()
const testing = ref(false)

// LLM 模型配置项
const form = reactive({
  modelUrl: '',
  apiKey: '',
  modelName: ''
})

// 提交前规整：全部输入去首尾空格，Base URL 不是完整接口地址时自动补 /chat/completions
function normalizeInput() {
  trimForm(form)
  if (needsChatCompletionsSuffix(form.modelUrl)) {
    form.modelUrl = normalizeChatCompletionsUrl(form.modelUrl)
    ElMessage.info('模型地址已自动补全为完整的 chat/completions 接口地址')
  }
}

// 点击“下一步”：通过通用网络请求按 OpenAI 格式请求 AI 回复 hello，成功则写入 config 并跳转登录页
async function nextStep() {
  normalizeInput()
  console.log('模型配置参数：', { ...form })
  if (!form.modelUrl || !form.modelName) {
    ElMessage.warning('请填写模型地址和模型名称')
    return
  }
  testing.value = true
  try {
    const headers = {}
    if (form.apiKey) headers.Authorization = `Bearer ${form.apiKey}`
    const res = await window.api.request({
      url: form.modelUrl,
      method: 'POST',
      json: {
        model: form.modelName,
        messages: [
          { role: 'user', content: '立即作答，不要思考、不要解释，只输出一个单词：hello' }
        ],
        stream: false,
        // 限制输出与温度，让测试回答最快返回
        max_tokens: 8,
        temperature: 0,
        // 关闭思考模式（DeepSeek/vLLM 等网关识别；不支持的服务会忽略此字段）
        enable_thinking: false
      },
      headers
    })
    console.log('AI 测试响应：', res)
    // 只要响应符合 OpenAI 格式（data.choices 为数组）即视为服务可用，不验证具体内容
    const isOpenAIFormat = res && res.success && Array.isArray(res.data?.choices)
    if (isOpenAIFormat) {
      // 读取已有 config（含 Polyv 凭证）并合并模型配置后写回本地
      let current = {}
      try {
        const file = await window.api.readFile('config.json')
        if (file.success) current = JSON.parse(file.content)
      } catch {
        console.warn('读取已有 config.json 失败，将仅写入模型配置')
      }
      const saved = await window.api.saveConfig(JSON.stringify({ ...current, ...form }, null, 2))
      if (!saved.success) {
        ElMessage.error(`配置保存失败：${saved.error}`)
        return
      }
      router.push('/login')
    } else {
      console.error('AI 测试请求异常：', res?.status, res?.data)
      ElMessage.error('AI服务不可用')
    }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="model-page">
    <!-- 顶部欢迎标题（与设置页保持一致） -->
    <header class="welcome">
      <h1 class="hello">Hello，欢迎使用 VideoQuestAI</h1>
      <p class="sub">在开始之前需要完成几个小设置</p>
    </header>

    <!-- 模型配置输入区 -->
    <el-form class="config-form" label-position="top" size="large">
      <el-form-item label="模型地址(OpenAI)">
        <el-input
          v-model="form.modelUrl"
          placeholder="请输入模型服务地址（Base URL，只填到 /v1 会自动补 chat/completions）"
          clearable
        />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input
          v-model="form.apiKey"
          placeholder="请输入 API Key"
          type="password"
          show-password
          clearable
        />
      </el-form-item>
      <el-form-item label="模型名称">
        <el-input v-model="form.modelName" placeholder="请输入模型名称" clearable />
      </el-form-item>

      <div class="actions">
        <el-button link type="primary" @click="router.push('/settings')">上一步</el-button>
        <el-button type="primary" class="next-btn" :loading="testing" @click="nextStep"
          >下一步</el-button
        >
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.model-page {
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

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.next-btn {
  min-width: 140px;
}
</style>
