import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb.__pgClient ?? postgres(process.env.DATABASE_URL!);

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });
