# 実装状況 — 0.1.0

仕様の要求を削除する文書ではなく、現在のコードと要求の差分です。IGRT/1.1の完全適合を宣言しません。

| 項目 | 現在の状態 | 残作業 |
|---|---|---|
| Source / Compiler / Web Runtime分離 | 実装 | Compiler最適化、共有式、連続評価 |
| 入れ子Transform、Anchor、Local Time | 実装 | remapを含む粒子birth時刻の逆写像 |
| Text | 基本文字配置・kerning・文字別効果 | 複雑なscript shaping、混在font run、Word/Lineの共通pivot、reflow |
| 図形・動的Bezier | SVG asset生成 | 各Shape細部、Pen Line経路、適応分割、正確なSpline |
| Repeater / Scatter | 展開・事前評価 | Color Step、Path座標空間、PRNG仕様完全一致 |
| Particle | burst/定率、birth位置、寿命曲線 | 動的rate、入れ子time、view attached/followモード |
| Camera | 最初のCamera、Pan/Zoom/Roll、2.5D投影 | realViewの所有関係、Local Camera、奥行きsort |
| Infinite Scroll | Lattice + periodic offset | 任意viewport/Cameraでの自動被覆枚数 |
| Effect | 局所Glow/Shadow/Blur、Temporal Echo | 隔離Group、Mask、Warp、合成mode、Motion Blur積分、対称効果の細部 |
| Baked Clip | 連番素材の読込 | 自動Fallback境界選択、複雑な合成の自動Bake |
| Audio | Sourceに保持、出力は明示拒否 | BGM/SFX・Seek同期・イベント走査 |
| Scratch Runtime | 汎用My Blocks + Lists + Stamp | LINE/PATH、残Opcode、公式RendererのFence対策・Size対策の実機検証、Prepare/Commit、性能予算 |
| sb3 import/export | Source/IR/Module/Assetの検査 | 完全ABIの入力対応、Scratch本体のroundtrip |
| 編集UI | Layer/Inspector/Timeline、JSON、画像/Font、Undo | Canvas上の移動、複数選択、keyframe/clipの直接Drag、全機能のUI接続 |

## 検査の範囲

`npm test` は5件の数学的境界テストです。過去の仕様書の65件の参照モデルテストを、このアプリのテスト結果として扱いません。

GitHub Actionsのブラウザ確認は起動・再生・sb3往復のDraw List一致・モバイルの横溢れを検査し、画面画像をartifactに保存します。Scratch本体での描画検証とは別です。

## 公式実装の確認

Scratch VM `rendered-target.js` のsetSizeはcostumeサイズに基づく上下限を適用し、setXYはrendererのfencingを通ります。Size範囲外のuniform scaleは局所assetへ折り込みます。Stage端のfencingなどでWebとの差が残るため、完全互換の判定は保留しています。

- https://github.com/scratchfoundation/scratch-vm/blob/develop/src/sprites/rendered-target.js
- https://github.com/scratchfoundation/scratch-vm/blob/develop/src/extensions/scratch3_pen/index.js
