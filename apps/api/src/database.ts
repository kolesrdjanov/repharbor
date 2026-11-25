import { PrismaPg } from '@prisma/adapter-pg';
import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async isReady() {
    try {
      await this.appUser.findFirst({ select: { id: true } });
      return true;
    } catch {
      return false;
    }
  }
}

@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
