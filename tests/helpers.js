import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FILES = ['ARCHITECTURE.md', 'SOFTWARE_ARCHITECTURE.md', 'CAPSTONE_METHODOLOGY_FINAL.md', 'high level software architure diagram.md', 'OPERATOR_MANUAL.md'];
export const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
