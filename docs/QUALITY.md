# Quality dashboard

最終更新: 2026-05-12 10:05:12

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 296 passing (19 files) |
| Coverage — lines | 70.86% |
| Coverage — statements | 70.86% |
| Coverage — branches | 90.86% |
| Coverage — functions | 83.13% |
| Mutation score (total / covered) | 71.43% / 81.10% |
| Mutants killed | 755 |
| Mutants survived | 176 |


## Mutation testing (Stryker)

_Report age: 0.0h._

**Overall: 71.43% total / 81.10% covered** (755 killed / 176 survived / 126 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 77.27 | 77.27 | 68 | 20 | 0 |
| src/main/clients/github.ts | 85.92 | 87.14 | 61 | 9 | 1 |
| src/main/clients/gmail.ts | 77.53 | 78.41 | 69 | 19 | 1 |
| src/main/clients/ollama.ts | 81.04 | 84.65 | 171 | 31 | 9 |
| src/main/clients/security.ts | 67.91 | 71.65 | 91 | 36 | 7 |
| src/main/clients/skills.ts | 77.51 | 80.37 | 131 | 32 | 6 |
| src/main/clients/slack.ts | 79.41 | 81.82 | 54 | 12 | 2 |
| src/main/clients/types.ts | 74.36 | 76.32 | 29 | 9 | 1 |
| src/main/oauth.ts | 43.09 | 91.01 | 81 | 8 | 99 |


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
