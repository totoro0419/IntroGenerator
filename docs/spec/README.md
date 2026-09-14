# IntroGenerator 実装契約 1.3 + Authoring 1.4 Easing Stack差分

Web Editorの編集モデルを非破壊で保持し、共通sb3をScratch標準機能と独立Webエンジンで再生するための設計・検証資料です。

基本契約は1.3です。ただし **PDF-F09 Easingについては `EASING_STACK_SPEC_v1.4.md` が1.4の正式差分として1.3記述を上書きします。** Easing Stackは複数EasingのLinearとの差分を加算合成し、開始値・終了値を維持します。再生ABIはIGRT/1.1のままです。

現在の製品コードと `schemas/authoring.schema.json` はまだIGAUTHOR/1.3実装です。1.4差分を設計Source of Truthとして先に確定し、次の実装工程でSchema・Editor・Evaluator・Compilerへ同時に反映します。Schemaだけ先行して未実装形式を受理する状態にはしません。

## Source of Truthの優先順位

1. `EASING_STACK_SPEC_v1.4.md` — PDF-F09 / Easingに限る1.4正式差分
2. `FUNCTIONAL_SPECIFICATION.md` — その他のユーザー機能仕様
3. `IntroGenerator_Runtime_Compiler_v1.md` — Runtime/Compiler意味仕様
4. `PDF_FUNCTIONAL_BASELINE.md` — PDF由来の最低機能
5. machine-readable contracts / schemas

Easingに関して1.3文書と1.4差分が衝突する場合は、1.4差分を優先します。それ以外の意味仕様は1.3を維持します。

## 内容

| パス | 内容 |
|---|---|
| EASING_STACK_SPEC_v1.4.md | Easing Stackの正式1.4差分。加算式、保存形式、移行、Compiler、UI、受入条件 |
| easing-stack-contract.json | Easing Stackの機械可読契約。式・端点・互換・受入条件 |
| FUNCTIONAL_SPECIFICATION.md | 編集操作・期待結果・境界動作の機能仕様。F09は1.4差分で上書き |
| IntroGenerator_Runtime_Compiler_v1.md | 指定順の全18章。基本契約版は1.3、再生ABIは1.1。4.4は1.4差分で上書き |
| schemas/authoring.schema.json | 現行IGAUTHOR/1.3保存形式。1.4実装時にStack形式へ更新予定 |
| schemas/runtime-lists.schema.json | IGRT/1.1永続ListのJSON表現 |
| schemas/runtime-abi.json | Table列、型、Opcode、Header、作業Listの機械可読カタログ |
| schemas/export-profile.json | 初期構造予算。FPSの実測保証ではない |
| build_contract.py | 基本契約ファイルを再生成するスクリプト |
| verification/contract_check.py | 部分的な意味検査と数式の参照Evaluator |
| verification/run_checks.py | 基本契約検査と最小Fixture生成 |
| verification/results.json | 実行結果と未検証範囲 |
| fixtures/ | 基本CASEのAuthoring/IR Fixture |
| PDF_FUNCTIONAL_BASELINE.md | PDF全115ページから整理した32機能と調整項目・合格条件 |
| pdf-feature-coverage.json | 115ページの対応索引と32機能の状態 |
| verification/feature_checks.py | PDF機能の保存形式・無効入力・網羅性の検査 |
| functional-contract.json | PDF32要件と原要求18機能群の1.3受入項目。F09はeasing-stack-contract.jsonで上書き |
| verification/continuation_checks.py | 1.3追加保存契約の検査 |
| sources.json | 参照した公式実装のURLと取得時のGit blob識別子 |

## Easing Stack 1.4の要点

```text
E_stack(u) = u + Σ enabled_i * weight_i * (E_i(u) - u)
```

- Linearが暗黙の基準線
- 1 Layer・Weight 1は従来Easingと同一
- 0 LayerはLinear
- Stack出力は0〜1へClampしない
- Layer順はv1.4では数値結果へ影響しない
- IGAUTHOR/1.3単一Easingは1 Layer・Weight 1として移行
- CompilerがStackを単一Curveへ畳み込み、IGRT/1.1へLower

## 実行

Python 3.10以降で、展開したこのフォルダ内から実行します。

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python build_contract.py
.venv/bin/python verification/run_checks.py
.venv/bin/python verification/feature_checks.py
.venv/bin/python verification/continuation_checks.py
```

Windowsでは`.venv/bin/python`を`.venv/Scripts/python.exe`へ置き換えます。

既存の1.3検査結果は1.3契約に対する記録です。Easing Stack 1.4の製品実装・Schema移行・UI操作・Scratch/Web一致試験は、1.4実装工程で新しい受入試験として追加します。1.4差分を未実装のままPASS扱いしません。

## 読む順序

通常はFUNCTIONAL_SPECIFICATION.mdから読みます。ただしEasing実装では先に `EASING_STACK_SPEC_v1.4.md` と `easing-stack-contract.json` を読み、その後Runtime/Compiler 4.4と既存Schemaを移行対象として確認します。

Editorの制限追加や全面Bakeで未実装部分を隠すことは契約に含みません。Compiler最適化はAuthoring SourceのEasing Layerを破壊してはいけません。
