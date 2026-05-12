# Quality dashboard

最終更新: 2026-05-12 10:14:19

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 300 passing (19 files) |
| Coverage — lines | 70.86% |
| Coverage — statements | 70.86% |
| Coverage — branches | 90.88% |
| Coverage — functions | 83.13% |
| Mutation score (total / covered) | 72.94% / 82.81% |
| Mutants killed | 771 |
| Mutants survived | 160 |


## Mutation testing (Stryker)

_Report age: 0.0h._

**Overall: 72.94% total / 82.81% covered** (771 killed / 160 survived / 126 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 81.82 | 81.82 | 72 | 16 | 0 |
| src/main/clients/github.ts | 85.92 | 87.14 | 61 | 9 | 1 |
| src/main/clients/gmail.ts | 87.64 | 88.64 | 78 | 10 | 1 |
| src/main/clients/ollama.ts | 81.04 | 84.65 | 171 | 31 | 9 |
| src/main/clients/security.ts | 69.40 | 73.23 | 93 | 34 | 7 |
| src/main/clients/skills.ts | 78.11 | 80.98 | 132 | 31 | 6 |
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
