import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { founderSession, proposedAgreement, referenceCompany, referenceIds, repSession } from '@repharbor/contracts';

async function seed() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('The development seed requires a local database and NODE_ENV=development.');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  try {
    await prisma.$transaction(async (tx) => {
      const accounts = [
        founderSession, repSession,
        { userId: referenceIds.unrelatedFounder, email: 'founder@elsewhere.test' },
        { userId: referenceIds.unrelatedRep, email: 'rep@elsewhere.test' },
      ];
      for (const { userId, email } of accounts) {
        await tx.appUser.upsert({ where: { id: userId }, create: { id: userId, email }, update: {} });
      }
      const scenarios = [
        {
          company: referenceCompany,
          founderId: referenceIds.founder, repId: referenceIds.rep,
          productId: referenceIds.product, engagementId: referenceIds.engagement, productName: 'Konvuno Pro',
        },
        {
          company: { id: referenceIds.unrelatedCompany, name: 'Elsewhere', timeZone: 'UTC' },
          founderId: referenceIds.unrelatedFounder, repId: referenceIds.unrelatedRep,
          productId: referenceIds.unrelatedProduct, engagementId: referenceIds.unrelatedEngagement, productName: 'Elsewhere Pro',
        },
      ];
      for (const scenario of scenarios) {
        const companyId = scenario.company.id;
        await tx.company.upsert({ where: { id: companyId }, create: scenario.company, update: {} });
        const membership = { companyId, userId: scenario.founderId };
        await tx.companyFounder.upsert({
          where: { companyId_userId: membership }, create: membership, update: {},
        });
        await tx.product.upsert({
          where: { id: scenario.productId },
          create: { id: scenario.productId, companyId, name: scenario.productName }, update: {},
        });
        await tx.engagement.upsert({
          where: { id: scenario.engagementId },
          create: { id: scenario.engagementId, companyId, productId: scenario.productId, repId: scenario.repId },
          update: {},
        });
      }
      await tx.agreementVersion.upsert({
        where: { id: proposedAgreement.id },
        create: { ...proposedAgreement, proposedBy: referenceIds.founder }, update: {},
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
