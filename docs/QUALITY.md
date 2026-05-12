# Quality dashboard

最終更新: 2026-05-12 08:33:37

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 234 passing (18 files) |
| Coverage — lines | 71.70% |
| Coverage — statements | 71.70% |
| Coverage — branches | 89.85% |
| Coverage — functions | 81.25% |
| Mutation score (total / covered) | 65.40% / 75.65% |
| Mutants killed | 637 |
| Mutants survived | 205 |


## Mutation testing (Stryker)

_Report age: 0.1h._

**Overall: 65.40% total / 75.65% covered** (637 killed / 205 survived / 132 no-cov)

| file | score | covered | killed | survived | no-cov |
|------|------:|--------:|-------:|---------:|-------:|
| src/main/clients/atlassian.ts | 77.27 | 77.27 | 68 | 20 | 0 |
| src/main/clients/github.ts | 85.92 | 87.14 | 61 | 9 | 1 |
| src/main/clients/gmail.ts | 73.68 | 74.67 | 56 | 19 | 1 |
| src/main/clients/ollama.ts | 78.41 | 83.64 | 138 | 27 | 11 |
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
