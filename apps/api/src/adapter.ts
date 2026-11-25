import { PrismaPg } from '@prisma/adapter-pg';

export function databaseAdapter(connectionString: string | undefined) {
  const url = new URL(connectionString ?? '');
  const schema = url.searchParams.get('schema');
  if (!schema) return new PrismaPg({ connectionString: url.href });
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(schema)) throw new Error('DATABASE_URL schema must be a PostgreSQL identifier.');
  const existing = url.searchParams.get('options');
  const options = [existing, `-c search_path="${schema}",public`].filter(Boolean).join(' ');
  return new PrismaPg({ connectionString: url.href, options }, { schema });
}
