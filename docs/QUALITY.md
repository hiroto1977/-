# Quality dashboard

最終更新: 2026-10-01 05:24:21 UTC

> 自動生成: `npm run quality:report`。**全掃引の変異検査の報告からだけ作る** (部分の報告からは生成側が断る)。
> 3 つの時点が載る —— 変異検査は「報告ファイルの日時」の時点、型検査・検査・被覆と「生成時点」の数は上の最終更新の時点。
> 被覆は CI と同じ `npm run test:cov` の数 (`src/main` の検査を走らせ、`src/main/**` だけを数える)。
> 変異検査の数は、全掃引 (run 36812785924・97de20b9d771b5c70f4155d7ffd36a21ed2d577e) の併合報告から `triage-mutations.cjs --summary` が CI のログへ出した**ファイルごとの件数**を貼り付けて組んだ (併合した報告そのもの = artifact はこの環境から取れなかった)。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型検査 | ✅ pass |
| ユニットテスト | 21066 passing (1036 files) |
| Coverage (`src/main/**` のみ) — lines | 99.69% |
| Coverage (`src/main/**` のみ) — statements | 99.21% |
| Coverage (`src/main/**` のみ) — branches | 97.52% |
| Coverage (`src/main/**` のみ) — functions | 98.60% |
| Mutation score (total / covered) | 100.00% / 100.00% |
| Mutation の表の行 (報告が測った本) | 308 本 (報告ファイルの日時 2026-10-01 04:51 UTC) |
| Mutants killed | 37532 |
| Mutants survived | 0 |
| Mutants 有効 (分母) | 37532 |
| Mutants ignored (Stryker disable 宣言) | 7978 |
| Mutants invalid (評価不成立) | 0 |

## Mutation testing (Stryker)

**Overall (表の 308 本): 100.00% total / 100.00% covered** (37532 killed / 0 survived / 0 no-cov / 37532 valid)

分母の範囲: この報告 (報告ファイルの日時 **2026-10-01 04:51 UTC**) の表の行は **308 本**。run が名指ししたのは **308 本** (報告に残る `config.mutate`)。この頁を生成した時点の `stryker.config.json` の `mutate` は **308 本**で、**この run はそのすべてを名指ししていた (全掃引)**。生成時点の `src/` の `.ts` (検査と `.d.ts` を除く) は **426 本**で、**118 本は `mutate` の外**に在る (学術コーパスなどの定数表を含む。外に居て判断を持っていそうな物の台帳は `src/shared/__tests__/mutateScopeCensus.test.ts`)。

分母から外れたもの: `Ignored` 7978 (`Stryker disable` で測らないと宣言した分 — 範囲は `npm run lint:mutation-scope` が台帳で押さえている) / `RuntimeError`+`CompileError` 0 (**評価が成立しなかった分。0 でないなら盲点**)

率の「—」は**分母が 0** (測る変異体が無い / 生存も殺しも無い) で、0% ではない。

