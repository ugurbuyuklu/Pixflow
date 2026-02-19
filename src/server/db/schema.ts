import type Database from 'better-sqlite3'

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      color_primary TEXT NOT NULL,
      color_accent TEXT NOT NULL,
      prompt_schema TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      concept TEXT NOT NULL,
      prompts TEXT NOT NULL,
      prompt_count INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'generate',
      model_used TEXT,
      variety_score TEXT,
      quality_metrics TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      prompt TEXT NOT NULL,
      name TEXT,
      concept TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS research_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept_keyword TEXT UNIQUE NOT NULL,
      trend_findings TEXT NOT NULL,
      competitor_insights TEXT NOT NULL,
      technical_recommendations TEXT NOT NULL,
      sources_analyzed INTEGER DEFAULT 0,
      source_urls TEXT,
      last_web_search INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 1,
      last_accessed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS generated_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      job_id TEXT NOT NULL,
      batch_index INTEGER NOT NULL,
      prompt_index INTEGER NOT NULL,
      variant_index INTEGER NOT NULL,
      url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      concept TEXT NOT NULL,
      prompt TEXT NOT NULL,
      aspect_ratio TEXT,
      resolution TEXT,
      output_format TEXT,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS image_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
      notes TEXT,
      rated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (image_id) REFERENCES generated_images(id) ON DELETE CASCADE,
      UNIQUE(user_id, image_id)
    );

    CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
    CREATE INDEX IF NOT EXISTS idx_history_product ON history(product_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_presets_product ON presets(product_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_research_cache_keyword ON research_cache(concept_keyword);
    CREATE INDEX IF NOT EXISTS idx_research_cache_expires ON research_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_research_cache_accessed ON research_cache(last_accessed_at);
    CREATE INDEX IF NOT EXISTS idx_generated_images_user ON generated_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_generated_images_job ON generated_images(job_id);
    CREATE INDEX IF NOT EXISTS idx_generated_images_generated_at ON generated_images(generated_at);
    CREATE INDEX IF NOT EXISTS idx_image_ratings_user ON image_ratings(user_id);
    CREATE INDEX IF NOT EXISTS idx_image_ratings_image ON image_ratings(image_id);
    CREATE INDEX IF NOT EXISTS idx_image_ratings_user_rating ON image_ratings(user_id, rating);
  `)
}

export function seedProducts(db: Database.Database): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }

  const insert = db.prepare('INSERT INTO products (name, slug, color_primary, color_accent) VALUES (?, ?, ?, ?)')

  const products = [
    ['Clone AI', 'clone-ai', '#7C3AED', '#A78BFA'],
    ['Fyro', 'fyro', '#EA580C', '#FB923C'],
    ['Fling', 'fling', '#DB2777', '#F472B6'],
    ['Zurna', 'zurna', '#0891B2', '#22D3EE'],
    ['Impresso', 'impresso', '#059669', '#34D399'],
    ['Captions', 'captions', '#7C3AED', '#A78BFA'],
  ] as const

  const insertMany = db.transaction((rows: typeof products) => {
    for (const row of rows) insert.run(...row)
  })

  if (existing.count === 0) {
    insertMany(products)
  } else {
    const existingSlugs = new Set(
      (db.prepare('SELECT slug FROM products').all() as { slug: string }[]).map((row) => row.slug),
    )
    for (const row of products) {
      if (!existingSlugs.has(row[1])) insert.run(...row)
    }
  }
}

export function seedCaptionPresets(db: Database.Database): void {
  const productRow = db.prepare('SELECT id FROM products WHERE slug = ?').get('captions') as { id: number } | undefined
  if (!productRow) return

  const existing = db
    .prepare('SELECT name FROM presets WHERE product_id = ? AND is_builtin = 1')
    .all(productRow.id) as { name: string }[]
  const existingNames = new Set(existing.map((row) => row.name))

  const presets = [
    {
      name: 'TikTok Bold',
      description: 'High-contrast, bold subtitles with highlight.',
      prompt: {
        language: 'auto',
        fontName: 'Poppins',
        fontSize: 72,
        fontWeight: 'black',
        fontColor: '#ffffff',
        highlightColor: '#7c3aed',
        strokeWidth: 3,
        strokeColor: '#000000',
        backgroundColor: '#000000',
        backgroundOpacity: 0.45,
        position: 'bottom',
        yOffset: 0,
        wordsPerSubtitle: 4,
        enableAnimation: true,
      },
    },
    {
      name: 'YouTube Clean',
      description: 'Clean white text with subtle stroke, no animation.',
      prompt: {
        language: 'auto',
        fontName: 'Inter',
        fontSize: 72,
        fontWeight: 'bold',
        fontColor: '#ffffff',
        highlightColor: '#ffffff',
        strokeWidth: 2,
        strokeColor: '#000000',
        backgroundColor: '#000000',
        backgroundOpacity: 0.2,
        position: 'bottom',
        yOffset: 0,
        wordsPerSubtitle: 6,
        enableAnimation: false,
      },
    },
    {
      name: 'Subtle Minimal',
      description: 'Minimal subtitles, smaller size, low contrast background.',
      prompt: {
        language: 'auto',
        fontName: 'Poppins',
        fontSize: 72,
        fontWeight: 'normal',
        fontColor: '#f5f5f5',
        highlightColor: '#f5f5f5',
        strokeWidth: 0,
        strokeColor: '#000000',
        backgroundColor: '#000000',
        backgroundOpacity: 0.15,
        position: 'bottom',
        yOffset: 8,
        wordsPerSubtitle: 6,
        enableAnimation: false,
      },
    },
    {
      name: 'High Contrast',
      description: 'Large text with strong outline for busy footage.',
      prompt: {
        language: 'auto',
        fontName: 'Poppins',
        fontSize: 72,
        fontWeight: 'bold',
        fontColor: '#ffffff',
        highlightColor: '#22c55e',
        strokeWidth: 4,
        strokeColor: '#000000',
        backgroundColor: '#000000',
        backgroundOpacity: 0.5,
        position: 'bottom',
        yOffset: 0,
        wordsPerSubtitle: 3,
        enableAnimation: true,
      },
    },
  ]

  const insert = db.prepare(
    'INSERT INTO presets (product_id, user_id, name, description, prompt, is_builtin) VALUES (?, NULL, ?, ?, ?, 1)',
  )
  const update = db.prepare(
    'UPDATE presets SET description = ?, prompt = ? WHERE product_id = ? AND name = ? AND is_builtin = 1',
  )

  for (const preset of presets) {
    if (existingNames.has(preset.name)) {
      update.run(preset.description, JSON.stringify(preset.prompt), productRow.id, preset.name)
    } else {
      insert.run(productRow.id, preset.name, preset.description, JSON.stringify(preset.prompt))
    }
  }
}
