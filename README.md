# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Changelog workflow

User-facing release notes are maintained from JSON files in `releases/changelog/` and generated into `src/data/changelog.generated.ts`.

- `npm run changelog:build` regenerates the frontend changelog data.
- `npm run changelog:check` validates the source files and fails if the generated output is stale.

Detailed instructions live in [docs/changelog-workflow.md](./docs/changelog-workflow.md).
