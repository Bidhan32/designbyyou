import { copyFile, readFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const shell = await readFile(new URL('index.html', dist), 'utf8');
if (!shell.includes('id="root"') || !shell.includes('noindex')) {
  throw new Error('Expected the freshly built protected application shell. Run vite build first.');
}
await copyFile(new URL('index.html', dist), new URL('app.html', dist));
await copyFile(new URL('../public/home.html', import.meta.url), new URL('index.html', dist));
console.log('Public homepage and separate noindex application shell prepared.');
