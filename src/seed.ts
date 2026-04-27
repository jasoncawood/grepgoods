import 'dotenv/config';
import { getDatabase } from './db';

async function seed() {
  // Dynamic import for ESM module in CJS context
  const { faker } = await import('@faker-js/faker');
  
  const db = await getDatabase();
  console.log('Seeding 15 random listings...');

  for (let i = 0; i < 15; i++) {
    const itemName = faker.commerce.productName();
    const price = parseFloat(faker.commerce.price({ min: 10, max: 1000 }));
    const currency = faker.helpers.arrayElement(['USD', 'EUR', 'GBP']);
    const actor = `https://${faker.internet.domainName()}/users/${faker.internet.username()}`;
    const activityId = `https://${faker.internet.domainName()}/activities/${faker.string.uuid()}`;
    
    const hashtags = [
      `#${faker.commerce.productAdjective()}`,
      `#${faker.commerce.department()}`,
      '#GrepGoods'
    ];

    const mediaUrls = [
      `https://picsum.photos/seed/${faker.string.uuid()}/600/400`
    ];

    await db.run(
      `INSERT INTO listings (activity_id, actor_id, content, item_name, price, currency, tags, media_urls, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [
        activityId,
        actor,
        `Check out this ${itemName} for only ${price} ${currency}! @market@grepgoods.space`,
        itemName,
        price,
        currency,
        JSON.stringify(hashtags),
        JSON.stringify(mediaUrls)
      ]
    );
  }

  console.log('Successfully seeded 15 items.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
