import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * Aggregate node — Gelen item array'inde matematiksel ve gruplama operasyonları uygular.
 * Operasyonlar: count, sum, avg, min, max, concat, groupBy, unique
 */
export const AggregateNode: INodeType = {
  definition: {
    displayName: 'Aggregate',
    name: 'sibercron.aggregate',
    icon: 'BarChart2',
    color: '#10B981',
    group: 'core',
    version: 1,
    description: 'Item\'lar üzerinde toplam, ortalama, gruplama gibi matematik işlemleri yapar',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operasyon',
        type: 'select',
        default: 'count',
        required: true,
        options: [
          { name: 'Sayım (count)', value: 'count' },
          { name: 'Toplam (sum)', value: 'sum' },
          { name: 'Ortalama (avg)', value: 'avg' },
          { name: 'Minimum (min)', value: 'min' },
          { name: 'Maksimum (max)', value: 'max' },
          { name: 'Birleştir (concat)', value: 'concat' },
          { name: 'Gruplama (groupBy)', value: 'groupBy' },
          { name: 'Tekil Değerler (unique)', value: 'unique' },
        ],
        description: 'Uygulanacak agregasyon operasyonu',
      },
      {
        name: 'field',
        displayName: 'Alan',
        type: 'string',
        default: '',
        description: 'Operasyonun uygulanacağı alan adı (noktalı yol desteklenir). count için opsiyonel.',
        displayOptions: { show: { operation: ['sum', 'avg', 'min', 'max', 'concat', 'groupBy', 'unique'] } },
      },
      {
        name: 'separator',
        displayName: 'Ayraç',
        type: 'string',
        default: ', ',
        description: 'concat operasyonunda değerler arasına konulacak karakter',
        displayOptions: { show: { operation: ['concat'] } },
      },
      {
        name: 'outputField',
        displayName: 'Sonuç Alanı',
        type: 'string',
        default: 'result',
        description: 'Sonucun yazılacağı alan adı (groupBy hariç)',
      },
      {
        name: 'includeCount',
        displayName: 'Toplam Sayıyı Da Ekle',
        type: 'boolean',
        default: false,
        description: 'groupBy sonucuna her grubun item sayısını ekler',
        displayOptions: { show: { operation: ['groupBy'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = (context.getParameter('operation') as string) ?? 'count';
    const field = (context.getParameter('field') as string) ?? '';
    const separator = (context.getParameter('separator') as string) ?? ', ';
    const outputField = (context.getParameter('outputField') as string) || 'result';
    const includeCount = context.getParameter('includeCount') as boolean ?? false;

    if (items.length === 0) {
      return [{ json: { [outputField]: operation === 'count' ? 0 : null, itemCount: 0 } }];
    }

    switch (operation) {
      case 'count': {
        const countValue = field
          ? items.filter((item) => getNestedValue(item.json, field) !== undefined && getNestedValue(item.json, field) !== null).length
          : items.length;
        return [{ json: { [outputField]: countValue, itemCount: items.length } }];
      }

      case 'sum': {
        const nums = items.map((item) => Number(getNestedValue(item.json, field) ?? 0)).filter((n) => !isNaN(n));
        const total = nums.reduce((acc, n) => acc + n, 0);
        return [{ json: { [outputField]: total, itemCount: items.length } }];
      }

      case 'avg': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const avg = nums.length > 0 ? nums.reduce((acc, n) => acc + n, 0) / nums.length : null;
        return [{ json: { [outputField]: avg !== null ? parseFloat(avg.toFixed(6)) : null, itemCount: items.length, validCount: nums.length } }];
      }

      case 'min': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const minVal = nums.length > 0 ? Math.min(...nums) : null;
        return [{ json: { [outputField]: minVal, itemCount: items.length } }];
      }

      case 'max': {
        const nums = items
          .map((item) => Number(getNestedValue(item.json, field)))
          .filter((n) => !isNaN(n));
        const maxVal = nums.length > 0 ? Math.max(...nums) : null;
        return [{ json: { [outputField]: maxVal, itemCount: items.length } }];
      }

      case 'concat': {
        const values = items
          .map((item) => {
            const v = getNestedValue(item.json, field);
            return v !== undefined && v !== null ? String(v) : null;
          })
          .filter((v): v is string => v !== null);
        return [{ json: { [outputField]: values.join(separator), itemCount: items.length } }];
      }

      case 'groupBy': {
        const groups: Record<string, INodeExecutionData[]> = {};
        for (const item of items) {
          const key = String(getNestedValue(item.json, field) ?? '__undefined__');
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
        }

        return Object.entries(groups).map(([key, groupItems]) => ({
          json: {
            [field || 'group']: key,
            items: groupItems.map((i) => i.json),
            ...(includeCount ? { count: groupItems.length } : {}),
          },
        }));
      }

      case 'unique': {
        if (!field) {
          // Deduplicate by stringified JSON
          const seen = new Set<string>();
          const unique = items.filter((item) => {
            const key = JSON.stringify(item.json);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return unique;
        } else {
          // Deduplicate by field value
          const seen = new Set<string>();
          const unique = items.filter((item) => {
            const val = String(getNestedValue(item.json, field) ?? '');
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
          });
          return unique;
        }
      }

      default:
        throw new Error(`Bilinmeyen operasyon: ${operation}`);
    }
  },
};

/** Dot-notation path resolver: "user.address.city" → value */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
