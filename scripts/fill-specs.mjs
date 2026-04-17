#!/usr/bin/env node
/**
 * Дозаполняет технические характеристики монет (диаметр, толщина, вес,
 * материал, гурт) в data/coins.csv по справочнику. Уже заполненные значения
 * не перетираются — таблица служит для монет, у которых поля пусты
 * (типичный случай — 341 строка регулярной чеканки, импортированной из XLSX).
 *
 * Тиражи в скрипт намеренно не внесены: для регулярной чеканки РФ точных
 * данных в открытом виде нет, а придуманные значения вводили бы в заблуждение.
 * Эти поля отображаются в UI как «—».
 *
 * Источники:
 *   — официальные паспорта монет ЦБ РФ (physical specs);
 *   — справочники Конрос, «Монеты России».
 *
 * Запуск:
 *   node scripts/fill-specs.mjs            # дозаполнить и записать
 *   node scripts/fill-specs.mjs --dry-run  # только отчёт
 */

import { readFile, writeFile } from 'node:fs/promises';

const DRY = process.argv.includes('--dry-run');
const CSV_PATH = 'data/coins.csv';

// ------------------------------------------------------------------
// Справочник. Правила применяются сверху вниз, первое совпадение — берётся.
// ------------------------------------------------------------------

/** @typedef {{material:string,diameterMm:number,thicknessMm:number,weightG:number,edge:string}} Spec */

