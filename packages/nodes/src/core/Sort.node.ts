import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Sort node — Gelen item array'ini bir veya birden fazla alana göre sıralar.
 *
 * sortKeys JSON dizisi örneği:
 * [{ "field": "age", "direction": "asc", "type": "number" }]
 */
export const SortNode: INodeType = {
  definition: {
    displayName: 'Sort',
    name: 'sibercron.sort',
    icon: 'ArrowUpDown',
    color: '#8B5CF6',
    group: 'core',
    version: 1,
    description: 'Item\'ları bir veya birden fazla alana göre artan/azalan sıralar',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'sortMode',
        displayName: 'Sıralama Modu',
        type: 'select',
        options: [
          { name: 'Alan Bazlı', value: 'field' },
          { name: 'Rastgele (Shuffle)', value: 'random' },
        ],
        default: 'field',
        description: 'Sıralama yöntemi',
      },
      {
        name: 'sortKeys',
        displayName: 'Sıralama Kriterleri (JSON)',
        type: 'json',
        default: '[{"field":"","direction":"asc","type":"auto"}]',
        description: 'Sıralama alanları dizisi. direction: asc|desc. type: auto|string|number|date. Noktalı yol desteklenir (user.age)',
        displayOptions: { show: { sortMode: ['field'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const sortMode = (context.getParameter('sortMode') as string) ?? 'field';

    if (items.length <= 1) return items;

    if (sortMode === 'random') {
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }

    // Field-based sort
    const sortKeysRaw = context.getParameter('sortKeys');
    let sortKeys: Array<{ field: string; direction: string; type: string }> = [];
    if (typeof sortKeysRaw === 'string') {
      try { sortKeys = JSON.parse(sortKeysRaw); } catch { sortKeys = []; }
    } else if (Array.isArray(sortKeysRaw)) {
      sortKeys = sortKeysRaw as typeof sortKeys;
    }

    sortKeys = sortKeys.filter((k) => k?.field);

    if (sortKeys.length === 0) {
      return [...items].sort((a, b) =>
        JSON.stringify(a.json).localeCompare(JSON.stringify(b.json)),
      );
    }

    return [...items].sort((a, b) => {
      for (const key of sortKeys) {
        const aVal = getNestedValue(a.json, key.field);
        const bVal = getNestedValue(b.json, key.field);
        const cmp = compareValues(aVal, bVal, key.type ?? 'auto');
        if (cmp !== 0) return key.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  },
};

function compareValues(a: unknown, b: unknown, type: string): number {
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;

  if (type === 'number') return Number(a) - Number(b);

  if (type === 'date') {
    const aTime = new Date(String(a)).getTime();
    const bTime = new Date(String(b)).getTime();
    if (isNaN(aTime) && isNaN(bTime)) return 0;
    if (isNaN(aTime)) return 1;
    if (isNaN(bTime)) return -1;
    return aTime - bTime;
  }

  if (type === 'string') {
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: false });
  }

  // auto: try numeric first, then date, then string
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

  if (typeof a === 'string' && typeof b === 'string') {
    const aTime = Date.parse(a);
    const bTime = Date.parse(b);
    if (!isNaN(aTime) && !isNaN(bTime)) return aTime - bTime;
  }

  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}
