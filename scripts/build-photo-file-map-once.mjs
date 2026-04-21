/**
 * Собирает data/photo-file-map.csv из имён в assets/raw-photos.
 * Соответствие строится по тексту подписи в имени файла (как у PM),
 * с нормализацией Unicode (NFC), без «угадывания» по одному слову там,
 * где в каталоге несколько монет с тем же названием.
 *
 * Запуск: node scripts/build-photo-file-map-once.mjs
 */
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'assets', 'raw-photos');
const OUT = path.join(ROOT, 'data', 'photo-file-map.csv');
const REF = path.join(ROOT, 'data', 'photo-slug-reference.csv');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);

/** @param {string} s */
function nfc(s) {
  return s.normalize('NFC');
}

/**
 * @param {string} basename — имя без расширения, уже NFC
 * @returns {string | null} out_stem без .jpg
 */
function stemFromCaption(basename) {
  const b = basename.trim();

  const endsAvers = /[—\-]\s*аверс\s*$/i.test(b) || /\sаверс\s*$/i.test(b);
  const endsRevers = /[—\-]\s*реверс\s*$/i.test(b) || /\sреверс\s*$/i.test(b);

  /** @param {string} slugPrefix */
  const side = (slugPrefix) => {
    if (endsAvers) return `${slugPrefix}-obverse`;
    if (endsRevers) return `${slugPrefix}-reverse`;
    return null;
  };

  // --- 10 ₽: тематика из подписи (точные префиксы / фразы) ---
  // Гагарина ММД / СПМД: реверс по подписи один файл — дублируется в public см. scripts/sync-shared-reverses.mjs
  if (b.includes('Гагарина') && b.includes('ММД')) {
    const s = side('10r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina-mmd');
    if (s) return s;
  }
  if (b.includes('Гагарина') && b.includes('СПМД')) {
    const s = side('10r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina');
    if (s) return s;
  }
  if (b.includes('Гагарина') && b.includes('реверс') && !b.includes('СПМД') && !b.includes('ММД')) {
    return '10r-2001-40-letie-kosmicheskogo-poleta-yu-a-gagarina-reverse';
  }

  if (b.includes('Политрук') && b.includes('ММД')) {
    const s = side('10r-2000-55-let-pobedy-v-vov-politruk');
    if (s) return s;
  }
  if (b.includes('Политрук') && /спмд/i.test(b)) {
    const s = side('10r-2000-55-let-pobedy-v-vov-politruk-spmd');
    if (s) return s;
  }
  if (b.includes('Политрук') && b.includes('реверс')) {
    return '10r-2000-55-let-pobedy-v-vov-politruk-reverse';
  }

  if (b.includes('никто не забыт') && b.includes('ММД')) {
    const s = side('10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt');
    if (s) return s;
  }
  if (b.includes('никто не забыт') && b.includes('СПМД')) {
    const s = side('10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt-spmd');
    if (s) return s;
  }
  if (b.includes('никто не забыт') && b.includes('реверс')) {
    return '10r-2005-60-let-pobedy-v-vov-nikto-ne-zabyt-reverse';
  }

  if (b.startsWith('Боровск')) return side('10r-2005-borovsk');
  if (b.startsWith('Вооруженные силы')) return side('10r-2002-vooruzhennye-sily');
  if (b.startsWith('Дербент')) return side('10r-2002-derbent');
  // Дмитров в подписи без года: в этом батче — ДГР 2004 (биметалл), не ГВС 2012
  if (b.startsWith('Дмитров')) return side('10r-2004-dmitrov');
  if (b.startsWith('Дорогобуж')) return side('10r-2003-dorogobuzh');
  if (b.startsWith('Калининград')) return side('10r-2005-kaliningrad');
  if (b.startsWith('Кемь')) return side('10r-2004-kem');
  if (b.startsWith('Кострома')) return side('10r-2002-kostroma');
  if (b.startsWith('Краснодарский край')) return side('10r-2005-krasnodarskiy-kray');
  if (b.startsWith('Ленинградская область')) return side('10r-2005-leningradskaya-oblast');
  if (b.startsWith('Муром')) return side('10r-2003-murom');
  if (b.startsWith('Мценск')) return side('10r-2005-mtsensk');
  if (b.startsWith('Орловская область')) return side('10r-2005-orlovskaya-oblast');
  // Псков без уточнения: ДГР 2003 (как остальной набор ДГР в этой папке)
  if (b.startsWith('Псков')) return side('10r-2003-pskov');
  if (b.startsWith('Республика Татарстан')) return side('10r-2005-respublika-tatarstan');
  if (b.startsWith('Ряжск')) return side('10r-2004-ryazhsk');
  if (b.startsWith('Старая Русса')) return side('10r-2002-staraya-russa');
  if (b.startsWith('Тверская область')) return side('10r-2005-tverskaya-oblast');

  if (b.startsWith('Министерство внутренних дел')) return side('10r-2002-ministerstvo-vnutrennikh-del');
  if (b.startsWith('Министерство иностранных дел')) return side('10r-2002-ministerstvo-inostrannykh-del');
  if (b.startsWith('Министерство образования')) return side('10r-2002-ministerstvo-obrazovaniya');
  if (b.startsWith('Министерство финансов')) return side('10r-2002-ministerstvo-finansov');
  if (b.startsWith('Министерство эконом')) return side('10r-2002-ministerstvo-ekonom-razvitiya');
  if (b.startsWith('Министерство юстиции')) return side('10r-2002-ministerstvo-yustitsii');

  return null;
}

function csvEscape(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const names = (await readdir(RAW))
  .filter((n) => IMAGE_EXT.has(path.extname(n).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, 'ru'));

const rows = ['filename,out_stem'];
const refRows = ['filename,coin_slug,side'];
const unknown = [];

for (const name of names) {
  const base = nfc(path.parse(name).name);
  const stem = stemFromCaption(base);
  if (!stem) {
    unknown.push(name);
    continue;
  }
  rows.push(`${csvEscape(name)},${csvEscape(stem)}`);
  const m = /^(.*)-(obverse|reverse)$/.exec(stem);
  const slug = m ? m[1] : stem;
  const side = m ? m[2] : '';
  refRows.push(`${csvEscape(name)},${csvEscape(slug)},${csvEscape(side)}`);
}

await writeFile(OUT, rows.join('\n'), 'utf8');
await writeFile(REF, refRows.join('\n'), 'utf8');
console.log(`Wrote ${OUT} (${rows.length - 1} mappings)`);
console.log(`Wrote ${REF}`);
if (unknown.length) {
  console.error('Unmatched:', unknown);
  process.exit(1);
}
