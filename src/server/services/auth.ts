import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from '../db/index.js'

const JWT_EXPIRY = '7d'

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not set in environment')
  return secret
}

export interface User {
  id: number
  email: string
  name: string
  role: string
  created_at: string
}

interface UserRow extends User {
  password_hash: string
}

export function createUser(email: string, password: string, name: string, role = 'user'): User {
  const db = getDb()
  const hash = bcrypt.hashSync(password, 10)
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).run(email, hash, name, role)

  return { id: Number(info.lastInsertRowid), email, name, role, created_at: new Date().toISOString() }
}

export function authenticateUser(email: string, password: string): { user: User; token: string } | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  if (!row) return null
  if (!bcrypt.compareSync(password, row.password_hash)) return null

  const { password_hash: _, ...user } = row
  const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: JWT_EXPIRY })
  return { user, token }
}

export function verifyToken(token: string): { userId: number; role: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: number; role: string }
  } catch {
    return null
  }
}

export function getUserById(id: number): User | null {
  const db = getDb()
  const row = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id) as User | undefined
  return row ?? null
}

export function changePassword(userId: number, currentPassword: string, newPassword: string): boolean {
  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined
  if (!row) return false
  if (!bcrypt.compareSync(currentPassword, row.password_hash)) return false

  const hash = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId)
  return true
}

export function listUsers(): User[] {
  const db = getDb()
  return db.prepare('SELECT id, email, name, role, created_at FROM users').all() as User[]
}

export function ensureAdminExists(): void {
  const db = getDb()
  const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin')
  if (!admin) {
    createUser('admin@pixery.com', 'pixflow2025', 'Admin', 'admin')
    console.log('[Auth] Default admin created: admin@pixery.com / pixflow2025')
  }
}
