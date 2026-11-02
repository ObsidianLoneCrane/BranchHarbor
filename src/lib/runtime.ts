import { invoke, isTauri } from '@tauri-apps/api/core'
import { version } from '../../package.json'

export interface RuntimeInfo {
  version: string
  platform: string
  architecture: string
}

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  if (!isTauri()) return { version, platform: 'Browser preview', architecture: 'Not applicable' }
  return invoke<RuntimeInfo>('get_runtime_info')
}
