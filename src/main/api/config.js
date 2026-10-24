/**
 * Polyv / HTTP 客户端配置
 * 优先级：默认可写路径下的 config.json > 环境变量 > 占位默认值
 * （config.json 由设置界面通过 file:write IPC 写入）
 */
import { app } from 'electron'
import fs from 'fs-extra'
import { join } from 'path'

const defaults = {
  baseUrl: 'http://api.polyv.net/v2',
  userId: '',
  writeToken: '',
  readToken: '',
  secretKey: '',
  appId: '',
  appSecret: ''
}

const envConfig = {
  userId: process.env.POLYV_USER_ID || '',
  writeToken: process.env.POLYV_WRITE_TOKEN || '',
  readToken: process.env.POLYV_READ_TOKEN || '',
  secretKey: process.env.POLYV_SECRET_KEY || '',
  appId: process.env.POLYV_APP_ID || '',
  appSecret: process.env.POLYV_APP_SECRET || ''
}

function loadLocalConfig() {
  try {
    const file = join(app.getPath('userData'), 'config.json')
    if (fs.existsSync(file)) {
      return fs.readJsonSync(file)
    }
  } catch (e) {
    console.error('读取 config.json 失败，降级为环境变量/默认值', e.message)
  }
  return {}
}

export const polyvConfig = { ...defaults, ...envConfig, ...loadLocalConfig() }

export default polyvConfig
