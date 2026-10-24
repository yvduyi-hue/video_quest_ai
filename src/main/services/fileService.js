/**
 * 本地文件读写 IPC 服务
 *
 * 规则（对应需求）：
 * - 不传路径 / 只传文件名            -> 使用默认可写路径（Electron userData 目录）
 * - 传入路径但没有权限（写失败/不可读）-> 自动回退到默认可写路径，文件名取原路径的 basename
 * - 读写结果都带上最终落盘路径 finalPath，方便界面提示用户文件在哪
 */
import { ipcMain, app } from 'electron'
import fs from 'fs-extra'
import { basename, join } from 'path'

// 默认可写路径：%APPDATA%/<appName>（Windows）
export function getDefaultDir() {
  return app.getPath('userData')
}

/**
 * 解析目标文件路径：
 * - filePath 为空             -> 默认可写目录 + 'data.txt'
 * - filePath 不含目录分隔符    -> 视为文件名，落在默认可写目录
 * - 其他                      -> 相对路径也按默认可写目录解析，绝对路径原样使用
 */
function resolveTarget(filePath, fallbackName = 'data.txt') {
  const dir = getDefaultDir()
  if (!filePath) return join(dir, fallbackName)
  if (!filePath.includes('/') && !filePath.includes('\\')) return join(dir, filePath)
  return filePath
}

/**
 * 写入本地文件
 * @param {string} filePath 文件路径或文件名；为空写默认可写目录
 * @param {string|Buffer} content 文件内容
 * @returns {{ success: boolean, finalPath: string, fallback: boolean, error?: string }}
 */
export async function writeLocalFile(filePath, content) {
  const target = resolveTarget(filePath)
  try {
    await fs.outputFile(target, content)
    return { success: true, finalPath: target, fallback: false }
  } catch {
    // 无权限 / 目录不可写：回退到默认可写路径
    const fallbackPath = join(getDefaultDir(), basename(target))
    try {
      await fs.outputFile(fallbackPath, content)
      return { success: true, finalPath: fallbackPath, fallback: true }
    } catch (e2) {
      return { success: false, finalPath: fallbackPath, fallback: true, error: e2.message }
    }
  }
}

/**
 * 读取本地文件
 * @param {string} filePath 文件路径或文件名；为空/无权限读默认可写目录
 * @returns {{ success: boolean, content?: string, finalPath: string, fallback: boolean, error?: string }}
 */
export async function readLocalFile(filePath) {
  const target = resolveTarget(filePath)
  try {
    const content = await fs.readFile(target, 'utf-8')
    return { success: true, content, finalPath: target, fallback: false }
  } catch (e) {
    // 原路径不存在/无权限：尝试默认可写路径下的同名文件
    const fallbackPath = join(getDefaultDir(), basename(target))
    if (fallbackPath === target) {
      return { success: false, finalPath: target, fallback: false, error: e.message }
    }
    try {
      const content = await fs.readFile(fallbackPath, 'utf-8')
      return { success: true, content, finalPath: fallbackPath, fallback: true }
    } catch (e2) {
      return { success: false, finalPath: fallbackPath, fallback: true, error: e2.message }
    }
  }
}

/** 注册文件相关 IPC */
export function registerFileIpc() {
  ipcMain.handle('file:write', (_e, filePath, content) => writeLocalFile(filePath, content))
  ipcMain.handle('file:read', (_e, filePath) => readLocalFile(filePath))
  ipcMain.handle('file:default-dir', () => getDefaultDir())
}
