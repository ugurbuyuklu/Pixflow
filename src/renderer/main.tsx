import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initApi } from './lib/api'
import { useAuthStore } from './stores/authStore'
import { useThemeStore } from './stores/themeStore'

initApi().finally(() => {
  useThemeStore.getState().init()
  useAuthStore.getState().init()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
