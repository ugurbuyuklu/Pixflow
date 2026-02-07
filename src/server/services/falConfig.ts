import { fal } from '@fal-ai/client'

let configured = false

export function ensureFalConfig() {
  if (!configured) {
    fal.config({ credentials: process.env.FAL_API_KEY })
    configured = true
  }
}