/** @type {Array<{when:(c:any)=>boolean, spec:Spec}>} */
const RULES = [
  // ===========================  КОПЕЙКИ  ===========================
  // 1 копейка РФ/СССР — сталь с мельхиоровым покрытием, гладкий гурт.
  {
    when: (c) => c.unit === 'копейка' && c.denom === 1,
    spec: { material: 'gvs', diameterMm: 15.5, thicknessMm: 1.25, weightG: 1.5, edge: 'Гладкий' }
  },
  // 5 копеек — сталь с мельхиоровым покрытием, гладкий гурт.
  {
    when: (c) => c.unit === 'копейка' && c.denom === 5,
    spec: { material: 'gvs', diameterMm: 18.5, thicknessMm: 1.45, weightG: 2.6, edge: 'Гладкий' }
  },

  // 10 копеек: магнитная (сталь с латунным покрытием, с 2006 г.)
  {
    when: (c) => c.unit === 'копейка' && c.denom === 10 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 17.5, thicknessMm: 1.25, weightG: 1.85, edge: 'Рубчатый (98 рифлений)' }
  },
  // 10 копеек: немагнитная или без указания (латунь, до 2006 г.)
  {
    when: (c) => c.unit === 'копейка' && c.denom === 10,
    spec: { material: 'cupronickel', diameterMm: 17.5, thicknessMm: 1.25, weightG: 1.95, edge: 'Рубчатый (98 рифлений)' }
  },

  // 50 копеек: магнитная — сталь с латунным покрытием
  {
    when: (c) => c.unit === 'копейка' && c.denom === 50 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 19.5, thicknessMm: 1.5, weightG: 2.75, edge: 'Рубчатый (105 рифлений)' }
  },
  // 50 копеек: латунь (до 2006)
  {
    when: (c) => c.unit === 'копейка' && c.denom === 50,
    spec: { material: 'cupronickel', diameterMm: 19.5, thicknessMm: 1.5, weightG: 2.9, edge: 'Рубчатый (105 рифлений)' }
  },

  // ===========================  ПЕРЕХОДНЫЙ ПЕРИОД 1991–1993  ===========================

  // 1 рубль 1991 (последний массовый рубль СССР, мельхиор-никелевый сплав)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 1 && c.year === 1991,
    spec: { material: 'cupronickel', diameterMm: 27.0, thicknessMm: 1.9, weightG: 7.5, edge: 'Рубчатый (140 рифлений)' }
  },
  // 1 рубль 1992–1993 (немагнитная — латунь/мельхиор, магнитная — сталь-латунь)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 1 && c.year <= 1993 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 19.5, thicknessMm: 1.4, weightG: 2.8, edge: 'Гладкий' }
  },
  {
    when: (c) => c.unit === 'рубль' && c.denom === 1 && c.year <= 1993,
    spec: { material: 'cupronickel', diameterMm: 19.5, thicknessMm: 1.4, weightG: 2.95, edge: 'Гладкий' }
  },

  // 5 рублей 1991 (мельхиор-никелевый сплав, последний год обычного 5-рубля СССР)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 5 && c.year === 1991,
    spec: { material: 'cupronickel', diameterMm: 26.0, thicknessMm: 1.85, weightG: 6.25, edge: 'Рубчатый с надписью «ПЯТЬ РУБЛЕЙ»' }
  },
  // 5 рублей 1992–1993 (сталь с латунным покрытием, магнитная)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 5 && c.year <= 1993,
    spec: { material: 'gvs', diameterMm: 24.0, thicknessMm: 1.8, weightG: 6.0, edge: 'Рубчатый' }
  },

  // 10 рублей 1991 (биметалл ГКЧП)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.year === 1991,
    spec: { material: 'bimetal', diameterMm: 25.0, thicknessMm: 1.85, weightG: 6.25, edge: 'Прерывисто-рубчатый' }
  },
  // 10 рублей 1992 биметалл
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.year === 1992 && c.variant === 'биметалл',
    spec: { material: 'bimetal', diameterMm: 25.0, thicknessMm: 1.85, weightG: 6.25, edge: 'Прерывисто-рубчатый' }
  },
  // 10 рублей 1992 немагнитная (латунь) / магнитная (сталь-латунь)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.year === 1992 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 21.0, thicknessMm: 1.35, weightG: 3.6, edge: 'Рубчатый' }
  },
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.year === 1992,
    spec: { material: 'cupronickel', diameterMm: 21.0, thicknessMm: 1.35, weightG: 3.75, edge: 'Рубчатый' }
  },
  // 10 рублей 1993
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.year === 1993,
    spec: { material: 'gvs', diameterMm: 21.0, thicknessMm: 1.35, weightG: 3.6, edge: 'Рубчатый' }
  },

  // 20 рублей 1992
  {
    when: (c) => c.unit === 'рубль' && c.denom === 20 && c.year <= 1993,
    spec: { material: 'gvs', diameterMm: 24.0, thicknessMm: 1.7, weightG: 5.25, edge: 'Рубчатый' }
  },

  // 50 рублей 1992 биметалл
  {
    when: (c) => c.unit === 'рубль' && c.denom === 50 && c.year === 1992 && c.variant === 'биметалл',
    spec: { material: 'bimetal', diameterMm: 24.5, thicknessMm: 1.65, weightG: 6.1, edge: 'Рубчатый' }
  },
  // 50 рублей 1992/93 моно
  {
    when: (c) => c.unit === 'рубль' && c.denom === 50 && c.year <= 1993,
    spec: { material: 'gvs', diameterMm: 23.0, thicknessMm: 1.7, weightG: 5.5, edge: 'Прерывисто-рубчатый' }
  },

  // 100 рублей 1992 биметалл
  {
    when: (c) => c.unit === 'рубль' && c.denom === 100 && c.year <= 1993,
    spec: { material: 'bimetal', diameterMm: 28.0, thicknessMm: 2.3, weightG: 12.33, edge: 'Рубчатый' }
  },

  // ===========================  РУБЛИ РФ 1997+  ===========================

  // 1 рубль: до 2009 мельхиор, с 2009 сталь-никель (магнитная)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 1 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 20.5, thicknessMm: 1.5, weightG: 3.0, edge: 'Прерывисто-рифлёный' }
  },
  {
    when: (c) => c.unit === 'рубль' && c.denom === 1,
    spec: { material: 'cupronickel', diameterMm: 20.5, thicknessMm: 1.5, weightG: 3.25, edge: 'Прерывисто-рифлёный' }
  },

  // 2 рубля
  {
    when: (c) => c.unit === 'рубль' && c.denom === 2 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 23.0, thicknessMm: 1.8, weightG: 5.0, edge: 'Прерывисто-рифлёный' }
  },
  {
    when: (c) => c.unit === 'рубль' && c.denom === 2,
    spec: { material: 'cupronickel', diameterMm: 23.0, thicknessMm: 1.8, weightG: 5.1, edge: 'Прерывисто-рифлёный' }
  },

  // 5 рублей
  {
    when: (c) => c.unit === 'рубль' && c.denom === 5 && c.variant === 'магнитная',
    spec: { material: 'gvs', diameterMm: 25.0, thicknessMm: 1.8, weightG: 6.0, edge: 'Рубчатый' }
  },
  {
    when: (c) => c.unit === 'рубль' && c.denom === 5,
    spec: { material: 'cupronickel', diameterMm: 25.0, thicknessMm: 1.8, weightG: 6.45, edge: 'Рубчатый' }
  },

  // 10 рублей регулярная чеканка (2009+, сталь-латунь)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 10 && c.type === 'regular',
    spec: { material: 'gvs', diameterMm: 22.0, thicknessMm: 2.2, weightG: 5.63, edge: 'Прерывисто-рубчатый (6 × 5)' }
  },

  // 25 рублей (стальные памятные выпусков ЦБ)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 25,
    spec: { material: 'cupronickel', diameterMm: 27.0, thicknessMm: 2.3, weightG: 10.0, edge: 'Рубчатый' }
  },

  // ===========================  ЮБИЛЕЙНЫЕ СЕРИИ  ===========================
  // 10 руб ГВС (сталь с латунным покрытием) — серия «Города воинской славы»
  // и «70 лет Победы» в той же физической форме.
  {
    when: (c) =>
      c.unit === 'рубль' &&
      c.denom === 10 &&
      (c.series === 'goroda-voinskoy-slavy' ||
        c.series === 'goroda-slavy' ||
        c.series === 'goroda-trudovoy-doblesti' ||
        c.series === '70-letie-pobedy-sovetskogo-naroda-v-velikoy-otechestvennoy-voyne-1941-1945-gg'),
    spec: { material: 'gvs', diameterMm: 22.0, thicknessMm: 2.2, weightG: 5.63, edge: 'Прерывисто-рубчатый (6 × 5)' }
  },

  // 10 руб БИМЕТАЛЛ — серии «Российская Федерация», «Древние города России»,
  // «Министерства» и прочие биметаллические юбилейные 10-рублёвки.
  {
    when: (c) =>
      c.unit === 'рубль' &&
      c.denom === 10 &&
      (c.series === 'rossiyskaya-federatsiya' ||
        c.series === 'drevnie-goroda-rossii' ||
        c.series === '200-letie-pobedy-rossii-v-otechestvennoy-voyne-1812-goda' ||
        c.series === '20-letie-prinyatiya-konstitutsii-rossiyskoy-federatsii' ||
        c.series === '1150-letie-zarozhdeniya-rossiyskoy-gosudarstvennosti' ||
        c.series === 'xxvii-vsemirnaya-letnyaya-universiada-2013-goda-v-g-kazani' ||
        c.series === 'khkhikh-vsemirnaya-zimnyaya-universiada-2019-goda-v-g-krasnoyarske'),
    spec: { material: 'bimetal', diameterMm: 27.0, thicknessMm: 2.1, weightG: 8.4, edge: 'Рифлёный с надписью «ДЕСЯТЬ РУБЛЕЙ»' }
  },

  // 5 руб памятные (сталь с никелевым покрытием) — серии по истории войн.
  {
    when: (c) =>
      c.unit === 'рубль' &&
      c.denom === 5 &&
      (c.series === '70-letie-pobedy-v-velikoy-otechestvennoy-voyne-1941-1945-gg' ||
        c.series === 'goroda-stolitsy-gosudarstv-osvobozhdennye-sovetskimi-voyskami-ot-nemetsko-fashistskikh-zakhvatchikov' ||
        c.series === 'srazheniya-i-znamenatelnye-sobytiya-otechestvennoy-voyny-1812-goda-i-zagranichnykh-pokhodov-russkoy-armii-1813-1814-godov' ||
        c.series === 'podvig-sovetskikh-voinov-srazhavshikhsya-na-krymskom-poluostrove-v-gody-velikoy-otechestvennoy-voyny-1941-1945-gg'),
    spec: { material: 'gvs', diameterMm: 25.0, thicknessMm: 1.8, weightG: 6.0, edge: 'Прерывисто-рубчатый' }
  },

  // 2 руб памятные (сталь с никелевым покрытием) — серия «Полководцы 1812 года».
  {
    when: (c) =>
      c.unit === 'рубль' &&
      c.denom === 2 &&
      c.series === 'polkovodtsy-i-geroi-otechestvennoy-voyny-1812-goda',
    spec: { material: 'gvs', diameterMm: 23.0, thicknessMm: 1.8, weightG: 5.0, edge: 'Прерывисто-рифлёный' }
  },

  // 25 руб стальные (памятные: Мультипликация, Универсиада, 75 лет Ленинграду и пр.)
  {
    when: (c) => c.unit === 'рубль' && c.denom === 25 && c.type === 'jubilee',
    spec: { material: 'cupronickel', diameterMm: 27.0, thicknessMm: 2.3, weightG: 10.0, edge: 'Рубчатый' }
  }
];

