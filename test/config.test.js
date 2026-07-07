import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

test('config lee secretos desde variables de entorno', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
        process.env.OPENAI_API_KEY = 'test-key';
        process.env.SPREADSHEET_ID = 'spreadsheet-id';
        process.env.GROUP_ID = '1234567890@g.us';
        import('./config.js').then((mod) => {
          console.log(JSON.stringify({
            OPENAI_API_KEY: mod.OPENAI_API_KEY,
            SPREADSHEET_ID: mod.SPREADSHEET_ID,
            GROUP_ID: mod.GROUP_ID,
          }));
        });
      `,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);

  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.OPENAI_API_KEY, 'test-key');
  assert.equal(parsed.SPREADSHEET_ID, 'spreadsheet-id');
  assert.equal(parsed.GROUP_ID, '1234567890@g.us');
});

test('config carga valores desde .env si existen', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import('./config.js').then((mod) => {
        console.log(JSON.stringify({
          OPENAI_API_KEY: mod.OPENAI_API_KEY,
          SPREADSHEET_ID: mod.SPREADSHEET_ID,
          GROUP_ID: mod.GROUP_ID,
        }));
      });`,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(typeof parsed.OPENAI_API_KEY, 'string');
  assert.equal(typeof parsed.SPREADSHEET_ID, 'string');
  assert.equal(typeof parsed.GROUP_ID, 'string');
});
