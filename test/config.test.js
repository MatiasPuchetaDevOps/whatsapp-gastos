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
        process.env.GROUP_DESTINATIONS_ID_1 = '1234567890@g.us';
        process.env.GROUP_DESTINATIONS_HOJA_1 = 'Gastos';
        process.env.GROUP_DESTINATIONS_ID_2 = '9876543210@g.us';
        process.env.GROUP_DESTINATIONS_HOJA_2 = 'Personal Matias';
        import('./config.js').then((mod) => {
          console.log(JSON.stringify({
            OPENAI_API_KEY: mod.OPENAI_API_KEY,
            SPREADSHEET_ID: mod.SPREADSHEET_ID,
            GROUP_DESTINATIONS: mod.GROUP_DESTINATIONS,
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
  assert.deepEqual(parsed.GROUP_DESTINATIONS, {
    '1234567890@g.us': 'Gastos',
    '9876543210@g.us': 'Personal Matias',
  });
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
          GROUP_DESTINATIONS: mod.GROUP_DESTINATIONS,
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
  assert.equal(typeof parsed.GROUP_DESTINATIONS, 'object');
});
