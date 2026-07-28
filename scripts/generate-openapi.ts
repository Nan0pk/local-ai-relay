import { mkdir, writeFile } from 'node:fs/promises';
import { generateOpenAPISpec } from '../src/routes/openapi.js';

await mkdir('docs', { recursive: true });
await writeFile('docs/openapi.json', `${JSON.stringify(generateOpenAPISpec(), null, 2)}\n`);
process.stdout.write('generated docs/openapi.json\n');
