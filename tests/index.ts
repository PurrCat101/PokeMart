import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvironmentFile(): void {
  const environment = process.env.TEST_ENV ?? 'default';
  const path = join(__dirname, 'configs', `.env.${environment}`);
  if (!existsSync(path)) throw new Error(`Unknown test environment "${environment}". Expected ${path}.`);
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnvironmentFile();

export const testConfig = {
  bffBaseUrl: process.env.BFF_BASE_URL ?? 'http://localhost:3001',
  pokemartApiBaseUrl: process.env.POKEMART_API_BASE_URL ?? 'http://localhost:3000',
  wiremockBaseUrl: process.env.WIREMOCK_BASE_URL ?? 'http://localhost:8080',
  mysql: {
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE ?? 'pokemart_lab',
    user: process.env.MYSQL_USER ?? 'pokemart_user',
    password: process.env.MYSQL_PASSWORD ?? 'change_me_for_local_development',
  },
};
