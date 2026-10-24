/**
 * 表单输入的提交前规整：配置类输入统一去首尾空格，模型地址自动补全为完整接口地址。
 * 主进程是把 config.json 里的 modelUrl 直接当请求 URL 用的（outlineService / quizService /
 * smartSubtitle），所以这里必须补成 OpenAI 的 chat/completions 端点，否则请求会打到根路径。
 */

// OpenAI 兼容接口路径结尾，大小写不敏感
const CHAT_COMPLETIONS_RE = /\/chat\/completions$/i

/**
 * 就地 trim 表单里所有字符串字段（去掉用户误粘贴的首尾空格/换行）
 * @param {Object} form 响应式表单对象
 * @returns {Object} 同一个 form，便于链式使用
 */
export function trimForm(form) {
  if (!form || typeof form !== 'object') return form
  Object.keys(form).forEach((key) => {
    const value = form[key]
    if (typeof value === 'string') form[key] = value.trim()
  })
  return form
}

/**
 * 补全模型地址：只填 Base URL（如 https://xx/v1、https://xx/v1/）时自动接上 /chat/completions；
 * 已经是完整地址则原样返回（仅去掉首尾空格与结尾多余斜杠）。非完整地址返回空串。
 * @param {string} input 用户填写的地址
 * @returns {string} 规整后的地址；入参为空时返回空串
 */
export function normalizeChatCompletionsUrl(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  // 查询串原样保留，只处理 path 部分
  const qIndex = raw.indexOf('?')
  const pathPart = qIndex === -1 ? raw : raw.slice(0, qIndex)
  const query = qIndex === -1 ? '' : raw.slice(qIndex)
  const clean = pathPart.replace(/\/+$/, '')
  if (CHAT_COMPLETIONS_RE.test(clean)) return `${clean}${query}`
  return `${clean}/chat/completions${query}`
}

/**
 * 判断地址是否需要补全（用于给出「已自动补全」提示）
 * @param {string} input 用户填写的地址
 * @returns {boolean} true 表示将被自动追加 /chat/completions
 */
export function needsChatCompletionsSuffix(input) {
  const normalized = normalizeChatCompletionsUrl(input)
  return !!normalized && normalized !== String(input ?? '').trim()
}
