import { getDatabase } from './db.js';

async function moderate() {
  const db = await getDatabase();
  const command = process.argv[2];
  const type = process.argv[3];
  const value = process.argv[4];
  const reason = process.argv[5] || 'No reason provided';

  if (command === 'block' && type && value) {
    await db.run(
      'INSERT OR REPLACE INTO blocks (type, value, reason) VALUES (?, ?, ?)',
      [type, value, reason]
    );
    console.log(`Successfully blocked ${type}: ${value}`);
  } else if (command === 'list') {
    const blocks = await db.all('SELECT * FROM blocks');
    console.table(blocks);
  } else if (command === 'unblock' && type && value) {
    await db.run('DELETE FROM blocks WHERE type = ? AND value = ?', [type, value]);
    console.log(`Successfully unblocked ${type}: ${value}`);
  } else {
    console.log('Usage:');
    console.log('  npm run moderate block <domain|actor> <value> [reason]');
    console.log('  npm run moderate unblock <domain|actor> <value>');
    console.log('  npm run moderate list');
  }

  process.exit(0);
}

moderate().catch(console.error);
