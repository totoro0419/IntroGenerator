# IntroGenerator 実装契約 1.3

Web Editorの編集モデルを非破壊で保持し、共通sb3をScratch標準機能と独立Webエンジンで再生するための設計・検証資料です。製品Editor、Compiler、Scratch Runtime、Web Rendererの実装そのものは含みません。

まずFUNCTIONAL_SPECIFICATION.mdでユーザー機能を確認します。1.3では拍固定／秒固定・マーカー・放射Particle・加速度の基準空間を保存契約へ補いました。

## 内容

| パス | 内容 |
|---|---|
| IntroGenerator_Runtime_Compiler_v1.md | 指定順の全18章。本文内の契約版は1.3、再生ABIは1.1 |
| schemas/authoring.schema.json | IGAUTHOR/1.3保存形式。追加field禁止、型付きNode/Expression/Track |
| schemas/runtime-lists.schema.json | IGRT/1.1永続ListのJSON表現 |
| schemas/runtime-abi.json | Table列、型、Opcode、Header、作業Listの機械可読カタログ |
| schemas/export-profile.json | 初期構造予算。FPSの実測保証ではない |
| build_contract.py | 上記4ファイルを再生成するスクリプト |
| verification/contract_check.py | 部分的な意味検査と数式の参照Evaluator |
| verification/run_checks.py | 36件の契約検査と最小Fixture生成 |
| verification/results.json | 実行結果と未検証範囲 |
| fixtures/ | CASE A〜Fの最小Authoring/IR 12ファイル＋追加機能のAuthoring 4ファイル |
| PDF_FUNCTIONAL_BASELINE.md | PDF全115ページから整理した32機能と調整項目・合格条件 |
| pdf-feature-coverage.json | 115ページの対応索引と32機能の状態 |
| verification/feature_checks.py | 追加した機能の保存形式・無効入力・網羅性の検査 |
| FUNCTIONAL_SPECIFICATION.md | 編集操作・期待結果・境界動作の機能仕様 |
| functional-contract.json | PDF32要件と原要求18機能群の受入項目 |
| verification/continuation_checks.py | 1.3追加保存契約の検査 |
| sources.json | 参照した公式実装のURLと取得時のGit blob識別子 |

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

Windowsでは`.venv/bin/python`を`.venv/Scripts/python.exe`へ置き換えます。検査はfixturesとresults.jsonを再生成します。製品コードへ組み込む場合は本文のSemantic Validationを実装し、この小規模checkerを完全な安全性検査と取り違えないでください。

## 確認できた範囲

基礎36検査、PDF機能保存14検査、1.3追加15検査を実行し、合計65件、失敗0・エラー0。追加14件は機能の保存形式・不正参照・ページ対応の検査であり、製品の機能試験ではありません。行列合成の検査1件はseed固定の10,000組を走査します。JSON Schema自体と6組の最小データ、時間差・位相・過去Path評価・粒子seek・周期・Sequence境界、丸め、整数参照、退化Path、Track/Easing、無効参照などを確認しています。

FixtureのAuthoringとIRは独立して作っています。製品Compilerで変換した対ではなく、CASE全体を視覚的に再現するsb3でもありません。例えばBのIRは1本のTemplateをindex違いで評価する数式検査です。Fontは外部参照のメタデータのみで、フォント本体やShaping実装は同梱していません。Runtimeの仮Asset metadataも実メディアとのリンク検査には使えません。

参照EvaluatorはPythonの配列を使い、実ScratchのMy Block stackやPenを実行しません。数式の反証を助けるための実装であり、すべての浮動小数点演算・描画差の一致を証明するものではありません。Scratch/Web実行、音声同期、保存往復、画素比較、性能は未実施です。実装の合格条件は本文18章にあります。

## 読む順序

FUNCTIONAL_SPECIFICATION.mdで機能の操作と期待結果を確認します。実装時は本文1〜5章で座標と時間の意味を確認し、11〜13章と機械仕様からLoader/Evaluator/Adapterを実装します。14章のPassへAuthoring変換を接続し、15章の6ケースと18章のGateを順に通します。Editorの制限追加や全面Bakeで未実装部分を隠すことは、この契約に含みません。

PDF全115ページを最低機能の抽出に参照しました。PDF固有の描画回数・分割数・変数名・計算式は互換要件にしません。機能検査の結果と未実施範囲はverification/feature-results.jsonを参照してください。sources.jsonのGit blob SHAはファイル内容の識別子であり、commit SHAやScratch公式サイトの稼働版を意味しません。
