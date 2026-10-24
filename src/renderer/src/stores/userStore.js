/**
 * 渲染进程登录用户状态（模块单例，响应式共享）
 * 真实会话保存在主进程内存，这里仅缓存一份供各组件读取。
 */
import { reactive } from 'vue'

export const userStore = reactive({
  user: null,
  get isLogin() {
    return this.user !== null
  },
  setUser(user) {
    this.user = user
  },
  clear() {
    this.user = null
  }
})
