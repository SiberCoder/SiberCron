# Contributing to SiberCron

Thank you for your interest in contributing to SiberCron! This guide will help you get started.

## Development Setup

1. **Prerequisites**: Node.js >= 18, pnpm >= 9, Git
2. **Fork & Clone**: Fork the repository and clone your fork
3. **Install**: Run `pnpm install` from the project root
4. **Develop**: Run `pnpm dev` to start all packages in development mode

## Project Structure

This is a **pnpm monorepo** managed with **Turborepo**:

- `packages/shared` — Shared TypeScript types (build first)
- `packages/core` — Workflow execution engine
- `packages/nodes` — Built-in node implementations
- `packages/server` — Fastify REST API + WebSocket server
- `packages/editor` — React frontend (Vite)

## Branch Naming

- `feature/short-description` — New features
- `fix/short-description` — Bug fixes
- `docs/short-description` — Documentation changes

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Telegram trigger node
fix: resolve workflow execution timeout issue
docs: update plugin development guide
refactor: simplify node registry lookup
```

## Creating a Node

1. Create a file in `packages/nodes/src/<category>/YourNode.node.ts`
2. Implement the `INodeType` interface from `@sibercron/shared`
3. Add the node to the `builtinNodes` array in `packages/nodes/src/index.ts`
4. The node will automatically appear in the editor's node palette

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `pnpm build` passes without errors
4. Open a PR with a clear description of what and why
5. Wait for code review

## Code Style

- TypeScript strict mode throughout
- ESM modules with `.js` import extensions (except in the editor/Vite package)
- `import type` for type-only imports
- No `any` types unless absolutely necessary

## Questions?

Open an issue for questions or join discussions.
