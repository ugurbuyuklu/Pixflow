import jwt from 'jsonwebtoken'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/index.js'
import { isSqliteRuntimeCompatible, setupTestDb, withEnv } from '../test-helpers.js'
import {
  authenticateUser,
  changePassword,
  createUser,
  ensureBootstrapAdminIfConfigured,
  getUserById,
  listUsers,
  verifyToken,
} from './auth.js'

const JWT_SECRET = 'test-secret-at-least-32-chars-long!'
let cleanup: (() => Promise<void>) | undefined
const describeDb = isSqliteRuntimeCompatible() ? describe : describe.skip

beforeAll(async () => {
  if (!isSqliteRuntimeCompatible()) return
  process.env.JWT_SECRET = JWT_SECRET
  const ctx = await setupTestDb()
  cleanup = ctx.cleanup
})

afterAll(async () => {
  if (!isSqliteRuntimeCompatible()) return
  delete process.env.JWT_SECRET
  if (cleanup) {
    await cleanup()
  }
})

describeDb('createUser', () => {
  it('returns User object with id, email, name, role', () => {
    const user = createUser('alice@test.com', 'password123', 'Alice')
    expect(user).toMatchObject({ email: 'alice@test.com', name: 'Alice', role: 'user' })
    expect(user.id).toBeGreaterThan(0)
    expect(user.created_at).toBeDefined()
  })

  it('defaults role to user', () => {
    const user = createUser('bob@test.com', 'password123', 'Bob')
    expect(user.role).toBe('user')
  })

  it('stores bcrypt hash not plaintext', () => {
    createUser('hash-check@test.com', 'mysecret', 'Hash')
    const row = getDb().prepare('SELECT password_hash FROM users WHERE email = ?').get('hash-check@test.com') as {
      password_hash: string
    }
    expect(row.password_hash).not.toBe('mysecret')
    expect(row.password_hash).toMatch(/^\$2[aby]?\$/)
  })

  it('throws on duplicate email', () => {
    createUser('dup@test.com', 'pass', 'Dup')
    expect(() => createUser('dup@test.com', 'pass2', 'Dup2')).toThrow()
  })
})

describeDb('authenticateUser', () => {
  beforeAll(() => {
    createUser('auth@test.com', 'correct-password', 'Auth User')
  })

  it('returns user + JWT token for valid credentials', () => {
    const result = authenticateUser('auth@test.com', 'correct-password')
    expect(result).not.toBeNull()
    expect(result!.user.email).toBe('auth@test.com')
    expect(result!.token).toBeTruthy()
  })

  it('returns null for wrong password', () => {
    expect(authenticateUser('auth@test.com', 'wrong')).toBeNull()
  })

  it('returns null for non-existent email', () => {
    expect(authenticateUser('nobody@test.com', 'whatever')).toBeNull()
  })
})

describeDb('verifyToken', () => {
  it('returns payload for valid token', () => {
    const { token } = authenticateUser('auth@test.com', 'correct-password')!
    const payload = verifyToken(token)
    expect(payload).not.toBeNull()
    expect(payload!.userId).toBeGreaterThan(0)
    expect(payload!.role).toBe('user')
  })

  it('returns null for invalid token', () => {
    expect(verifyToken('garbage.token.here')).toBeNull()
  })

  it('returns null for token signed with wrong secret', () => {
    const fakeToken = jwt.sign({ userId: 1, role: 'admin' }, 'wrong-secret')
    expect(verifyToken(fakeToken)).toBeNull()
  })
})

describeDb('getUserById', () => {
  it('returns user for valid id', () => {
    const created = createUser('byid@test.com', 'pass', 'ById')
    const found = getUserById(created.id)
    expect(found).not.toBeNull()
    expect(found!.email).toBe('byid@test.com')
  })

  it('returns null for non-existent id', () => {
    expect(getUserById(99999)).toBeNull()
  })

  it('does not return password_hash', () => {
    const created = createUser('nohash@test.com', 'pass', 'NoHash')
    const found = getUserById(created.id) as Record<string, unknown>
    expect(found).not.toHaveProperty('password_hash')
  })
})

describeDb('changePassword', () => {
  let userId: number

  beforeAll(() => {
    userId = createUser('changepw@test.com', 'oldpass', 'ChangePw').id
  })

  it('returns true and updates password when current password correct', () => {
    expect(changePassword(userId, 'oldpass', 'newpass')).toBe(true)
    expect(authenticateUser('changepw@test.com', 'newpass')).not.toBeNull()
  })

  it('returns false when current password wrong', () => {
    expect(changePassword(userId, 'wrongcurrent', 'doesntmatter')).toBe(false)
  })

  it('returns false when userId does not exist', () => {
    expect(changePassword(99999, 'any', 'any')).toBe(false)
  })
})

describeDb('listUsers', () => {
  it('returns all users without password_hash', () => {
    const users = listUsers()
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect(u).toHaveProperty('email')
      expect(u).not.toHaveProperty('password_hash')
    }
  })
})

describeDb('ensureBootstrapAdminIfConfigured', () => {
  it('skips when PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP is not set', async () => {
    await withEnv({ PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP: undefined }, () => {
      expect(() => ensureBootstrapAdminIfConfigured()).not.toThrow()
    })
  })

  it('throws when enabled but email/password missing', async () => {
    await withEnv(
      {
        PIXFLOW_BOOTSTRAP_ADMIN_ON_STARTUP: 'true',
        PIXFLOW_BOOTSTRAP_ADMIN_EMAIL: undefined,
        PIXFLOW_BOOTSTRAP_ADMIN_PASSWORD: undefined,
      },
      () => {
        expect(() => ensureBootstrapAdminIfConfigured()).toThrow('missing')
      },
    )
  })
})
