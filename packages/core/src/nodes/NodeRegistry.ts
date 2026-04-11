import type { INodeType, INodeTypeDefinition } from '@sibercron/shared';

/**
 * Manages registration and lookup of available node types.
 * Node types are the "plugins" that define what each workflow node can do.
 */
export class NodeRegistry {
  private nodes: Map<string, INodeType> = new Map();

  /**
   * Register a node type. Throws if a node with the same name is already registered.
   */
  register(node: INodeType): void {
    const name = node.definition.name;

    if (this.nodes.has(name)) {
      throw new Error(`Node type "${name}" is already registered.`);
    }

    this.nodes.set(name, node);
  }

  /**
   * Look up a node type by its unique name.
   */
  get(name: string): INodeType | undefined {
    return this.nodes.get(name);
  }

  /**
   * Return all registered node types.
   */
  getAll(): INodeType[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Return just the definition metadata for every registered node.
   * Useful for exposing available node types through the API without
   * leaking the execute implementation.
   */
  getDefinitions(): INodeTypeDefinition[] {
    return this.getAll().map((node) => node.definition);
  }

  /**
   * Return all node types that belong to a specific group (e.g. "trigger", "ai").
   */
  getByGroup(group: string): INodeType[] {
    return this.getAll().filter((node) => node.definition.group === group);
  }

  /**
   * Check whether a node type with the given name is registered.
   */
  has(name: string): boolean {
    return this.nodes.has(name);
  }
}
