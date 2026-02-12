const MIN_JWT_SECRET_LENGTH = 32

function hasValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isTruthy(value: string | undefined): boolean {
  if (!hasValue(value)) return false
  return ['1', 'true', 'yes', 'on'].includes((value as string).trim().toLowerCase())
}

export function validateServerEnv(): void {
  const jwtSecret = process.env.JWT_SECRET
  if (!hasValue(jwtSecret)) {
    throw new Error('Missing required environment variable: JWT_SECRET')
  }

  if ((jwtSecret as string).trim().length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`)
  }

  if (process.env.NODE_ENV === 'production' && isTruthy(process.env.PIXFLOW_AUTH_BYPASS)) {
    throw new Error('PIXFLOW_AUTH_BYPASS must be disabled in production.')
  }

  const bootstrapEnabled = process.env.PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP
  const bootstrapEmail = process.env.PIXFLOW_BOOTSTRAP_ADMIN_EMAIL
  const bootstrapPassword = process.env.PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD

  const bootstrapConfigProvided = hasValue(bootstrapEnabled) || hasValue(bootstrapEmail) || hasValue(bootstrapPassword)
  if (!bootstrapConfigProvided) return

  const normalizedEnabled = (bootstrapEnabled || '').trim().toLowerCase()
  const bootstrapIsOn = ['1', 'true', 'yes', 'on'].includes(normalizedEnabled)
  if (!bootstrapIsOn) return

  if (!hasValue(bootstrapEmail) || !hasValue(bootstrapPassword)) {
    throw new Error(
      'Bootstrap admin is enabled; PIXFLOW_BOOTSTRAP_ADMIN_EMAIL and PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD must both be set.',
    )
  }

  if (!(bootstrapEmail as string).includes('@')) {
    throw new Error('PIXFLOW_BOOTSTRAP_ADMIN_EMAIL must be a valid email address.')
  }

  if ((bootstrapPassword as string).length < 12) {
    throw new Error('PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters long.')
  }
}
