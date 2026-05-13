# Quality dashboard

最終更新: 2026-05-13 03:43:10

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ❌ FAIL |
| ユニットテスト | 320 passing (19 files) |
| Coverage — lines | 75.02% |
| Coverage — statements | 75.02% |
| Coverage — branches | 89.24% |
| Coverage — functions | 90.47% |
| Mutation score (total / covered) | 74.17% / 84.05% |
| Mutants killed | 801 |
| Mutants survived | 152 |


## Mutation testing (Stryker)

_Report age: 0.0h._

**Overall: 74.17% total / 84.05% covered** (801 killed / 152 survived / 127 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 82.02 | 82.02 | 73 | 16 | 0 |
| src/main/clients/github.ts | 85.92 | 87.14 | 61 | 9 | 1 |
| src/main/clients/gmail.ts | 87.64 | 88.64 | 78 | 10 | 1 |
| src/main/clients/ollama.ts | 80.37 | 84.31 | 172 | 32 | 10 |
| src/main/clients/security.ts | 71.64 | 75.59 | 96 | 31 | 7 |
| src/main/clients/skills.ts | 77.78 | 81.10 | 133 | 31 | 7 |
| src/main/clients/slack.ts | 86.76 | 89.39 | 59 | 7 | 2 |
| src/main/clients/types.ts | 84.62 | 84.62 | 33 | 6 | 0 |
| src/main/oauth.ts | 46.83 | 90.57 | 96 | 10 | 99 |


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
