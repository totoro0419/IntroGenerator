# IntroGenerator Studio

Webで編集し、編集元データとScratch用Lists・Costumes・固定My Blocksを含むsb3を出力するアプリです。Web再生は独立したCanvasエンジンを使います。

アプリ: https://totoro0419.github.io/IntroGenerator/

## 現在の実装

初期実装です。仕様1.3全体の完成版ではありません。

- レイヤー、入れ子Group、Transform、時間設定、キーフレーム、文字別Animation
- 図形、Bezier、Repeater、Scatter、Particle、Camera、周期スクロール
- 素材・Font・連番の読込、局所Glow/Shadow/Blur、Temporal Echo
- 再生・Seek、Undo/Redo、端末への自動保存、JSON保存・読込
- sb3書出しと再読込。同じListsを独立したWeb Runtimeで評価

現在のScratch出力は固定時刻でサンプリングしたDIRECT/STAMP命令に限定しています。編集元の階層とKeyframesはsb3内に保持します。Scratch本体との画素単位の一致、性能の適合判定は未完了です。

実装済み・部分対応・未接続の区別は [implementation-status.md](docs/implementation-status.md) を参照してください。元の要求仕様は [docs/spec](docs/spec) に保持しています。

## 開発

Node.js 22以降で `npm ci`、`npm run dev`。`npm test` と `npm run build` を実行できます。mainへのpushでGitHub Actionsがビルド・ブラウザの主要経路確認後、Pagesへ公開します。

UIはUI Implementation Qualityスキルの手順を適用しています。外部UI生成サービスから生成結果を取得したものではありません。

同梱Fontのライセンスは [public/fonts/LICENSE.txt](public/fonts/LICENSE.txt) を参照してください。