| file | score | covered | killed | survived | no-cov | ignored | invalid |
|------|------:|--------:|-------:|---------:|-------:|--------:|--------:|
| src/main/atomicWrite.ts | 100.00 | 100.00 | 31 | 0 | 0 | 13 | 0 |
| src/main/atRest.ts | 100.00 | 100.00 | 72 | 0 | 0 | 2 | 0 |
| src/main/clients/assistant.ts | 100.00 | 100.00 | 159 | 0 | 0 | 3 | 0 |
| src/main/clients/atlassian.ts | 100.00 | 100.00 | 31 | 0 | 0 | 7 | 0 |
| src/main/clients/base.ts | 100.00 | 100.00 | 13 | 0 | 0 | 0 | 0 |
| src/main/clients/business.ts | 100.00 | 100.00 | 326 | 0 | 0 | 273 | 0 |
| src/main/clients/calendar.ts | 100.00 | 100.00 | 45 | 0 | 0 | 1 | 0 |
| src/main/clients/canva.ts | 100.00 | 100.00 | 52 | 0 | 0 | 1 | 0 |
| src/main/clients/cloudflare.ts | 100.00 | 100.00 | 45 | 0 | 0 | 1 | 0 |
| src/main/clients/cursor.ts | 100.00 | 100.00 | 4 | 0 | 0 | 0 | 0 |
| src/main/clients/demae-can.ts | 100.00 | 100.00 | 10 | 0 | 0 | 35 | 0 |
| src/main/clients/devEnv.ts | 100.00 | 100.00 | 218 | 0 | 0 | 19 | 0 |
| src/main/clients/drive.ts | 100.00 | 100.00 | 19 | 0 | 0 | 1 | 0 |
| src/main/clients/emotions.ts | 100.00 | 100.00 | 231 | 0 | 0 | 1 | 0 |
| src/main/clients/exportPaths.ts | 100.00 | 100.00 | 67 | 0 | 0 | 3 | 0 |
| src/main/clients/freee.ts | 100.00 | 100.00 | 60 | 0 | 0 | 2 | 0 |
| src/main/clients/funding.ts | 100.00 | 100.00 | 30 | 0 | 0 | 110 | 0 |
| src/main/clients/github.ts | 100.00 | 100.00 | 54 | 0 | 0 | 6 | 0 |
| src/main/clients/gmail.ts | 100.00 | 100.00 | 38 | 0 | 0 | 1 | 0 |
| src/main/clients/home.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/kpi.ts | 100.00 | 100.00 | 156 | 0 | 0 | 42 | 0 |
| src/main/clients/library.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/linux.ts | 100.00 | 100.00 | 83 | 0 | 0 | 26 | 0 |
| src/main/clients/microsoft-365.ts | 100.00 | 100.00 | 90 | 0 | 0 | 2 | 0 |
| src/main/clients/mutual-funds.ts | 100.00 | 100.00 | 10 | 0 | 0 | 35 | 0 |
| src/main/clients/notion.ts | 100.00 | 100.00 | 49 | 0 | 0 | 1 | 0 |
| src/main/clients/ollama.ts | 100.00 | 100.00 | 108 | 0 | 0 | 49 | 0 |
| src/main/clients/quality.ts | 100.00 | 100.00 | 1 | 0 | 0 | 8 | 0 |
| src/main/clients/real-estate.ts | 100.00 | 100.00 | 10 | 0 | 0 | 34 | 0 |
| src/main/clients/security.ts | 100.00 | 100.00 | 76 | 0 | 0 | 13 | 0 |
| src/main/clients/settings.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/shigyo.ts | 100.00 | 100.00 | 1 | 0 | 0 | 5 | 0 |
| src/main/clients/shopify.ts | 100.00 | 100.00 | 249 | 0 | 0 | 60 | 0 |
| src/main/clients/skills.ts | 100.00 | 100.00 | 210 | 0 | 0 | 59 | 0 |
| src/main/clients/slack.ts | 100.00 | 100.00 | 45 | 0 | 0 | 1 | 0 |
| src/main/clients/snapshotStub.ts | 100.00 | 100.00 | 1 | 0 | 0 | 1 | 0 |
| src/main/clients/stocks.ts | 100.00 | 100.00 | 700 | 0 | 0 | 630 | 0 |
| src/main/clients/storage.ts | 100.00 | 100.00 | 1 | 0 | 0 | 7 | 0 |
| src/main/clients/teamradar.ts | 100.00 | 100.00 | 89 | 0 | 0 | 2 | 0 |
| src/main/clients/templates.ts | 100.00 | 100.00 | 183 | 0 | 0 | 0 | 0 |
| src/main/clients/types.ts | 100.00 | 100.00 | 64 | 0 | 0 | 0 | 0 |
| src/main/clients/uber-eats.ts | 100.00 | 100.00 | 10 | 0 | 0 | 34 | 0 |
| src/main/clients/wordpress.ts | 100.00 | 100.00 | 47 | 0 | 0 | 1 | 0 |
| src/main/clients/youtube.ts | 100.00 | 100.00 | 65 | 0 | 0 | 3 | 0 |
| src/main/eraseAll.ts | 100.00 | 100.00 | 64 | 0 | 0 | 0 | 0 |
| src/main/main.ts | 100.00 | 100.00 | 386 | 0 | 0 | 1 | 0 |
| src/main/oauth.ts | 100.00 | 100.00 | 401 | 0 | 0 | 22 | 0 |
| src/main/secrets.ts | 100.00 | 100.00 | 215 | 0 | 0 | 7 | 0 |
| src/main/shellOpenGate.ts | 100.00 | 100.00 | 31 | 0 | 0 | 0 | 0 |
| src/main/stateFile.ts | 100.00 | 100.00 | 52 | 0 | 0 | 2 | 0 |
| src/main/windowPrefs.ts | 100.00 | 100.00 | 46 | 0 | 0 | 11 | 0 |
| src/preload/preload.ts | 100.00 | 100.00 | 32 | 0 | 0 | 0 | 0 |
| src/renderer/components/serviceActionMachine.ts | 100.00 | 100.00 | 47 | 0 | 0 | 11 | 0 |
| src/renderer/components/serviceActionUtils.ts | 100.00 | 100.00 | 49 | 0 | 0 | 0 | 0 |
| src/renderer/data/accounting.ts | 100.00 | 100.00 | 41 | 0 | 0 | 2 | 0 |
| src/renderer/data/actionOutcome.ts | 100.00 | 100.00 | 27 | 0 | 0 | 0 | 0 |
| src/renderer/data/assistantMarkdown.ts | 100.00 | 100.00 | 189 | 0 | 0 | 29 | 0 |
| src/renderer/data/assistantProviders.ts | 100.00 | 100.00 | 56 | 0 | 0 | 0 | 0 |
| src/renderer/data/backup.ts | 100.00 | 100.00 | 240 | 0 | 0 | 11 | 0 |
| src/renderer/data/backupPosture.ts | 100.00 | 100.00 | 23 | 0 | 0 | 0 | 0 |
| src/renderer/data/balanceSheet.ts | 100.00 | 100.00 | 402 | 0 | 0 | 4 | 0 |
| src/renderer/data/bankSubmission.ts | 100.00 | 100.00 | 672 | 0 | 0 | 11 | 0 |
| src/renderer/data/bestAnswers.ts | 100.00 | 100.00 | 649 | 0 | 0 | 0 | 0 |
| src/renderer/data/bestAnswersJob.ts | 100.00 | 100.00 | 83 | 0 | 0 | 0 | 0 |
| src/renderer/data/budgetVariance.ts | 100.00 | 100.00 | 193 | 0 | 0 | 10 | 0 |
| src/renderer/data/businessAxonometric.ts | 100.00 | 100.00 | 97 | 0 | 0 | 125 | 0 |
| src/renderer/data/businessFinancials.ts | 100.00 | 100.00 | 46 | 0 | 0 | 4 | 0 |
| src/renderer/data/businessTriage.ts | 100.00 | 100.00 | 56 | 0 | 0 | 397 | 0 |
| src/renderer/data/businessUnits.ts | 100.00 | 100.00 | 174 | 0 | 0 | 5 | 0 |
| src/renderer/data/cashflowDebtService.ts | 100.00 | 100.00 | 38 | 0 | 0 | 7 | 0 |
| src/renderer/data/cashForecast.ts | 100.00 | 100.00 | 199 | 0 | 0 | 17 | 0 |
| src/renderer/data/cashPlan.ts | 100.00 | 100.00 | 115 | 0 | 0 | 30 | 0 |
| src/renderer/data/charts.ts | 100.00 | 100.00 | 254 | 0 | 0 | 6 | 0 |
| src/renderer/data/chatbot.ts | 100.00 | 100.00 | 115 | 0 | 0 | 123 | 0 |
| src/renderer/data/chatCalc.ts | 100.00 | 100.00 | 91 | 0 | 0 | 41 | 0 |
| src/renderer/data/chatOrg.ts | 100.00 | 100.00 | 160 | 0 | 0 | 2 | 0 |
| src/renderer/data/cloudBackup.ts | 100.00 | 100.00 | 200 | 0 | 0 | 33 | 0 |
| src/renderer/data/cloudSync.ts | 100.00 | 100.00 | 154 | 0 | 0 | 15 | 0 |
| src/renderer/data/collectionChange.ts | 100.00 | 100.00 | 26 | 0 | 0 | 2 | 0 |
| src/renderer/data/collectionShapes.ts | 100.00 | 100.00 | 84 | 0 | 0 | 72 | 0 |
| src/renderer/data/complianceResearch.ts | 100.00 | 100.00 | 20 | 0 | 0 | 0 | 0 |
| src/renderer/data/connectionStatus.ts | 100.00 | 100.00 | 23 | 0 | 0 | 0 | 0 |
| src/renderer/data/connectorExecution.ts | 100.00 | 100.00 | 64 | 0 | 0 | 1 | 0 |
| src/renderer/data/consolidation.ts | 100.00 | 100.00 | 15 | 0 | 0 | 0 | 0 |
| src/renderer/data/counseling.ts | 100.00 | 100.00 | 120 | 0 | 0 | 118 | 0 |
| src/renderer/data/counselingResearch.ts | 100.00 | 100.00 | 52 | 0 | 0 | 97 | 0 |
| src/renderer/data/credentialSaveMessage.ts | 100.00 | 100.00 | 50 | 0 | 0 | 0 | 0 |
| src/renderer/data/crisisDeliberation.ts | 100.00 | 100.00 | 77 | 0 | 0 | 103 | 0 |
| src/renderer/data/csv.ts | 100.00 | 100.00 | 141 | 0 | 0 | 10 | 0 |
| src/renderer/data/dbPosture.ts | 100.00 | 100.00 | 14 | 0 | 0 | 0 | 0 |
| src/renderer/data/deviceStoreFailure.ts | 100.00 | 100.00 | 88 | 0 | 0 | 0 | 0 |
| src/renderer/data/docImports.ts | 100.00 | 100.00 | 172 | 0 | 0 | 1 | 0 |
| src/renderer/data/docLegalStatus.ts | 100.00 | 100.00 | 8 | 0 | 0 | 238 | 0 |
| src/renderer/data/docStudioChecks.ts | 100.00 | 100.00 | 1305 | 0 | 0 | 45 | 0 |
| src/renderer/data/docStudioTeikan.ts | 100.00 | 100.00 | 356 | 0 | 0 | 8 | 0 |
| src/renderer/data/eligibility.ts | 100.00 | 100.00 | 150 | 0 | 0 | 92 | 0 |
| src/renderer/data/emotionInsights.ts | 100.00 | 100.00 | 101 | 0 | 0 | 10 | 0 |
| src/renderer/data/emotionsWeb.ts | 100.00 | 100.00 | 167 | 0 | 0 | 15 | 0 |
| src/renderer/data/exportOutcome.ts | 100.00 | 100.00 | 27 | 0 | 0 | 5 | 0 |
| src/renderer/data/financialCsv.ts | 100.00 | 100.00 | 57 | 0 | 0 | 52 | 0 |
| src/renderer/data/financialDiagnosis.ts | 100.00 | 100.00 | 100 | 0 | 0 | 33 | 0 |
| src/renderer/data/financialRatios.ts | 100.00 | 100.00 | 168 | 0 | 0 | 5 | 0 |
| src/renderer/data/financialReport.ts | 100.00 | 100.00 | 124 | 0 | 0 | 77 | 0 |
| src/renderer/data/financialStatements.ts | 100.00 | 100.00 | 379 | 0 | 0 | 2 | 0 |
| src/renderer/data/financialTrend.ts | 100.00 | 100.00 | 37 | 0 | 0 | 1 | 0 |
| src/renderer/data/foodDelivery.ts | 100.00 | 100.00 | 27 | 0 | 0 | 2 | 0 |
| src/renderer/data/highlightSettings.ts | 100.00 | 100.00 | 49 | 0 | 0 | 20 | 0 |
| src/renderer/data/hydroponicsSetup.ts | 100.00 | 100.00 | 57 | 0 | 0 | 8 | 0 |
| src/renderer/data/importFile.ts | 100.00 | 100.00 | 26 | 0 | 0 | 3 | 0 |
| src/renderer/data/industryPresets.ts | 100.00 | 100.00 | 6 | 0 | 0 | 25 | 0 |
| src/renderer/data/inputGuards.ts | 100.00 | 100.00 | 313 | 0 | 0 | 12 | 0 |
| src/renderer/data/investments.ts | 100.00 | 100.00 | 505 | 0 | 0 | 55 | 0 |
| src/renderer/data/kessanImport.ts | 100.00 | 100.00 | 246 | 0 | 0 | 0 | 0 |
| src/renderer/data/kpiActuals.ts | 100.00 | 100.00 | 500 | 0 | 0 | 22 | 0 |
| src/renderer/data/kpiActualsCsv.ts | 100.00 | 100.00 | 18 | 0 | 0 | 2 | 0 |
| src/renderer/data/latestRecord.ts | 100.00 | 100.00 | 10 | 0 | 0 | 0 | 0 |
| src/renderer/data/localWrite.ts | 100.00 | 100.00 | 86 | 0 | 0 | 0 | 0 |
| src/renderer/data/managementHighlights.ts | 100.00 | 100.00 | 417 | 0 | 0 | 39 | 0 |
| src/renderer/data/managementReport.ts | 100.00 | 100.00 | 245 | 0 | 0 | 1 | 0 |
| src/renderer/data/manualData.ts | 100.00 | 100.00 | 113 | 0 | 0 | 135 | 0 |
| src/renderer/data/memberCare.ts | 100.00 | 100.00 | 188 | 0 | 0 | 6 | 0 |
| src/renderer/data/members.ts | 100.00 | 100.00 | 177 | 0 | 0 | 11 | 0 |
| src/renderer/data/overview.ts | 100.00 | 100.00 | 118 | 0 | 0 | 0 | 0 |
| src/renderer/data/overviewOverrides.ts | 100.00 | 100.00 | 215 | 0 | 0 | 320 | 0 |
| src/renderer/data/overviewScorecard.ts | 100.00 | 100.00 | 24 | 0 | 0 | 1 | 0 |
| src/renderer/data/parameterOverrides.ts | 100.00 | 100.00 | 52 | 0 | 0 | 2 | 0 |
| src/renderer/data/persistedShape.ts | 100.00 | 100.00 | 60 | 0 | 0 | 0 | 0 |
| src/renderer/data/printDocument.ts | 100.00 | 100.00 | 6 | 0 | 0 | 0 | 0 |
| src/renderer/data/profitSensitivity.ts | 100.00 | 100.00 | 104 | 0 | 0 | 0 | 0 |
| src/renderer/data/readCollectionNow.ts | 100.00 | 100.00 | 17 | 0 | 0 | 2 | 0 |
| src/renderer/data/recordCipher.ts | 100.00 | 100.00 | 24 | 0 | 0 | 1 | 0 |
| src/renderer/data/recordEncryption.ts | 100.00 | 100.00 | 82 | 0 | 0 | 3 | 0 |
| src/renderer/data/recordShapeAudit.ts | 100.00 | 100.00 | 41 | 0 | 0 | 0 | 0 |
| src/renderer/data/revenueConcentration.ts | 100.00 | 100.00 | 162 | 0 | 0 | 2 | 0 |
| src/renderer/data/saasWriteWeb.ts | 100.00 | 100.00 | 84 | 0 | 0 | 0 | 0 |
| src/renderer/data/sales.ts | 100.00 | 100.00 | 295 | 0 | 0 | 43 | 0 |
| src/renderer/data/salesAnalytics.ts | 100.00 | 100.00 | 186 | 0 | 0 | 19 | 0 |
| src/renderer/data/salesCsv.ts | 100.00 | 100.00 | 23 | 0 | 0 | 2 | 0 |
| src/renderer/data/salesKpiBridge.ts | 100.00 | 100.00 | 17 | 0 | 0 | 2 | 0 |
| src/renderer/data/sameRecordData.ts | 100.00 | 100.00 | 57 | 0 | 0 | 0 | 0 |
| src/renderer/data/selfCareLibrary.ts | 100.00 | 100.00 | 2 | 0 | 0 | 89 | 0 |
| src/renderer/data/shareholders.ts | 100.00 | 100.00 | 102 | 0 | 0 | 5 | 0 |
| src/renderer/data/shigyoDirectory.ts | 100.00 | 100.00 | 121 | 0 | 0 | 12 | 0 |
| src/renderer/data/shopifyImport.ts | 100.00 | 100.00 | 15 | 0 | 0 | 0 | 0 |
| src/renderer/data/sourceVerification.ts | 100.00 | 100.00 | 93 | 0 | 0 | 0 | 0 |
| src/renderer/data/sparkline.ts | 100.00 | 100.00 | 53 | 0 | 0 | 0 | 0 |
| src/renderer/data/statementAccounts.ts | 100.00 | 100.00 | 344 | 0 | 0 | 278 | 0 |
| src/renderer/data/statementEquity.ts | 100.00 | 100.00 | 165 | 0 | 0 | 1 | 0 |
| src/renderer/data/stocksAnalysisWeb.ts | 100.00 | 100.00 | 823 | 0 | 0 | 111 | 0 |
| src/renderer/data/stocksWatchlistWeb.ts | 100.00 | 100.00 | 117 | 0 | 0 | 7 | 0 |
| src/renderer/data/store.ts | 100.00 | 100.00 | 439 | 0 | 0 | 50 | 0 |
| src/renderer/data/teamEmotionRadar.ts | 100.00 | 100.00 | 136 | 0 | 0 | 0 | 0 |
| src/renderer/data/trendAlerts.ts | 100.00 | 100.00 | 42 | 0 | 0 | 2 | 0 |
| src/renderer/data/useCollection.ts | 100.00 | 100.00 | 87 | 0 | 0 | 9 | 0 |
| src/renderer/data/useLatestForm.ts | 100.00 | 100.00 | 66 | 0 | 0 | 1 | 0 |
| src/renderer/data/villageLayout.ts | 100.00 | 100.00 | 173 | 0 | 0 | 17 | 0 |
| src/renderer/data/voiceCommand.ts | 100.00 | 100.00 | 263 | 0 | 0 | 575 | 0 |
| src/renderer/data/voiceSession.ts | 100.00 | 100.00 | 123 | 0 | 0 | 3 | 0 |
| src/renderer/data/workingCapital.ts | 100.00 | 100.00 | 63 | 0 | 0 | 0 | 0 |
| src/renderer/fs/folderMirror.ts | 100.00 | 100.00 | 22 | 0 | 0 | 1 | 0 |
| src/renderer/fs/fsa.ts | 100.00 | 100.00 | 88 | 0 | 0 | 24 | 0 |
| src/renderer/hashRoute.ts | 100.00 | 100.00 | 7 | 0 | 0 | 0 | 0 |
| src/renderer/hooks/useServiceData.ts | 100.00 | 100.00 | 82 | 0 | 0 | 8 | 0 |
| src/renderer/keyIntent.ts | 100.00 | 100.00 | 31 | 0 | 0 | 0 | 0 |
| src/renderer/library/library.ts | 100.00 | 100.00 | 206 | 0 | 0 | 62 | 0 |
| src/renderer/library/preview.ts | 100.00 | 100.00 | 54 | 0 | 0 | 5 | 0 |
| src/renderer/navigate.ts | 100.00 | 100.00 | 22 | 0 | 0 | 1 | 0 |
| src/renderer/network/liveRead.ts | 100.00 | 100.00 | 41 | 0 | 0 | 0 | 0 |
| src/renderer/network/ollamaWeb.ts | 100.00 | 100.00 | 444 | 0 | 0 | 10 | 0 |
| src/renderer/network/proxy.ts | 100.00 | 100.00 | 172 | 0 | 0 | 25 | 0 |
| src/renderer/oauth/callbackPaste.ts | 100.00 | 100.00 | 88 | 0 | 0 | 0 | 0 |
| src/renderer/oauth/pkce.ts | 100.00 | 100.00 | 131 | 0 | 0 | 3 | 0 |
| src/renderer/oauth/pkceSession.ts | 100.00 | 100.00 | 20 | 0 | 0 | 0 | 0 |
| src/renderer/plan/internalLicense.ts | 100.00 | 100.00 | 82 | 0 | 0 | 13 | 0 |
| src/renderer/recents.ts | 100.00 | 100.00 | 18 | 0 | 0 | 0 | 0 |
| src/renderer/security/autoLock.ts | 100.00 | 100.00 | 57 | 0 | 0 | 36 | 0 |
| src/renderer/security/dataCrypto.ts | 100.00 | 100.00 | 152 | 0 | 0 | 2 | 0 |
| src/renderer/security/eraseAll.ts | 100.00 | 100.00 | 118 | 0 | 0 | 44 | 0 |
| src/renderer/security/frameGuard.ts | 100.00 | 100.00 | 22 | 0 | 0 | 6 | 0 |
| src/renderer/security/lockWorkspace.ts | 100.00 | 100.00 | 32 | 0 | 0 | 0 | 0 |
| src/renderer/security/mnemonic.ts | 100.00 | 100.00 | 80 | 0 | 0 | 10 | 0 |
| src/renderer/security/vault.ts | 100.00 | 100.00 | 442 | 0 | 0 | 82 | 0 |
| src/renderer/security/webauthn.ts | 100.00 | 100.00 | 53 | 0 | 0 | 8 | 0 |
| src/renderer/security/webCrypto.ts | 100.00 | 100.00 | 24 | 0 | 0 | 0 | 0 |
| src/renderer/sidebarFilter.ts | 100.00 | 100.00 | 46 | 0 | 0 | 0 | 0 |
| src/renderer/voice/speechAdapter.ts | 100.00 | 100.00 | 49 | 0 | 0 | 0 | 0 |
| src/renderer/voice/ttsAdapter.ts | 100.00 | 100.00 | 211 | 0 | 0 | 4 | 0 |
| src/renderer/web-templates.ts | 100.00 | 100.00 | 74 | 0 | 0 | 0 | 0 |
| src/shared/advisorQuestionLimits.ts | 100.00 | 100.00 | 24 | 0 | 0 | 5 | 0 |
| src/shared/ai/chat.ts | 100.00 | 100.00 | 38 | 0 | 0 | 0 | 0 |
| src/shared/ai/credentials.ts | 100.00 | 100.00 | 157 | 0 | 0 | 0 | 0 |
| src/shared/ai/providers.ts | 100.00 | 100.00 | 246 | 0 | 0 | 22 | 0 |
| src/shared/aiEndpoint.ts | 100.00 | 100.00 | 172 | 0 | 0 | 0 | 0 |
| src/shared/api/atlassian.ts | 100.00 | 100.00 | 111 | 0 | 0 | 6 | 0 |
| src/shared/api/canva.ts | 100.00 | 100.00 | 83 | 0 | 0 | 2 | 0 |
| src/shared/api/cursor.ts | 100.00 | 100.00 | 167 | 0 | 0 | 0 | 0 |
| src/shared/api/github.ts | 100.00 | 100.00 | 84 | 0 | 0 | 1 | 0 |
| src/shared/api/google.ts | 100.00 | 100.00 | 189 | 0 | 0 | 7 | 0 |
| src/shared/api/http.ts | 100.00 | 100.00 | 46 | 0 | 0 | 0 | 0 |
| src/shared/api/notion.ts | 100.00 | 100.00 | 75 | 0 | 0 | 3 | 0 |
| src/shared/api/slack.ts | 100.00 | 100.00 | 92 | 0 | 0 | 9 | 0 |
| src/shared/api/types.ts | 100.00 | 100.00 | 3 | 0 | 0 | 0 | 0 |
| src/shared/api/wordpress.ts | 100.00 | 100.00 | 76 | 0 | 0 | 1 | 0 |
| src/shared/assistantLimits.ts | 100.00 | 100.00 | 33 | 0 | 0 | 4 | 0 |
| src/shared/atlassianLinks.ts | 100.00 | 100.00 | 2 | 0 | 0 | 0 | 0 |
| src/shared/atlassianSite.ts | 100.00 | 100.00 | 95 | 0 | 0 | 4 | 0 |
| src/shared/balanceSheetFreshness.ts | 100.00 | 100.00 | 47 | 0 | 0 | 0 | 0 |
| src/shared/bankFormat.ts | 100.00 | 100.00 | 170 | 0 | 0 | 53 | 0 |
| src/shared/buildingIso.ts | 100.00 | 100.00 | 163 | 0 | 0 | 1 | 0 |
| src/shared/businessAdvisor.ts | 100.00 | 100.00 | 1 | 0 | 0 | 0 | 0 |
| src/shared/connectors/connectorCatalog.ts | 100.00 | 100.00 | 17 | 0 | 0 | 176 | 0 |
| src/shared/connectors/connectorHealth.ts | 100.00 | 100.00 | 36 | 0 | 0 | 0 | 0 |
| src/shared/connectors/connectorRegistry.ts | 100.00 | 100.00 | 191 | 0 | 0 | 3 | 0 |
| src/shared/connectors/pluginRuntime.ts | 100.00 | 100.00 | 41 | 0 | 0 | 6 | 0 |
| src/shared/constantTimeEquals.ts | 100.00 | 100.00 | 22 | 0 | 0 | 2 | 0 |
| src/shared/controlChars.ts | 100.00 | 100.00 | 12 | 0 | 0 | 0 | 0 |
| src/shared/credentialUse.ts | 100.00 | 100.00 | 14 | 0 | 0 | 77 | 0 |
| src/shared/cryptoParams.ts | 100.00 | 100.00 | 8 | 0 | 0 | 0 | 0 |
| src/shared/dataOrigin.ts | 100.00 | 100.00 | 71 | 0 | 0 | 77 | 0 |
| src/shared/dbSecurityPosture.ts | 100.00 | 100.00 | 71 | 0 | 0 | 49 | 0 |
| src/shared/depreciation.ts | 100.00 | 100.00 | 297 | 0 | 0 | 25 | 0 |
| src/shared/emotionsShape.ts | 100.00 | 100.00 | 78 | 0 | 0 | 0 | 0 |
| src/shared/emotionThresholds.ts | — | — | 0 | 0 | 0 | 1 | 0 |
| src/shared/employerBenefits.ts | 100.00 | 100.00 | 252 | 0 | 0 | 4 | 0 |
| src/shared/eraseReport.ts | 100.00 | 100.00 | 36 | 0 | 0 | 0 | 0 |
| src/shared/escape.ts | 100.00 | 100.00 | 35 | 0 | 0 | 0 | 0 |
| src/shared/externalUrlGate.ts | 100.00 | 100.00 | 27 | 0 | 0 | 3 | 0 |
| src/shared/financialHealthBands.ts | — | — | 0 | 0 | 0 | 20 | 0 |
| src/shared/formatters.ts | 100.00 | 100.00 | 24 | 0 | 0 | 1 | 0 |
| src/shared/funding.ts | 100.00 | 100.00 | 565 | 0 | 0 | 40 | 0 |
| src/shared/fxCurrency.ts | 100.00 | 100.00 | 95 | 0 | 0 | 4 | 0 |
| src/shared/headerValue.ts | 100.00 | 100.00 | 28 | 0 | 0 | 5 | 0 |
| src/shared/httpLimits.ts | 100.00 | 100.00 | 95 | 0 | 0 | 21 | 0 |
| src/shared/hydroponicCrops.ts | 100.00 | 100.00 | 233 | 0 | 0 | 0 | 0 |
| src/shared/hydroponics.ts | 100.00 | 100.00 | 162 | 0 | 0 | 0 | 0 |
| src/shared/imageUrlGate.ts | 100.00 | 100.00 | 47 | 0 | 0 | 2 | 0 |
| src/shared/inputCeiling.ts | 100.00 | 100.00 | 66 | 0 | 0 | 0 | 0 |
| src/shared/invoiceTax.ts | 100.00 | 100.00 | 104 | 0 | 0 | 41 | 0 |
| src/shared/invoiceTransition.ts | 100.00 | 100.00 | 63 | 0 | 0 | 3 | 0 |
| src/shared/isoDate.ts | 100.00 | 100.00 | 143 | 0 | 0 | 1 | 0 |
| src/shared/issueLevel.ts | 100.00 | 100.00 | 5 | 0 | 0 | 1 | 0 |
| src/shared/localDate.ts | 100.00 | 100.00 | 8 | 0 | 0 | 0 | 0 |
| src/shared/managementScorecard.ts | 100.00 | 100.00 | 280 | 0 | 0 | 14 | 0 |
| src/shared/mutualFundsMetrics.ts | 100.00 | 100.00 | 222 | 0 | 0 | 5 | 0 |
| src/shared/num.ts | 100.00 | 100.00 | 30 | 0 | 0 | 0 | 0 |
| src/shared/ollama.ts | 100.00 | 100.00 | 515 | 0 | 0 | 55 | 0 |
| src/shared/parameters.ts | 100.00 | 100.00 | 284 | 0 | 0 | 7 | 0 |
| src/shared/passwordStrength.ts | 100.00 | 100.00 | 122 | 0 | 0 | 1 | 0 |
| src/shared/payroll.ts | 100.00 | 100.00 | 125 | 0 | 0 | 34 | 0 |
| src/shared/plan.ts | 100.00 | 100.00 | 31 | 0 | 0 | 61 | 0 |
| src/shared/privateTarget.ts | 100.00 | 100.00 | 231 | 0 | 0 | 121 | 0 |
| src/shared/proxyEndpoint.ts | 100.00 | 100.00 | 172 | 0 | 0 | 0 | 0 |
| src/shared/readNumeric.ts | 100.00 | 100.00 | 103 | 0 | 0 | 0 | 0 |
| src/shared/realEstateMetrics.ts | 100.00 | 100.00 | 166 | 0 | 0 | 7 | 0 |
| src/shared/recordEntryLimits.ts | 100.00 | 100.00 | 1 | 0 | 0 | 0 | 0 |
| src/shared/redact.ts | 100.00 | 100.00 | 123 | 0 | 0 | 0 | 0 |
| src/shared/safeFilename.ts | 100.00 | 100.00 | 34 | 0 | 0 | 0 | 0 |
| src/shared/savingsPlanning.ts | 100.00 | 100.00 | 184 | 0 | 0 | 17 | 0 |
| src/shared/scanTarget.ts | 100.00 | 100.00 | 240 | 0 | 0 | 0 | 0 |
| src/shared/securityRange.ts | 100.00 | 100.00 | 122 | 0 | 0 | 166 | 0 |
| src/shared/seededNoise.ts | 100.00 | 100.00 | 5 | 0 | 0 | 0 | 0 |
| src/shared/serviceAdvisor.ts | 100.00 | 100.00 | 872 | 0 | 0 | 12 | 0 |
| src/shared/serviceId.ts | 100.00 | 100.00 | 4 | 0 | 0 | 3 | 0 |
| src/shared/shigyoTypes.ts | 100.00 | 100.00 | 6 | 0 | 0 | 0 | 0 |
| src/shared/storageDurability.ts | 100.00 | 100.00 | 18 | 0 | 0 | 0 | 0 |
| src/shared/talent.ts | 100.00 | 100.00 | 405 | 0 | 0 | 42 | 0 |
| src/shared/taxAutomobile.ts | 100.00 | 100.00 | 75 | 0 | 0 | 18 | 0 |
| src/shared/taxBusinessOffice.ts | 100.00 | 100.00 | 28 | 0 | 0 | 0 | 0 |
| src/shared/taxCalc.ts | 100.00 | 100.00 | 496 | 0 | 0 | 51 | 0 |
| src/shared/taxCapitalGains.ts | 100.00 | 100.00 | 8 | 0 | 0 | 120 | 0 |
| src/shared/taxCasual.ts | 100.00 | 100.00 | 50 | 0 | 0 | 0 | 0 |
| src/shared/taxConsumption.ts | 100.00 | 100.00 | 93 | 0 | 0 | 0 | 0 |
| src/shared/taxConsumptionBusiness.ts | 100.00 | 100.00 | 132 | 0 | 0 | 0 | 0 |
| src/shared/taxConsumptionSchedule.ts | 100.00 | 100.00 | 329 | 0 | 0 | 5 | 0 |
| src/shared/taxCorporate.ts | 100.00 | 100.00 | 124 | 0 | 0 | 18 | 0 |
| src/shared/taxCredits.ts | 100.00 | 100.00 | 210 | 0 | 0 | 31 | 0 |
| src/shared/taxDeductions.ts | 100.00 | 100.00 | 120 | 0 | 0 | 304 | 0 |
| src/shared/taxDividend.ts | 100.00 | 100.00 | 48 | 0 | 0 | 3 | 0 |
| src/shared/taxFixedAsset.ts | 100.00 | 100.00 | 96 | 0 | 0 | 1 | 0 |
| src/shared/taxFurusato.ts | 100.00 | 100.00 | 68 | 0 | 0 | 7 | 0 |
| src/shared/taxGift.ts | 100.00 | 100.00 | 40 | 0 | 0 | 26 | 0 |
| src/shared/taxIndividualBusiness.ts | 100.00 | 100.00 | 33 | 0 | 0 | 10 | 0 |
| src/shared/taxInheritance.ts | 100.00 | 100.00 | 61 | 0 | 0 | 16 | 0 |
| src/shared/taxNationalHealthInsurance.ts | 100.00 | 100.00 | 83 | 0 | 0 | 4 | 0 |
| src/shared/taxNationalPension.ts | 100.00 | 100.00 | 23 | 0 | 0 | 1 | 0 |
| src/shared/taxPublicPension.ts | 100.00 | 100.00 | 52 | 0 | 0 | 12 | 0 |
| src/shared/taxRealEstateAcquisition.ts | 100.00 | 100.00 | 54 | 0 | 0 | 5 | 0 |
| src/shared/taxRealEstateTransactionCost.ts | 100.00 | 100.00 | 35 | 0 | 0 | 0 | 0 |
| src/shared/taxRegistrationLicense.ts | 100.00 | 100.00 | 33 | 0 | 0 | 11 | 0 |
| src/shared/taxRetirement.ts | 100.00 | 100.00 | 56 | 0 | 0 | 18 | 0 |
| src/shared/taxSocialInsurance.ts | 100.00 | 100.00 | 76 | 0 | 0 | 86 | 0 |
| src/shared/taxStampDuty.ts | 100.00 | 100.00 | 54 | 0 | 0 | 35 | 0 |
| src/shared/team.ts | 100.00 | 100.00 | 51 | 0 | 0 | 29 | 0 |
| src/shared/teamRadarState.ts | 100.00 | 100.00 | 289 | 0 | 0 | 54 | 0 |
| src/shared/templateSvg.ts | 100.00 | 100.00 | 95 | 0 | 0 | 88 | 0 |
| src/shared/textWrap.ts | 100.00 | 100.00 | 12 | 0 | 0 | 0 | 0 |
| src/shared/tokenInput.ts | 100.00 | 100.00 | 40 | 0 | 0 | 2 | 0 |
| src/shared/tokenResponse.ts | 100.00 | 100.00 | 63 | 0 | 0 | 0 | 0 |
| src/shared/tradeTax.ts | 100.00 | 100.00 | 206 | 0 | 0 | 34 | 0 |
| src/shared/updateCheck.ts | 100.00 | 100.00 | 141 | 0 | 0 | 0 | 0 |
| src/shared/vaultToken.ts | 100.00 | 100.00 | 69 | 0 | 0 | 0 | 0 |
| src/shared/versionOrder.ts | 100.00 | 100.00 | 16 | 0 | 0 | 3 | 0 |
| src/shared/watchlistState.ts | 100.00 | 100.00 | 95 | 0 | 0 | 3 | 0 |
| src/shared/waterCyclePlanner.ts | 100.00 | 100.00 | 165 | 0 | 0 | 1 | 0 |
| src/shared/welfareDocs.ts | 100.00 | 100.00 | 61 | 0 | 0 | 5 | 0 |
| src/shared/welfareScheme.ts | 100.00 | 100.00 | 141 | 0 | 0 | 6 | 0 |
| src/shared/writeFieldLimits.ts | 100.00 | 100.00 | 274 | 0 | 0 | 92 | 0 |
| src/shared/zoningPlanner.ts | 100.00 | 100.00 | 190 | 0 | 0 | 1 | 0 |

## How to drill down

```bash
# 全件 (`mutate` の全ファイル)。この頁はこの報告からしか作らない。
# 所要は時間単位 —— 実測は週次の mutation.yml の実行履歴と docs/QUALITY_WORKFLOW.md が持つ
npm run mutate

# 触ったファイルだけ (変更したファイル ∩ mutate)。部分の報告なので、この頁の再生成には使えない
npm run audit:mutate-changed

# 1 ファイルだけ (同じく部分の報告)
npx stryker run --mutate src/shared/example.ts

# 生存を影響の大きい順に
npm run mutate:triage
npm run mutate:triage -- --file=src/main/clients/security.ts

# 「生存」が本当に生存かを原文へ当て直して確かめる (広いファイルは --top で絞る)
npm run audit:survivors -- src/shared/example.ts --top=10

# 被覆の HTML (この頁の被覆は src/main/** に絞っている)
npx vitest run src/main --coverage --coverage.include=src/main/** --coverage.reporter=html
open coverage/index.html
```

詳しい運用ルールは `docs/QUALITY_WORKFLOW.md` を参照。
