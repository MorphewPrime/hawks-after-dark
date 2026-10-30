/**
 * The only DOM helpers the views need.
 *
 * `el` builds elements, `mount` swaps a view in, and `sortableTable` covers the
 * one interactive pattern this site repeats: a stat table you can sort by
 * clicking a column.
 */

import { COLUMNS, column, fmtStat } from './stats.js';

/**
 * el('div.card', { onclick }, child, child)
 *
 * The tag string takes CSS-style shorthand: 'span.badge.win', 'td#total'.
 * Attributes starting with "on" become listeners, `dataset` and `style` take
 * objects, everything else is set as an attribute. Null children are skipped so
 * views can write `cond && el(...)`.
 */
export function el(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const [tagName, id] = name.split('#');
  const node = document.createElement(tagName || 'div');

  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (attrs && (typeof attrs !== 'object' || Array.isArray(attrs) || attrs instanceof Node)) {
    children.unshift(attrs);
    attrs = null;
  }

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = [node.className, value].filter(Boolean).join(' ');
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false || child === '') continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function mount(container, ...children) {
  container.replaceChildren();
  append(container, children);
  return container;
}

/** A link into the hash router: `link('#/players/gus-ketchell', 'Gus')`. */
export function link(href, ...children) {
  return el('a', { href }, ...children);
}

export function heading(title, subtitle) {
  return el('header.page-head', el('h1', title), subtitle && el('p.subtitle', subtitle));
}

export function empty(title, message, action) {
  return el('div.empty', el('p.empty-title', title), el('p', message), action);
}

/** A segmented control. Options are `{ id, label }`; returns the element. */
export function segmented(label, options, value, onChange) {
  return el(
    'div.segmented',
    { role: 'group', 'aria-label': label },
    options.map((opt) =>
      el(
        'button',
        {
          type: 'button',
          class: opt.id === value ? 'is-active' : null,
          'aria-pressed': opt.id === value,
          onclick: () => onChange(opt.id),
        },
        opt.label,
      ),
    ),
  );
}

/**
 * Renders a stat table that sorts on header clicks.
 *
 * `rows` are `{ key, cells, values }` where `cells` holds the leading
 * non-stat columns (already built nodes or text) and `values` the stat numbers
 * keyed by column id. `sort` is `{ key, dir }` and `onSort` receives the next
 * one, so the caller keeps hold of the state.
 */
export function sortableTable({ leading, columns, rows, sort, onSort, footer }) {
  const headerCell = (col) =>
    el(
      'th',
      {
        class: 'num' + (sort.key === col.key ? ' is-sorted' : ''),
        title: col.title,
        'aria-sort': sort.key === col.key ? (sort.dir === -1 ? 'descending' : 'ascending') : null,
        onclick: () => onSort(nextSort(sort, col.key, -1)),
      },
      col.label,
      sort.key === col.key ? el('span.caret', sort.dir === -1 ? '▾' : '▴') : null,
    );

  return el(
    'div.table-wrap',
    el(
      'table.stats',
      el(
        'thead',
        el(
          'tr',
          leading.map((head, i) =>
            el(
              'th',
              {
                class: (i === 0 ? 'sticky' : '') + (sort.key === head.key ? ' is-sorted' : ''),
                onclick: head.key ? () => onSort(nextSort(sort, head.key, 1)) : null,
                style: head.key ? { cursor: 'pointer' } : null,
              },
              head.label,
              sort.key === head.key ? el('span.caret', sort.dir === -1 ? '▾' : '▴') : null,
            ),
          ),
          columns.map((key) => headerCell(column(key) ?? { key, label: key })),
        ),
      ),
      el(
        'tbody',
        rows.map((row) =>
          el(
            'tr',
            row.cells.map((cell, i) => el('td', { class: i === 0 ? 'sticky' : null }, cell)),
            columns.map((key) =>
              el('td', { class: 'num' + (sort.key === key ? ' is-sorted' : '') }, fmtStat(key, row.values[key])),
            ),
          ),
        ),
      ),
      footer &&
        el(
          'tfoot',
          el(
            'tr',
            footer.cells.map((cell, i) => el('td', { class: i === 0 ? 'sticky' : null }, cell)),
            columns.map((key) => el('td.num', fmtStat(key, footer.values[key]))),
          ),
        ),
    ),
  );
}

/** Clicking the sorted column flips it; a new column starts at its default. */
function nextSort(sort, key, defaultDir) {
  if (sort.key === key) return { key, dir: sort.dir === 1 ? -1 : 1 };
  return { key, dir: defaultDir };
}

/** Sorts rows by a stat column, or by the row's text for the leading columns. */
export function sortRows(rows, sort) {
  const statKey = COLUMNS.some((c) => c.key === sort.key);
  return [...rows].sort((a, b) => {
    if (statKey) return ((a.values[sort.key] ?? 0) - (b.values[sort.key] ?? 0)) * sort.dir;
    const av = a.sortText ?? '';
    const bv = b.sortText ?? '';
    return av.localeCompare(bv) * sort.dir;
  });
}
