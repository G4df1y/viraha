# Contributing to CompanionOS

We love contributions! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/companionos/viraha.git
cd viraha
pnpm install
pnpm build
```

## Development Workflow

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make changes
4. Run `pnpm build` 鈥?must pass with zero errors
5. Run tests: `pnpm test`
6. Commit with clear message
7. Push and open a PR

## Code Standards

- TypeScript strict mode 鈥?no `any`
- All new features need tests
- Follow existing patterns (event-driven, DIP, typed events)
- No circular dependencies between packages
- Run `pnpm lint` before committing

## Package Conventions

- `packages/` 鈥?core engines (event-driven, no fitness-specific code)
- `apps/` 鈥?concrete implementations
- `knowledge-packs/` 鈥?domain knowledge (markdown + JSON)
- Every package must have a `package.json` with `"type": "module"`

## Architecture Rules

- Engines communicate via EventBus, not direct imports
- Runtime depends on ports (interfaces), not concrete engines
- Context assembly is separate from runtime
- All LLM provider calls go through @viraha/provider

## PR Review Checklist

- [ ] Build passes
- [ ] Tests pass (or added)
- [ ] No `any` types
- [ ] No `console.log` in production code
- [ ] Uses event bus instead of callbacks where appropriate
- [ ] Knowledge packs are in `knowledge-packs/` not in source code

## Code of Conduct

All contributors must follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

