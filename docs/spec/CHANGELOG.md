# 1.4 Easing Stack design amendment

- PDF-F09を単一Easingから複数Easingの加算Stackへ拡張する正式設計差分を追加。
- 合成式を `E_stack(u)=u+Σw_i(E_i(u)-u)` に固定。開始値・終了値を厳密維持し、Overshootは保持する。
- Layerごとに安定ID、enabled、weight、Primitive curve parameterを保持する。
- 0 LayerはLinear、1 Layer・Weight 1は従来単一Easingと同一。
- Layer順はv1.4では数値結果へ影響しない。順序はEditor表示のため保存する。
- IGAUTHOR/1.3の単一Easingは、1 Layer・Weight 1へ見た目を変えず移行する。
- Authoring targetをIGAUTHOR/1.4と定義。Runtime ABIはIGRT/1.1を維持し、CompilerがStackを単一Curve/LUTへLowerする。
- `EASING_STACK_SPEC_v1.4.md` と `easing-stack-contract.json` をF09/Runtime 4.4に対する優先Source of Truthとして登録。
- 現行製品コードと `schemas/authoring.schema.json` はまだIGAUTHOR/1.3。1.4実装工程でSchema・Editor・Evaluator・Compiler・受入試験を同時移行する。未実装の1.4をPASS扱いしない。

# 1.3

- 32 PDF機能の編集操作と期待結果、元要求18機能群をFUNCTIONAL_SPECIFICATION.mdとfunctional-contract.jsonへ明文化。
- IGAUTHOR/1.3にtimeAnchors、markers、radialLaunch、accelerationSpaceを追加。従来Sourceの時刻は秒固定として移行。
- 拍固定／秒固定、Local Time、残像、曲線装飾、入れ子の影passの機能上の動作を確定。
- 保存契約に15検査を追加。合計65検査成功。実機・製品Compiler・UI操作は未検証。
- IGRT/1.1、Opcode、Runtime List Schema、出力Profileは1.2パッケージと同一。
- 配布ZIPは設計資料と検証用コード。製品実装や実行可能なsb3ではない。
