#!/usr/bin/env node
/**
 * Перезаписывает поле `описание` для всех строк с type=jubilee в data/coins.csv:
 * уникальные связные тексты в нумизматическом стиле (варианты на основе хэша slug).
 *
 * Перед генерацией подмешивает тираж из data/jubilee-mintage-overrides.json (slug → число),
 * если в CSV тираж пустой или 0.
 *
 * Запуск: node scripts/write-jubilee-about.mjs
 *         node scripts/write-jubilee-about.mjs --dry-run
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'coins.csv');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'jubilee-mintage-overrides.json');
const DRY = process.argv.includes('--dry-run');

/** @type {Record<string, string>} */
const SERIES_LABELS = {
  'rossiyskaya-federatsiya': 'Российская Федерация',
  'drevnie-goroda-rossii': 'Древние города России',
  'goroda-voinskoy-slavy': 'Города воинской славы',
  'goroda-slavy': 'Города воинской славы',
  'goroda-trudovoy-doblesti': 'Города трудовой доблести',
  'chelovek-truda': 'Человек труда',
  'oruzhie-velikoy-pobedy-konstruktory-oruzhiya': 'Оружие Великой Победы',
  'polkovodtsy-i-geroi-otechestvennoy-voyny-1812-goda': '200 лет Победы 1812',
  'srazheniya-i-znamenatelnye-sobytiya-otechestvennoy-voyny-1812-goda-i-zagranichnykh-pokhodov-russkoy-armii-1813-1814-godov': '200 лет Победы 1812',
  '200-letie-pobedy-rossii-v-otechestvennoy-voyne-1812-goda': '200 лет Победы 1812',
  '50-letie-pobedy-v-velikoy-otechestvennoy-voyne': '50 лет Победы в ВОВ',
  '50-let-velikoy-pobedy': '50 лет Победы в ВОВ',
  'pamyatnye-monety-posvyashchennye-pobede-v-velikoy-otechestvennoy-voyne-1941-1945-gg': '50 лет Победы в ВОВ',
  '70-letie-pobedy-v-velikoy-otechestvennoy-voyne-1941-1945-gg': '70 лет Победы в ВОВ',
  '70-letie-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg': '70 лет Победы в ВОВ',
  'goroda-stolitsy-gosudarstv-osvobozhdennye-sovetskimi-voyskami-ot-nemetsko-fashistskikh-zakhvatchikov': '70 лет Победы в ВОВ',
  '70-letie-razgroma-sovetskimi-voyskami-nemetsko-fashistskikh-voysk-v-stalingradskoy-bitve': '70 лет Победы в ВОВ',
  '75-letie-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg': '75 лет Победы в ВОВ',
  'yubiley-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg': '75 лет Победы в ВОВ',
  '75-letie-polnogo-osvobozhdeniya-leningrada-ot-fashistskoy-blokady': '75 лет Победы в ВОВ',
  'xxii-olimpiyskie-zimnie-igry-i-xi-paralimpiyskie-zimnie-igry-2014-goda-v-g-sochi': 'Олимпиада в Сочи 2014',
  'chempionat-mira-po-futbolu-fifa-2018-v-rossii': 'ЧМ по футболу 2018',
  'krasnaya-kniga': 'Красная книга',
  'krasnaya-kniga-sssr': 'Красная книга СССР',
  'vydayushchiesya-lichnosti-rossii': 'Выдающиеся личности России',
  '200-letie-so-dnya-rozhdeniya-pushkina': 'Выдающиеся личности России',
  'rossiyskaya-sovetskaya-multiplikatsiya': 'Российская (советская) мультипликация',
  '300-letie-rossiyskogo-flota': '300-летие Российского флота',
  '1150-letie-zarozhdeniya-rossiyskoy-gosudarstvennosti': '1150-летие зарождения российской государственности',
  '20-letie-prinyatiya-konstitutsii-rossiyskoy-federatsii': '20-летие Конституции РФ',
  'khkhikh-vsemirnaya-zimnyaya-universiada-2019-goda-v-g-krasnoyarske': 'Универсиада в Красноярске',
  'kosmos': 'Космос',
  'podvig-sovetskikh-voinov-srazhavshikhsya-na-krymskom-poluostrove-v-gody-velikoy-otechestvennoy-voyny-1941-1945-gg': 'Подвиг защитников Крыма',
  'rossiyskiy-sport': 'Российский спорт',
  'xxvii-vsemirnaya-letnyaya-universiada-2013-goda-v-g-kazani': 'Универсиада в Казани',
  'bez-serii': 'отдельный выпуск вне именной серии',
  '50-letie-pobedy-v-velikoy-otechestvennoy-voyne': '50 лет Победы в ВОВ',
  '50-letie-osvobozhdeniya-kieva-ot-fashistskikh-zakhvatchikov': 'Памятные монеты о Великой Отечественной войне',
  'pamyatnye-monety-posvyashchennye-pobede-v-velikoy-otechestvennoy-voyne-1941-1945-gg': 'Памятные монеты о Великой Отечественной войне'
};

