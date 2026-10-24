<script setup>
// 系统设置：仅允许配置 AI 模型信息，保存在 config.json
import { reactive, ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  needsChatCompletionsSuffix,
  normalizeChatCompletionsUrl,
  trimForm
} from '../utils/formInput.js'

const loading = ref(false)
const saving = ref(false)

// 与配置表单对应：仅 LLM 模型配置
const form = reactive({
  // LLM 模型配置
  modelUrl: '',
  apiKey: '',
  modelName: ''
})

// 加载时的模型配置快照，用于判断用户是否修改过模型配置
let initialModelConfig = { modelUrl: '', apiKey: '', modelName: '' }

// 保留 config.json 中未被本界面覆盖的其它字段，保存时合并回写，避免丢数据
let extraConfig = {}

// 加载配置：模型配置取自 config.json
async function loadConfig() {
  loading.value = true
  try {
    const file = await window.api.readFile('config.json')
    if (file.success) {
      const data = JSON.parse(file.content || '{}')
      Object.keys(form).forEach((key) => {
        if (data[key] !== undefined && data[key] !== null) {
          // 旧配置里可能存了带空格/未补全的地址，加载时就规整，避免与快照对比误判为“已修改”
          const value = String(data[key])
          form[key] = key === 'modelUrl' ? normalizeChatCompletionsUrl(value) : value.trim()
        }
      })
      // 记录本界面未管理的字段
      extraConfig = Object.fromEntries(Object.entries(data).filter(([key]) => !(key in form)))
      // 记录加载时的模型配置快照
      initialModelConfig = {
        modelUrl: form.modelUrl,
        apiKey: form.apiKey,
        modelName: form.modelName
      }
    }
  } catch (e) {
    console.error('读取配置失败：', e)
    ElMessage.warning('读取本地配置失败，将使用空白配置')
  } finally {
    loading.value = false
  }
}

// 按 OpenAI 格式向目标 AI 服务发送测试请求，响应 data.choices 为数组即视为可用
async function verifyModelService() {
  const headers = {}
  if (form.apiKey) headers.Authorization = `Bearer ${form.apiKey}`
  const res = await window.api.request({
    url: form.modelUrl,
    method: 'POST',
    json: {
      model: form.modelName,
      messages: [{ role: 'user', content: '立即作答，不要思考、不要解释，只输出一个单词：hello' }],
      stream: false,
      max_tokens: 8,
      temperature: 0,
      enable_thinking: false
    },
    headers
  })
  console.log('AI 验证响应：', res)
  return res && res.success && Array.isArray(res.data?.choices)
}

// 保存：模型配置变更先验证 AI 服务可用，通过后写回 config.json
async function saveAll() {
  // 提交前规整：去首尾空格 + Base URL 自动补全为完整接口地址
  trimForm(form)
  if (needsChatCompletionsSuffix(form.modelUrl)) {
    form.modelUrl = normalizeChatCompletionsUrl(form.modelUrl)
    ElMessage.info('模型地址已自动补全为完整的 chat/completions 接口地址')
  }
  if (!form.modelUrl || !form.modelName) {
    ElMessage.warning('请填写模型地址和模型名称')
    return
  }
  const modelChanged =
    form.modelUrl !== initialModelConfig.modelUrl ||
    form.apiKey !== initialModelConfig.apiKey ||
    form.modelName !== initialModelConfig.modelName
  saving.value = true
  try {
    if (modelChanged) {
      let ok = false
      try {
        ok = await verifyModelService()
      } catch (e) {
        console.error('AI 服务验证异常：', e)
      }
      if (!ok) {
        ElMessage.error('AI服务不可用，请检查模型配置')
        return
      }
    }

    // 写 config.json：仅保存 AI 配置，其余字段原样保留
    const payload = { ...extraConfig, ...form }
    const saved = await window.api.saveConfig(JSON.stringify(payload, null, 2))
    if (!saved.success) {
      ElMessage.error(`保存失败：${saved.error}`)
      return
    }

    ElMessage.success('配置已保存')
    // 保存成功后刷新快照，避免重复验证
    initialModelConfig = {
      modelUrl: form.modelUrl,
      apiKey: form.apiKey,
      modelName: form.modelName
    }
  } catch (e) {
    console.error('保存配置异常：', e)
    ElMessage.error(`保存失败：${e.message}`)
  } finally {
    saving.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div v-loading="loading" class="system-setting-page">
    <el-form class="config-form" label-position="top" size="large">
      <!-- 模型配置 -->
      <h2 class="section-title">模型配置</h2>
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
        <el-button @click="loadConfig">重新加载</el-button>
        <el-button type="primary" class="save-btn" :loading="saving" @click="saveAll"
          >保存设置</el-button
        >
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.system-setting-page {
  height: 100%;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: 24px 20px 40px;
  box-sizing: border-box;
}

.config-form {
  width: 100%;
  max-width: 560px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
  margin: 8px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.save-btn {
  min-width: 140px;
}
</style>
