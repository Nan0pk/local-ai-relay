import { readFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export async function ensureNodeInUserPath(): Promise<void> {
  const localNodeBin = join(homedir(), '.local', 'node', 'bin');
  if (existsSync(join(localNodeBin, 'node')) && existsSync(join(localNodeBin, 'npm'))) {
    const rcFiles = ['.bashrc', '.bash_profile', '.zshrc'].map((f) => join(homedir(), f));
    for (const rcPath of rcFiles) {
      if (existsSync(rcPath)) {
        try {
          const content = await readFile(rcPath, 'utf8');
          if (!content.includes('.local/node/bin')) {
            await appendFile(rcPath, `\n# Auto-added by local-ai-relay\nexport PATH="$HOME/.local/node/bin:$PATH"\n`);
          }
        } catch {
          // ignore read/write errors
        }
      }
    }
  }
}
