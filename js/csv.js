/**
 * CSV reading, and the one translation from a GameChanger export into our
 * counting stats.
 *
 * A GameChanger season export has three header-ish rows before the data:
 *   1. a grouping row  ,,,Batting,,,,,,Pitching,,,,,,Fielding,,,
 *   2. the real header Number,Last,First,GP,PA,AB,AVG,...
 *   3. player rows, then a "Totals" row, then a "Glossary" row
 * We find the header by looking for the row that has an "AB" cell, so extra
 * banner rows above it do not matter.
 */

import { singlesFrom } from './stats.js';

/** RFC 4180 reader: quoted fields, escaped quotes, CRLF or LF. Blank rows dropped. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Rows that look like a player but are not one. */
const NOT_A_PLAYER = /^(totals?|team|glossary|opponents?)$/i;

/**
 * Innings-played-by-position columns, which GameChanger writes as the tail of
 * the fielding block: these ten in this order, then a "Total" column.
 */
const FIELDING_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'SF'];

const num = (v) => {
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

const decimal = (v) => {
  const n = parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Indexes a header row so columns can be looked up by any of their known
 * spellings. GameChanger repeats names like "H" and "SO" across the batting,
 * pitching and fielding blocks, so we only ever take the first occurrence —
 * which is the batting one.
 */
function headerLookup(header) {
  const cells = header.map((c) => c.trim().toUpperCase());
  const first = new Map();
  cells.forEach((name, i) => {
    if (name && !first.has(name)) first.set(name, i);
  });
  return (...names) => {
    for (const n of names) {
      const i = first.get(n.toUpperCase());
      if (i !== undefined) return i;
    }
    return -1;
  };
}

/**
 * Locates the innings-by-position columns. Names like "1B" and "SF" also exist
 * in the batting block, so we anchor on the trailing "Total" column and only
 * accept the ten columns before it when they spell out the positions in order.
 * Returns `[position, columnIndex]` pairs, or nothing when the export has no
 * fielding block.
 */
function fieldingColumns(header) {
  const cells = header.map((c) => c.trim().toUpperCase());
  const end = cells.lastIndexOf('TOTAL');
  const start = end - FIELDING_POSITIONS.length;
  if (end < 0 || start < 0) return [];
  const matches = FIELDING_POSITIONS.every((p, i) => cells[start + i] === p);
  return matches ? FIELDING_POSITIONS.map((p, i) => [p, start + i]) : [];
}

/**
 * Pulls one batting line per player out of a GameChanger CSV.
 * Returns `{ lines, teamRuns }`; teamRuns comes from the Totals row when present.
 */
export function parseGameChanger(text) {
  // Some exporters start the file with a byte-order mark, which would
  // otherwise glue itself onto the first column's name.
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const headerIndex = rows.findIndex((r) => r.some((c) => c.trim().toUpperCase() === 'AB'));
  if (headerIndex < 0) {
    throw new Error("no 'AB' column found — is this a GameChanger batting export?");
  }

  const at = headerLookup(rows[headerIndex]);
  const iLast = at('Last');
  const iFirst = at('First');
  const iPlayer = at('Player', 'Player Name', 'Name');
  const iNumber = at('Number', '#', 'No');
  const fieldingAt = fieldingColumns(rows[headerIndex]);

  const lines = [];
  let teamRuns = null;

  for (const row of rows.slice(headerIndex + 1)) {
    const cell = (i) => (i >= 0 ? (row[i] ?? '').trim() : '');
    const get = (...names) => num(row[at(...names)]);

    // "Totals" and "Glossary" land in whichever column comes first, so check them all.
    const labels = [cell(iNumber), cell(iLast), cell(iFirst), cell(iPlayer)].filter(Boolean);
    if (labels.some((l) => /^totals?$/i.test(l))) {
      teamRuns = get('R');
      continue;
    }
    if (labels.some((l) => NOT_A_PLAYER.test(l))) continue;

    let name = cell(iPlayer);
    if (!name) name = `${cell(iFirst)} ${cell(iLast)}`.trim();
    if (!name) continue;
    const h = get('H');
    const doubles = get('2B');
    const triples = get('3B');
    const hr = get('HR');
    const ab = get('AB');
    const bb = get('BB');
    const sf = get('SF');
    const paColumn = at('PA');

    lines.push({
      name,
      jersey: cell(iNumber) || null,
      /** Innings at each position, when the export includes fielding. */
      innings: Object.fromEntries(
        fieldingAt
          .map(([position, i]) => [position, decimal(row[i])])
          .filter(([, innings]) => innings > 0),
      ),
      stats: {
        g: 1,
        pa: paColumn >= 0 ? num(row[paColumn]) : ab + bb + sf,
        ab, h, doubles, triples, hr, bb, sf,
        singles: singlesFrom(h, doubles, triples, hr),
        rbi: get('RBI'),
        r: get('R'),
        so: get('SO', 'K'),
      },
    });
  }

  if (!lines.length) throw new Error('no player rows found');
  return { lines, teamRuns };
}
