import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

async function seed() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('The development seed requires a local database and NODE_ENV=development.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  try {
    for (const email of ['founder@repharbor.test', 'rep@repharbor.test']) {
      await prisma.appUser.upsert({ where: { email }, create: { email }, update: {} });
    }
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
