import type { INodeType, IExecutionContext, INodeExecutionData } from '@sibercron/shared';

/**
 * XML node — parse XML strings to JSON objects and convert JSON back to XML.
 * Uses a lightweight built-in parser (no external deps).
 *
 * Operations:
 *  - parseToJson: Convert an XML string field to a JSON object
 *  - toXml:       Convert a JSON field to an XML string
 */

// ── Minimal XML → JSON parser ─────────────────────────────────────────────
function parseXml(xml: string): Record<string, unknown> {
  // Strip XML declaration and comments
  const cleaned = xml
    .replace(/<\?xml[^?]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  function parseNode(str: string): unknown {
    str = str.trim();
    if (!str.startsWith('<')) return str;

    const tagMatch = str.match(/^<([^>\/\s]+)([^>]*)>([\s\S]*)<\/\1\s*>$/s);
    if (!tagMatch) {
      // Self-closing tag
      const selfMatch = str.match(/^<([^>\/\s]+)([^>]*)\s*\/>$/);
      if (selfMatch) {
        const attrs = parseAttrs(selfMatch[2]);
        return Object.keys(attrs).length > 0 ? { '@': attrs } : '';
      }
      return str;
    }

    const [, tagName, attrStr, inner] = tagMatch;
    void tagName;
    const attrs = parseAttrs(attrStr);
    const children = parseChildren(inner.trim());

    const result: Record<string, unknown> = {};
    if (Object.keys(attrs).length > 0) result['@'] = attrs;

    if (typeof children === 'string') {
      if (Object.keys(attrs).length === 0) return children;
      result['#text'] = children;
    } else {
      Object.assign(result, children);
    }
    return result;
  }

  function parseAttrs(attrStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /(\w[\w-]*)=["']([^"']*)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrStr)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  function parseChildren(inner: string): Record<string, unknown> | string {
    // If no child tags, return as text
    if (!/</.test(inner)) return inner;

    const result: Record<string, unknown> = {};
    const re = /<([^>\/\s]+)[^>]*>[\s\S]*?<\/\1\s*>|<([^>\/\s]+)[^>]*\/>/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(inner)) !== null) {
      const fullTag = m[0];
      const name = m[1] ?? m[2];
      const parsed = parseNode(fullTag);
      if (name in result) {
        const existing = result[name];
        if (Array.isArray(existing)) {
          existing.push(parsed);
        } else {
          result[name] = [existing, parsed];
        }
      } else {
        result[name] = parsed;
      }
    }

    return result;
  }

  // Wrap in root detection
  const rootMatch = cleaned.match(/^<([^>\/\s]+)[^>]*>[\s\S]*<\/\1\s*>$/s);
  if (!rootMatch) throw new Error('Invalid XML: no root element found');

  const rootName = rootMatch[1];
  const parsed = parseNode(cleaned);
  return { [rootName]: parsed };
}

// ── Minimal JSON → XML serializer ─────────────────────────────────────────
function toXml(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (obj === null || obj === undefined) return '';

  if (Array.isArray(obj)) {
    return obj.map((item) => toXml(item, indent)).join('\n');
  }

  const record = obj as Record<string, unknown>;
  let xml = '';
  for (const [key, value] of Object.entries(record)) {
    if (key === '@') continue; // skip attributes object at root serialization
    const attrs = (record['@'] as Record<string, string> | undefined) ?? {};
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join('');

    if (Array.isArray(value)) {
      xml += value
        .map((item) => `${pad}<${key}${attrStr}>${toXml(item, indent + 1)}</${key}>`)
        .join('\n');
    } else if (typeof value === 'object' && value !== null) {
      xml += `${pad}<${key}${attrStr}>\n${toXml(value, indent + 1)}\n${pad}</${key}>`;
    } else {
      const escaped = String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      xml += `${pad}<${key}${attrStr}>${escaped}</${key}>`;
    }
    xml += '\n';
  }
  return xml.trimEnd();
}

export const XMLNode: INodeType = {
  definition: {
    displayName: 'XML',
    name: 'sibercron.xml',
    icon: 'FileCode',
    color: '#F59E0B',
    group: 'core',
    version: 1,
    description: 'Parse XML to JSON or convert JSON to XML',
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        name: 'operation',
        displayName: 'Operation',
        type: 'select',
        default: 'parseToJson',
        required: true,
        options: [
          { name: 'Parse XML → JSON', value: 'parseToJson' },
          { name: 'Convert JSON → XML', value: 'toXml' },
        ],
      },
      {
        name: 'field',
        displayName: 'Input Field',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Field containing the XML string (for parseToJson) or the object to serialize (for toXml)',
        placeholder: 'data',
      },
      {
        name: 'outputField',
        displayName: 'Output Field',
        type: 'string',
        default: 'result',
        description: 'Field name to write the output into',
        placeholder: 'result',
      },
      {
        name: 'xmlDeclaration',
        displayName: 'Include XML Declaration',
        type: 'boolean',
        default: false,
        description: 'Prepend <?xml version="1.0" encoding="UTF-8"?> to output (toXml only)',
        displayOptions: {
          show: { operation: ['toXml'] },
        },
      },
    ],
  },

  async execute(context: IExecutionContext): Promise<INodeExecutionData[]> {
    const items = context.getInputData();
    const operation = context.getParameter<string>('operation') ?? 'parseToJson';
    const field = context.getParameter<string>('field') ?? 'data';
    const outputField = context.getParameter<string>('outputField') ?? 'result';
    const xmlDeclaration = context.getParameter<boolean>('xmlDeclaration') ?? false;

    return items.map((item) => {
      try {
        if (operation === 'parseToJson') {
          const xmlStr = String(item.json[field] ?? '');
          if (!xmlStr.trim()) {
            return { json: { ...item.json, [outputField]: null, _xmlError: 'Empty input' } };
          }
          const parsed = parseXml(xmlStr);
          return { json: { ...item.json, [outputField]: parsed } };
        } else {
          // toXml
          const obj = item.json[field];
          if (obj === undefined || obj === null) {
            return { json: { ...item.json, [outputField]: '', _xmlError: 'Field not found' } };
          }
          let xml = toXml(obj);
          if (xmlDeclaration) xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
          return { json: { ...item.json, [outputField]: xml } };
        }
      } catch (err) {
        return { json: { ...item.json, [outputField]: null, _xmlError: (err as Error).message } };
      }
    });
  },
};
