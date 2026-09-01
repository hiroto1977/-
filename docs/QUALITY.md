# Quality dashboard

最終更新: 2026-09-01 03:05:07

> 自動生成: `npm run quality:report`。コミット前に再生成して差分をレビューに含めるのが推奨。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型チェック | ✅ pass |
| ユニットテスト | 11578 passing (412 files) |
| Coverage — lines | 98.98% |
| Coverage — statements | 98.38% |
| Coverage — branches | 96.50% |
| Coverage — functions | 95.13% |
| Mutation score (total / covered) | 100.00% / 100.00% |
| Mutants killed | 27282 |
| Mutants survived | 0 |
| Mutants 有効 (分母) | 27282 |
| Mutants ignored (Stryker disable 宣言) | 8071 |
| Mutants invalid (評価不成立) | 6 |


## Mutation testing (Stryker)

_Report age: 0.2h._

**Overall: 100.00% total / 100.00% covered** (27282 killed / 0 survived / 0 no-cov / 27282 valid)

分母から外れたもの: `Ignored` 8071 (`Stryker disable` で測らないと宣言した分 — 範囲は `npm run lint:mutation-scope` が台帳で押さえている) / `RuntimeError`+`CompileError` 6 (**評価が成立しなかった分。0 でないなら盲点**: `src/renderer/data/cloudBackup.ts` 3, `src/renderer/hooks/useServiceData.ts` 1, `src/shared/depreciation.ts` 2)

