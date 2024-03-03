import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super();
    this.$extends(withAccelerate());
  }
}
