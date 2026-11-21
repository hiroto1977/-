'use strict';
// threat: T-088 —— 「データだけのモジュール」であることを、実行する前に構文木で確かめる。
//
// vite.config.ts の `academicJsonParse` は、ビルドのたびに `academicKnowledge.ts` (~8.8 MB の学術コーパス) を
// esbuild で CJS にして `vm.runInNewContext` で**実行**し、`VERIFIED_CONCEPTS` を JSON に畳む。
// `vm` は隔離ではない: コンテキストへ渡したホストのオブジェクト (`exports`) の
// `constructor.constructor('return process')()` で外へ出られ、`process.env` (release.yml の Build は署名鍵 4 本と
// 公開用の権限を env に持つ) とファイルへの書き込みに届く (2026-10-16 実測)。
// そのファイルは整合性チェーンにも CODEOWNERS にも無く (更新が頻繁で「安定資産」ではない)、8.8 MB の差分は
// 人の目では読まれない —— 末尾に 1 行足すだけで署名鍵を持つジョブ内の任意コードになる。
//
// 直しは「実行しない」ではなく「**実行してよい形だけを通す**」: 型宣言と、リテラル (配列・オブジェクト・
// 文字列・数・真偽・null) だけで組んだ `export const <name> = [...]` の 1 文以外は拒む。
// 通らなければビルドを落とす (黙って実行しない・黙って通常のリテラルへ倒さない)。
const ts = require('typescript');

const KIND = ts.SyntaxKind;

function isStringConcat(n) {
  if (n.kind === KIND.StringLiteral || n.kind === KIND.NoSubstitutionTemplateLiteral) return true;
  return n.kind === KIND.BinaryExpression && n.operatorToken.kind === KIND.PlusToken && isStringConcat(n.left) && isStringConcat(n.right);
}

/** @returns {string | null} 拒む理由 (通れば null) */
function findImpure(sf, node) {
  const where = () => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${line + 1}:${character + 1}`;
  };
  switch (node.kind) {
    case KIND.StringLiteral:
    case KIND.NoSubstitutionTemplateLiteral:
    case KIND.NumericLiteral:
    case KIND.TrueKeyword:
    case KIND.FalseKeyword:
    case KIND.NullKeyword:
      return null;
    case KIND.BinaryExpression:
      // 長い本文を行で折る `'…' + '…'` だけ (両辺が文字列リテラルか、その連結)。
      return node.operatorToken.kind === KIND.PlusToken && isStringConcat(node)
        ? null
        : `${where()} 文字列リテラルの連結でない二項演算`;
    case KIND.PrefixUnaryExpression:
      return node.operator === KIND.MinusToken && node.operand.kind === KIND.NumericLiteral
        ? null
        : `${where()} リテラルでない前置演算子`;
    case KIND.ArrayLiteralExpression:
      for (const el of node.elements) {
        const r = findImpure(sf, el);
        if (r) return r;
      }
      return null;
    case KIND.ObjectLiteralExpression:
      for (const p of node.properties) {
        if (p.kind !== KIND.PropertyAssignment) return `${ts.SyntaxKind[p.kind]} は通さない (${where()})`;
        const n = p.name;
        if (n.kind !== KIND.Identifier && n.kind !== KIND.StringLiteral && n.kind !== KIND.NumericLiteral) {
          return `${where()} 計算された鍵`;
        }
        if (n.text === '__proto__') return `${where()} __proto__ の鍵`;
        const r = findImpure(sf, p.initializer);
        if (r) return r;
      }
      return null;
    default:
      return `${ts.SyntaxKind[node.kind]} は通さない (${where()})`;
  }
}

/**
 * `code` が「型宣言 + `export const <exportName> = <リテラルだけ>` の 1 文」だけで書かれていることを確かめる。
 * 通らなければ投げる (呼ぶ側は実行の前に呼び、投げたらビルドを落とす)。
 */
function assertPureDataModule(code, { exportName, label = 'module' }) {
  const sf = ts.createSourceFile(label, code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diags = sf.parseDiagnostics;
  if (Array.isArray(diags) && diags.length > 0) {
    throw new Error(`${label}: 構文エラーがあるため実行しない (${diags.length} 件)`);
  }
  let found = 0;
  for (const st of sf.statements) {
    if (st.kind === KIND.InterfaceDeclaration || st.kind === KIND.TypeAliasDeclaration || st.kind === KIND.EmptyStatement) {
      continue;
    }
    if (st.kind === KIND.VariableStatement) {
      const exported = (st.modifiers ?? []).some((m) => m.kind === KIND.ExportKeyword);
      const onlyExport = (st.modifiers ?? []).every((m) => m.kind === KIND.ExportKeyword);
      const decls = st.declarationList.declarations;
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (exported && onlyExport && isConst && decls.length === 1 && decls[0].name.kind === KIND.Identifier && decls[0].name.text === exportName && decls[0].initializer) {
        const r = findImpure(sf, decls[0].initializer);
        if (r) throw new Error(`${label}: 実行してよい「データだけ」の形ではない — ${r}`);
        found++;
        continue;
      }
    }
    const { line } = sf.getLineAndCharacterOfPosition(st.getStart(sf));
    throw new Error(`${label}: 型宣言と export const ${exportName} = <リテラル> の 1 文以外は通さない (${line + 1} 行目: ${ts.SyntaxKind[st.kind]})`);
  }
  if (found !== 1) throw new Error(`${label}: export const ${exportName} が ${found} 個 (ちょうど 1 個が要る)`);
}

module.exports = { assertPureDataModule };
