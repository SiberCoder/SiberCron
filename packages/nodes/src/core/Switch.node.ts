import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';
import { getNestedValue } from '../utils/pathResolver.js';

/**
 * Switch node — routes items to one of up to 5 named outputs based on field value matching.
 * Unlike Conditional (binary true/false), Switch supports N-way routing.
 *
 * Outputs: case1, case2, case3, case4, case5, default
 * Each input item is sent to the FIRST matching case (or 'default' if none match).
 */
export const SwitchNode: INodeType = {
  definition: {
    displayName: 'Switch',
    name: 'sibercron.switch',
    icon: 'Shuffle',
    color: '#8B5CF6',
    group: 'core',
    version: 1,
    description: 'Route items to multiple outputs based on field value',
    inputs: ['main'],
    outputs: ['case1', 'case2', 'case3', 'case4', 'case5', 'default'],
    properties: [
      {
        name: 'field',
        displayName: 'Field to Match',
        type: 'string',
        default: '',
        required: true,
        description: 'Field path to evaluate (dot notation: e.g. "status" or "data.type")',
        placeholder: 'status',
      },
      {
        name: 'matchMode',
        displayName: 'Match Mode',
        type: 'select',
        default: 'equals',
        description: 'How to compare the field value to each case value',
        options: [
          { name: 'Equals (strict)', value: 'equals' },
          { name: 'Equals (case-insensitive)', value: 'equalsCI' },
          { name: 'Contains', value: 'contains' },
          { name: 'Starts With', value: 'startsWith' },
          { name: 'Ends With', value: 'endsWith' },
          { name: 'Matches Regex', value: 'regex' },
          { name: 'Greater Than', value: 'gt' },
          { name: 'Less Than', value: 'lt' },
        ],
      },
      {
        name: 'case1Value',
        displayName: 'Case 1 Value',
        type: 'string',
        default: '',
        description: 'Value for case 1 → routed to "case1" output',
        placeholder: 'value_1',
      },
      {
        name: 'case2Value',
        displayName: 'Case 2 Value',
        type: 'string',
        default: '',
        description: 'Value for case 2 → routed to "case2" output (leave empty to disable)',
        placeholder: 'value_2',
      },
      {
        name: 'case3Value',
        displayName: 'Case 3 Value',
        type: 'string',
        default: '',
        description: 'Value for case 3 → routed to "case3" output (leave empty to disable)',
        placeholder: 'value_3',
      },
      {
        name: 'case4Value',
        displayName: 'Case 4 Value',
        type: 'string',
        default: '',
        description: 'Value for case 4 → routed to "case4" output (leave empty to disable)',
        placeholder: 'value_4',
      },
      {
        name: 'case5Value',
        displayName: 'Case 5 Value',
        type: 'string',
        default: '',
        description: 'Value for case 5 → routed to "case5" output (leave empty to disable)',
        placeholder: 'value_5',
      },
      {
        name: 'sendToDefault',
        displayName: 'Send unmatched to default',
        type: 'boolean',
        default: true,
        description: 'If enabled, items that don\'t match any case are sent to "default" output',
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const field = context.getParameter<string>('field') ?? '';
    const matchMode = context.getParameter<string>('matchMode') ?? 'equals';
    const caseValues = [
      context.getParameter<string>('case1Value') ?? '',
      context.getParameter<string>('case2Value') ?? '',
      context.getParameter<string>('case3Value') ?? '',
      context.getParameter<string>('case4Value') ?? '',
      context.getParameter<string>('case5Value') ?? '',
    ];
    const sendToDefault = context.getParameter<boolean>('sendToDefault') ?? true;

    function matches(fieldValue: unknown, caseValue: string): boolean {
      if (caseValue === '') return false;
      const fv = String(fieldValue ?? '');
      switch (matchMode) {
        case 'equals': return fv === caseValue;
        case 'equalsCI': return fv.toLowerCase() === caseValue.toLowerCase();
        case 'contains': return fv.includes(caseValue);
        case 'startsWith': return fv.startsWith(caseValue);
        case 'endsWith': return fv.endsWith(caseValue);
        case 'regex': {
          try { return new RegExp(caseValue).test(fv); } catch { return false; }
        }
        case 'gt': return Number(fv) > Number(caseValue);
        case 'lt': return Number(fv) < Number(caseValue);
        default: return false;
      }
    }

    const outputNames = ['case1', 'case2', 'case3', 'case4', 'case5', 'default'];
    const results: INodeExecutionData[] = [];

    for (const item of items) {
      const fieldValue = getNestedValue(item.json, field);
      let matchedCase: string | null = null;

      for (let i = 0; i < 5; i++) {
        if (caseValues[i] !== '' && matches(fieldValue, caseValues[i])) {
          matchedCase = outputNames[i];
          break;
        }
      }

      if (matchedCase === null && sendToDefault) {
        matchedCase = 'default';
      }

      if (matchedCase) {
        results.push({
          // engine reads branch from json.branch (same convention as Conditional node)
          json: { ...item.json, branch: matchedCase, _switchBranch: matchedCase },
        });
      }
    }

    context.helpers.log(
      `Switch: processed ${items.length} items → ` +
      outputNames.map((n) => `${n}:${results.filter((r) => r.json._switchBranch === n).length}`).join(', '),
    );

    return results;
  },
};
