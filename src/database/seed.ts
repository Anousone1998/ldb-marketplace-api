/**
 * Seeds sample employees and listings.
 *
 *   npm run seed         → runs pending migrations, then upserts seed data (idempotent)
 *   npm run seed:clean   → runs migrations, TRUNCATEs all marketplace tables, then re-seeds
 *
 * Employees log in with their userId + phoneNumber (POST /api/v1/auth/login).
 */
import 'reflect-metadata';
import { DeepPartial } from 'typeorm';
import { ItemStatus, ItemType } from '../common/enums';
import { AppDataSource } from './data-source';
import { Item, User } from './entities';

const SEED_USERS: DeepPartial<User>[] = [
  {
    userId: 'EMP00101',
    fullName: 'Souksavanh Phommachanh',
    department: 'Information Technology',
    phoneNumber: '+856 20 5555 0101',
    qrPaymentUrl: null,
  },
  {
    userId: 'EMP00102',
    fullName: 'Khamla Vongsa',
    department: 'Human Resources',
    phoneNumber: '+856 20 5555 0102',
    qrPaymentUrl: null,
  },
  {
    userId: 'EMP00103',
    fullName: 'Vilayvanh Sisouphanh',
    department: 'Finance & Accounting',
    phoneNumber: '+856 20 5555 0103',
    qrPaymentUrl: null,
  },
  {
    userId: 'EMP00104',
    fullName: 'Phonesavanh Keomany',
    department: 'Marketing',
    phoneNumber: '+856 20 5555 0104',
    qrPaymentUrl: null,
  },
];

const SEED_ITEMS: DeepPartial<Item>[] = [
  {
    sellerId: 'EMP00101',
    title: 'MacBook Air M1 13" (8GB / 256GB) - Space Gray',
    description:
      'Used for 2 years, battery health 89%. No scratches on the screen, minor wear on the bottom case. ' +
      'Comes with original charger and box.',
    price: 7_500_000,
    itemType: ItemType.SECOND_HAND,
    status: ItemStatus.AVAILABLE,
    pickupLocation: 'HQ Building A, 5th Floor - IT Help Desk',
    images: [],
  },
  {
    sellerId: 'EMP00104',
    title: 'Logitech MX Master 3S Wireless Mouse',
    description: 'Bought 6 months ago, switched to a trackpad. Works perfectly, includes USB-C cable and Bolt receiver.',
    price: 650_000,
    itemType: ItemType.SECOND_HAND,
    status: ItemStatus.AVAILABLE,
    pickupLocation: 'HQ Building B, 2nd Floor - Marketing',
    images: [],
  },
  {
    sellerId: 'EMP00103',
    title: 'Homemade Khao Piak Sen - Friday Lunch Pre-order',
    description:
      'Fresh rice noodle soup with chicken, made the same morning. Order by Thursday 3 PM, ' +
      'pickup Friday 11:45 AM. Price per bowl, container included.',
    price: 35_000,
    itemType: ItemType.FOOD,
    status: ItemStatus.AVAILABLE,
    pickupLocation: 'HQ Building A, Ground Floor - Staff Canteen',
    images: [],
  },
  {
    sellerId: 'EMP00102',
    title: 'Banana Cake & Coconut Sticky Rice Set - Pre-order',
    description: 'Box of 6 banana cakes + 4 coconut sticky rice. Baked fresh on Wednesday, pickup after 4 PM.',
    price: 60_000,
    itemType: ItemType.FOOD,
    status: ItemStatus.AVAILABLE,
    pickupLocation: 'HQ Building A, 3rd Floor - HR Pantry',
    images: [],
  },
  {
    sellerId: 'EMP00101',
    title: 'Free Books: Clean Code + The Pragmatic Programmer',
    description:
      'Giving away two classic software engineering books (English editions, good condition). ' +
      'First come, first served - please pick them up within the week.',
    price: 0,
    itemType: ItemType.FREE,
    status: ItemStatus.AVAILABLE,
    pickupLocation: 'HQ Building A, 5th Floor - Library Shelf',
    images: [],
  },
];

async function run(): Promise<void> {
  const clean = process.argv.includes('--clean');
  const started = Date.now();

  await AppDataSource.initialize();
  try {
    const migrations = await AppDataSource.runMigrations({ transaction: 'all' });
    if (migrations.length > 0) {
      console.log(`✔ Applied ${migrations.length} migration(s): ${migrations.map((m) => m.name).join(', ')}`);
    }

    await AppDataSource.transaction(async (manager) => {
      if (clean) {
        await manager.query('TRUNCATE TABLE "messages", "orders", "items", "users" RESTART IDENTITY CASCADE');
        console.log('✔ Cleaned tables: messages, orders, items, users');
      }

      await manager.upsert(User, SEED_USERS, { conflictPaths: ['userId'], skipUpdateIfNoValuesChanged: true });
      console.log(`✔ Upserted ${SEED_USERS.length} employees`);

      let inserted = 0;
      for (const item of SEED_ITEMS) {
        const exists = await manager.existsBy(Item, { sellerId: item.sellerId, title: item.title });
        if (!exists) {
          await manager.insert(Item, item);
          inserted += 1;
        }
      }
      console.log(`✔ Inserted ${inserted} item(s) (${SEED_ITEMS.length - inserted} already present)`);
    });

    console.log('\nSeeded logins (POST /api/v1/auth/login with userId + phoneNumber):');
    for (const user of SEED_USERS) console.log(`  ${user.userId}  ${user.phoneNumber}  (${user.fullName})`);
    console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((err: unknown) => {
  console.error('✖ Seeding failed:', err);
  process.exit(1);
});
