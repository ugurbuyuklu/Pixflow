import { getDb } from '../db/index.js'

export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  body: string | null
  read: boolean
  created_at: string
}

interface NotificationRow {
  id: number
  user_id: number
  type: string
  title: string
  body: string | null
  read: number
  created_at: string
}

const MAX_NOTIFICATIONS = 200

function rowToNotification(row: NotificationRow): Notification {
  return { ...row, read: row.read === 1 }
}

export function getNotifications(userId: number, limit = 50): Notification[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit) as NotificationRow[]
  return rows.map(rowToNotification)
}

export function createNotification(
  userId: number,
  type: string,
  title: string,
  body?: string,
): Notification {
  const db = getDb()

  const insertAndTrim = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)'
    ).run(userId, type, title, body ?? null)

    const count = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ?').get(userId) as { c: number }).c
    if (count > MAX_NOTIFICATIONS) {
      db.prepare(`
        DELETE FROM notifications WHERE id IN (
          SELECT id FROM notifications WHERE user_id = ?
          ORDER BY created_at ASC LIMIT ?
        )
      `).run(userId, count - MAX_NOTIFICATIONS)
    }

    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid) as NotificationRow
  })

  return rowToNotification(insertAndTrim())
}

export function markAsRead(id: number, userId: number): boolean {
  const db = getDb()
  const result = db.prepare(
    'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'
  ).run(id, userId)
  return result.changes > 0
}

export function markAllAsRead(userId: number): number {
  const db = getDb()
  const result = db.prepare(
    'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0'
  ).run(userId)
  return result.changes
}

/** Fire-and-forget notification helper. Never throws. */
export function notify(userId: number, type: string, title: string, body?: string): void {
  try {
    createNotification(userId, type, title, body)
  } catch (err) {
    console.error('[Notifications] Failed to create notification:', err)
  }
}
