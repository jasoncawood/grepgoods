import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const dbPath = process.env.DATABASE_PATH || './data/grepgoods.db';
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await setupDatabase(db);

  return db;
}

async function setupDatabase(database: Database) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      activity_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      item_name TEXT,
      price REAL,
      currency TEXT,
      content TEXT,
      media_urls TEXT, -- JSON string array
      tags TEXT,       -- JSON string array
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS keys (
      actor_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      type TEXT NOT NULL, -- 'domain', 'actor', or 'keyword'
      value TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (type, value)
    );
  `);
  console.log('Database schema initialized.');
}
