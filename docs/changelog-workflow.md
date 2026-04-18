# Changelog Workflow

The user-facing changelog is maintained from JSON release files under `releases/changelog/`.

## Add a new release

1. Copy the latest release file in `releases/changelog/` and rename it to the new version, for example `0.0.3.json`.
2. Update `version`, `date`, `headline`, `summary`, and the release sections in both `zh-CN` and `en`.
3. Run `npm run changelog:build` to regenerate `src/data/changelog.generated.ts`.
4. Check the changelog page locally if the release includes user-visible wording changes.

## Validation rules

- The JSON filename must exactly match the `version` field.
- Versions must use `major.minor.patch` format.
- Dates must use `YYYY-MM-DD`.
- Every localized text field must include non-empty `zh-CN` and `en` values.
- The generated file must stay in sync with the JSON source files.

## Commands

- `npm run changelog:build` regenerates `src/data/changelog.generated.ts`.
- `npm run changelog:check` validates the JSON files and fails if the generated file is stale.

CI runs `npm run changelog:check`, so pull requests that change release files without regenerating the output will fail.
