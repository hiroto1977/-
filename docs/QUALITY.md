# Quality dashboard

最終更新: 2026-05-12 04:43:51

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 189 passing (17 files) |
| Coverage — lines | 69.40% |
| Coverage — statements | 69.40% |
| Coverage — branches | 90.23% |
| Coverage — functions | 79.45% |
| Mutation score (total / covered) | 61.66% / 72.04% |
| Mutants killed | 402 |
| Mutants survived | 156 |


## Mutation testing (Stryker)

_Report age: 0.7h._

**Overall: 61.66% total / 72.04% covered** (402 killed / 156 survived / 94 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 77.92 | 77.92 | 60 | 17 | 0 |
| src/main/clients/gmail.ts | 73.68 | 74.67 | 56 | 19 | 1 |
| src/main/clients/security.ts | 65.67 | 69.29 | 88 | 39 | 7 |
| src/main/clients/skills.ts | 72.39 | 75.78 | 97 | 31 | 6 |
| src/main/clients/slack.ts | 79.41 | 81.82 | 54 | 12 | 2 |
| src/main/oauth.ts | 28.83 | 55.29 | 47 | 38 | 78 |


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
