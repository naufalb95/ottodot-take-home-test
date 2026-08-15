import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@db:5432/trial_booking"
  },
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  },
});
