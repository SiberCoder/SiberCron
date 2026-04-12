import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * DateTime node — comprehensive date/time manipulation without external dependencies.
 * Uses built-in Intl API for formatting and native Date for arithmetic.
 *
 * Operations:
 *  - now:        Get current date/time in various formats
 *  - parse:      Parse a date string from a field
 *  - format:     Format a date from a field
 *  - add:        Add time to a date (minutes/hours/days/weeks/months)
 *  - subtract:   Subtract time from a date
 *  - diff:       Calculate difference between two dates
 *  - extract:    Extract parts (year/month/day/hour/minute/weekday/week/quarter)
 *  - startOf:    Start of period (day/week/month/year)
 *  - endOf:      End of period (day/week/month/year)
 *  - isBefore/isAfter/isBetween: comparisons
 */
export const DateTimeNode: INodeType = {
  definition: {
    displayName: 'DateTime',
    name: 'sibercron.dateTime',
    icon: 'CalendarClock',
    color: '#0EA5E9',
    group: 'core',
    version: 1,
    description: 'Parse, format, and manipulate date/time values',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'now',
        required: true,
        options: [
          { name: 'Now — Get current date/time', value: 'now' },
          { name: 'Format — Format a date field', value: 'format' },
          { name: 'Parse — Parse date string to ISO', value: 'parse' },
          { name: 'Add — Add time to a date', value: 'add' },
          { name: 'Subtract — Subtract time from a date', value: 'subtract' },
          { name: 'Difference — Time between two dates', value: 'diff' },
          { name: 'Extract — Get date parts (year, month, day…)', value: 'extract' },
          { name: 'Start Of — Beginning of period', value: 'startOf' },
          { name: 'End Of — End of period', value: 'endOf' },
          { name: 'Compare — Is before/after/between', value: 'compare' },
        ],
      },
      // Common
      {
        name: 'dateField',
        displayName: 'Date Field',
        type: 'string',
        default: '',
        description: 'Field containing the date (dot notation). Leave empty to use current time.',
        placeholder: 'createdAt',
        displayOptions: { show: { operation: ['format', 'parse', 'add', 'subtract', 'extract', 'startOf', 'endOf', 'compare'] } },
      },
      {
        name: 'outputField',
        displayName: 'Output Field Name',
        type: 'string',
        default: 'result',
        description: 'Name of the field to write the result to',
        placeholder: 'formattedDate',
      },
      {
        name: 'timezone',
        displayName: 'Timezone',
        type: 'string',
        default: 'Europe/Istanbul',
        description: 'IANA timezone for formatting (e.g. Europe/Istanbul, UTC, America/New_York)',
        placeholder: 'Europe/Istanbul',
        displayOptions: { show: { operation: ['now', 'format', 'extract', 'startOf', 'endOf'] } },
      },
      // Format options
      {
        name: 'formatPattern',
        displayName: 'Format Pattern',
        type: 'select',
        default: 'iso',
        description: 'Output format for the date',
        options: [
          { name: 'ISO 8601 (2024-01-15T09:00:00.000Z)', value: 'iso' },
          { name: 'Date only (2024-01-15)', value: 'date' },
          { name: 'Time only (09:00:00)', value: 'time' },
          { name: 'Date + Time (2024-01-15 09:00)', value: 'datetime' },
          { name: 'Unix timestamp (seconds)', value: 'unix' },
          { name: 'Unix timestamp (milliseconds)', value: 'unix_ms' },
          { name: 'Human readable (15 Ocak 2024)', value: 'human' },
          { name: 'Relative (2 hours ago)', value: 'relative' },
          { name: 'Custom (see locale format)', value: 'custom' },
        ],
        displayOptions: { show: { operation: ['now', 'format', 'add', 'subtract', 'startOf', 'endOf'] } },
      },
      {
        name: 'customFormat',
        displayName: 'Custom Format',
        type: 'string',
        default: '',
        description: 'Intl.DateTimeFormat options as JSON (e.g. {"year":"numeric","month":"long","day":"2-digit"})',
        placeholder: '{"weekday":"long","hour":"2-digit","minute":"2-digit"}',
        displayOptions: { show: { operation: ['now', 'format', 'add', 'subtract'], formatPattern: ['custom'] } },
      },
      // Add/Subtract amount
      {
        name: 'amount',
        displayName: 'Amount',
        type: 'number',
        default: 1,
        description: 'Amount of time to add or subtract',
        displayOptions: { show: { operation: ['add', 'subtract'] } },
      },
      {
        name: 'unit',
        displayName: 'Unit',
        type: 'select',
        default: 'hours',
        description: 'Time unit',
        options: [
          { name: 'Minutes', value: 'minutes' },
          { name: 'Hours', value: 'hours' },
          { name: 'Days', value: 'days' },
          { name: 'Weeks', value: 'weeks' },
          { name: 'Months', value: 'months' },
          { name: 'Years', value: 'years' },
        ],
        displayOptions: { show: { operation: ['add', 'subtract', 'diff'] } },
      },
      // Diff: second date
      {
        name: 'date2Field',
        displayName: 'Second Date Field',
        type: 'string',
        default: '',
        description: 'Second date for difference calculation. Leave empty to use current time.',
        placeholder: 'updatedAt',
        displayOptions: { show: { operation: ['diff'] } },
      },
      // Extract: which part
      {
        name: 'extractPart',
        displayName: 'Extract Part',
        type: 'select',
        default: 'year',
        description: 'Which part of the date to extract',
        options: [
          { name: 'Year', value: 'year' },
          { name: 'Month (1-12)', value: 'month' },
          { name: 'Day (1-31)', value: 'day' },
          { name: 'Hour (0-23)', value: 'hour' },
          { name: 'Minute (0-59)', value: 'minute' },
          { name: 'Second (0-59)', value: 'second' },
          { name: 'Weekday (0=Sun, 6=Sat)', value: 'weekday' },
          { name: 'Week of year (1-52)', value: 'week' },
          { name: 'Quarter (1-4)', value: 'quarter' },
          { name: 'Day of year (1-365)', value: 'dayOfYear' },
          { name: 'Is Leap Year', value: 'isLeapYear' },
          { name: 'Days in month', value: 'daysInMonth' },
        ],
        displayOptions: { show: { operation: ['extract'] } },
      },
      // StartOf/EndOf period
      {
        name: 'period',
        displayName: 'Period',
        type: 'select',
        default: 'day',
        options: [
          { name: 'Day', value: 'day' },
          { name: 'Week (Mon)', value: 'week' },
          { name: 'Month', value: 'month' },
          { name: 'Year', value: 'year' },
          { name: 'Hour', value: 'hour' },
          { name: 'Minute', value: 'minute' },
        ],
        displayOptions: { show: { operation: ['startOf', 'endOf'] } },
      },
      // Compare
      {
        name: 'compareMode',
        displayName: 'Compare Mode',
        type: 'select',
        default: 'isBefore',
        options: [
          { name: 'Is Before', value: 'isBefore' },
          { name: 'Is After', value: 'isAfter' },
          { name: 'Is Same Day', value: 'isSameDay' },
          { name: 'Is Between', value: 'isBetween' },
        ],
        displayOptions: { show: { operation: ['compare'] } },
      },
      {
        name: 'compareDate',
        displayName: 'Compare Date / Start Date',
        type: 'string',
        default: '',
        description: 'Date to compare against (ISO string, field name, or "now")',
        placeholder: '2024-12-31 or now',
        displayOptions: { show: { operation: ['compare'] } },
      },
      {
        name: 'compareEndDate',
        displayName: 'End Date (for isBetween)',
        type: 'string',
        default: '',
        placeholder: '2025-12-31',
        displayOptions: { show: { operation: ['compare'], compareMode: ['isBetween'] } },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'now';
    const dateField = context.getParameter<string>('dateField') ?? '';
    const outputField = context.getParameter<string>('outputField') ?? 'result';
    const timezone = context.getParameter<string>('timezone') ?? 'Europe/Istanbul';
    const formatPattern = context.getParameter<string>('formatPattern') ?? 'iso';
    const customFormat = context.getParameter<string>('customFormat') ?? '';
    const amount = context.getParameter<number>('amount') ?? 1;
    const unit = context.getParameter<string>('unit') ?? 'hours';
    const date2Field = context.getParameter<string>('date2Field') ?? '';
    const extractPart = context.getParameter<string>('extractPart') ?? 'year';
    const period = context.getParameter<string>('period') ?? 'day';
    const compareMode = context.getParameter<string>('compareMode') ?? 'isBefore';
    const compareDate = context.getParameter<string>('compareDate') ?? '';
    const compareEndDate = context.getParameter<string>('compareEndDate') ?? '';

    // ── Helpers ──────────────────────────────────────────────────

    function getFieldValue(item: INodeExecutionData, field: string): unknown {
      if (!field) return undefined;
      return field.split('.').reduce((curr: unknown, k) => {
        if (curr == null || typeof curr !== 'object') return undefined;
        return (curr as Record<string, unknown>)[k];
      }, item.json);
    }

    function parseDate(value: unknown, fallback = new Date()): Date {
      if (!value) return fallback;
      if (typeof value === 'number') return new Date(value);
      const d = new Date(String(value));
      return isNaN(d.getTime()) ? fallback : d;
    }

    function formatDate(d: Date, pattern: string, tz: string, custom: string): unknown {
      switch (pattern) {
        case 'iso': return d.toISOString();
        case 'date': return d.toISOString().slice(0, 10);
        case 'time': return d.toISOString().slice(11, 19);
        case 'datetime': return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
        case 'unix': return Math.floor(d.getTime() / 1000);
        case 'unix_ms': return d.getTime();
        case 'human': {
          try {
            return new Intl.DateTimeFormat('tr-TR', {
              year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
            }).format(d);
          } catch { return d.toISOString(); }
        }
        case 'relative': {
          const diff = Date.now() - d.getTime();
          const sec = Math.abs(diff) / 1000;
          const future = diff < 0;
          const suffix = future ? 'from now' : 'ago';
          if (sec < 60) return `${Math.round(sec)} seconds ${suffix}`;
          if (sec < 3600) return `${Math.round(sec / 60)} minutes ${suffix}`;
          if (sec < 86400) return `${Math.round(sec / 3600)} hours ${suffix}`;
          return `${Math.round(sec / 86400)} days ${suffix}`;
        }
        case 'custom': {
          if (!custom) return d.toISOString();
          try {
            const opts = JSON.parse(custom) as Intl.DateTimeFormatOptions;
            return new Intl.DateTimeFormat('tr-TR', { ...opts, timeZone: tz }).format(d);
          } catch { return d.toISOString(); }
        }
        default: return d.toISOString();
      }
    }

    function addTime(d: Date, n: number, u: string): Date {
      const copy = new Date(d.getTime());
      switch (u) {
        case 'minutes': copy.setMinutes(copy.getMinutes() + n); break;
        case 'hours': copy.setHours(copy.getHours() + n); break;
        case 'days': copy.setDate(copy.getDate() + n); break;
        case 'weeks': copy.setDate(copy.getDate() + n * 7); break;
        case 'months': copy.setMonth(copy.getMonth() + n); break;
        case 'years': copy.setFullYear(copy.getFullYear() + n); break;
      }
      return copy;
    }

    function startOf(d: Date, p: string): Date {
      const c = new Date(d.getTime());
      switch (p) {
        case 'minute': c.setSeconds(0, 0); break;
        case 'hour': c.setMinutes(0, 0, 0); break;
        case 'day': c.setHours(0, 0, 0, 0); break;
        case 'week': { const dow = c.getDay(); c.setDate(c.getDate() - ((dow + 6) % 7)); c.setHours(0, 0, 0, 0); break; }
        case 'month': c.setDate(1); c.setHours(0, 0, 0, 0); break;
        case 'year': c.setMonth(0, 1); c.setHours(0, 0, 0, 0); break;
      }
      return c;
    }

    function endOf(d: Date, p: string): Date {
      const c = startOf(d, p);
      switch (p) {
        case 'minute': c.setSeconds(59, 999); break;
        case 'hour': c.setMinutes(59, 59, 999); break;
        case 'day': c.setHours(23, 59, 59, 999); break;
        case 'week': c.setDate(c.getDate() + 6); c.setHours(23, 59, 59, 999); break;
        case 'month': c.setMonth(c.getMonth() + 1, 0); c.setHours(23, 59, 59, 999); break;
        case 'year': c.setMonth(11, 31); c.setHours(23, 59, 59, 999); break;
      }
      return c;
    }

    // ── Process items ──────────────────────────────────────────────

    return items.map((item) => {
      const now = new Date();
      const fieldDate = dateField ? parseDate(getFieldValue(item, dateField), now) : now;
      let result: unknown;

      switch (operation) {
        case 'now': {
          result = formatDate(now, formatPattern, timezone, customFormat);
          break;
        }
        case 'format': {
          result = formatDate(fieldDate, formatPattern, timezone, customFormat);
          break;
        }
        case 'parse': {
          const raw = getFieldValue(item, dateField);
          const parsed = parseDate(raw, now);
          result = isNaN(parsed.getTime()) ? null : parsed.toISOString();
          break;
        }
        case 'add': {
          const added = addTime(fieldDate, amount, unit);
          result = formatDate(added, formatPattern, timezone, customFormat);
          break;
        }
        case 'subtract': {
          const subtracted = addTime(fieldDate, -amount, unit);
          result = formatDate(subtracted, formatPattern, timezone, customFormat);
          break;
        }
        case 'diff': {
          const d2 = date2Field ? parseDate(getFieldValue(item, date2Field), now) : now;
          const diffMs = Math.abs(d2.getTime() - fieldDate.getTime());
          const unitDivisors: Record<string, number> = {
            minutes: 60000,
            hours: 3600000,
            days: 86400000,
            weeks: 604800000,
            months: 2592000000, // approx 30d
            years: 31536000000,
          };
          result = diffMs / (unitDivisors[unit] ?? 1);
          break;
        }
        case 'extract': {
          switch (extractPart) {
            case 'year': result = fieldDate.getFullYear(); break;
            case 'month': result = fieldDate.getMonth() + 1; break;
            case 'day': result = fieldDate.getDate(); break;
            case 'hour': result = fieldDate.getHours(); break;
            case 'minute': result = fieldDate.getMinutes(); break;
            case 'second': result = fieldDate.getSeconds(); break;
            case 'weekday': result = fieldDate.getDay(); break;
            case 'week': {
              const startOfYear = new Date(fieldDate.getFullYear(), 0, 1);
              result = Math.ceil(((fieldDate.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
              break;
            }
            case 'quarter': result = Math.floor(fieldDate.getMonth() / 3) + 1; break;
            case 'dayOfYear': {
              const start = new Date(fieldDate.getFullYear(), 0, 0);
              result = Math.floor((fieldDate.getTime() - start.getTime()) / 86400000);
              break;
            }
            case 'isLeapYear': {
              const y = fieldDate.getFullYear();
              result = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
              break;
            }
            case 'daysInMonth': {
              result = new Date(fieldDate.getFullYear(), fieldDate.getMonth() + 1, 0).getDate();
              break;
            }
            default: result = null;
          }
          break;
        }
        case 'startOf': {
          result = formatDate(startOf(fieldDate, period), formatPattern, timezone, customFormat);
          break;
        }
        case 'endOf': {
          result = formatDate(endOf(fieldDate, period), formatPattern, timezone, customFormat);
          break;
        }
        case 'compare': {
          const refDate = compareDate === 'now' || !compareDate ? now : parseDate(compareDate, now);
          switch (compareMode) {
            case 'isBefore': result = fieldDate.getTime() < refDate.getTime(); break;
            case 'isAfter': result = fieldDate.getTime() > refDate.getTime(); break;
            case 'isSameDay': {
              result = (
                fieldDate.getFullYear() === refDate.getFullYear() &&
                fieldDate.getMonth() === refDate.getMonth() &&
                fieldDate.getDate() === refDate.getDate()
              );
              break;
            }
            case 'isBetween': {
              const endRef = compareEndDate ? parseDate(compareEndDate, now) : now;
              result = fieldDate.getTime() >= refDate.getTime() && fieldDate.getTime() <= endRef.getTime();
              break;
            }
            default: result = null;
          }
          break;
        }
        default:
          result = null;
      }

      return {
        json: {
          ...item.json,
          [outputField]: result,
          _dateTimeOp: operation,
        },
      };
    });
  },
};