// ------------------------------------------------------------------
// CSV helpers (inline, чтобы скрипт был standalone)
// ------------------------------------------------------------------

function parseCsv(raw) {
  const rows = [];
  let i = 0, f = '', row = [], q = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (q) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { f += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      f += ch; i++; continue;
    }
    if (ch === '"') { q = true; i++; continue; }
    if (ch === ',') { row.push(f); f = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      if (f.length || row.length) { row.push(f); rows.push(row); }
      row = []; f = '';
      if (ch === '\r' && raw[i + 1] === '\n') i += 2; else i++;
      continue;
    }
    f += ch; i++;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function csvEsc(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------------------------------------------------------------------

function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  if (s === '') return true;
  const n = Number(s);
  return Number.isFinite(n) && n === 0;
}

async function main() {
  const raw = await readFile(CSV_PATH, 'utf8');
  const rows = parseCsv(raw).filter((r) => r.length > 1);
  const head = rows.shift();
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));

  const stats = { total: rows.length, filled: 0, alreadyFull: 0, noRule: 0 };
  const misses = new Map();

  const outRows = rows.map((r) => {
    const coin = {
      denom: Number(r[ix['номинал']]),
      unit: r[ix['единица_номинала']] || 'рубль',
      year: Number(r[ix['год']]),
      mint: r[ix['монетный_двор']],
      type: r[ix['type']],
      era: r[ix['era']],
      variant: r[ix['разновидность']] || '',
      material: r[ix['material']],
      series: r[ix['series']] || ''
    };

    const before = {
      material: r[ix['material']],
      diameter: r[ix['диаметр_мм']],
      thickness: r[ix['толщина_мм']],
      weight: r[ix['вес_г']],
      edge: r[ix['гурт']]
    };

    const allFull =
      !isEmpty(before.material) &&
      !isEmpty(before.diameter) &&
      !isEmpty(before.thickness) &&
      !isEmpty(before.weight) &&
      !isEmpty(before.edge);

    if (allFull) {
      stats.alreadyFull += 1;
      return r;
    }

    const rule = RULES.find((ru) => ru.when(coin));
    if (!rule) {
      stats.noRule += 1;
      const key = `${coin.denom} ${coin.unit} / ${coin.year} / ${coin.variant || '—'} / ${coin.type}`;
      misses.set(key, (misses.get(key) ?? 0) + 1);
      return r;
    }

    const next = [...r];
    let touched = false;
    const set = (col, value) => {
      if (isEmpty(next[ix[col]])) { next[ix[col]] = String(value); touched = true; }
    };
    set('material', rule.spec.material);
    set('диаметр_мм', rule.spec.diameterMm);
    set('толщина_мм', rule.spec.thicknessMm);
    set('вес_г', rule.spec.weightG);
    set('гурт', rule.spec.edge);
    if (touched) stats.filled += 1;
    return next;
  });

  console.log('—— fill-specs ——');
  console.log(`Всего строк:        ${stats.total}`);
  console.log(`Уже заполнены:      ${stats.alreadyFull}`);
  console.log(`Дозаполнено:        ${stats.filled}`);
  console.log(`Без правила:        ${stats.noRule}`);
  if (misses.size) {
    console.log('\nТребуют правила в справочнике:');
    for (const [k, n] of [...misses.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${k}`);
    }
  }

  if (DRY) {
    console.log('\n(dry-run — ничего не записано)');
    return;
  }

  const out =
    [head, ...outRows].map((r) => r.map(csvEsc).join(',')).join('\n') + '\n';
  await writeFile(CSV_PATH, out, 'utf8');
  console.log(`\nЗаписано в ${CSV_PATH}`);
}

main().catch((err) => {
  console.error('ERR:', err);
  process.exit(1);
});