/** @type {Record<string, string>} */
const MATERIAL_PHRASE = {
  cupronickel: 'мельхиор (медно-никелевый сплав)',
  galvanic: 'сталь с гальваническим покрытием',
  gvs: 'сталь с латунным покрытием',
  bimetal: 'биметаллическая заготовка',
  silver: 'серебро',
  gold: 'золото'
};

function parseCsv(raw) {
  const rows = [];
  let i = 0;
  let f = '';
  let row = [];
  let q = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (q) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          f += '"';
          i += 2;
          continue;
        }
        q = false;
        i++;
        continue;
      }
      f += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      q = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(f);
      f = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (f.length || row.length) {
        row.push(f);
        rows.push(row);
      }
      row = [];
      f = '';
      if (ch === '\r' && raw[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    f += ch;
    i++;
  }
  if (f.length || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

function escCsv(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function serializeCsv(rows) {
  return rows.map((row) => row.map(escCsv).join(',')).join('\n') + '\n';
}

function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseNum(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatDenom(d, unit) {
  if (unit === 'копейка') {
    if (d === 1) return '1 копейка';
    if (d >= 2 && d <= 4) return `${d} копейки`;
    return `${d} копеек`;
  }
  if (d === 1) return '1 рубль';
  if (d >= 2 && d <= 4) return `${d} рубля`;
  return `${d} рублей`;
}

/**
 * @param {Record<string, string>} row
 * @param {number} h
 */
function buildAbout(row, h) {
  const slug = row.slug ?? '';
  const name = (row['название'] ?? '').trim();
  const year = String(row['год'] ?? '').trim();
  const mint = (row['монетный_двор'] ?? '').trim();
  const denom = parseNum(row['номинал']);
  const unit = (row['единица_номинала'] ?? 'рубль').trim() === 'копейка' ? 'копейка' : 'рубль';
  const denomStr = formatDenom(denom, unit);
  const seriesRaw = (row.series ?? '').trim();
  const seriesLabel = SERIES_LABELS[seriesRaw] ?? seriesRaw.replace(/-/g, ' ');
  const material = MATERIAL_PHRASE[row.material] ?? 'недрагоценный металл';
  let mintage = parseNum(row['тираж']);
  const variant = (row['разновидность'] ?? '').trim();

  const mintPart = mint ? `, монетный двор — ${mint}` : '';
  const varPart = variant ? ` Вариант: ${variant}.` : '';

  const a = h % 7;
  const b = (h >> 3) % 6;
  const c = (h >> 7) % 5;

  const openings = [
    `Памятный выпуск номиналом ${denomStr} (${year}${mintPart}) — отдельная позиция в каталоге современной России: сюжет «${name}».`,
    `Юбилейная монета ${denomStr} ${year} года${mint ? ` (${mint})` : ''} посвящена теме «${name}» — для коллекционера это прежде всего сюжет и сохранность.`,
    `Выпуск ${year} года, ${denomStr}${mintPart}: на реверсе раскрывается тема «${name}» в рамках официальной памятной программы.`,
    `Номинал ${denomStr}, год чеканки ${year}${mintPart}. Предмет коллекционирования — памятная монета с наименованием «${name}».`,
    `Официальная памятная монета ${denomStr} (${year}) с темой «${name}»${mint ? `; штемпель ${mint}` : ''}.`,
    `Каталожная карточка: ${denomStr}, ${year} год${mintPart}. Тематика выпуска — «${name}».`,
    `Представитель памятной эмиссии ${year} года (${denomStr})${mintPart}: «${name}».`
  ];

  const hasNamedSeries = Boolean(seriesLabel && seriesLabel !== 'отдельный выпуск вне именной серии');
  const seriesBits = [
    hasNamedSeries
      ? `Серия в каталоге: «${seriesLabel}».`
      : `Оформлена как самостоятельный сюжет без привязки к крупной серии в базе проекта.`,
    hasNamedSeries
      ? `Относится к линейке «${seriesLabel}» — это задаёт нумизматический контекст подбора.`
      : `Материал заготовки по паспорту выпуска: ${material}.`,
    hasNamedSeries
      ? `Входит в тематическую группу «${seriesLabel}».`
      : `Технология изготовления для круга обращения: ${material}.`,
    `Материал заготовки по паспорту выпуска: ${material}.`,
    `Технология изготовления для круга обращения: ${material}.`,
    `Для оценки экземпляра важны сохранность штемпеля и полнота комплекта.${varPart}`
  ];

  const mintageBits =
    mintage > 0
      ? [
          `По официальным данным эмиссии тираж составил ${mintage.toLocaleString('ru-RU')} экземпляров — это задаёт массовость выпуска и ориентир по редкости в коллекции.`,
          `Заявленный тираж — ${mintage.toLocaleString('ru-RU')} шт.; при прочих равных более скромный тираж обычно поддерживает спрос в коллекционном сегменте.`,
          `Тираж ${mintage.toLocaleString('ru-RU')} шт. хорошо известен по банковским материалам и фиксируется в нумизматических справочниках.`,
          `Эмиссия ${mintage.toLocaleString('ru-RU')} экземпляров относит монету к категории памятных выпусков с известной массовостью.`,
          `Официальный тираж — ${mintage.toLocaleString('ru-RU')} шт.; для ориентира по рынку смотрите состояние и полноту комплекта.`
        ]
      : [
          `По этой позиции в открытых банковских сводках тираж не унифицирован или не перенесён в базу — ориентируйтесь на каталоги и аукционную статистику.`,
          `Точный тираж в таблице не проставлен: при покупке сверяйте паспорт монеты и независимые каталоги.`,
          `Для тиража в базе нет числового значения; нумизматическая оценка опирается на сохранность и подлинность.`,
          `Число отчеканенных экземпляров в данной строке не указано — имеет смысл свериться с расширенными каталогами (Конрос, «Монеты России»).`
        ];

  const closings = [
    'Как объект коллекции монета интересна сочетанием темы, штемпеля и качества чеканки.',
    'В коллекцию её берут за узнаваемый сюжет и возможность собрать серию целиком.',
    'Для альбома важны равномерный блеск поля и отсутствие следов обращения на рельефе.',
    'Рыночная котировка в первую очередь следует за сохранностью и редкостью штемпельных разновидностей.',
    'Сохраняйте монету от влаги и механических повреждений — для памятных выпусков критична сохранность деталей рельефа.'
  ];

  const parts = [openings[a], seriesBits[b % seriesBits.length], mintageBits[c % mintageBits.length], closings[(a + c) % closings.length]];

  return parts.join(' ');
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error('Пустой CSV');

  let overrides = {};
  try {
    overrides = JSON.parse(await readFile(OVERRIDES_PATH, 'utf8'));
  } catch {
    /* нет файла — ок */
  }

  const header = rows[0];
  const ix = (n) => {
    const i = header.indexOf(n);
    if (i === -1) throw new Error(`Нет колонки ${n}`);
    return i;
  };
  const iType = ix('type');
  const iSlug = ix('slug');
  const iMint = ix('тираж');
  const iDesc = ix('описание');

  const hdr = header.reduce((acc, h, j) => {
    acc[h] = j;
    return acc;
  }, {});

  let n = 0;
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if ((row[iType] || '') !== 'jubilee') continue;

    const obj = {};
    for (const name of header) obj[name] = row[hdr[name]];

    const slug = obj.slug ?? '';
    const cur = parseNum(obj['тираж']);
    const ov = overrides[slug];
    if (ov != null && Number(ov) > 0 && cur === 0) {
      row[iMint] = String(Number(ov));
      obj['тираж'] = row[iMint];
    }

    const text = buildAbout(obj, fnv1a(`${slug}|${obj['название'] ?? ''}`));
    row[iDesc] = text;
    n += 1;
  }

  if (DRY) {
    console.log(`[dry-run] было бы перезаписано юбилейных описаний: ${n}`);
    return;
  }

  await writeFile(CSV_PATH, serializeCsv(rows), 'utf8');
  console.log(`Готово. Обновлено юбилейных описаний: ${n}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
