import type { INodeExecutionData } from '@sibercron/shared';

/**
 * Resolves `{{ expression }}` templates within node parameters.
 *
 * Supported variables:
 *   $json      – the first input item's JSON (shorthand)
 *   $input     – full input data array
 *   $item(n)   – the nth input item's JSON
 *   $env       – environment variables (process.env)
 *   $now       – current ISO date string
 *   $timestamp – current Unix timestamp (ms)
 *   $runId     – current execution ID
 *
 * Examples:
 *   {{ $json.name }}           → value of the "name" field from the first input item
 *   {{ $json.user.email }}     → nested access
 *   {{ $item(1).id }}          → second input item's id
 *   {{ $json.count + 1 }}      → arithmetic
 *   {{ $json.name.toUpperCase() }} → JS string method
 */

const EXPRESSION_PATTERN = /\{\{\s*([\s\S]*?)\s*\}\}/g;

interface ExpressionContext {
  inputData: INodeExecutionData[];
  executionId?: string;
  env?: Record<string, string | undefined>;
}

/**
 * Evaluate a single expression string against the given context.
 */
function evaluateExpression(
  expression: string,
  ctx: ExpressionContext,
): unknown {
  const $json = ctx.inputData[0]?.json ?? {};
  const $input = ctx.inputData;
  const $item = (index: number) => ctx.inputData[index]?.json ?? {};
  const $env = ctx.env ?? process.env;
  const $now = new Date().toISOString();
  const $timestamp = Date.now();
  const $runId = ctx.executionId ?? '';

  try {
    // Build a function with the expression context variables in scope.
    // Using Function constructor for sandboxed evaluation (no access to
    // local variables beyond what we explicitly pass).
    const fn = new Function(
      '$json',
      '$input',
      '$item',
      '$env',
      '$now',
      '$timestamp',
      '$runId',
      `"use strict"; return (${expression});`,
    );
    return fn($json, $input, $item, $env, $now, $timestamp, $runId);
  } catch {
    // If evaluation fails, return the original template string
    return `{{ ${expression} }}`;
  }
}

/**
 * Resolve all `{{ }}` templates in a string value.
 * If the entire string is a single expression, the raw value is returned
 * (preserving non-string types like numbers, objects).
 * If the string contains mixed text + expressions, everything is stringified.
 */
export function resolveExpressions(
  value: string,
  ctx: ExpressionContext,
): unknown {
  // Fast path: no expressions at all
  if (!value.includes('{{')) return value;

  // Check if the entire string is a single expression
  const trimmed = value.trim();
  const singleMatch = /^\{\{\s*([\s\S]*?)\s*\}\}$/.exec(trimmed);
  if (singleMatch && trimmed === value.trim()) {
    return evaluateExpression(singleMatch[1], ctx);
  }

  // Mixed content: replace each expression inline (stringify results)
  return value.replace(EXPRESSION_PATTERN, (_match, expr: string) => {
    const result = evaluateExpression(expr, ctx);
    if (result === null || result === undefined) return '';
    if (typeof result === 'object') return JSON.stringify(result);
    return String(result);
  });
}

/**
 * Deep-resolve expressions in an entire parameters object.
 * Walks objects and arrays, resolving string values.
 */
export function resolveParameterExpressions(
  parameters: Record<string, unknown>,
  ctx: ExpressionContext,
): Record<string, unknown> {
  return resolveDeep(parameters, ctx) as Record<string, unknown>;
}

function resolveDeep(value: unknown, ctx: ExpressionContext): unknown {
  if (typeof value === 'string') {
    return resolveExpressions(value, ctx);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveDeep(item, ctx));
  }

  if (value !== null && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveDeep(val, ctx);
    }
    return resolved;
  }

  // Numbers, booleans, null — pass through unchanged
  return value;
}