| file | score | covered | killed | survived | no-cov | ignored | invalid |
|------|------:|--------:|-------:|---------:|-------:|--------:|--------:|
| src/main/atomicWrite.ts | 100.00 | 100.00 | 23 | 0 | 0 | 11 | 0 |
| src/main/clients/atlassian.ts | 100.00 | 100.00 | 118 | 0 | 0 | 7 | 0 |
| src/main/clients/base.ts | 100.00 | 100.00 | 15 | 0 | 0 | 0 | 0 |
| src/main/clients/business.ts | 100.00 | 100.00 | 329 | 0 | 0 | 287 | 0 |
| src/main/clients/calendar.ts | 100.00 | 100.00 | 60 | 0 | 0 | 1 | 0 |
| src/main/clients/canva.ts | 100.00 | 100.00 | 59 | 0 | 0 | 2 | 0 |
| src/main/clients/cloudflare.ts | 100.00 | 100.00 | 115 | 0 | 0 | 2 | 0 |
| src/main/clients/cursor.ts | 100.00 | 100.00 | 4 | 0 | 0 | 0 | 0 |
| src/main/clients/demae-can.ts | 100.00 | 100.00 | 5 | 0 | 0 | 51 | 0 |
| src/main/clients/devEnv.ts | 100.00 | 100.00 | 214 | 0 | 0 | 17 | 0 |
| src/main/clients/drive.ts | 100.00 | 100.00 | 38 | 0 | 0 | 1 | 0 |
| src/main/clients/emotions.ts | 100.00 | 100.00 | 206 | 0 | 0 | 2 | 0 |
| src/main/clients/exportPaths.ts | 100.00 | 100.00 | 67 | 0 | 0 | 3 | 0 |
| src/main/clients/freee.ts | 100.00 | 100.00 | 48 | 0 | 0 | 2 | 0 |
| src/main/clients/funding.ts | 100.00 | 100.00 | 30 | 0 | 0 | 110 | 0 |
| src/main/clients/github.ts | 100.00 | 100.00 | 66 | 0 | 0 | 5 | 0 |
| src/main/clients/gmail.ts | 100.00 | 100.00 | 82 | 0 | 0 | 7 | 0 |
| src/main/clients/home.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/kpi.ts | 100.00 | 100.00 | 158 | 0 | 0 | 42 | 0 |
| src/main/clients/library.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/linux.ts | 100.00 | 100.00 | 69 | 0 | 0 | 20 | 0 |
| src/main/clients/microsoft-365.ts | 100.00 | 100.00 | 129 | 0 | 0 | 4 | 0 |
| src/main/clients/mutual-funds.ts | 100.00 | 100.00 | 5 | 0 | 0 | 52 | 0 |
| src/main/clients/notion.ts | 100.00 | 100.00 | 78 | 0 | 0 | 1 | 0 |
| src/main/clients/ollama.ts | 100.00 | 100.00 | 110 | 0 | 0 | 47 | 0 |
| src/main/clients/quality.ts | 100.00 | 100.00 | 1 | 0 | 0 | 8 | 0 |
| src/main/clients/real-estate.ts | 100.00 | 100.00 | 5 | 0 | 0 | 51 | 0 |
| src/main/clients/security.ts | 100.00 | 100.00 | 132 | 0 | 0 | 23 | 0 |
| src/main/clients/settings.ts | 100.00 | 100.00 | 4 | 0 | 0 | 2 | 0 |
| src/main/clients/shigyo.ts | 100.00 | 100.00 | 1 | 0 | 0 | 5 | 0 |
| src/main/clients/shopify.ts | 100.00 | 100.00 | 266 | 0 | 0 | 60 | 0 |
| src/main/clients/skills.ts | 100.00 | 100.00 | 136 | 0 | 0 | 47 | 0 |
| src/main/clients/slack.ts | 100.00 | 100.00 | 67 | 0 | 0 | 1 | 0 |
| src/main/clients/snapshotStub.ts | 100.00 | 100.00 | 1 | 0 | 0 | 1 | 0 |
| src/main/clients/stocks.ts | 100.00 | 100.00 | 743 | 0 | 0 | 688 | 0 |
| src/main/clients/storage.ts | 100.00 | 100.00 | 1 | 0 | 0 | 7 | 0 |
| src/main/clients/teamradar.ts | 100.00 | 100.00 | 292 | 0 | 0 | 150 | 0 |
| src/main/clients/templates.ts | 100.00 | 100.00 | 228 | 0 | 0 | 83 | 0 |
| src/main/clients/types.ts | 100.00 | 100.00 | 47 | 0 | 0 | 0 | 0 |
| src/main/clients/uber-eats.ts | 100.00 | 100.00 | 5 | 0 | 0 | 50 | 0 |
| src/main/clients/wordpress.ts | 100.00 | 100.00 | 66 | 0 | 0 | 1 | 0 |
| src/main/clients/youtube.ts | 100.00 | 100.00 | 67 | 0 | 0 | 4 | 0 |
| src/main/main.ts | 100.00 | 100.00 | 342 | 0 | 0 | 1 | 0 |
| src/main/oauth.ts | 100.00 | 100.00 | 388 | 0 | 0 | 26 | 0 |
| src/main/secrets.ts | 100.00 | 100.00 | 184 | 0 | 0 | 7 | 0 |
| src/main/shellOpenGate.ts | 100.00 | 100.00 | 31 | 0 | 0 | 0 | 0 |
| src/preload/preload.ts | 100.00 | 100.00 | 28 | 0 | 0 | 0 | 0 |
| src/renderer/components/serviceActionMachine.ts | 100.00 | 100.00 | 51 | 0 | 0 | 11 | 0 |
| src/renderer/components/serviceActionUtils.ts | 100.00 | 100.00 | 71 | 0 | 0 | 0 | 0 |
| src/renderer/data/accounting.ts | 100.00 | 100.00 | 26 | 0 | 0 | 2 | 0 |
| src/renderer/data/actionOutcome.ts | 100.00 | 100.00 | 27 | 0 | 0 | 0 | 0 |
| src/renderer/data/assistantMarkdown.ts | 100.00 | 100.00 | 172 | 0 | 0 | 30 | 0 |
| src/renderer/data/backup.ts | 100.00 | 100.00 | 80 | 0 | 0 | 6 | 0 |
| src/renderer/data/backupPosture.ts | 100.00 | 100.00 | 23 | 0 | 0 | 0 | 0 |
| src/renderer/data/balanceSheet.ts | 100.00 | 100.00 | 156 | 0 | 0 | 2 | 0 |
| src/renderer/data/budgetVariance.ts | 100.00 | 100.00 | 130 | 0 | 0 | 10 | 0 |
| src/renderer/data/businessAxonometric.ts | 100.00 | 100.00 | 95 | 0 | 0 | 125 | 0 |
| src/renderer/data/businessFinancials.ts | 100.00 | 100.00 | 38 | 0 | 0 | 4 | 0 |
| src/renderer/data/businessTriage.ts | 100.00 | 100.00 | 28 | 0 | 0 | 353 | 0 |
| src/renderer/data/businessUnits.ts | 100.00 | 100.00 | 187 | 0 | 0 | 16 | 0 |
| src/renderer/data/cashflowDebtService.ts | 100.00 | 100.00 | 38 | 0 | 0 | 7 | 0 |
| src/renderer/data/cashForecast.ts | 100.00 | 100.00 | 200 | 0 | 0 | 18 | 0 |
| src/renderer/data/cashPlan.ts | 100.00 | 100.00 | 115 | 0 | 0 | 30 | 0 |
| src/renderer/data/charts.ts | 100.00 | 100.00 | 248 | 0 | 0 | 6 | 0 |
| src/renderer/data/chatbot.ts | 100.00 | 100.00 | 115 | 0 | 0 | 123 | 0 |
| src/renderer/data/chatCalc.ts | 100.00 | 100.00 | 71 | 0 | 0 | 17 | 0 |
| src/renderer/data/chatOrg.ts | 100.00 | 100.00 | 159 | 0 | 0 | 3 | 0 |
| src/renderer/data/cloudBackup.ts | 100.00 | 100.00 | 197 | 0 | 0 | 27 | 3 |
| src/renderer/data/cloudSync.ts | 100.00 | 100.00 | 154 | 0 | 0 | 15 | 0 |
| src/renderer/data/complianceResearch.ts | 100.00 | 100.00 | 20 | 0 | 0 | 0 | 0 |
| src/renderer/data/connectionStatus.ts | 100.00 | 100.00 | 23 | 0 | 0 | 0 | 0 |
| src/renderer/data/connectorExecution.ts | 100.00 | 100.00 | 51 | 0 | 0 | 1 | 0 |
| src/renderer/data/consolidation.ts | 100.00 | 100.00 | 15 | 0 | 0 | 0 | 0 |
| src/renderer/data/counseling.ts | 100.00 | 100.00 | 120 | 0 | 0 | 114 | 0 |
| src/renderer/data/counselingResearch.ts | 100.00 | 100.00 | 52 | 0 | 0 | 97 | 0 |
| src/renderer/data/crisisDeliberation.ts | 100.00 | 100.00 | 73 | 0 | 0 | 103 | 0 |
| src/renderer/data/csv.ts | 100.00 | 100.00 | 139 | 0 | 0 | 9 | 0 |
| src/renderer/data/dbPosture.ts | 100.00 | 100.00 | 14 | 0 | 0 | 0 | 0 |
| src/renderer/data/docLegalStatus.ts | 100.00 | 100.00 | 8 | 0 | 0 | 198 | 0 |
| src/renderer/data/docStudioChecks.ts | 100.00 | 100.00 | 1029 | 0 | 0 | 14 | 0 |
| src/renderer/data/docStudioTeikan.ts | 100.00 | 100.00 | 356 | 0 | 0 | 8 | 0 |
| src/renderer/data/eligibility.ts | 100.00 | 100.00 | 160 | 0 | 0 | 92 | 0 |
| src/renderer/data/emotionInsights.ts | 100.00 | 100.00 | 101 | 0 | 0 | 10 | 0 |
| src/renderer/data/emotionsWeb.ts | 100.00 | 100.00 | 165 | 0 | 0 | 15 | 0 |
| src/renderer/data/financialCsv.ts | 100.00 | 100.00 | 27 | 0 | 0 | 52 | 0 |
| src/renderer/data/financialDiagnosis.ts | 100.00 | 100.00 | 84 | 0 | 0 | 33 | 0 |
| src/renderer/data/financialRatios.ts | 100.00 | 100.00 | 125 | 0 | 0 | 5 | 0 |
| src/renderer/data/financialReport.ts | 100.00 | 100.00 | 92 | 0 | 0 | 77 | 0 |
| src/renderer/data/financialStatements.ts | 100.00 | 100.00 | 378 | 0 | 0 | 2 | 0 |
| src/renderer/data/financialTrend.ts | 100.00 | 100.00 | 37 | 0 | 0 | 1 | 0 |
| src/renderer/data/foodDelivery.ts | 100.00 | 100.00 | 27 | 0 | 0 | 2 | 0 |
| src/renderer/data/highlightSettings.ts | 100.00 | 100.00 | 53 | 0 | 0 | 1 | 0 |
| src/renderer/data/hydroponicsSetup.ts | 100.00 | 100.00 | 47 | 0 | 0 | 7 | 0 |
| src/renderer/data/industryPresets.ts | 100.00 | 100.00 | 6 | 0 | 0 | 25 | 0 |
| src/renderer/data/inputGuards.ts | 100.00 | 100.00 | 141 | 0 | 0 | 51 | 0 |
| src/renderer/data/investments.ts | 100.00 | 100.00 | 289 | 0 | 0 | 57 | 0 |
| src/renderer/data/kpiActuals.ts | 100.00 | 100.00 | 281 | 0 | 0 | 22 | 0 |
| src/renderer/data/kpiActualsCsv.ts | 100.00 | 100.00 | 11 | 0 | 0 | 1 | 0 |
| src/renderer/data/managementHighlights.ts | 100.00 | 100.00 | 310 | 0 | 0 | 19 | 0 |
| src/renderer/data/managementReport.ts | 100.00 | 100.00 | 139 | 0 | 0 | 13 | 0 |
| src/renderer/data/manualData.ts | 100.00 | 100.00 | 45 | 0 | 0 | 135 | 0 |
| src/renderer/data/memberCare.ts | 100.00 | 100.00 | 137 | 0 | 0 | 6 | 0 |
| src/renderer/data/members.ts | 100.00 | 100.00 | 131 | 0 | 0 | 10 | 0 |
| src/renderer/data/overview.ts | 100.00 | 100.00 | 89 | 0 | 0 | 0 | 0 |
| src/renderer/data/overviewOverrides.ts | 100.00 | 100.00 | 204 | 0 | 0 | 316 | 0 |
| src/renderer/data/profitSensitivity.ts | 100.00 | 100.00 | 92 | 0 | 0 | 0 | 0 |
| src/renderer/data/recordCipher.ts | 100.00 | 100.00 | 24 | 0 | 0 | 1 | 0 |
| src/renderer/data/recordEncryption.ts | 100.00 | 100.00 | 71 | 0 | 0 | 4 | 0 |
| src/renderer/data/revenueConcentration.ts | 100.00 | 100.00 | 162 | 0 | 0 | 2 | 0 |
| src/renderer/data/saasWriteWeb.ts | 100.00 | 100.00 | 260 | 0 | 0 | 433 | 0 |
| src/renderer/data/sales.ts | 100.00 | 100.00 | 125 | 0 | 0 | 19 | 0 |
| src/renderer/data/salesAnalytics.ts | 100.00 | 100.00 | 186 | 0 | 0 | 19 | 0 |
| src/renderer/data/salesCsv.ts | 100.00 | 100.00 | 15 | 0 | 0 | 1 | 0 |
| src/renderer/data/salesKpiBridge.ts | 100.00 | 100.00 | 17 | 0 | 0 | 2 | 0 |
| src/renderer/data/selfCareLibrary.ts | 100.00 | 100.00 | 2 | 0 | 0 | 89 | 0 |
| src/renderer/data/shareholders.ts | 100.00 | 100.00 | 102 | 0 | 0 | 5 | 0 |
| src/renderer/data/shigyoDirectory.ts | 100.00 | 100.00 | 123 | 0 | 0 | 12 | 0 |
| src/renderer/data/shopifyImport.ts | 100.00 | 100.00 | 21 | 0 | 0 | 0 | 0 |
| src/renderer/data/sourceVerification.ts | 100.00 | 100.00 | 28 | 0 | 0 | 5 | 0 |
| src/renderer/data/sparkline.ts | 100.00 | 100.00 | 53 | 0 | 0 | 0 | 0 |
| src/renderer/data/statementAccounts.ts | 100.00 | 100.00 | 344 | 0 | 0 | 278 | 0 |
| src/renderer/data/statementEquity.ts | 100.00 | 100.00 | 165 | 0 | 0 | 1 | 0 |
| src/renderer/data/stocksAnalysisWeb.ts | 100.00 | 100.00 | 825 | 0 | 0 | 113 | 0 |
| src/renderer/data/stocksWatchlistWeb.ts | 100.00 | 100.00 | 141 | 0 | 0 | 8 | 0 |
| src/renderer/data/store.ts | 100.00 | 100.00 | 261 | 0 | 0 | 42 | 0 |
| src/renderer/data/teamEmotionRadar.ts | 100.00 | 100.00 | 75 | 0 | 0 | 0 | 0 |
| src/renderer/data/trendAlerts.ts | 100.00 | 100.00 | 42 | 0 | 0 | 2 | 0 |
| src/renderer/data/useCollection.ts | 100.00 | 100.00 | 32 | 0 | 0 | 9 | 0 |
| src/renderer/data/villageLayout.ts | 100.00 | 100.00 | 173 | 0 | 0 | 17 | 0 |
| src/renderer/data/voiceCommand.ts | 100.00 | 100.00 | 263 | 0 | 0 | 563 | 0 |
| src/renderer/data/voiceSession.ts | 100.00 | 100.00 | 123 | 0 | 0 | 3 | 0 |
| src/renderer/data/workingCapital.ts | 100.00 | 100.00 | 24 | 0 | 0 | 6 | 0 |
| src/renderer/fs/fsa.ts | 100.00 | 100.00 | 80 | 0 | 0 | 26 | 0 |
| src/renderer/hashRoute.ts | 100.00 | 100.00 | 7 | 0 | 0 | 0 | 0 |
| src/renderer/hooks/useServiceData.ts | 100.00 | 100.00 | 64 | 0 | 0 | 7 | 1 |
| src/renderer/library/library.ts | 100.00 | 100.00 | 122 | 0 | 0 | 59 | 0 |
| src/renderer/library/preview.ts | 100.00 | 100.00 | 55 | 0 | 0 | 5 | 0 |
| src/renderer/network/liveRead.ts | 100.00 | 100.00 | 41 | 0 | 0 | 0 | 0 |
| src/renderer/network/ollamaWeb.ts | 100.00 | 100.00 | 434 | 0 | 0 | 8 | 0 |
| src/renderer/network/proxy.ts | 100.00 | 100.00 | 358 | 0 | 0 | 128 | 0 |
| src/renderer/oauth/pkce.ts | 100.00 | 100.00 | 162 | 0 | 0 | 8 | 0 |
| src/renderer/oauth/pkceSession.ts | 100.00 | 100.00 | 9 | 0 | 0 | 2 | 0 |
| src/renderer/plan/internalLicense.ts | 100.00 | 100.00 | 64 | 0 | 0 | 15 | 0 |
| src/renderer/recents.ts | 100.00 | 100.00 | 18 | 0 | 0 | 0 | 0 |
| src/renderer/security/autoLock.ts | 100.00 | 100.00 | 52 | 0 | 0 | 41 | 0 |
| src/renderer/security/dataCrypto.ts | 100.00 | 100.00 | 145 | 0 | 0 | 2 | 0 |
| src/renderer/security/frameGuard.ts | 100.00 | 100.00 | 22 | 0 | 0 | 6 | 0 |
| src/renderer/security/lockWorkspace.ts | 100.00 | 100.00 | 4 | 0 | 0 | 0 | 0 |
| src/renderer/security/mnemonic.ts | 100.00 | 100.00 | 80 | 0 | 0 | 10 | 0 |
| src/renderer/security/vault.ts | 100.00 | 100.00 | 408 | 0 | 0 | 96 | 0 |
| src/renderer/security/webauthn.ts | 100.00 | 100.00 | 53 | 0 | 0 | 8 | 0 |
| src/renderer/sidebarFilter.ts | 100.00 | 100.00 | 46 | 0 | 0 | 0 | 0 |
| src/renderer/voice/speechAdapter.ts | 100.00 | 100.00 | 49 | 0 | 0 | 0 | 0 |
| src/renderer/web-templates.ts | 100.00 | 100.00 | 258 | 0 | 0 | 1 | 0 |
| src/shared/ai/chat.ts | 100.00 | 100.00 | 44 | 0 | 0 | 0 | 0 |
| src/shared/ai/credentials.ts | 100.00 | 100.00 | 157 | 0 | 0 | 0 | 0 |
| src/shared/ai/providers.ts | 100.00 | 100.00 | 246 | 0 | 0 | 22 | 0 |
| src/shared/aiEndpoint.ts | 100.00 | 100.00 | 172 | 0 | 0 | 0 | 0 |
| src/shared/api/atlassian.ts | 100.00 | 100.00 | 49 | 0 | 0 | 5 | 0 |
| src/shared/api/canva.ts | 100.00 | 100.00 | 52 | 0 | 0 | 1 | 0 |
| src/shared/api/cursor.ts | 100.00 | 100.00 | 105 | 0 | 0 | 0 | 0 |
| src/shared/api/github.ts | 100.00 | 100.00 | 43 | 0 | 0 | 1 | 0 |
| src/shared/api/google.ts | 100.00 | 100.00 | 77 | 0 | 0 | 4 | 0 |
| src/shared/api/http.ts | 100.00 | 100.00 | 45 | 0 | 0 | 0 | 0 |
| src/shared/api/notion.ts | 100.00 | 100.00 | 34 | 0 | 0 | 2 | 0 |
| src/shared/api/slack.ts | 100.00 | 100.00 | 53 | 0 | 0 | 1 | 0 |
| src/shared/api/types.ts | 100.00 | 100.00 | 3 | 0 | 0 | 0 | 0 |
| src/shared/api/wordpress.ts | 100.00 | 100.00 | 37 | 0 | 0 | 1 | 0 |
| src/shared/atlassianSite.ts | 100.00 | 100.00 | 29 | 0 | 0 | 0 | 0 |
| src/shared/buildingIso.ts | 100.00 | 100.00 | 148 | 0 | 0 | 1 | 0 |
| src/shared/connectors/connectorCatalog.ts | 100.00 | 100.00 | 17 | 0 | 0 | 176 | 0 |
| src/shared/connectors/connectorHealth.ts | 100.00 | 100.00 | 31 | 0 | 0 | 0 | 0 |
| src/shared/connectors/connectorRegistry.ts | 100.00 | 100.00 | 191 | 0 | 0 | 3 | 0 |
| src/shared/connectors/pluginRuntime.ts | 100.00 | 100.00 | 39 | 0 | 0 | 5 | 0 |
| src/shared/controlChars.ts | 100.00 | 100.00 | 12 | 0 | 0 | 0 | 0 |
| src/shared/credentialUse.ts | 100.00 | 100.00 | 14 | 0 | 0 | 76 | 0 |
| src/shared/cryptoParams.ts | 100.00 | 100.00 | 8 | 0 | 0 | 0 | 0 |
| src/shared/dataOrigin.ts | 100.00 | 100.00 | 48 | 0 | 0 | 76 | 0 |
| src/shared/dbSecurityPosture.ts | 100.00 | 100.00 | 71 | 0 | 0 | 49 | 0 |
| src/shared/depreciation.ts | 100.00 | 100.00 | 262 | 0 | 0 | 26 | 2 |
| src/shared/employerBenefits.ts | 100.00 | 100.00 | 264 | 0 | 0 | 4 | 0 |
| src/shared/escape.ts | 100.00 | 100.00 | 35 | 0 | 0 | 0 | 0 |
| src/shared/externalUrlGate.ts | 100.00 | 100.00 | 22 | 0 | 0 | 0 | 0 |
| src/shared/formatters.ts | 100.00 | 100.00 | 3 | 0 | 0 | 0 | 0 |
| src/shared/funding.ts | 100.00 | 100.00 | 518 | 0 | 0 | 45 | 0 |
| src/shared/fxCurrency.ts | 100.00 | 100.00 | 100 | 0 | 0 | 4 | 0 |
| src/shared/httpLimits.ts | 100.00 | 100.00 | 60 | 0 | 0 | 21 | 0 |
| src/shared/hydroponics.ts | 100.00 | 100.00 | 126 | 0 | 0 | 17 | 0 |
| src/shared/imageUrlGate.ts | 100.00 | 100.00 | 25 | 0 | 0 | 0 | 0 |
| src/shared/invoiceTax.ts | 100.00 | 100.00 | 96 | 0 | 0 | 41 | 0 |
| src/shared/issueLevel.ts | 100.00 | 100.00 | 5 | 0 | 0 | 1 | 0 |
| src/shared/managementScorecard.ts | 100.00 | 100.00 | 275 | 0 | 0 | 8 | 0 |
| src/shared/mutualFundsMetrics.ts | 100.00 | 100.00 | 138 | 0 | 0 | 4 | 0 |
| src/shared/num.ts | 100.00 | 100.00 | 22 | 0 | 0 | 0 | 0 |
| src/shared/ollama.ts | 100.00 | 100.00 | 395 | 0 | 0 | 43 | 0 |
| src/shared/passwordStrength.ts | 100.00 | 100.00 | 119 | 0 | 0 | 0 | 0 |
| src/shared/payroll.ts | 100.00 | 100.00 | 134 | 0 | 0 | 34 | 0 |
| src/shared/plan.ts | 100.00 | 100.00 | 31 | 0 | 0 | 61 | 0 |
| src/shared/proxyEndpoint.ts | 100.00 | 100.00 | 142 | 0 | 0 | 0 | 0 |
| src/shared/realEstateMetrics.ts | 100.00 | 100.00 | 154 | 0 | 0 | 6 | 0 |
| src/shared/redact.ts | 100.00 | 100.00 | 67 | 0 | 0 | 0 | 0 |
| src/shared/safeFilename.ts | 100.00 | 100.00 | 34 | 0 | 0 | 0 | 0 |
| src/shared/savingsPlanning.ts | 100.00 | 100.00 | 148 | 0 | 0 | 16 | 0 |
| src/shared/scanTarget.ts | 100.00 | 100.00 | 218 | 0 | 0 | 0 | 0 |
| src/shared/securityRange.ts | 100.00 | 100.00 | 119 | 0 | 0 | 166 | 0 |
| src/shared/seededNoise.ts | 100.00 | 100.00 | 5 | 0 | 0 | 0 | 0 |
| src/shared/serviceId.ts | 100.00 | 100.00 | 4 | 0 | 0 | 3 | 0 |
| src/shared/shigyoTypes.ts | 100.00 | 100.00 | 6 | 0 | 0 | 0 | 0 |
| src/shared/talent.ts | 100.00 | 100.00 | 307 | 0 | 0 | 40 | 0 |
| src/shared/taxAutomobile.ts | 100.00 | 100.00 | 75 | 0 | 0 | 18 | 0 |
| src/shared/taxBusinessOffice.ts | 100.00 | 100.00 | 28 | 0 | 0 | 0 | 0 |
| src/shared/taxCalc.ts | 100.00 | 100.00 | 477 | 0 | 0 | 75 | 0 |
| src/shared/taxCapitalGains.ts | 100.00 | 100.00 | 8 | 0 | 0 | 133 | 0 |
| src/shared/taxCasual.ts | 100.00 | 100.00 | 52 | 0 | 0 | 0 | 0 |
| src/shared/taxConsumption.ts | 0.00 | 0.00 | 0 | 0 | 0 | 2 | 0 |
| src/shared/taxConsumptionBusiness.ts | 100.00 | 100.00 | 116 | 0 | 0 | 2 | 0 |
| src/shared/taxConsumptionSchedule.ts | 100.00 | 100.00 | 252 | 0 | 0 | 12 | 0 |
| src/shared/taxCorporate.ts | 100.00 | 100.00 | 128 | 0 | 0 | 17 | 0 |
| src/shared/taxCredits.ts | 100.00 | 100.00 | 131 | 0 | 0 | 14 | 0 |
| src/shared/taxDeductions.ts | 100.00 | 100.00 | 119 | 0 | 0 | 282 | 0 |
| src/shared/taxDividend.ts | 100.00 | 100.00 | 45 | 0 | 0 | 2 | 0 |
| src/shared/taxFixedAsset.ts | 100.00 | 100.00 | 96 | 0 | 0 | 0 | 0 |
| src/shared/taxFurusato.ts | 100.00 | 100.00 | 57 | 0 | 0 | 6 | 0 |
| src/shared/taxGift.ts | 100.00 | 100.00 | 40 | 0 | 0 | 26 | 0 |
| src/shared/taxIndividualBusiness.ts | 100.00 | 100.00 | 33 | 0 | 0 | 10 | 0 |
| src/shared/taxInheritance.ts | 100.00 | 100.00 | 61 | 0 | 0 | 16 | 0 |
| src/shared/taxNationalHealthInsurance.ts | 100.00 | 100.00 | 83 | 0 | 0 | 4 | 0 |
| src/shared/taxNationalPension.ts | 100.00 | 100.00 | 23 | 0 | 0 | 1 | 0 |
| src/shared/taxPublicPension.ts | 100.00 | 100.00 | 55 | 0 | 0 | 11 | 0 |
| src/shared/taxRealEstateAcquisition.ts | 100.00 | 100.00 | 54 | 0 | 0 | 4 | 0 |
| src/shared/taxRealEstateTransactionCost.ts | 100.00 | 100.00 | 35 | 0 | 0 | 0 | 0 |
| src/shared/taxRegistrationLicense.ts | 100.00 | 100.00 | 33 | 0 | 0 | 11 | 0 |
| src/shared/taxRetirement.ts | 100.00 | 100.00 | 57 | 0 | 0 | 18 | 0 |
| src/shared/taxSocialInsurance.ts | 100.00 | 100.00 | 70 | 0 | 0 | 85 | 0 |
| src/shared/taxStampDuty.ts | 100.00 | 100.00 | 54 | 0 | 0 | 34 | 0 |
| src/shared/team.ts | 100.00 | 100.00 | 34 | 0 | 0 | 29 | 0 |
| src/shared/textWrap.ts | 100.00 | 100.00 | 12 | 0 | 0 | 0 | 0 |
| src/shared/tokenInput.ts | 100.00 | 100.00 | 34 | 0 | 0 | 0 | 0 |
| src/shared/tradeTax.ts | 100.00 | 100.00 | 118 | 0 | 0 | 34 | 0 |
| src/shared/updateCheck.ts | 100.00 | 100.00 | 145 | 0 | 0 | 0 | 0 |
| src/shared/vaultToken.ts | 100.00 | 100.00 | 29 | 0 | 0 | 0 | 0 |
| src/shared/waterCyclePlanner.ts | 100.00 | 100.00 | 151 | 0 | 0 | 0 | 0 |
| src/shared/welfareDocs.ts | 100.00 | 100.00 | 39 | 0 | 0 | 6 | 0 |
| src/shared/welfareScheme.ts | 100.00 | 100.00 | 105 | 0 | 0 | 6 | 0 |
| src/shared/zoningPlanner.ts | 100.00 | 100.00 | 163 | 0 | 0 | 0 | 0 |


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
