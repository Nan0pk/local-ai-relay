import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
const examplePath = join(process.cwd(), '.env.example');

if (!existsSync(envPath) && existsSync(examplePath)) {
  copyFileSync(examplePath, envPath);
}
