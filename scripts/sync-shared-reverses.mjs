/**
 * После photos:process — копирует общий реверс на второй slug (ММД/СПМД с тем же сюжетом).
 * Список согласован с PM: реверс визуально одинаковый для пары дворов.
 */
import { copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COINS = path.join(__dirname, '..', 'public', 'images', 'coins');

/** [источник, назначение] */
const PAIRS = [
  [
    '10r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina-reverse.jpg',
    '10r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina-mmd-reverse.jpg'
  ],
  [
    '10r-2000-55-let-pobedy-v-vov-politruk-reverse.jpg',
    '10r-2000-55-let-pobedy-v-vov-politruk-spmd-reverse.jpg'
  ],
  [
    '10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt-reverse.jpg',
    '10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt-spmd-reverse.jpg'
  ]
];

async function main() {
  for (const [srcName, destName] of PAIRS) {
    const src = path.join(COINS, srcName);
    const dest = path.join(COINS, destName);
    try {
      await access(src);
    } catch {
      console.warn(`[sync-shared-reverses] пропуск (нет источника): ${srcName}`);
      continue;
    }
    await copyFile(src, dest);
    console.log(`[sync-shared-reverses] ${destName} ← ${srcName}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
