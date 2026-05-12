# Quality dashboard

最終更新: 2026-05-12 05:13:17

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 201 passing (17 files) |
| Coverage — lines | 69.52% |
| Coverage — statements | 69.52% |
| Coverage — branches | 91.20% |
| Coverage — functions | 79.45% |
| Mutation score (total / covered) | 62.53% / 73.71% |
| Mutants killed | 499 |
| Mutants survived | 178 |


## Mutation testing (Stryker)

_Report age: 0.0h._

**Overall: 62.53% total / 73.71% covered** (499 killed / 178 survived / 121 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 77.27 | 77.27 | 68 | 20 | 0 |
| src/main/clients/github.ts | 85.92 | 87.14 | 61 | 9 | 1 |
| src/main/clients/gmail.ts | 73.68 | 74.67 | 56 | 19 | 1 |
| src/main/clients/security.ts | 65.67 | 69.29 | 88 | 39 | 7 |
| src/main/clients/skills.ts | 71.64 | 75.00 | 96 | 32 | 6 |
| src/main/clients/slack.ts | 79.41 | 81.82 | 54 | 12 | 2 |
| src/main/clients/types.ts | 74.36 | 76.32 | 29 | 9 | 1 |
| src/main/oauth.ts | 25.00 | 55.29 | 47 | 38 | 103 |


## How to drill down

```bash
# Re-run mutation testing (takes ~2 min)
npm run mutate

# See the top 20 survived mutants ranked by potential impact
npm run mutate:triage

# Filter to one file
npm run mutate:triage -- --file=src/main/clients/security.ts

# Full coverage HTML report
npx vitest run --coverage --coverage.reporter=html
open coverage/index.html
```

詳しい運用ルールは `docs/QUALITY_WORKFLOW.md` を参照。
