<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-head">
        <VqBrandLogo size="md" />
        <h2>登录平台</h2>
        <p class="sub">请使用您的教育单位凭证或关联账号登录</p>
      </div>

      <VqInput v-model="email" type="email" prefix-icon="mail" placeholder="name@school.edu.cn 或 yourname@example.com" />
      <VqPassword v-model="pwd" placeholder="请输入您的登录密码" />

      <div class="row">
        <VqCheckbox v-model="remember" label="记住我（保持登录 14 天）" />
        <VqLink @click="goForget">忘记密码？</VqLink>
      </div>

      <VqButton variant="primary" full-width :loading="loading" @click="login">登录</VqButton>

      <div class="divider"><span>或通过以下方式登录（教育认证/演示）</span></div>

      <div class="other-login">
        <VqButton variant="outline" icon="wechat" @click="login">微信快捷登录</VqButton>
        <VqButton variant="outline" icon="school" @click="login">高校统一认证</VqButton>
        <VqButton variant="outline" icon="github" @click="login">GitHub</VqButton>
      </div>

      <p class="register">还没有账号？<VqLink @click="goRegister">立即注册</VqLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VqBrandLogo from '../src/components/vq-base/VqBrandLogo.vue'
import VqInput from '../src/components/vq-base/VqInput.vue'
import VqPassword from '../src/components/vq-base/VqPassword.vue'
import VqCheckbox from '../src/components/vq-base/VqCheckbox.vue'
import VqButton from '../src/components/vq-base/VqButton.vue'
import VqLink from '../src/components/vq-base/VqLink.vue'

const email = ref('')
const pwd = ref('')
const remember = ref(false)
const loading = ref(false)

const login = () => {
  loading.value = true
  setTimeout(() => (loading.value = false), 800)
}
const goForget = () => {}
const goRegister = () => {}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vq-bg-hover);
}
.login-card {
  width: 420px;
  background: #fff;
  border: 1px solid var(--vq-border-base);
  border-radius: var(--vq-radius-md);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.login-head h2 {
  margin: 12px 0 4px;
  color: var(--vq-text-title);
}
.sub {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--vq-text-secondary);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.divider {
  position: relative;
  text-align: center;
  font-size: 12px;
  color: var(--vq-text-placeholder);
}
.divider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid var(--vq-border-base);
}
.divider span {
  position: relative;
  background: #fff;
  padding: 0 8px;
}
.other-login {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.other-login :deep(.vq-btn) {
  padding: 0 8px;
  font-size: 13px;
}
.register {
  margin: 0;
  text-align: center;
  font-size: 14px;
  color: var(--vq-text-secondary);
}
</style>
