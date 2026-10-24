export type ButtonVariant = 'primary' | 'outline'
export type VideoStatus = 'published' | 'processing' | 'pending'
export type IconName =
  | 'mail'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'upload'
  | 'folder-plus'
  | 'search'
  | 'dots-three'
  | 'video'
  | 'wechat'
  | 'github'
  | 'school'

export interface VqButtonProps {
  variant?: ButtonVariant
  fullWidth?: boolean
  icon?: IconName
  loading?: boolean
  disabled?: boolean
}

export interface VqInputProps {
  modelValue: string
  type?: 'text' | 'email'
  placeholder?: string
  prefixIcon?: IconName
  disabled?: boolean
}

export interface VqCheckboxProps {
  modelValue: boolean
  label: string
  disabled?: boolean
}

export interface VqNavItemProps {
  icon: IconName
  label: string
  active?: boolean
}

export interface VqFolderCardProps {
  title: string
  count: number
}

export interface VqVideoCardProps {
  title: string
  coverUrl: string
  duration: string
  status: VideoStatus
}
