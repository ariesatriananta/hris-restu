export const APP_NAME = 'HRIS RSIA'
export const APP_SHORT_NAME = 'RSIA'
export const COMPANY_NAME = 'PT Restu Sejati Inti Abadi'
export const APP_LOGO_SRC = '/brand/restu-logo-2.png'
export const APP_ICON_SRC = '/brand/restu-icon.png'
export function shouldShowAppLogo(value: string | undefined) {
  return (value ?? 'true').trim().toLowerCase() !== 'false'
}

export const SHOW_APP_LOGO = shouldShowAppLogo(import.meta.env.VITE_SHOW_LOGO)
