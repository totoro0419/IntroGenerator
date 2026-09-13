# 1. Executive Decision

1. **Authoring Model → Compiled Runtime IR → Runtime**の3層を固定する。
2. Runtimeの実装は2つに分ける。Scratchは標準ブロック＋Pen、Webはsb3を読み込む独立エンジンとする。
3. WebはScratch VMやMy Blocksを通常再生時に実行しない。両実装が同じIRの意味仕様を実装する。
4. Webの完成映像プレビューも、増分Compileしたsb3相当データを入力とする。編集用Graphを別解釈して完成映像を変えない。
5. 非破壊Authoring Graphは別領域に保持し、sb3にも編集用メタデータとして同梱する。再生用IRから階層を推測復元しない。
6. Groupは座標・時間のコンテナ、Compositionは解像度・時間・合成境界を持つ再利用可能な局所シーンとする。
7. Cameraは投影を行うViewの構成要素とする。通常の文字GroupやPrecompをSub Cameraとは呼ばない。
8. ScratchにParent Treeを渡さず、時刻依存の行列計算を有限長の直線的なProgramへ変換する。
9. 定数畳み込み、共通計算、曲線Sampling、Generator展開は出力コピー上で行い、編集元を変更しない。
10. 最終描画命令はSTAMPとLINE。PATHとSEQUENCEはその展開命令とする。
11. RepeaterはTemplateの有界反復、Particleは発生時状態と時刻から再計算するStampとする。
12. 原則は単一の非表示Painter、Cloneなし、単一のEngineスクリプトとする。
13. 任意時刻の映像再現を保証する。音声の任意seekはScratch標準機能の保証範囲から分離する。
14. アセット参照はAsset IDを経由する。Costume番号の直接参照は最終リンク表だけに閉じ込める。
15. Bake単位は意味的に閉じた最小の連続レイヤー区間とする。全部Bakeを既定にしない。
16. v1の出力は有限区間 `[0,D)`。無限Loopはこの区間内の周期式として表す。
17. 品質誤差、命令数、Listサイズ、Assetサイズ、実測フレーム時間を出力Profileに記録する。
18. この文書は**設計仕様**であり、Scratch実機での性能・描画一致をPASSと宣言するものではない。

**確認した一次資料と前提。** 2026-09-12にGitHub接続からScratch公式実装を読んだ。通常Web取得はこの環境では失敗したが、GitHub接続からソース内容を取得できた。対象 `totoro0419/IntroGenerator` はAPIが空のRepositoryと返したため、既存実装への適合確認は行えていない。前版1.1まではPDF未参照。本改訂1.2ではユーザーの新しい指示により、添付『Scratch イントロエンジン完全講座』全115ページを機能の最低要件として照合した。

- StampはPenレイヤーへ描かれ、非表示のSpriteもStampできる。Penの色・太さはStampの着色・大きさの代用にならない。[Pen実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/extensions/scratch3_pen/index.js)、[Renderer実装](https://github.com/scratchfoundation/scratch-render/blob/develop/src/RenderWebGL.js)
- SpriteのScaleは一様。位置のfencing、Costume寸法に依存するサイズClampがある。[RenderedTarget実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/sprites/rendered-target.js)
- Warpにも時間制限によるyieldがある。無制限の原子的描画ではない。[Sequencer実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/engine/sequencer.js)
- 標準Soundブロックに開始オフセット指定はなく、同じSoundPlayerの再生は既存再生を停止し得る。[Soundブロック](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/blocks/scratch3_sound.js)、[SoundPlayer実装](https://github.com/scratchfoundation/scratch-audio/blob/develop/src/SoundPlayer.js)


**実装契約版 1.3（再生ABIは1.1を維持）**

契約1.1では、前版に残ったデータ型、既定値、Opcode境界、Compilerの自動判断、Web Renderer、Scratchのsb3構築と状態遷移を補完した。契約1.2でPDFの機能要件を追加し、本改訂1.3で操作・保存条件を補完する。`schemas/authoring.schema.json`、`runtime-lists.schema.json`、`runtime-abi.json`を同梱する。前版IGRT/1.0の出力は本版と取り違えず、1.1として再Compileする。ABI名、Header24項目、本文、機械仕様を同期する。

設計上の意味・入力・処理・出力・失敗条件を決めることと、実装後の速度・互換性を測ることを分離する。後者を実施していない事実は変わらない。付属コードは契約検証用Evaluatorであり、製品CompilerやScratch Runtimeが完成したという意味ではない。

**1.2 PDFから採用するのは機能の下限**

ユーザーの追記により、PDFの内部アルゴリズムは互換要件にしない。必要なのは、その教材で作れる表現と調整内容をIntroGeneratorでも編集・出力できることである。全115ページから32機能を整理し、`PDF_FUNCTIONAL_BASELINE.md`と`pdf-feature-coverage.json`へ対応ページ・操作項目・機能の合格条件を記録した。

20回のStamp、400 sample、黄金比、固有の変数名・Costume名・空欄分岐を固定仕様に追加しない。非破壊のAuthoring Modelと既存の汎用IRを維持する。PDF機能の補完を契約1.2で行い、本改訂では操作・保存条件を1.3として確定した。AuthoringはIGAUTHOR/1.3、再生ABIはIGRT/1.1を継続する。

# 2. Authoring Model

**2.1 Node契約**

各Nodeの意味的な共通情報は識別子、種別、親、順序付き子、可視性、時間範囲、TimeMap、Transform、Opacity、Blend、固有Properties、Effectsである。保存上の正式field名は第2.5節とJSON Schemaに固定する。UUIDは編集時のみ使用する。Effect順とChild順は配列順であり、暗黙の並べ替えをしない。

| Node | 保持する固有データ | 描画上の意味 |
|---|---|---|
| Project / Scene | duration、背景、Composition参照、Scene切替 | SceneはComposition instance。重なりはTransition区間 |
| Group | 子、Transform、TimeMap | 新しい画面・Cameraを作らない |
| CompositionDefinition | logicalWidth/Height、duration、children、clipRect、optional View | 独立した内部座標・時間の定義 |
| CompositionInstance | definitionId、親へのTransform、TimeMap、override | 定義を破壊せず複数配置 |
| Text | 原文、Unicode方向、font runs、layout、animator stack | 下記Text構造の所有者 |
| Line / Word / CharacterHandle | 文字範囲、選択範囲、Animator、基準Pivot | layout結果を編集可能な単位に関連付ける |
| GlyphRun / Glyph | glyphId、cluster範囲、advance、offset、font instance | 描画単位。Characterと必ずしも1対1ではない |
| Shape | 種類、寸法、角数、fill、stroke、パラメータ | 解像度非依存の手続き形状 |
| Image | 元Asset、crop、fit、color properties | Sprite画像にCompile可能な視覚要素 |
| Path | segment、control points、閉路、幅、trim | 形状と移動軌道に共通利用 |
| Repeater | template参照、mode、count、instance modifiers | Templateを非破壊で反復 |
| Scatter | template参照、seed、分布、制約 | IDごとに安定した乱数を生成 |
| ParticleSystem | emitter、rate/bursts、life、initial distribution、space | 時刻から粒子状態を決定 |
| Effect | 入力、順序、パラメータ、適用座標系 | Stroke前後・Transform前後・合成後を明示 |
| View | viewport、cameraId、worldRoot、overlayRoot | Worldを投影しScreenと合成する境界 |
| Camera | positionXYZ、zoom、roll、projection、near/far、shake | View専用。Child Transformの代用品にしない |

Containmentは木、Composition参照・Path参照などは有向非巡回Graphとする。循環参照はUUIDを列挙してCompileエラー。Editorは反復DFSで処理し、深いGroupを言語の再帰深度に依存させない。リソース上限以外の固定階層数制限を設けない。

**2.2 Spaceの所有**

各ViewはWorldRootとOverlayRootを持つ。通常の子は親のSpaceを継承する。Worldの子の途中に「Cameraを無視する」フラグを置いて、親行列だけ恣意的に切断することは禁止する。Screen固定に変更した要素はOverlayRootへ移し、必要なら `projectedAnchor(worldNode)` という明示的な座標依存を作る。前者は完全固定、後者はWorldの点へ追従するScreen Graphicである。

**2.3 合成とOpacity**

- `opacityMode=inherit`：各LeafのOpacityへ積を掛ける。Groupは表示上もこの意味として提示する。
- `opacityMode=isolated`：子を一度合成し、その結果へOpacityを1回掛ける。
- Compositionの既定はisolated。内部が静的なら1枚の透過Asset、動的でも重なりがなく演算交換が証明できればLeafへ分配する。
- Mask、Blur、非source-over Blend、isolated opacityの重なりは合成依存である。機械的なLeaf化をしない。

**2.4 sb3を入力とするWebエンジン**

`sb3 ZIP → project.json + Costume/Sound bytes → IG ABI validation → typed arrays / expression DAG → Web renderer` とする。Web実装はListsを一度数値配列へ変換し、Programを事前解析して評価器へ変換する。任意文字列のevalは使わない。GPU Instancing、画像Atlas、Polyline Meshを使ってよいが、レイヤー順とsource-overを維持する。

通常再生はIR・Assets・Soundsだけを参照する。編集元を同梱しても、Webだけ元のText/Blurを描き直してBakeを無視しない。これはScratch出力のプレビュー一致を守るためである。Webでは高解像度Rasterizeが可能だが、追加の視覚効果を勝手に復元しない。

`IG_SOURCE` にはGraph等のJSON envelopeをUTF-8→gzip→base64→4096文字単位に分割して保存する。これは編集情報でありScratch Engineは読まない。format=`IGAUTHOR/1.3`と第2.5節のProject/Asset情報を持たせる。sourceHashは循環を避けてIG_HEADERにだけ保存する。再編集に必要な元画像・利用許可のあるFont bytesはenvelope内に同梱するか、欠落を明示した参照にする。Glyph pathしかない場合、既存文字の外観は保てても新しい文字の入力に必要なFontが復元できるとは主張しない。

Scratchで保存し直すと、未知のZIP追加ファイルは保持保証がないため編集情報を独自ZIP entryだけに置かない。通常Listとして保持し、保存往復は実装Gateで検証する。IRとSourceのhashが不一致なら、ユーザーにどちらを編集元にするか示し、再生IRを黙って上書きしない。

標準Scratchの任意のsb3を再生する汎用エミュレータではない。IG ABI・module fingerprintを持つsb3を対象にする。Scratch上でMy Blocksを改変した場合、Webでその任意コードを再現する保証はない。未知モジュールは互換性エラーとする。


**2.5 Authoring保存Schema：IGAUTHOR/1.3**

正式Root fieldは `format,projectId,width,height,duration,fit,background,seed,root,definitions,nodes,expressions,tracks,assets,audio,tempo,profile`。この基礎fieldは全て必須。1.3でtimeAnchorsとmarkersを任意fieldとして追加する。その他の未知fieldは拒否する。空の機能は空配列、optional referenceはnullで表す。JSON Schemaのdefaultに依存せず、EditorのNode Factoryが明示値を保存する。

正式Node fieldは `id,name,parent,children,enabled,space,time,transform,opacity,opacityMode,blend,effects,type,data`。`id`が従来説明のUUIDに相当する。Schemaはidを英字開始の最大128文字の不透明識別子として扱い、意味を埋め込まない。`data`はtypeで分岐するclosed objectである。

| 設計要素 | 保存場所 |
|---|---|
| Scene | root配下のcomposition/instance Nodeとtime.start/end |
| Composition定義 | parent=null、definitionsに登録されたNode tree |
| Group階層 | nodes[].parent/children。親子双方を検証 |
| Textの原文・Font・Layout | text.data.text/runs/align/tracking/lineHeight等 |
| Line/Word/Character Animator | text.data.animators[].selector。単位と範囲を明示 |
| Shaping後Glyph cache | 保存必須ではない再生成cache。Font digestとLayout入力hashで識別 |
| Spline | path.data.spline。元の制御点を保持し、segmentsへ上書きしない |
| Cubic Path | path.data.segments。splineとは排他的 |
| Ribbon | path.data.ribbonのwidthCurve/alphaCurve/spacingPx |
| Property Animation | scalar binding→expressions→tracks |
| 非標準Warp/Mask/Blur | effectsの順序付きtyped payload |

Scalar Bindingは有限数、または `{"expr":"expressionId"}` の2択。文字列で式を保存せず、Expressionは許可された演算のDAGとする。vectorはBinding配列、RGBAは0..1 channelのBinding配列。色域ClampはPaint評価後に1回行う。数値が±1e100を超えたときは意味未定義にせずdomain errorとする。

TimeMapの全fieldは `start,end,rate,offset,wrap,duration,remap`。start/endは親時刻のactive範囲で `[start,end)`。まずq=(parentTime−start)*rate+offset、次にwrap、最後にremapを評価する。remap内のlocalTime入力はwrap済みqであり、remapの結果そのものを参照しない。Node PropertiesのlocalTimeはremap完了後の値。rate=0、offset=0、wrap=noneが静止/通常時間の明示設定になる。

Expression inputはmasterTime/localTime/index/count/age/normalizedAge/birthTime/lineIndex/wordIndex/characterIndex/pathU。使用Context外の入力は0として補完せずCompileエラー。indexは0-based、countはinstance上限ではなく当該評価時点の宣言個数、pathUは正規化弧長。CompilerのTemplate sortには別途固定R_MAXを使う。

文字範囲はUnicode code pointのhalf-open範囲。Font runsは原文全体を重複なく覆う。Animator selectorのfrom/toは選択unitの論理index範囲であり、code point範囲とは別型として扱う。空白を数えるか、logical/visual順かを必須fieldで保存する。文字編集時のrange追従は挿入位置前後のAffinityをEditorの編集操作で適用し、保存時には解決後のrangeを出す。

**構造検査の順番**：JSON Schema→ID一意性→外部参照→親子整合→Containment/Composition参照の循環→Expression循環→型付き依存Graph→数値domain→Export Profile。Emitterが親Transformを読むことは正常で、Containmentの子参照と合わせて誤った循環にしてはならない。依存Graphは `(nodeId,channel)` を頂点とし、Transform、Geometry、Paint、Compositeを分離する。Parent.Transform→Child.Transform、Child.Composite→Parent.Compositeは別channelである。

Instance overridesのpropertyはBindingへ到達するJSON Pointerに限定する。存在しないfield、id/type/parent/childrenの変更は拒否。overrideはInstanceごとのCompiler copyへ適用し、Definitionを変更しない。

Asset bytesはbase64またはexternalRefの排他2択。外部参照でも編集元の保存はできるが、Export時に未解決ならMissingAssetとして止める。既存Glyphで文字を推測補完しない。空のTextはrunsを0長範囲として保存し、Stampを出さない。

**2.6 機能補完による保存形式1.2**

| 追加・補完field | ユーザー機能 | 値・既定値・整合条件 |
|---|---|---|
| path.data.bezier | 4点に固定されないBezier編集 | nullまたは{points:[Binding XY,…]}。2点以上。segments／spline／bezierのちょうど1つだけを選ぶ。未指定はnull |
| path.data.decorations | 曲線端・曲線沿いの装飾 | id,kind=endpoints/alongPath,asset,size,angle,opacity,spacing,orientation=fixed/tangent,pass=base/shadow。未指定は[]。sizeは倍率、spacingはPathのローカル距離。endpointsではspacingは保持するが未使用 |
| effects[].temporalEcho | 柔らかい動きの残像＋鮮明な本体 | duration,unit=seconds/beats,opacity,softness,falloff=Track ID/null,includeBase,camera=sampled/current。duration≥0、opacityは最終Clamp、softnessは論理pxで≥0。falloff=nullは古い残像ほど線形減衰 |
| effects[].symmetry | 軸対称・点対称配置 | center XY,mode=x/y/point,space=local/world/screen,transformContent。xは中心を通るX軸についてYを反転、yはY軸についてXを反転、pointは両方を反転。trueは内容の向きも変換、falseはStampの配置位置だけ変更。曲線は制御点を対称変換し、falseでは付随するStampの向きを保つ。元と複製を連続して描く |
| group.data.passOrder | 影をまとめて背面へ | 未指定は通常の子順。指定時はshadowとbaseを各1回含む2項目の配列。標準は[shadow,base]。子のShadowと本体を指定順へ分類し、各pass内は元の描画順 |
| paint.kind=hsv | HSVでの色調整 | hueTurns,saturation,value,alphaは全てBinding。Hは周期、S/V/Aは0..1へClamp。RGBA paintも維持 |
| easing.kind=powerIn/Out/InOut | 加減速の強さを連続調整 | power>0の有限数。元からあるQuad等と共存。固定2..5だけに制限しない |

1.1 Sourceのmigrationはformatだけを1.2へ変更し、追加の任意fieldは上記既定値として解釈する。既存Node・Expression・Track・Asset IDを書き換えない。新Effectを持つSourceを1.1へ渡して無視させない。IRのTablesとOpcodeには互換変更を加えず、Compilerで既存Primitiveへ展開する。

**2.7 機能操作を保存する追加契約1.3**

機能の意味・操作・期待結果は`FUNCTIONAL_SPECIFICATION.md`、機械可読の受入項目は`functional-contract.json`に置く。PDFの32機能と元の18機能群を両方保持する。後者は前者と重なる分類で、追加18個の独立機能という意味ではない。

| Source field | 保存する値 | 既定値・参照 |
|---|---|---|
| timeAnchors[] | id,target,owner,key,unit,value | 未指定は[]。unit=seconds/beats、valueは有限数。target=nodeStart/nodeEnd/keyframe/audioStart |
| markers[] | id,name,unit,value | 未指定は[]。名前付き編集マーカー。描画・音声Eventにはしない |
| particle.data.radialLaunch | nullまたは{angleStart,angleSpan,speed,distribution} | 未指定はnull。角度2項目はBinding degree。speedは既存Distribution。distribution=random/distributed |
| particle.data.accelerationSpace | world/birthLocal | 未指定はworld。加速度の意味を明示 |

Anchorのtarget=nodeStart/nodeEndではowner=Node ID、key=null、対応値はnode.time.start/end。keyframeではowner=Track ID、key=Key ID、対応値はkey.time。audioStartではowner=Audio ID、key=null、対応値はaudio.start。配列index・JSON Pointerを永続参照にしない。同一target/owner/keyへ2つのAnchorを付けない。Anchor ID、Marker IDは各表内で一意とする。

Anchorがない既存の時刻は秒固定。Anchor付き時刻の秒fieldは解決済みキャッシュであり、保存時にはAnchorから解決した値と絶対誤差1e−9秒以内で一致することを要求する。BPM変更時はキャッシュ更新・Keyの安定ソート・範囲検査を同一編集Transactionで行う。競合Keyや開始終了逆転は操作を確定せず、対象を返す。読み込み時に不整合を黙って選び直さず、不正な編集データとして返す。

1.2から1.3へはformatを変更し、新しい任意fieldがなければ既定値で解釈する。元のID・数値・素材は変えない。1.2以前に失われた拍固定の意図は推測復元せず秒固定にする。1.3で追加した編集意図を古いLoaderへ渡して無視させない。

# 3. Transform & Coordinate System

**3.1 数学規約**

全計算は列ベクトル、+X右、+Y上、角度は反時計回りのdegree、距離は論理px。SVGのY下向きからはAsset生成時に1回だけ変換する。Scratch Stageは中心原点480×360。AuthoringがW×Hなら最外側にFit行列を置く。containは `s=min(480/W,360/H)`、coverは `s=max(480/W,360/H)`。中心位置はどちらもStage中心で、Stage外はClipする。

行列 `M=[a,b,c,d,tx,ty]` は次を表す。

```text
x' = a*x + c*y + tx
y' = b*x + d*y + ty
L = T(position) * R(rotation) * S(scaleX,scaleY) * T(-anchor)
Wchild(t) = Wparent(t) * Lchild(localTime(t))
```

`A*B` の6成分は、Bを `[e,f,g,h,u,v]` として

```text
[a*e+c*f, b*e+d*f, a*g+c*h, b*g+d*h,
 a*u+c*v+tx, b*u+d*v+ty]
```

Anchorはこの `T(-anchor)` にだけ存在する。Assetの原点も同じAnchorへ動かして二重に引かない。Glyph Assetの基準はFontのGlyph原点とし、回転PivotはLayout/Animator行列で表す。

Zはv1の2.5Dモデルでは `zWorld=zParent+zLocal` とする。XY回転がZを変えず、ScaleXYもZを変えない。ScaleZやRotationX/Yを持つAuthoringは任意Warpの経路へ送る。暗黙の3D TRSとはしない。

**3.2 厳密な適用順**

右から先に作用する。

```text
screenPoint = StageFit
            * ViewProjection(camera at master t, world z)
            * ancestors(t in each explicit time space)
            * repeaterContainer(t)
            * instancePlacement(i,t)
            * textTransform(text time)
            * linePlacement * lineAnimator
            * wordPlacement * wordAnimator
            * glyphPlacement
            * characterAnimator(character time)
            * glyphPoint
```

実際のContainment順がこの位置関係を決める。Textの内側にRepeaterを置いた場合は内側に入る。Animator配列は `M=A1*A2*...*An` と定義し、後ろのAnimatorが点に先に作用することをUIの積み上げ表示に対応させる。ユーザーが順を変えれば結果も変わる。

Characterの基準点 `g` とPivot `p` がある場合、`T(g)*T(p)*R*S*T(-p)` とする。`T(g)`はglyphPosition、`p`はGlyph原点基準であり、Text全体のAnchorとは別である。

**3.3 ParentのFlatten**

```text
stack = [(sceneRoot, identityExpression, masterTimeExpression, inheritedAlpha=1)]
while stack is not empty:
    node, parentM, parentTime, alpha = pop()
    localTime = composeTimeMap(node.timeMap, parentTime)
    worldM = multiply(parentM, TRS(node.properties evaluated at localTime))
    if node introduces real View: insert one explicit projection expression
    if node requires isolated composite: schedule compiler-owned composite region
    else if node is drawable: emit leaf expression(worldM, localTime, alpha, geometry)
    push children with expression references

constantFold → commonSubexpressionElimination → topological instruction ordering
```

Parent行列を開始時だけ焼くこと、ParentのPosition/Rotation/ScaleのKeyframeを子の同名Keyframeへ加算することは禁止。親回転＋子移動は一般に単純なKeyframe加算では表現できない。

IRには親IDも再帰Traversalも残さない。Program内のMAT_MUL列は有限で、純粋な数式の依存だけを持つ。共通Parentは必要ならSHARED Programで1フレーム1回評価する。ただしinstance index、粒子age、別時刻に依存する式をGlobal共有してはならない。

高コストな合成行列は、6成分を出力Trackへ近似変換できる。この場合は回転1周の中点を落とさないSamplingを行い、特異値・位置・角度・画面上輪郭の誤差を評価する。単純に両端行列を補間すると180度差でScaleが潰れるため、区間を分割するかProgramを残す。

**3.4 Scratchへ渡せるStamp変形**

線形部分の列を `u=(a,b), v=(c,d)` とする。

```text
similarity iff dot(u,v)≈0 AND dot(u,u)≈dot(v,v) AND determinant>0
s=sqrt(a*a+b*b)
theta=atan2(b,a)
Scratch direction = 90-theta
```

近似の許容は行列係数だけでなくAssetの画面上誤差で判定する。ゼロScaleはStampを省略する。反転は鏡像Assetへ分離し、任意回転と併用する。

変形 `A(t)=Similarity(t)*H` でHが一定ならHだけSVG pathへ適用する。Hは任意Affineでもよい。Hが変化する場合、LINE/PATHは頂点へ直接適用する。画像・塗りGlyphは姿勢別Asset/時間Sequenceへ変換する。動的形状だけを局所Bakeし、外側の一様TransformとCameraを残す。Camera後にこの条件を最終再検査する。


**3.5 Transform Loweringの決定手順**

各Leafについて、Ancestorの積を`worldMatrixExpr`として構築し、Local Viewのprojectionを挿入し、最後のMain ViewだけD_VIEWへ残す。Screen LeafはD_VIEW=0。Camera後の適合検査と画面上の誤差検査は、最外StageFitも含めたMatrixで行う。

固定Affine残差の抽出はA(t0)を選ぶだけでは不十分である。候補Hを定数行列として固定し、`B(t)=A(t)*inverse(H)`が全対象区間でSimilarityになることを区間解析する。Hのdet=0なら逆行列を作らず、幾何退化として別扱い。区間解析が証明できなければRuntime Stamp適合とは判定しない。

ShapeのScaleX/Yを固定pathへ織り込んでも、Parentの非一様Scale×Child Rotationから生じる動的Shearを消したことにはならない。原点/Pivotを含む全積の後に再判定する。一般AffineのStrokeは輪郭を変換する。Round-cap Penの端点だけ変換して済ませるのはscreen-width設定またはSimilarity時だけ。

# 4. Time Model

**4.1 MasterとLocal**

再生開始時のScratch timer値を `wall0`、開始位置を `seek0` として `t=seek0+(timer-wall0)*playRate`。timerのResetを要求しない。1フレームの先頭でtを固定し、フレーム途中で再取得しない。Webは同じ論理tを音声Clock等から供給する。

TimeMapは順序付きの関数合成である。

```text
q = (parentTime - start) * rate + sourceOffset
localTime = remap(q)  // identity, clamp, loop, pingpong, or compiled retime track
```

外側TimeMapのLoop/非線形remapがあれば、内側と安易に1本のoffset/scaleへ潰さない。Programの演算列として残す。Sceneを移動すると変わるのはScene startであり、内部Keyframeを全て書き換えない。

```text
modp(x,L)=x-L*floor(x/L), L>0
loop(q,L)=modp(q,L)
pingpong(q,L)=L-abs(modp(q,2*L)-L)
```

Loopの区間は `[0,L)`、Ping-pongは折り返し点Lを含む。rate=0はsourceOffsetで静止。L=0のLoopはEditorでは警告し、RuntimeへはCONSTへ変換する。逆再生の表示は可能だがScratch音声はミュートする。

**4.2 Track**

全Trackはscalar。vector、matrix、colorは複数scalarの集合。Key時刻は秒の倍精度数。`K_TIME`は厳密昇順。同時刻の編集Keyは最後のUUID順ではなく明示した編集順の最終値を採用して正規化する。

時刻qに対してupper_boundで最初の `K_TIME>q` を探す。左Key j、右Key j+1を使用し、`u=(q-tj)/(tj1-tj)`。`v=vj+(vj1-vj)*ease(u)`。最初より前、最後以降は端の値を返す。空TrackはT_DEFAULT、1Keyは定数。HOLDは左値だが、右Keyに完全一致すれば右値となる。

RotationはCompile前にunwrapする。0→720を0→0に短絡しない。極短区間も正のdurationである限り式を変えず、ビジュアル上飛ばされた場合でも任意seekで評価可能とする。

**4.3 Phaseの型**

- Delay/TimeOffset：秒。`q_i=q-i*delay-randomDelay[i]`。
- Cycle phase：cycle単位。`phase_i=phase0+i*phaseStep`。
- Angle phase：degree。Sinへ渡す際にのみ `360*cycle`。

Repeaterの親は `q`、内部Animationだけは `q_i` を受ける。Delayを親・Cameraへ波及させない。`t`、`q`、`q_i`をそれぞれ別Program slotに置く。

**4.4 Easing**

| 種類 | Scratch実装 | 定義 |
|---|---|---|
| Linear | 直接 | u |
| Sine In / Out / InOut | 直接 | 1−cos(90u) / sin(90u) / (1−cos(180u))/2 |
| Quad/Cubic/Quart/Quint In | 直接 | u^n、n=2..5 |
| 同Out | 直接 | 1−(1−u)^n |
| 同InOut | 直接 | u<.5なら(2u)^n/2、他は1−(2−2u)^n/2 |
| Expo/Circ/Back/Elastic/Bounce | Compiler LUT | 名前だけでなくパラメータと採用式VersionをSourceへ保存 |
| User cubic Bezier | Compiler LUT | xを逆解決してyを求める |

Bezierは `(0,0),(x1,y1),(x2,y2),(1,1)`。xが単調であることを導関数の根を含め検査する。Newton法最大8回、範囲外/小導関数なら二分法へ移り、x誤差≤1e−8でyを評価する。yのOvershootは保持し、Opacity等の最終物性でのみClampする。

LUTは非一様な `(u,value)` 点列である。評価はupper_bound＋線形補間。端点だけでなく極値、Bounce接合点、Elastic振動を分割に含める。誤差はそのEasingが動かすProperty量と最大投影Scaleに換算する。既定の出力目標は位置0.25 Stage px、alpha 1/255、輪郭0.5 px以下。これは設計上の品質設定でありScratchの仕様値ではない。誤差を証明できないユーザー式はユーザーコードとして実行せず、Compiler内の許可された式評価から検査付きSamplingへ変換する。

Compiler側のNamed Easingは以下の式をIG easing definition v1として固定する。Expo Inはu=0なら0、他は `2^(10*u−10)`。Circ Inは `1−sqrt(1−u*u)`。Back Inは `u*u*((s+1)*u−s)`、既定s=1.70158。Elastic Inはu=0/1を端値で返し、内部は `−2^(10*u−10)*sin(360*(u−1−p/4)/p)`、既定period p=.3（cycle-domain）。Bounce Outはn=7.5625、d=2.75として、u<1/dならn*u²、u<2/dならn*(u−1.5/d)²+.75、u<2.5/dならn*(u−2.25/d)²+.9375、それ以外はn*(u−2.625/d)²+.984375。Bounce Inは `1−BounceOut(1−u)`。

各InからOut=`1−In(1−u)`、InOutはu<.5なら`In(2u)/2`、他は`1−In(2−2u)/2`と定義する。外部ツールの同名Easingと係数が違う場合があるため、名前だけでImportせず元CurveをLUT化する。許可する調整パラメータはBackのs、Elasticのp>0のみ。他の自由CurveはUser Bezier/Curveデータへ保存する。


**4.5 Samplingの保証水準と時刻の正規化**

Export Profileは`continuousCertified`と`sampled`の2モード。前者は連続区間の誤差上界を満たす変換だけを許す。証明できない区間をサンプル検査だけでPASSにせず、正確な式を残すか、診断を返す。後者はsampleFPSの全サンプル時刻での契約であり、映像時刻を `ts=min(LAST_TIME,floor(max(0,t)*F)/F)` へ正規化する。任意tへのseekはこのFrameを直接返す。どちらも積算Frame counterは使わない。

音声Eventはtsではなく生のmaster tで区間走査する。sampleFPS=0が連続、正数がsampledで、IG_HEADER[22]へ保存する。mixed dataの局所SequenceはQF_TIMEでHoldされ、その時間誤差はExport reportに個別記録する。continuousCertifiedでは局所Holdにも上界が必要。sampledでは共通サンプル時刻の見た目を照合する。

scalarの線形近似誤差は、区間幅hと二階微分上界Kが得られる場合 `K*h*h/8`。Hold近似なら一階微分上界Vから `V*h`。これにProperty→画面誤差のJacobian上界を掛ける。矩形/Asset頂点の変位とAlphaを別に計算する。Easingのy overshootはここでも保持する。

区間演算は加減乗除、sqrt、整数pow、sin/cos、min/maxを実装し、一次/二次微分をautomatic differentiationで伝播する。sin/cosの極値は区間内の90度/180度格子を検査する。割り算の分母区間が0を含むなら区間を分割し、残る場合は適合不能。floor/mod/hold/step、Loop、Key境界は不連続点として先にsplitする。ユーザー式で境界を有限に分離できない場合、continuousCertifiedへの自動変換は拒否し、sampledへの明示的な変更で出力できる。Editorの式を削除しない。

**4.7 拍固定の意味**

tempoは最初のbeat=0、以後beatが厳密増加、BPMは正の有限数。各区間の拍差をそのBPMで秒へ変換して足す。負の拍は最初のBPMで0より前へ延長する。Anchorのseconds値はそのまま、beats値はこの変換結果を対応する秒fieldへ保存する。

Nodeのstart/endは親Local Time、Keyは所属Trackが評価されるTime Space、Audio startはMaster Timeで解釈する。内部Timelineでも拍0をそのTimelineの0とする。同じProject tempo mapを単位変換に使い、外側SceneのTimeMapは変換後の秒へ作用する。親の移動・Loop・Time Scaleで内部KeyをMainの絶対拍へ付け替えない。異なるTime Spaceで同じTrackを使う場合も、各使用先で同じ局所曲線を評価する規約を保つ。

Editorでの単位の表示変更はAnchorの固定基準を変更しない。「拍固定に変更」「秒固定に変更」の操作だけが現在位置を維持してAnchorを書き換える。音楽位置への配置はScene開始やAudio開始のAnchorで表現する。Markersは編集用位置を保持するのみ。音源のsourceIn/sourceOut、offsetやdurationは既存の秒設定を維持し、timeAnchorsで未定義の対象を追加しない。

# 5. Text Algorithm

**5.1 Layoutしてから分解する**

`Text → paragraph/line → style/script/direction run → shaped glyphs + clusters` を先に確定する。単語や文字を1つずつmeasureしてから並べる方式は禁止。Font shapingにはHarfBuzz相当のShaperを用い、Font bytes/version、variation axes、features、script、language、directionを固定する。Shapingにはkerning、ligature、mark positioning、reorderingが関与する。[HarfBuzzのShaping説明](https://github.com/harfbuzz/harfbuzz/blob/main/docs/usermanual-shaping-concepts.xml)

```text
segment graphemes and Unicode word boundaries
resolve bidi + font fallback runs
shape candidate lines; select line breaks; reshape each final line in its context
store each glyph's glyphId, cluster range, advanceXY, offsetXY
pen = line origin
for glyph in visual order:
    glyphOrigin = pen + glyph.offset
    pen += glyph.advance
    add tracking only at allowed cluster boundaries
apply line alignment and paragraph anchor once
```

WordのAnimator所有範囲はUnicode word range、Characterの所有範囲はgrapheme clusterで指定する。空白はadvanceと時間順番には参加できるが、輪郭がなければStampを生成しない。Staggerの空白を数えるかはSourceの明示設定とする。

**5.2 字形と文字単位の不一致**

1つのligature Glyphが複数文字を覆う場合、元のGlyphを保ったまま各文字を完全独立に動かすことは一意に定まらない。既定はclusterを1つの視覚単位として動かす。より細かい編集要求には、(a)任意ligatureを解除してrun全体を再Shaping、(b)元Glyph pathを明示境界で切り分けた視覚断片、とする。必須ligature・結合文字を黙って破壊しない。解除で外観が変わることはEditorで示す。

したがってText→Line→Word→Characterは**論理選択階層**、GlyphRunは**描画配置データ**である。両者を無理に単純な1対1の木へ変換しない。

**5.3 Layout情報**

Alignmentは各LineのTypographic advance幅に対するleft/center/right/justify。Text Anchorは全体Layout boxまたはInk boxを選択し、その基準を保存する。Trackingはcluster間に追加し、Shaperのkerning調整量を消さない。Line Heightはbaseline間隔である。Animationで大きさが変わっても自動改行を毎フレームやり直さない。動的reflowを明示した場合だけCompilerが時間別Layoutを作る。

文字gに対する位置は

```text
M_g(t)=M_Text(q) * T(lineOrigin) * A_line(q_l)
       * T(wordOriginRelativeToLine) * A_word(q_w)
       * T(glyphOriginRelativeToWord) * A_char(q_g)
q_g=q - staggerOrder(g)*delay - fixedRandomDelay(g)
waveY=A*sin(360*frequency*q + phase(g))
```

これでText全体Zoom/回転中にも、各Glyphの回転・移動・Waveを独立評価できる。Line/Word/Character Animatorが有効でも、Layout originの差分を一度ずつ使うため二重平行移動がない。

**5.4 Asset化**

FontのGlyph outlineをpathへ変換する。基準原点を保ったままSVG viewBoxとrotationCenterへ対応させる。Asset keyは `font digest + face/axes + glyphId + outline version + paint/effect + fixed affine residual + resolution policy`。文字列のUnicode値だけでdedupしない。同じTでも別Font/variation/Strokeなら別Asset。

Strokeは輪郭拡張、Shadowはoffset付きの塗り/ぼかし済み形状、Extrudeはoffset unionまたは順序付きMulti-stamp、GradientはSVGの検証済み線形/放射GradientかPNGとして生成する。文字列全体に連続するGradientは各GlyphでGradient座標を共有する必要があり、各文字を同じ色Assetとして使い回せるとは限らない。

静的文字列で内部Animationがない場合に限りText全体を1Assetへ最適化する。元Sourceには原文・Glyph layout・Animatorを残す。


**5.5 Text実装手順の補足**

Font resolverは指定font digestを最優先し、未収録字だけ指定順のfallback Fontへ分ける。OSの暗黙Font fallbackは使用しない。Shaping engine version、Unicode segmentation/bidi version、Font digest、axes/featuresをCompile reportへ保存し、同じSourceから異なるGlyphになる原因を追跡可能にする。

Line break候補はUnicodeの改行機会から作り、boxWidth内へ収まる最大候補を左から選ぶ。最終Lineは前後Contextを指定して再Shapingする。再Shapingで幅を超えた場合は候補を1つ前へ戻す。進行量が0の候補を選ばず、1clusterがboxWidthを超えるときはそのclusterを単独Lineにする。RTLのlogical文字範囲とvisual Glyph順を混ぜない。

Line/Word AnchorはAnimation前のLayout boxから計算する。文字ごとのScaleが変わってもLayoutを自動更新しない。dynamicReflow=trueではline breakが変わる時刻をCompile側で解決し、Layout状態を区間ごとに切り替える。文字選択は原文rangeを維持し、旧Line番号を別の文字へ無条件移植しない。

StrokeはPaintとして先に生成し、Transformは後で適用する。Shadow/GlowをText合成後に指定した場合はGlyphごとに分配せず、Textの合成面を入力とする。Word opacity・Character opacity・Text isolated opacityはそれぞれ別段であり、全ての数値を1個のalphaへ掛け算できるとは限らない。

**5.6 残像機能の最低条件**

文字の位置・回転・Zoomの動きに沿う残像を付け、長さ・強さ・柔らかさ・時間による減衰を調整できる。鮮明な現在の本体を残すか選べる。文字列・Font・内部の文字AnimationはEffect適用後も編集可能とする。

Cameraを含む残像はcamera=sampled、文字自体の動きだけを現在のCameraで見る残像はcurrentとする。前者では各履歴時刻の文字階層・Cameraを合わせて評価する。残像だけを過去にしてCameraを現在に固定したものを、Cameraを含む残像の完成とは判定しない。

temporalEchoは演出としての重ね表示であり、物理的なシャッター積分のmotionBlurとは別に保持する。duration=0は残像なし、includeBaseだけが表示を決める。拍単位はtempo mapで時間へ変換する。Quality sampling数はCompiler/Profileの担当で、教材の20回をEditorの上限にも必須回数にもしない。

# 6. Runtime Primitive

| IR Primitive | 固定処理 | 最終描画 |
|---|---|---|
| STAMP=1 | Asset解決→Similarity→状態設定→Stamp | Pen Stamp |
| LINE=2 | 端点Transform→幅/色/alpha→Clip→Pen移動 | Pen Line |
| PATH=3 | Polyline取得→arc-length trim→segment展開 | LINE列 |
| SEQUENCE=4 | timeからframe選択→Asset解決 | STAMP |

Effect、Text、Ring、ParticleはPrimitiveを増やさず、これらへLowerする。Scratch graphic effectはv1ではcolor、brightness、ghostだけをABIへ公開する。Ghostはalphaから算出する。他のScratch effectを使いたい場合は意味仕様を追加したABI revisionかGenerated Assetにする。色相effectは任意RGB着色の代替ではなく、RGB完全指定はAssetまたはPen colorで行う。

**Stamp Adapterの順序**：pen up → switch costume → clear/set effects → size → direction → go to → Stamp。非表示を保つ。Costume変更後に必ずsizeを設定し、別CostumeのClamp結果を引き継がない。Pen描画の前には専用Carrier Costumeに切り替える。

Stage外の命令は輪郭/幅/Glow margin込みでcullする。少しでも見えるStampがfencingされる場合は、Compilerで安全な余白・原点調整をしたAsset、画面内で使う事前crop Asset、または最小Sequenceへ変換する。半端に見える対象を「中心がStage外だから削除」しない。

SizeのClampは確認した実装で以下。w,hはRendererのSkin寸法。

```text
minScale=min(1,max(5/w,5/h))
maxScale=min(720/w,540/h)
actualSize=100*clamp(requestedSize/100,minScale,maxScale)
```

小さくなる文字は、透明余白内に縮小輪郭を持つAsset variant等で対応し、それでも品質許容外なら局所Sequenceとする。0<Scaleを一律0扱いにはしない。最終Adapterは実際のsize/x/y reporterを検査し、不一致を検出したフレームを正常扱いしない。[位置とサイズ処理](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/sprites/rendered-target.js)

Pen幅は確認実装で1〜1200。1px未満のStrokeは細線Assetへ変換する。非一様Affine下の円形Strokeは楕円断面になるので、端点だけ変形したPen Lineでは一致しない。`strokeMode=screen` は画面上一定幅、`strokeMode=geometric` はSimilarity時のみPen幅をScaleし、一般Affineでは輪郭pathをAsset化する。[Penパラメータ](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/extensions/scratch3_pen/index.js)

LINEのCarrierは非表示の塗り矩形720×540、size100、direction90、effects0で固定する。Clipを画面＋半幅＋AA余白に行い、端点がCarrierのfencingなし領域に収まることを検査する。収まらない極太線はAssetへ回す。透明Carrierはsilhouetteによって境界が変わり得るため採用しない。半透明LineはPen down時の開始点も描かれるので、cap/joinのAlpha重複を受け入れる意味仕様を設ける。均一透明度の連続Strokeが必要ならPath全体のAssetへ変換する。


**6.1 Pen/Stamp Adapterの実行可能な境界**

Compilerが出すSVGは`viewBox="0 0 W H"`へ正規化する。BitmapはbitmapResolution=2、rotationCenterは元pixel単位で保存する。これによりロード時の2倍変換でAsset Tableが変わる問題を避ける。元画像はSourceへ保持し、出力用の画像だけ正規化する。[Bitmapロード処理](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/import/load-costume.js)

CarrierはCostume libraryとは別の予約Costumeとし、番号をHeader[24]へ保存する。無描画の検証でCarrierのfencingなし領域を確認する。通常の720×540の塗り矩形では中心が画面内にある線を十分に扱えるが、その数値だけを外挿せず、実際の端点とrequest/report一致をPREFLIGHTする。Carrierはhide、rotationStyle=all around、size100、direction90、effects0。

sizeとpositionが意図通り設定されたかは、requested値とreporter値の差を設計許容値以内で確認する。非表示でもfencingが無効になるとは仮定しない。Clip対象のBoundsはAssetの論理境界＋Stroke＋Effect余白を用いる。cullはこの拡張Bounds全体が画面と交差しない場合のみ。

LINE zero-lengthの標準IR意味はdotである。DRAW LINEはpen up→Carrier設定→始点へ移動→RGB→transparency→width→pen down。終点が始点と異なるときだけ終点へ移動し、pen upする。通常線は「開始dot＋segment」のsource-over結果であり、zero-lengthはdotを二度描かない。DOTを出したくない原文のzero-length LineはCompilerがactive=0にする。

Pen幅1または3では公式PenSkinがX/Yへ0.5の補正を加える。Web側も同じ補正を入れる。元のDL座標には補正を焼き込まず、Pen互換Rasterizerの内部で1回だけ適用する。[PenSkin](https://github.com/scratchfoundation/scratch-render/blob/develop/src/PenSkin.js)

# 7. Generator Algorithms

**7.1 共通Template**

Generatorは最大instance数 `Nmax` と有限のTemplate列を持つ。Runtimeで無制限の再帰Generatorを生成しない。Nested GeneratorはCompilerで混合基数indexに平坦化するか、内側を展開する。`i`は式中0-based、List rowは1-based。

Template Programは `master t, instance i, particle row` を入力とし、親timeとchild timeを別slotで算出する。反復数が動く場合もNmaxはCompile時に上限を確定し、Programのactive出力を `i<floor(max(0,count(t)))` にする。

| Repeater | instance placement B_i（右側から適用） |
|---|---|
| Linear | `T(i*dx,i*dy)*R(i*dtheta)*S(sxStep^i,syStep^i)` |
| Radial | `R(theta0+i*dtheta)*T(radius,0)*R(localAngle+i*rotationStep)*S(scaleStep^i)` |
| Grid | col=modp(i,columns), row=floor(i/columns); `T(col*dx,row*dy)*R(i*dtheta)*S(scaleStep^i)` |
| Path | `T(P(u_i))*R(tangentAngle(u_i)+angleOffset+i*dtheta)*S(scaleStep^i)` |

`alpha_i=clamp(alphaBase*opacityStep^i,0,1)`、colorは宣言したRGB/HSV補間、phaseはcycleで加える。scaleStepの負値反転はCompilerがparityと鏡像Assetに分ける。0^0はinstance 0の倍率1として明示処理し、それ以降は0とする。

Color Stepの既定はRGB channelごとの加算で、`channel_i=round(clamp(baseChannel+i*stepChannel,0,255))`、RGB整数は`65536*r+256*g+b`。HSV選択時はHueを360でwrap、S/Vを0..1へClampしてRGBへ変換する。変換はCompilerが式またはTrackへLowerする。Stampの任意RGBをScratch color effectで近似置換しないため、固定instance色は別paint Asset、動的色は有限variant/Sequenceへ変換する。Pen LineならRGB整数を直接設定する。

**24本、0.03秒差の例**

```text
q=t-start
M_parent(q)=R(omega*q)
q_i=q-0.03*i
B_i=R(15*i)*T(radius,0)
line_i = M_parent(q)*B_i*S(pulse(q_i),pulse(q_i))*localLine
```

全体回転にはq、内部Scaleにはq_iを使う。Cameraはさらに外側でtから評価する。Pulseの前にLoopを掛けるか、delay以前を非activeにするかはSourceで別設定にする。

**7.2 Scatter**

既定はCompiler事前生成。乱数keyを `projectSeed,nodeUUID,instanceStableId,propertyTag` で分離し、個数の増減で既存instance値を変えない。ハッシュ→32bit seed→固定版PRNGをCompilerで実行し、得た最終Position/Rotation/Delay/Asset IDをIRへ保存する。Runtimeはpick randomを使わない。

分布は矩形一様なら `x=xmin+(xmax-xmin)*u`、円面積一様なら `r=R*sqrt(u),theta=360*v`。拒否SamplingはCompiler内で試行上限を持ち、不足時はエラー/明示した代替とする。

Scratch側PRNGは将来の入力依存作品用Optionalとする。Park–Miller `s'=16807*s mod 2147483647`, `u=(s'-1)/2147483646`, seed=1..2147483646なら整数積は倍精度の正確整数範囲に収まる。しかしseekにはcounter→stateの対応か再生成が必要で、任意時刻introでは保存済み乱数の方が軽い。v1の必須Moduleには入れない。

**7.3 Particle**

finite export内の全birthをCompilerで列挙する。各行にmaster秒のbirth/life、world初期位置、world初速度、world加速度、角度、角速度、scale/opacity curve、Assetを保存する。

```text
a=t-birth
active=(0<=a<life)
position = p0 + v0*a + 0.5*acc*a*a
rotation = r0 + spin*a
scale = s0 * scaleCurve(a/life)
alpha = alpha0 * opacityCurve(a/life)
```

動くEmitterは **birth時刻** の行列 `E(tb)` をCompilerで評価し、`p0=E(tb)*spawnPoint`、`v0=linear(E(tb))*localVelocity + inheritVelocity*dEmitterPosition/dt(tb)` とする。Camera行列は含めない。微分はkey intervalの片側規約を定め、birthが不連続点なら右側を使う。加速度はworld指定かbirth-local指定かをSourceに保持する。

EmitterのspaceはWORLD、SCREEN、VIEW_ATTACHEDの3択。VIEW_ATTACHEDは発生時にScreen座標を指定Zで逆投影しWORLDへ保存する。birth後はCameraへ固定しない。Emitterに追従し続ける粒子は別のFOLLOWモードであり、WORLD粒子と混同しない。

一定rateのLocal Timeはbirth/life/velocity/accelerationをmaster秒へ変換する。非線形/逆方向/Loopで時刻の逆像が複数ある場合、発生区間の各branchをCompilerで展開し、軌跡をTrack/ProgramへCompileする。単純なbirth/life式で表せない粒子を誤って積分しない。画像Bakeではなく数値軌道Bakeを先に選ぶ。

Emitterが後で移動しても既存p0を書き換えない。Cloneなし。life<=0の行は削除。負ageは描かない。毎frameの「position += velocity」は使用しない。

**7.4 Infinite Scroll**

2本の格子基底b1,b2を列に持つ可逆行列Bと、セルperiodic offset f(t)を使う。

```text
offset = B * (modp(fx(t),1), modp(fy(t),1))
tilePosition(j,k,t)=B*(j,k)+offset
```

横/縦は1D、斜めStripeは回転した1D格子、Pattern/Grid/Imageは2D格子とする。Viewport四隅を親行列とBの逆行列で格子座標へ戻し、floor(min)−margin〜ceil(max)+marginを覆うj,kを列挙する。Sprite境界、太さ、Blurの余白をmarginに含める。det(B)=0なら1Dへ正規化するかCompileエラー。

Runtimeのループ数はExport区間全体のCamera/Transform範囲からNmaxを確定する。Frameごとの可視indexをIR式から生成しても上限は一定。透明度のあるTileに重ね代を加えると継ぎ目が濃くなるため、境界を一致させるか、周期Textureを1枚生成して使用する。


**7.5 Generatorの数値生成規約**

乱数はSHA-256で `canonical([projectSeed,nodeId,instanceStableId,propertyTag])` をhashし、先頭4byteをunsigned big-endian整数hにする。Park–Miller seed=`1+h mod 2147483646`。各Propertyの独立streamから値を取り、最終値をIRへ保存する。normal分布はBox–Mullerを用い、u=0を生成しないよう開区間へ写す。指定min/maxへClampする規約を保存し、無制限のrejection loopを使わない。

Linear/Radial/Grid/PathのNmax、Template数K、Nested count積はCompile時に整数で計算する。積がProfileを超えた時点で内側展開や数値Bake候補を評価する。R_MAX=0は描画なし。Grid columns<=0は入力エラー、Path Repeaterの全長0は同一点へ配置しtangent=(1,0)。count(t)の端数はfloor、負値は0、R_MAX超過はCompileエラーである。

Particle rateはLocal秒あたりの発生数。非負rate r(q)を積分した累積R(q)が整数nを越える最初の時刻をbirthとする。rがpiecewise constant/linearなら解析積分、それ以外は誤差上界付き適応積分と単調二分探索を使う。birth誤差を1e−8秒以下にし、rate=0区間ではbirthを出さない。同時BurstはSource順と粒子indexで安定順にする。

Node retimeの単調branchごとにLocal birthの逆像を求める。Loopの各周回は異なるeventInstance IDを持ち、過去周回の粒子がlife内なら残るかclipするかをCompositionのactive範囲で確定する。逆再生やfreezeでmaster時間に単純変換できない軌道は、Local ageとTimeMapをProgramへ残すか数値Track化する。PT_BIRTH/LIFEの単純式へ誤変換しない。

Infinite Scrollの可視範囲計算で親行列が特異になる時刻は逆行列を作らない。Scale0なら非描画。1軸だけ0なら退化形状をGenerated GeometryへLowerする。Cameraの最大可視領域がNear-planeで発散する場合はnear>0とfinite motion rangeで分離する。上限を証明できないRepeaterを無制限loopとして出さない。

**7.6 放射Particleの編集契約**

radialLaunch=nullは従来のCartesian velocityを使う。設定時は発生ごとの方向と非負speedを決め、そのXY速度を既存velocityへ加える。既存velocityは独立した平行移動の成分、Z速度は従来通り。角度はEmitterの発生時Local座標の+Xから反時計回り。angleSpanは符号付きで、0は同一方向。angleStart/angleSpanはbirthのLocal Timeと固定発生ordinalで評価する。

新規UIの標準値はangleStart=0、angleSpan=360、speed=constant(100)、distribution=distributed、Cartesian velocity=0。既存ファイルへこのPresetを勝手に適用しない。速度Distributionの下限は0以上。uniform/normalのmin≤max、全て有限、normalのsigma≥0を検査する。

randomは既存のSeed付き独立streamを使う。distributedは固定発生ordinalの順序を保った低偏りの角度列。v1.3のCompiler内規約は、ordinal+1の2進桁反転値へ当該Emitterのseed位相を加え、1周期へ折り返す。0..1の角度比率をangleStart..angleStart+angleSpanへ写す。これはRuntime APIやPDF互換条件ではなく、同じSourceから同じ出力を得るための版固定規約である。個数変更で既存ordinalを変更しない。BPM変更やEmission設定の編集でbirth列自体が変わる場合は、その編集結果として再生成する。

初速度は発生時EmitterでWorldへ変換する。accelerationSpace=worldは従来のWorld加速度、birthLocalは発生時Emitterの線形成分で1回変換する。Scaleを含むLocal速度／加速度の変換規約は既存7.3に従う。followモードも加速度の指定基準を保存するが、World単純軌道へ誤変換せず既存のLocal軌道ProgramへLowerする。

# 8. Path Algorithms

**8.1 共通API**

`samplePosition(path,u,time)`、`sampleTangent(path,u,time)`、`drawProgress(path,start,end,time)`、`placeAlongPath(path,u,time)`。uは既定で**正規化arc length**。Bezierのparameterとは別名vを使う。Closed pathはwrap、Open pathはclamp。

静的PathはCompilerでPolylineへSamplingする。点P_jごとに累積長 `s_j=s_(j-1)+|P_j-P_(j-1)|` を保存する。目標長 `s=u*total` を二分探索し、該当segment内を線形補間する。ゼロ長segmentを除去し、全長0は最初の点とtangent=(1,0)を返す。

**8.2 Curve評価**

```text
Cubic B(v)=(1-v)^3*P0+3*(1-v)^2*v*P1+3*(1-v)*v^2*P2+v^3*P3
B'(v)=3*(1-v)^2*(P1-P0)+6*(1-v)*v*(P2-P1)+3*v^2*(P3-P2)
Circle/Arc(v)=center + radius*(cos(a0+v*sweep),sin(a0+v*sweep))
```

SplineはCompilerでCubic chainへ変換する。v1標準Splineはcentripetal Catmull–Rom。knotsは `h_i=h_(i-1)+|P_i-P_(i-1)|^0.5`、重複点は統合する。P1→P2区間のHermite tangentは

```text
m1=(h2-h1)*[(P1-P0)/(h1-h0) -(P2-P0)/(h2-h0) +(P2-P1)/(h2-h1)]
m2=(h2-h1)*[(P2-P1)/(h2-h1) -(P3-P1)/(h3-h1) +(P3-P2)/(h3-h2)]
C0=P1; C1=P1+m1/3; C2=P2-m2/3; C3=P2
```

端点は鏡映仮想点で補い、閉路ではwrapする。Bezierの中点だけでflat判定しない。control hullからchordへの最大距離と、control polygon長−chord長の両方を検査し、de Casteljau二分する。最大投影Scaleを含め画面誤差に換算する。

**8.3 動的Path**

Control点だけが動く場合はgeometry Programが時刻から全Control点を返す。Compilerは全Export範囲に対する誤差上界から分割v一覧を確定するか、時間bin別の固定分割を作る。Scratchはその有限個のvでCubicを評価し、現在の累積長を作る。長さ等速移動には**現在形状の累積長**を使う。

標準固定版のSamplingで品質を満たせない場合は、時間別Polylineの数値サンプルへ変換し、さらに必要な時だけ画像Sequenceへ送る。Scratchで制御なしの適応再帰Subdivisionは実行しない。

TangentはCubicなら導関数を優先する。ほぼゼロなら左右の近傍点差を決定論的に使用する。角やcuspで方向が不連続なのは数学的性質なので、bevel/round joinを選ぶか、Authoringで平滑化する。前フレームの角度に頼ってseek結果を変えない。Polyline tangentはsegment方向を既定とし、頂点ちょうどでは進行方向側を選ぶ。

**8.4 trim / drawProgress**

`start,end`を累積長へ変換し、両端segmentを部分切断して間のsegmentだけ描く。Openでstart>endは空。Closedでは明示wrapモードの時だけ2区間へ分ける。Stroke幅0/alpha0は描かない。

**8.5 Ribbon / Trail / Light Streak**

Ribbonはarc length位置でcenter P、unit tangent T、normal N=(-Ty,Tx)、width wを求め、左右点 `P±w*N/2` を作る。幅/Opacityは正規化長さのTrackで変える。

- 細い・不透明・一定幅：Pen Polyline。
- 柔らかい線：局所radial-gradient Stampを密に配置。
- 幅可変：短いSegment Stamp/重なる円Stamp。長さと幅の比が動く矩形は1AssetのScaleXYで代用せず、Generated aspect variantまたはPen segmentへ変換。
- 自己交差、均一alpha、厳密なjoinが重要なRibbon：全輪郭をGenerated Asset/局所Sequence。

Segment densityは `spacing<=min(width*k,screenErrorBound)` のProfile値からCompileし、必ずNmaxを持つ。重なる半透明Stampのalpha合成が意図と異なる場合はArtistがその見た目を選んだ場合のみMulti-stampを使う。Glowは加算合成ではなくsource-overのsoft stampsとして定義するか、光学的な加算結果を背景を含む最小合成区間でBakeする。

**Trailは2種類を区別する。**

```text
shape-follow trail: point_j = Path(u(t)-j*du, time=t)
temporal trail:     point_j = WorldTrajectory(time=t-j*dt)
```

後者ではPath形状・Emitter・親Transformも過去時刻で評価し、Cameraだけ現在時刻で投影する。前フレームのStampを残す方法はerase-all・seekと矛盾するため採用しない。Motion Blurはこれと異なりシャッター区間のscreen imageを積分するので、Cameraも各サンプル時刻で評価する。


**8.6 Samplingの停止条件とArc-length誤差**

Bezier静的Subdivisionはde Casteljauで二分し、control hullのchordからの距離とcontrol polygon長−chord長を両方評価する。最大depth=24、最大sample数=Profile.maxSamples。達したのに許容を満たさなければ「成功したPolyline」として返さず、Asset/Sequence候補へ渡す。closed最終点は先頭の複製を持ち、累積長へ最後の閉鎖segmentを含める。

動的Pathは各time区間のControl点をintervalとして評価し、同じSubdivision treeが全区間を覆うまで分割する。time区間とv区間のどちらを二分するかは、誤差が大きい方の正規化幅を選ぶ。同点はtimeを先にする。depth/総点数上限は固定し、未収束を表現誤差としてreportする。

Arc-length逆引きで求めたPolyline区間からBezier parameter vも線形補間して保持する。位置はPolyline補間、tangentはこのvでの導関数を使用する。これは曲線位置の近似であり、誤差はPolyline許容と弧長誤差を合算する。ゼロ導関数の場合は現在区間のchord方向、それも0なら右、左の非ゼロ区間を探索、全て0なら(1,0)。時刻間の状態を参照しない。

PATH APIの閉路uは常にwrapするが、描画Trimのend=1は全周終点として扱う。samplePosition(1)が先頭に戻ることを理由にdrawProgress(0,1)を空にしない。Trim区間は弧長区間として処理し、位置APIのwrapから独立させる。

**8.7 自由曲線・流れる線・装飾の機能補完**

ユーザーはBezierの制御点を追加・削除・移動できる。元のpointsを保持し、出力Polylineへ置き換えて編集能力を失わせない。座標列の貼り付けはEditorの入力機能として提供し、有効な数値XYペアへ変換した後も視覚編集できる。末尾カンマは許容、途中の空欄・奇数個の座標・非数値は位置付きエラーとする。

曲線の表示位置と表示長を別々に調整できる。開始／終端のtrim Bindingsへ対応させ、線が伸びる、後ろから消える、短い区間が曲線上を流れる、の各演出を作れる。点番号や400分割をユーザー機能にしない。

endpoints装飾は現在表示中の始点・終点へ置く。alongPath装飾は表示範囲にspacing間隔で置く。サイズ・透明度・角度・接線追従・Assetは線から独立して編集可能。空の表示範囲は線・装飾とも非表示、1点へ退化したendpointsは1回だけ描く。線に沿う柔らかい光や影はalongPathのsoft Assetまたは等価な生成Assetで表現する。shadow passへ配置できる。

高次数Bezierの静的出力は精度管理したPolyline、動的出力は既存GEOMETRY／数値事前計算へ落とす。次数が3ではないという理由だけで全画面Baked Clipにしない。端点装飾はSTAMP、曲線はPATH/LINE、柔らかい光は適切なAssetとSTAMPを基本経路とする。

# 9. Camera & 2.5D

Cameraはposition(cx,cy,cz)、zoom、roll、focal f、near>0、far、shakeを持つ。Zは奥を正。Pointの `d=z-cz`。

```text
if perspective: active = near <= d <= far; k=zoom*f/d
if orthographic: k=zoom
screenXY = viewportCenter + R(-roll) * k * (worldXY-cameraXY)
screenScale = k*worldScale
screenRotation = worldRotation-roll
```

各Stampは一定Zのcamera-facing plane。内部でZが異なるPathは個々の頂点をnear/far Clipして投影するが、v1通常Pathは単一Zに揃え、深度可変はsegment群へCompileする。planeにRotationX/Yを掛けた任意透視WarpはStampでは表現しない。

ParallaxはCamera移動とdの差から自然に出す。独立した視差係数を使う場合はCamera-relative Position式として保存し、Perspectiveと二重に掛けない。TunnelはRing群のZを周期的に変え、near/far外をcullする。near=0へ近づけて巨大Scaleを作らない。

Shakeはseed付きの事前Noise Trackまたは固定周波数のSin和。Camera XY/roll/zoomそれぞれに純粋関数として加える。pick randomもframe count依存も使わない。Worldの全要素で同じCamera Program出力を共有し、Screen overlayには適用しない。

**Local Cameraを必要とする条件**：Composition内部に独立したPan/Perspective、または複数のViewportで異なる見え方が必要な場合だけ、CompositionのViewを作る。文字＋Ringを一緒に動かすだけならGroup/Composition transformで十分。

Local Viewは内部World→Composition平面へ1回投影し、その平面を外側へ配置する。外側Main Cameraは必要ならその平面へ1回作用する。この2段は別Worldを結ぶ明示投影であり、同じCameraの二重適用ではない。Viewport clipやisolated effectがなければ点の式へFlattenできる。あれば内部合成結果をAsset/Sequenceにする。Split Screenは複数Viewとviewport clipを持ち、Lineは数値Clip、画像が切れる場合はcrop Asset/Sequenceを使う。

Painter orderを既定とし、自動Z-sortは選択したDepth Island内だけで行う。Depth Islandではfar→near、同Zは固定ordinal順。異なるIsland間はEditorのレイヤー順。Screen Graphicが偶然奥へ回るような全体Z-sortは行わない。


**9.1 DepthとView適用の明示契約**

Camera Nodeのposition/rotationは通常のTransform field、zoom/focal/near/far/shakeはcamera.dataから評価する。VIEW ProgramはCameraのAncestor TimeMapをmasterTimeから辿ってCompileした式であるため、Sceneを移動すればCamera Animationも同じLocal Timeへ移る。

D_VIEWで投影するMatrixは平行な一定ZのLeafへ適用する。view=0のscreen LeafにもStageFitだけは1回適用する。island sort=depthの場合、全Leafが同一の最終View IDであることをValidatorが要求する。Background/Overlayは別islandで、Camera Z比較へ混ぜない。

近平面外のPROJECT_MATRIXは `[1,0,0,1,0,0,0]` を返す。ゼロ除算を実行してからSELECTで隠すのではなく、division前にnear/farを検査する。最後のactive=0を親のactiveと乗算する。zoom<=0も非active。負zoomのAuthoringは鏡像Asset/回転へLowerし、Cameraには正zoomだけを渡す。

# 10. Asset & Costume System

**10.1 境界**

| 系統 | 事前Library | Generated SVG / PNG | Procedural Geometry |
|---|---|---|---|
| Circle、Dot、Bar、Rectangle | 基準比率の輪郭 | 任意比率の矩形、角丸 | LineとしてのBar、stroke輪郭 |
| Triangle、Diamond、Polygon、Star | よく使う角数・比率 | 任意角数・頂点・内外径比 | 動的頂点はPolyline、fillはAsset |
| Arrow、Chevron、Bracket、Crosshair、Target | 基準形 | 太さ・head比率・隙間が違う形 | 動的線要素はLINE群 |
| Ring、Arc、Frame | 基準厚み | 任意厚み・角・輪郭 | 動的Arc trimはPATH |
| Burst、Spark、Shard、Blob、Petal | 代表的な形 | seedや形状パラメータから生成 | 必要な輪郭Animationのみ数値Path |

LibraryをEditorに搭載するが、sb3には使ったAssetと必須Carrierだけを入れる。任意幅w、高さhのRectangleはその寸法のpathを生成する。厚みhのRingは外半径Rと内半径max(0,R−h)の輪郭差をpath化する。Stroke/Fillの規約はSourceで保持する。Arc Lengthが動く場合、一定幅なら静的Circle Pathのtrim、塗り扇形や端形状が複雑なら形状variant/Sequenceとする。

SVGはFont text、外部画像URL、script、foreignObject、未検証filterに依存させない。通常のpath/fill/strokeと検証済みGradientへ正規化し、BlurはPNGまたは輪郭生成へ変換する。SVG機能のWebブラウザでの表示成功だけでScratch互換と判定しない。

**10.2 IDとdedup**

Compiler内AssetKeyは内容hash。最終IRでは到達可能Assetを安定順に並べて1..Nを割り当てる。`A_COSTUME[id]`だけがScratchのCostume番号を持つ。Costume名は `ig_<sha256>_<variantOrdinal>` とし、純数値名を使わない。序数に依存するScratchのswitch costume入力は数字とする。

Costume直接参照はListが1回減るが、dedup・追加・Sequenceの参照を全部修正する必要がある。Asset Table方式ならCompilerの最終リンクだけで再割当できるため後者を採用する。Scratch編集画面でCostumeを手動並べ替えた場合はABIのAsset mapが古くなる。INITで記録したCostume名とswitch後のCostume nameを照合し、不一致を検出する。名前自体の変更は再Compile/再リンクが必要。

sb3のCostume recordは `name, assetId, md5ext, dataFormat, bitmapResolution, rotationCenterX/Y` を正式Serializerと整合させる。Asset IDのdedupキーとsb3 media assetIdは別概念であり、同じ文字列であると仮定しない。[sb3 Serializer](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/serialization/sb3.js)

**10.3 Sequence**

SequenceはフレームAssetを連続Costume番号で表さない。`Q_FIRST,Q_COUNT → QF_TIME,QF_ASSET` を参照する。QF_TIMEは最初0の厳密昇順、区間 `[time_j,time_(j+1))` はframe j、末尾はQ_DURATIONまで。任意時刻はupper_boundで直接取得する。Frame skipでも連番indexを加算しない。

全Frameは同じ論理Canvas・同じAnchorで生成する。透明余白をcropする場合は各Frameの原点補正をCostume rotationCenterに保存し、Stamp時の平行移動補正を二重に加えない。同一画像はAssetを再利用してよい。

Asset数や容量を減らすためのFrame間引きは、最大画面誤差または指定Frame rate契約の範囲内だけで行う。Frame間のCrossfadeを勝手に入れない。Compiled Sequenceは任意tで決定論的だが、その見た目は元の連続Animationの時間Sampling近似である。


**10.4 Shape FactoryとPaint評価**

標準Shapeは中央原点、Arrowの前方は+X。Rectangleは±width/2,±height/2。Circle/Dotはradius。Triangle/Polygonは外接円の等角点、Diamondは4頂点、Starは外半径/内半径を交互、Ringは外周と内周のevenodd fill、ArcはstartAngle〜startAngle+sweepAngleの弧。Frameは外矩形と内矩形の差、Bracket/Crosshair/Targetは複数Bar/Arcのunion。Arrowはshaft幅とtipRatioから7頂点、Chevronは折れた帯輪郭。Burst/Sparkは交互半径のStarを基本とし、Shardはseed付きの凸多角形、Blob/PetalはCubic閉曲線として生成する。

Shape.paramsは全Shapeで同じclosed field集合を持ち、非使用fieldも既定値を明示保存する。未使用値で描画を変えない。既定値はwidth=100,height=100,radius=50,innerRadius=25,thickness=8,cornerRadius=0,sides=6,points=5,startAngle=0,sweepAngle=360,tipRatio=.4,seed=0。不正な負寸法は反転へ勝手に変換せず入力診断、負ScaleはTransformとして別に扱う。

静的Maskの最終経路はPNG alpha合成であり、未知のSVG clip/filter互換性に依存しない。必要なら輪郭交差でSVGを生成してよいが、PNG経路を必ず実装する。Blurはpremultiplied RGBAへ分離Gaussianを適用し、半径ceil(3*sigma)、kernelを正規化、外側を透明とする。sigma=0はidentity。Morphological spreadはalphaのmax/min filterで距離を増減し、Glowはspread→Blur→指定色→元内容の順。Shadowはalpha→spread→Blur→offset→指定色として元内容の背面へ置く。これらの順序をEffect stackに対応させる。

Gradientはstopsを位置昇順に並べ、同位置は右側stopを採用し、RGBAはpremultiplied sRGBで補間する。SVG実装との差を避ける必要のあるGradientはPNGへ生成する。Mask lumaはlinear-light輝度 `0.2126R+0.7152G+0.0722B` にmask alphaを掛ける。alpha maskはalphaだけを使う。mask invertは1−mask、featherはmask値へGaussian適用後にcontentのRGBAへ掛ける。

任意四隅Warpは元矩形の4点対応から8未知数のHomographyを部分Pivot付きGaussian eliminationで解き、出力pixel中心を逆写像してbilinear sampleする。quadが自己交差、面積0、分母が0を横切る場合は区間分割し、それでも不正なら入力診断。補間順はpremultiplied RGBA。World/ScreenによるEffect適用時刻・投影順はSourceに保存したspaceとEffect位置を使う。

**10.5 Asset生成時の範囲と容量**

Assetの共通座標から最終画面までの最大Scaleで必要Raster解像度を決める。Geometry tolerance以下になる解像度まで上げ、Profile容量を超えたら無条件に縮小しない。Blur余白はceil(3*sigma)+spread+2pxを取り、Shadow offsetの両端を含める。局所Sequenceは全Frameの論理Bounds unionを使い、各frameのrotationCenterを共通原点へ合わせる。

SVG viewBoxの非ゼロoffsetは出力前にpath座標とrotationCenterへ吸収し、常に0始まりにする。公式SVGSkinがviewBox offsetをrotationCenterから引く処理と二重にならない。[SVGSkin](https://github.com/scratchfoundation/scratch-render/blob/develop/src/SVGSkin.js)

# 11. Scratch List Schema

**11.1 共通規則**

- ABI=`IGRT/1.1`。全ID/referenceは整数、1-based。0はoptional referenceなし。`item 0`を読むことは禁止。
- 永続数値は有限数、時間秒、角degree、alpha 0..1。stringは名前/hash/Sourceだけ。数値Listで空文字を0として利用しない。
- 同じTableのParallel Listsは全て同じrow数。Compilerが長さ・enum・外部参照・範囲を検査する。
- 可変長配列は `FIRST,COUNT`。COUNT=0ならFIRST=0で読み取りなし。COUNT>0なら `1<=FIRST<=FIRST+COUNT−1<=poolLength`。
- runtimeは永続Tableを削除・insertしない。unused entryはCompilerのreachability GCで削除し、全参照を再割当する。tombstoneは使わない。
- 各Listは200,000 items以下に制限する。これは確認したScratch追加操作の上限に合わせた互換上限であり、巨大な初期Listを抜け道にしない。[List実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/blocks/scratch3_data.js)
- 以下で `{X,Y}` は実在する2本のList名への**省略表記**。例えば `PV_{X,Y,S}` は `PV_X,PV_Y,PV_S`。Runtimeに動的List名検索は作らない。
- 各Tableには暗黙のID列を追加しない。行番号がID。COUNTを得る基準Listは表の先頭List。

**11.2 ヘッダー／編集情報**

| List名 | index / 意味 |
|---|---|
| IG_HEADER | 固定24 items：1 ABI文字列、2 duration D、3 targetFPS、4 width、5 height、6 stageFitScale、7 backgroundRGB、8 qualityVersion、9 moduleMask、10 maxDraws、11 maxMemCells、12 maxFrames、13 maxPathSamples、14 maxAudioCatchup、15 sourceHash、16 irHash、17 moduleHash、18 assetMapHash、19 sourceEncoding=`gzip-base64-json-v1`、20 LAST_TIME=nextDown(D)、21 binDuration、22 sampleFPS（0=連続）、23 numericLimit=1e100、24 carrierCostume番号 |
| IG_SOURCE | gzip-base64の4096文字chunk列。連結順で復元。Scratchは読まない |
| IG_MODULE | 使用する固定Moduleの識別名＋version文字列。Web検証用。未使用Moduleの表は空 |

IR hashはhash欄そのものとSourceを除くcanonical serialization、Asset bytesのdigestを含め計算する。Scratch内では暗号hashを計算せず構造・名前の検査、Web/Compilerで完全hash検査をする。

**11.3 Command / Template / Layer / Generator**

| List名 | 同じrowの各columnの意味 |
|---|---|
| C_KIND, C_FIRST, C_COUNT | command種別0=DIRECT,1=REPEAT,2=PARTICLE。Template範囲 |
| C_GEN, C_START, C_END | kind1→R ID、kind2→PS ID、direct→0。master active候補区間 `[START,END)` |
| C_ISLAND, C_ORDER | island ID、island内の固定command ordinal。重複禁止 |
| D_PRIM, D_PROGRAM | Templateのprimitive 1..4、DRAW Program ID |
| D_ASSET, D_PATH, D_SEQUENCE | STAMP/LINE/PATH/SEQUENCE用参照。対象外は0。LINEは全て0 |
| D_VIEW, D_STROKE | 最後に適用するView ID。0=screen。stroke 0=geometric,1=screen |
| D_ORDER | Templateのcommand内ordinal、1..C_COUNTの順列 |
| I_SORT | island順はrow順。0=painter、1=far-to-near depth |
| R_KIND, R_MAX, R_ORDER | 0 linear,1 radial,2 grid,3 path,4 lattice。最大instance数。0 instance-major,1 template-major |
| PS_FIRST, PS_COUNT | Particle Tableの連続範囲 |

R Tableには位置やPhaseの別コピーを持たない。それらの定数/TrackはTemplate Programが唯一の所有者となる。Rは走査範囲と順序だけを制御し、R_KINDはCompiler/Web診断用。`IG REPEAT` はmode別描画を重複実装せず同じ有界Template反復を行う。

Compiled sort keyは `(islandID, depthKey if depth-sort, C_ORDER, localOrdinal, segmentOrdinal)`。localOrdinalはinstance-majorなら `i*C_COUNT+D_ORDER`、template-majorなら `(D_ORDER−1)*R_MAX+i+1`。複数CommandへGenerator展開するCompilerは、同じ順序になるC_ORDERを再割当する。

**11.4 Program / Instruction / Register**

| List名 | 意味 |
|---|---|
| P_KIND, P_FIRST, P_COUNT | 0 DRAW、1 VIEW、2 GEOMETRY、3 SHARED。Instruction範囲 |
| P_REGS, P_OUTPUT, P_OUTCOUNT | Programのslot数、出力開始slot、出力個数 |
| O_CODE, O_DST, O_FIRST, O_COUNT | opcode、出力開始slot、引数pool範囲 |
| O_IMM | CONST値または静的ID/enum。opcode表以外で解釈しない |
| OA_SLOT | 引数pool。全て現在Program内のslot番号。Matrix入力は連続6slotの先頭 |
| S_PROGRAM, S_FIRST, S_COUNT | master時刻だけに依存するSHARED ProgramとSH_DATAの出力範囲。row順が依存順 |
| SH_DATA | フレーム可変。Shared結果のFlattened List |
| V_PROGRAM | View row→VIEW Program。tだけに依存。局所ViewはCompilerが式へFlatten |
| V_DATA | フレーム可変。11 cells/View。`11*(viewID−1)+j` |

Instructionは制御フローの分岐・ジャンプ・任意CALLを持たない。O_DSTに複数slot書くopcodeの出力幅は表で固定する。Compilerは各slotが読む前に書かれ、出力範囲がP_REGS内であることを検証する。常用定数はCONSTをまとめて先頭に置く。Selectの両枝は評価済みなので、ゼロ除算はDIV命令自体で検査する。

| O_CODE | 引数数／O_IMM／出力 | 意味 |
|---|---|---|
| 0 CONST | 0／有限数／1 | 即値 |
| 1 INPUT | 0／0=t,1=i,2=particle row／1 | 呼び出しContext |
| 2 SHARED | 0／SH_DATAのindex／1 | 同フレーム共有結果。先に生成済みだけ読む |
| 3 PARTICLE_FIELD | 0／Particle column enum／1 | Contextのparticle rowから読む |
| 4 MOV | 1／0／1 | scalar copy |
| 5 ADD,6 SUB,7 MUL,8 DIV | 2／0／1 | DIVの分母0はfault |
| 9 MIN,10 MAX,11 POW | 2／0／1 | POWは有限実数結果だけ。0^0は1というIR規約 |
| 12 ABS,13 FLOOR,14 SQRT | 1／0／1 | SQRT負値はfault |
| 15 SIN,16 COS | 1／0／1 | degree |
| 17 ATAN2 | 2(y,x)／0／1 | degree、(0,0)=0 |
| 18 MODP | 2(x,L)／0／1 | L>0。その他fault |
| 19 LT,20 LE,21 EQ | 2／0／1 | 数値比較、結果0/1 |
| 22 SELECT | 3(cond,a,b)／0／1 | cond!=0ならa |
| 23 TRACK | 1(time)／Track ID／1 | Track評価 |
| 24 MAT_TRS | 7(x,y,sx,sy,theta,ax,ay)／0／6 | T*R*S*T(-anchor) |
| 25 MAT_MUL | 2(matrixBaseA,B)／0／6 | 行列合成 |
| 26 MAT_POINT | 3(matrixBase,x,y)／0／2 | 座標変換 |
| 27 PATH_SAMPLE | 2(u,geometryTime)／Path ID／4 | x,y,unitTangentX,Y |
| 28 PROJECT_MATRIX | 12(cx,cy,cz,zoom,roll,f,near,far,centerX,Y,projection,z)／0／7 | 6成分Camera行列＋active。projection=0 ortho,1 perspective |

Loop、Ping-pong、Wave、Stagger、Particle式、Repeater式は上記scalar命令へ展開する。PATH_SAMPLEから呼ぶGEOMETRY ProgramはPATH_SAMPLEを含めない。VIEW/SHARED ProgramもPATH_SAMPLEを含めない。これでEvaluatorのCall Graphは固定で、Hierarchy由来の再帰はない。

DRAW出力は連続32slot。出力slot番号は相対offsetで、P_OUTPUTから数える。

| offset | 意味・既定値 |
|---|---|
| 1..6 | Camera前Matrix a,b,c,d,tx,ty。identity |
| 7,8 | world z=0、alpha=1 |
| 9,10 | stroke width=1、RGB integer=0 |
| 11,12 | color effect=0、brightness=0 |
| 13 | assetOverride=0。正数ならD_ASSETの代わり。Particle等に使用 |
| 14,15 | path trim start=0,end=1 |
| 16 | sequence localTime=0 |
| 17..20 | LINE x0,y0,x1,y1=0 |
| 21,22 | active=1、depthBias=0 |
| 23 | geometryTime=master t。PATHと動的Path samplingに使用 |
| 24..32 | reserved=0。v1で別用途に流用禁止 |

VIEW出力11slotは `cx,cy,cz,zoom,roll,f,near,far,centerX,centerY,projection`。GEOMETRYはCubic数Nに対し、各4制御点のXYが連続する8*Nslot。SHAREDは任意の有限scalar列。ProgramごとにP_OUTCOUNTを検査する。

**11.5 Track / Keyframe / Ease**

| List名 | 意味 |
|---|---|
| T_FIRST, T_COUNT, T_DEFAULT | Key範囲、空の場合の値。Track外は端値Hold |
| K_TIME, K_VALUE, K_EASE | 時刻、値、右側区間のEase ID。最後のEASEも有効IDを置くが未使用 |
| E_KIND, E_PARAM, E_FIRST, E_COUNT | kind0 HOLD,1 LINEAR,2 SINE_IN,3 OUT,4 INOUT,5 POWER_IN,6 OUT,7 INOUT,8 LUT。PARAMはpower n、他0。LUT範囲 |
| EL_U, EL_VALUE | 非一様LUTのuと値。先頭u=0、末尾u=1、u厳密昇順 |

Angle unwrap、sRGB/HSV色補間等はCompilerがscalar Trackへ解決する。色空間をScratchが勝手に推測しない。

**11.6 Path**

| List名 | 意味 |
|---|---|
| H_KIND, H_CLOSED | kind0 STATIC_POLYLINE,1 DYNAMIC_CUBIC。closed0/1 |
| H_FIRST, H_COUNT, H_LENGTH | static PV範囲、総長。dynamicでは0,0,0 |
| H_PROGRAM, H_CUBICS | dynamic GEOMETRY Program、Cubic数。staticでは0,0 |
| H_SAMPLE_FIRST, H_SAMPLE_COUNT | dynamic分割点HS範囲。staticでは0,0 |
| PV_X, PV_Y, PV_S | static座標と累積長。closedは末尾に先頭座標を複製して閉路長を含める |
| HS_SEGMENT, HS_U | dynamic samplingのCubic番号1..H_CUBICSとparameter v。連結Cubicの重複境界は出力時除去 |

v1のdynamic control layoutはCubicごと4点×XY=8slot。接続点はProgram出力上重複してもよい。接続条件はCompilerが検査する。各GEOMETRYは`t`として渡されたgeometryTimeだけと、明示Context i/particle rowへ依存できる。

**11.7 Particle**

| List名 | 意味 |
|---|---|
| PT_BIRTH, PT_LIFE | master秒での発生と寿命 |
| PT_X, PT_Y, PT_Z | birth時点の最終world位置 |
| PT_VX, PT_VY, PT_VZ | master秒基準の初速度 |
| PT_AX, PT_AY, PT_AZ | master秒基準の加速度 |
| PT_ROT, PT_SPIN | 初期degreeとdegree/秒 |
| PT_SCALE, PT_ALPHA | 初期倍率とalpha |
| PT_ASSET, PT_SCALE_TRACK, PT_ALPHA_TRACK | Asset ID、normalized age入力のTrack ID。Trackは0を認めず定数Trackを共有 |

PARTICLE_FIELD enumは上表順に0..17：BIRTH,LIFE,X,Y,Z,VX,VY,VZ,AX,AY,AZ,ROT,SPIN,SCALE,ALPHA,ASSET,SCALE_TRACK,ALPHA_TRACK。TRACK opcodeのIDは静的なので、異なるcurve組の粒子はPS/Templateを分ける。FIELDのTrack IDを任意動的TRACK呼び出しに使う実装はv1に含めない。CompilerはPS内のcurve参照がTemplateと一致することを検査する。

**11.8 Asset / Sequence / Audio / index**

| List名 | 意味 |
|---|---|
| A_COSTUME, A_NAME | 1-based Costume番号、期待する固有名 |
| A_W, A_H, A_CX, A_CY | Skin基準寸法、Costume rotationCenter。WebのAsset座標復元にも使用 |
| A_RES, A_UNIT, A_HASH | bitmapResolution（SVGは1）、100%時の論理px変換倍率、content hash。出力Assetは原則UNIT=1 |
| A_MIN_SIZE, A_MAX_SIZE | Compileした適用可能なScratch size百分率。公式Clampより保守的でもよい |
| Q_FIRST, Q_COUNT, Q_DURATION | frame table範囲、Sequence秒長 |
| QF_TIME, QF_ASSET | frame開始秒とAsset ID |
| AU_SOUND, AU_NAME, AU_DURATION | 1-based Sound番号、名前、秒長 |
| AE_TIME, AE_SOUND, AE_ORDER | master秒、AU ID、同時刻の安定順。時刻順に事前sort |
| AB_TIME, AB_SOUND | 任意の再開checkpoint。そこから末尾までPremixしたAU ID。音声ありでは0秒必須、音声なしでは空 |
| B_FIRST, B_COUNT, B_COMMAND | 任意の時間bin index。FIRST/COUNTはB_COMMANDの候補command ID範囲 |

Time binは `b=min(binCount,1+floor(clamp(t,0,LAST_TIME)/binDuration))`。binDurationはIG_HEADER[21]に保存し、INITはそこからIG_BIN_DURATIONへ読み込む。作品別のINITコード生成はしない。bin自体を使わない出力はB_*を空にして全C走査。候補は保守的supersetとし、境界の評価は必ずC_START/C_ENDとProgram activeで再検査する。

**11.9 可変Work Lists**

| List名 | レイアウト／用途 |
|---|---|
| M | Program register memory。現在frame base bとslot sは `M[b+s−1]` |
| F | 8 cells/評価frame：1base,2regs,3program,4pc,5t,6i,7particleRow,8parentFrame。`8*(fid−1)+k` |
| PX, PY, PS | Pathの現在Polylineと累積長。一時領域。長さをCompiler maxSamplesまでINITで確保 |
| DL_KIND, DL_ASSET | prepared draw list。最終1=STAMP,2=LINE |
| DL_X, DL_Y, DL_U, DL_V | Stamp位置XY、LINEは始点XYと終点UV |
| DL_SIZE, DL_DIR, DL_ALPHA | Stamp size百分率、Scratch direction、alpha |
| DL_WIDTH, DL_RGB, DL_COLOR, DL_BRIGHT | LINE太さ/RGB、Stamp effect値 |
| DL_ISLAND, DL_DEPTH, DL_COMMAND, DL_LOCAL, DL_SEGMENT | 安定Sort key。StampのSEGMENT=0 |
| DL_PERM, DL_SORT_TMP | draw rowの順列とstable mergesort作業用。画面順だけ変更しpayloadを並べ替えない |
| DL_GROUP | 同じLeafのPath segment等を連続に扱う識別値。v1は各Leaf共通depth |

DLは最大maxDrawsまで事前allocateし、`DL_N`で有効件数を持つ。PX等も有効件数 `PATH_N` を別に持つ。毎frame永続データをappend/deleteしない。M/FもINITで最大長を確保する。Scratchのreplace itemは未作成indexへ拡張しないため、allocate前のreplaceは禁止。

**11.10 Global variables**

固定名は `IG_STATUS,IG_ERROR,IG_PLAYING,IG_T,IG_PREV_T,IG_WALL0,IG_SEEK0,IG_RATE,IG_FRAME,IG_REQUEST_SEEK,IG_HAS_SEEK,IG_AUDIO_CURSOR,IG_AUDIO_MODE,IG_FRAME_MS,IG_BIN_DURATION,IG_GEOM_BASE,IG_EVAL_BASE,DL_N,PATH_N,F_TOP,M_TOP`。IG_STATUSは0未初期化、1準備、2再生、3停止、−1fault。IG_ERRORは数値code（後述）、詳細はWeb/Compiler reportへ対応させる。

temporaryはMy Blockごとの接頭辞 `TR_*,EA_*,MA_*,PA_*,CL_*,SO_*,AD_*` で分離する。別blockが同じtempを使わない。反復の生存変数はFまたは専用stackへ置く。ユーザーイベントはrequest変数だけを書き、EvaluatorやDLを直接書かない。


**11.11 機械仕様、Header、Moduleの完全化**

`runtime-abi.json`が全永続Tableの列名と型、Opcodeの入力幅/出力幅、work List名、Header24項目を列挙する。`runtime-lists.schema.json`がJSONの型・必須field・追加field禁止を検査する。本文の省略記法を実装時に人手で展開しない。

Header[8]はProfile ID文字列、[9]はModule bit mask。bit値はcore=1,line=2,path=4,repeat=8,particle=16,sequence=32,audio=64。PATHはlineを要求、全Moduleはcoreを要求する。IG_MODULEは`core@1.1`等の有効Module名をbit順に格納する。未知bit/Module、必要Moduleの欠落はerror10。Header[12]のmaxFramesは映像Frame総数ではなくEvaluator call frame最大深度。

Header[21]=binDuration（binなしは0）、[22]=sampleFPS（連続は0）、[23]=1e100、[24]=Carrier Costume番号。Header[6]のfitScaleはSource fitに基づくmin/maxの値であり、ProjectごとのINITコードへ埋め込まない。WORK領域の最大値は全ProgramからCompilerが算出し、INITはHeaderに従ってallocateする。

全ListはPainterローカル、IDは`ig:list:<name>`、Variable IDは`ig:var:<name>`、Painter名は`IG_PAINTER`とする。IDはSB3のdictionary keyで、Listの表示名だけで参照しない。WebはPainterのIG_HEADERとmodule規約から識別する。Painterが複数なら曖昧として拒否する。

Asset IDはコンパクトなrow index。SB3 mediaはbytesのMD5をassetId/filenameに、IGの整合検査はSHA-256をA_HASHへ保存する。Hash方式を同一視しない。名前は`ig_<sha256>_<variantOrdinal>`とし、短縮digestの衝突を黙認しない。非表示CarrierはAsset Tableに入れずHeaderから参照する。

**11.12 Canonical hashの決定手順**

実装言語ごとのJSON number表記の差を避けるため、canonical binary token列を定義する。null=`N`、bool=`B0/B1`、number=`D`＋IEEE754 binary64 big-endian 8byte（−0は+0）、string=`S`＋UTF-8 byte数の十進ASCII＋`:`＋UTF-8。array=`A`＋要素数＋`:`＋各token。object=`O`＋member数＋`:`＋Unicode code point順にsortしたkey token/value token。NaN/Infinity、孤立Surrogateを拒否し、Unicode正規化は行わない。

sourceHashはIGAUTHOR Root全体のcanonical hash。IR hashは永続Lists（IG_SOURCEを除く、IG_HEADER[16]だけ空文字にしたもの）とmedia SHA-256一覧のcanonical hash。moduleHashは実行Block graphのopcode,next,parent,inputs,fields,mutation,shadow,topLevelをcanonical化し、座標x/yとコメントを除外する。AssetMapHashはA_*と対応Costume metadataのcanonical hash。Web/Compilerは完全hashを検査し、Scratchは必要な構造/名前/範囲を検査する。

Source hashとIR hashを直接比較するのではない。Sourceを再hashしてHeader[15]へ照合し、IRを別にhashして[16]へ照合する。Sourceの編集後に旧IRを表示する場合はrevision不一致として示し、Compile完了後に両方を同じrevisionへ更新する。

**11.13 必須Semantic Validation**

全ProgramのInstruction範囲を確認し、入力slotの定義済み集合を先頭から更新する。Matrix入力は先頭slotだけでなく6slot全てが定義済みか確認する。dst..dst+width−1の範囲も検査する。opcodeの即値IDは有限整数として解釈し、floorして別IDへ変えない。JSONの1と1.0は同じ整数IDであり、型付き配列のindexへ変換する際は整数性を検査してから変換する。SHAREDの参照は生成順の先行出力のみ。GEOMETRYからSHARED参照は禁止し、過去timeのPathが現在Frameの共有値を読む問題を防ぐ。

R_MAXとPS_COUNTを使い、Template区間内のD_ORDERが1..COUNTの順列であることを確認する。STAMPはassetOverrideの有無にかかわらずD_ASSET>0の有効な既定Assetを持つ。assetOverride>0のときだけそれを優先する。他Primitiveの不要参照は0。

static PathはPV_S[0]=0、非減少、座標差からの累積長と許容誤差内一致、末尾=H_LENGTH。dynamic Pathは8*H_CUBICSのGEOMETRY出力、HSのsegment/v順、最初v0・最後v1、全segment coverageを検証する。Curve discontinuityはPath分割で表し、存在しない接続Lineを追加しない。

音声なしはAU/AE/AB全て空。音声ありはAB_TIME[1]=0、各Sound参照有効、各AE時刻順、同時刻AE_ORDER一意、Sound metadata duration>=0。Bin内Command IDは重複禁止。Depth islandは最終View IDを統一する。全Style/RGB/Alphaは最終出力時に所定のClamp/整数化を行い、invalid asset indexをCostumeのwrap動作へ任せない。

**11.14 機能補完とIR互換性**

IGAUTHOR/1.2および1.3の追加は編集側の保存契約である。再生List Schema、29 Opcode、32slot DRAW出力はIGRT/1.1のまま使う。追加機能を作品別My Blockへ変換しない。影passと対称複製はCompilerの描画順・Transformへ、端点と光はSTAMPへ、色はRGB/既存Effectsへ、任意強度easingは既存POW/LUTへ展開する。

過去Cameraを使用する残像では、その投影までDRAW式へ含めてD_VIEW=0とし、最外StageFitだけをAdapterで1回掛ける。現在Cameraの場合は既存D_VIEWを残す。同じProgram内のCSEは時間scopeを含むため、過去の投影を現在のSHARED結果へ置き換えない。

# 12. Scratch My Blocks

**12.1 呼び出しABI**

通常の結果は `M[callerBase+dst−1 ..]` へ書く。EVAL PROGRAMだけは出力先sinkを持ち、sink=0はM、sink=1はSH_DATAとする。後者はSHARED Programからのcopyに限る。単一のGlobal RESULT変数は禁止。blockの返り値個数は以下で固定する。単純なleaf演算は引数を先に専用tempへ取り込んでから出力するため、入力slotと出力slotの重複を許す。CompilerのProgramは原則SSAで生成し、最終register allocation後だけ安全に再利用する。

`IG EVAL PROGRAM(p,t,i,particleRow,sink,callerBase,dst)` は新frameをFへpushし、M_TOPの先へP_REGSを割当て、実行後P_OUTCOUNT個をcallerのdstへcopyしてpopする。呼び出し元のpc/t/iはF内で保護する。rootはM先頭32cellsを出力領域として確保し、評価frameは固定scratch領域の後ろ、IG_EVAL_BASE以降（下記）へ配置する。

固定領域はM[1..32]=DRAW、M[33..43]=VIEW、M[44..75]=helper scratch、M[76..75+G]=GEOMETRYとする。Gは全GEOMETRY Programの最大出力長（なしなら0）。`IG_GEOM_BASE=76, IG_EVAL_BASE=76+G`。SHARED呼出はsink=1,base=S_FIRST,dst=1とし、S_COUNT=P_OUTCOUNTを検査してSH_DATAへcopyする。通常のDRAW/VIEW/GEOMETRY呼出はsink=0。SHAREDの出力はP_REGS内の評価frameから直接copyし、32slotのDRAW bufferへ一度押し込まない。

DRAW → PATH_SAMPLE → GEOMETRYまでの固定Call Graphとする。GEOMETRYはPATH_SAMPLEを呼べない。これでpath作業PX/PY/PSを再帰的に上書きしない。別timeのPathは毎回再構築、同じpath/time/i/particleRowだけcache可能。frameIDだけをcache keyにしてはならない。

| My Block | 入力 → 出力 | 触る領域 | Warp | 呼び出し元／副作用 |
|---|---|---|---|---|
| IG INIT | なし→STATUS | 全work、状態 | Yes | 緑旗。構造検証、allocate、hide、pen up、sound stop |
| IG VALIDATE | なし→ERROR | 検証専用temp | Yes | INIT。Table長・index・Asset名を検査。描画なし |
| IG PLAY | checkpoint→なし | Clock/Audio状態 | No | Controller。epoch設定、checkpoint音源start |
| IG SEEK | t→なし | request、Clock、Audio | No | Controllerのみ。音停止、映像seek、既定ミュート |
| IG STEP | なし→なし | IG_T/prev、frame状態 | No | 唯一のforever。時刻固定、Build、Audio、Commit |
| IG BUILD FRAME | t→DL | M,F,SH,V,DL | Yes | STEP。画面は消さない |
| IG RENDER COMMAND | c,t→DL追加 | command専用temp、M | Yes | BUILD。active検査とGenerator dispatch |
| IG EMIT TEMPLATE | d,t,i,row,c,ordinal→DL | M、DL | Yes | command/repeat/particle。Program→camera→primitive展開 |
| IG EVAL PROGRAM | p,t,i,row,sink,base,dst→可変幅M/SH_DATA | M,F | Yes | Template/View/Shared/Path。push/pop |
| IG EXEC OP | instruction,fid→slot | M,F、opcode専用temp | Yes | EVAL PROGRAM。opcode dispatch |
| IG EVAL TRACK | track,time,base,dst→1 | M、TR_* | Yes | TRACK。Key binary search、EASE呼出 |
| IG EASE | ease,u,base,dst→1 | M、EA_* | Yes | EVAL TRACK。LUT binary search含む |
| IG MAT TRS | 7scalar,base,dst→6 | M、MA_TRS_* | Yes | MAT_TRS |
| IG MAT MUL | 12scalar,base,dst→6 | M、MA_MUL_* | Yes | MAT_MUL。入力を先にcopy |
| IG MAT POINT | 6matrix,x,y,base,dst→2 | M、MA_POINT_* | Yes | MAT_POINT、Primitive展開 |
| IG ATAN2 | y,x,base,dst→1 | M、MA_ANGLE_* | Yes | ATAN2/Stamp変換。Scratch atan＋象限補正 |
| IG PROJECT | camera11,z,base,dst→7 | M、CA_* | Yes | PROJECT_MATRIX、APPLY CAMERA。near/far判定 |
| IG APPLY CAMERA | view,z,matrixBase,base,dst→7 | M、専用CA_APPLY_* | Yes | Template。view0はidentity。ここで最外StageFit適用 |
| IG PATH BUILD | path,time,i,row→PX/PY/PS | path専用temp、M/F | Yes | PATH SAMPLE/EXPAND PATH。geometry Program呼出可 |
| IG PATH SAMPLE | path,u,time,i,row,base,dst→4 | M、PX/PY/PS、PA_SAMPLE_* | Yes | opcode27。Geometryのcallで自分のtempを上書きしない |
| IG CUBIC | 8coords,v,base,dst→4 | M、PA_CUBIC_* | Yes | PATH BUILD。位置と導関数 |
| IG EXPAND PATH | path,time,trim,matrix,style,context→DL | PX/PY/PS、DL | Yes | Template。LINE候補を生成 |
| IG SEQUENCE FRAME | sequence,q,base,dst→1 assetID | M、SQ_* | Yes | Template。binary search |
| IG REPEAT | c,r,t→DL追加 | RE_*、M | Yes | RENDER COMMAND。Nmaxの有界loop |
| IG PARTICLE | c,ps,t→DL追加 | PT_LOOP_*、M | Yes | RENDER COMMAND。行範囲走査、非生存行をskip |
| IG PREPARE STAMP | asset,matrix,alpha,effects,key→DL | DL、AD_STAMP_* | Yes | Template/Sequence。Similarity、bounds、範囲検査 |
| IG PREPARE LINE | endpoints,width,color,alpha,key→DL | DL、CL_* | Yes | Template/Path。expanded-viewport clip |
| IG CLIP LINE | bounds,x0,y0,x1,y1,base,dst→5 | M、CL_LINE_* | Yes | PREPARE LINE。validと端点。Liang–Barsky |
| IG SORT DRAWS | なし→DL_PERM | DL_PERM/TMP、SO_* | Yes | BUILD末尾。安定bottom-up mergesort |
| IG PREFLIGHT | なし→ERROR | Painter状態、AD_* | Yes | BUILD末尾。pen up状態でsize/position/name検査、pixels変更なし |
| IG AUDIO EVENTS | previous,t→cursor更新 | Audio cursor、Sound | No | STEP。交差eventの欠落を防ぐ |
| IG COMMIT FRAME | なし→なし | Pen pixels、Painter状態 | Yes | STEP。erase all、順に描画。wait/broadcastなし |
| IG DRAW STAMP | drawRow→なし | Painter状態 | Yes | COMMITのみ。Costume/effects/size/direction/position/stamp |
| IG DRAW LINE | drawRow→なし | Pen状態、Painter位置 | Yes | COMMITのみ。carrier、pen色→alpha→width、移動 |
| IG FAIL | code→ERROR/STATUS | status、sound | No | Controllerがfaultを受けて停止。既存完成画面維持 |

CoreはINIT/VALIDATE/PLAY/SEEK/STEP/BUILD/COMMAND/TEMPLATE/PROGRAM/OP/TRACK/EASE/MATRIX/PROJECT/PREPARE/SORT/PREFLIGHT/COMMIT/STAMP/FAIL。LINE、PATH、REPEAT、PARTICLE、SEQUENCE、AUDIOはOptional Module。使用opcodeとPrimitiveから推移的にModuleを選択する。Core内のPROJECTもViewなし出力ではdead-stripできる。

My Blocks名と定義本体はversion付き固定Template。作品Object名を含むMy Blockを生成しない。module inclusion、Constant、Lists、Costumes、Soundsだけが作品差分となる。

**12.2 Register破綻の検査**

EVAL TRACKがEASEを呼ぶ際、検索j、left/right valueはTR_*に置き、EASEはEA_*のみ使用。戻った値をdstへ受け、TR_*から補間する。PATH_SAMPLEがGEOMETRY Programを呼ぶ際は元ProgramのpcをFへ保存し、戻り先を呼び出し元frameに指定する。FRAMEのtをGlobal IG_Tだけから読まない。過去時刻Trailが現在時刻で評価されるバグを防ぐ。

ScratchのCustom Block引数は参照中に同じ名前のGlobalを使わない。引数Reporterを使う。Evaluationの途中でbroadcast-and-wait、wait、sound-until-doneを呼ばない。外部イベントからEvaluatorを再入させない。Warpのyieldが起きてもWriterは単一なのでデータ競合は起こさないが、描画原子性は別の性能Gateである。


**12.3 Register AllocationとScratch命令生成**

CompilerはExpression DAGをSSAで生成し、各値の最終使用Instructionを計算する。幅1、2、4、6、7の連続slot区間をlinear-scanで割当てる。多成分値の途中だけを再利用しない。Programの固定出力は先頭領域を予約し、終端MOVで連続出力を確定する。これによりP_OUTPUT/P_OUTCOUNTが1つの範囲になる。

EVAL PROGRAMのframe baseはM_TOP+1。headerのmaxMemCellsを越えるなら評価前にerror5。Fの8項目を設定してからInstructionを開始する。呼び出し時のscratchはcaller frameのslotまたは専用領域に置き、Global CURRENT_PCに依存しない。復帰時は出力を指定sinkへcopyしてからM_TOPとF_TOPを戻す。copy範囲が重なる場合は一時領域へ退避するか、方向を選ぶmemmove規約で処理する。

最大メモリは `76+maxGeometryOutput−1 + 最大call path上のP_REGS総和`。SH_DATAとV_DATAは別Listなのでこの和には含めない。path call graphはDRAW→GEOMETRYで最大2Program frame。TRS/EASE等のMy Block呼出は別Program frameを増やさず専用tempで動く。将来Call opcodeを足す場合はABI revisionが必要。

Scratchの最終コード生成は固定Block IRをSB3 blocks dictionaryへLowerする。Statementのsequenceはnext/parentを結び、If/RepeatのSUBSTACK先頭のparentは制御Block、Reporter treeのparentは入力先Blockにする。literal数はnumeric input tag、boolean条件は比較/論理Reporter。My Blockはdefinition→prototypeをcustom_block入力で結び、prototypeのproccode/argumentids/argumentnames/argumentdefaults/warpをcall側と同じものから生成する。argumentidsを作品別Object名から作らない。

My Block TemplateはASTから一度構築して検証できる。EditorからScratchへ出す度に作品Objectの命令本体を生成する方式にはしない。作品差はLists/Costumes/Soundsと使用Moduleの選択。SB3に外部拡張URLやJavaScript opcodeは含めず、extensionsは必要な場合の`pen`だけ。

**12.4 数学OpcodeのScratch対応**

MIN/MAX/SELECTはIf branch、MAT_*はscalar演算で実装する。POWはbase>0なら`e^(exponent*ln(base))`、base=0はexponent=0→1、正→0、負→error4。base<0はexponentが整数のときだけabs(base)のpowに奇偶符号を掛ける。短い正整数のpowerは乗算列へCompileしてよい。

Scratchのsin/cosは公式実装で小数点以下10桁へ丸める。WebのIR Evaluatorも同じ丸めを適用し、MAT_TRSとSine easingにも共通関数を使う。これはGPUが最終Stamp角から計算するsin/cosとは別である。演算誤差をgeometry toleranceへ含め、画面上の適合を確認する。[演算ブロック実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/blocks/scratch3_operators.js)

全Opcodeはdomainを先に検査する。error時はIG_ERRORを設定して出力0/identityを置き、ControllerがそのFrameをCommitしない。巨大powのInfinityを次のList indexへ伝播しない。SELECTはlazy演算ではないため、Compilerは非選択枝の危険なdivisionをSELECTだけで隠さない。Projectionは専用guard付きOpcodeを使う。

# 13. Render Frame Pseudocode

```text
on green flag:
    IG INIT
    if error: stop controller
    IG PLAY(0)
    forever:                            // このforever自体はnon-warp
        process pending seek/play/stop  // handlerはrequestだけを書いていた
        if not playing and no redraw request: yield
        t = freeze requested master time
        if t<0: t=0
        if t>=D: render LAST_TIME then stop, or use explicit playback loop remap

        BUILD_FRAME(t) [warp]:
            reset DL_N and work cursors; keep old Pen pixels
            eval SHARED programs in dependency order at t
            eval VIEW programs at t; copy 11 outputs per view to V_DATA
            candidates = bin(t) or all commands
            for command c in candidates:
                if not C_START[c] <= t < C_END[c]: continue
                enumerate bounded contexts (direct / repeat / particle)
                for each template d in required local ordering:
                    result = EVAL_PROGRAM(d.program,t,i,particleRow)
                    if not result.active or alpha<=0: continue
                    // result.matrix has every required ancestor already composed
                    cameraMatrixWithStageFit, visible = APPLY_CAMERA(d.view,result.z)
                    finalM = cameraMatrixWithStageFit * result.matrix
                    if not visible: continue
                    if STAMP: choose override/base asset; PREPARE_STAMP
                    if LINE: transform endpoints; prepare stroke; PREPARE_LINE
                    if PATH:
                        BUILD_PATH(path,result.geometryTime,i,particleRow)
                        trim by arc length; transform; append prepared LINEs
                    if SEQUENCE:
                        asset=frameAt(result.sequenceTime)
                        PREPARE_STAMP(asset,finalM,...)
            check bounds and maxDraws
            stable sort draw row indices
            PREFLIGHT all adapter states with pen up, sprite hidden

        if build fault:
            stop sounds, retain previous completed image, set error
        else:
            if forward continuous play:
                AUDIO_EVENTS(previousTime,t)   // nonblocking starts only
            COMMIT_FRAME [warp]:
                erase all
                for row in DL_PERM[1..DL_N]:
                    if STAMP: DRAW_STAMP(row)
                    else: DRAW_LINE(row)
                pen up; keep painter hidden
            previousTime=t
            record elapsed/frame statistics
        yield at outer loop boundary
```

**APPLY CAMERA出力にStageFitを含める**。呼び出し側は `returnedCameraAndFit * result.matrix` だけを計算し、StageFitを重ねて適用しない。

WebのLINE実装は、IG DRAW LINEの「始点でPen downによるpoint、次にsegment」という合成順も含めて再現する。1つの半透明連続Meshに置換して接合部のalphaを変えない。Stampは`ghost=100*(1−alpha)`、PenはRGB設定の後に`transparency=100*(1−alpha)`を設定する。RGB設定がPen透明度を初期化するため、この順序は固定する。

Generatorと文字階層のTransformはTemplate Program内、Cameraはその後。Temporal Trailの過去TransformはProgram内にあり、現在Cameraの外側へ出さない。Screenはview0でCameraがidentityとなり、StageFitだけを通る。

erase allを先頭に置かず、準備成功後へ移した。これは無効IndexやScale超過で途中まで消えた画面を残すことを避ける。標準PenにBackbuffer swapはないため、COMMITの途中でWarpがyieldすると途中画像が見える可能性は残る。確認実装のWarp時間値は500msだが、その値を性能予算として使わない。実測で通常1フレーム予算内へ収める。[Warpの実装](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/engine/sequencer.js)

**音声仕様**

通常の短尺IntroはBGMと固定SFXをCompilerで1本のPremixへ統合する。t=0と音開始を同じControllerで開始し、映像はtimerの経過秒から進める。Scratchは音声の実再生位置を標準Reporterから読めないため、sample-accurateな同期保証はできない。ズレを毎frame音再起動で直すことはしない。

BPMから秒への変換はtempo区間ごと `seconds += beatCount*60/BPM`。BPM変更、音量、pan、retimeはPremixへ反映する。Editorにはbeat情報を保持し、Runtimeへは秒だけ渡す。

独立SFXが必要なときは `(previousTime,t]` の全AE行をcursorから走査する。同時刻はAE_ORDER順、処理後だけcursorを進める。最初は時刻0のEventを明示発火してcursorを進める。Frame skipでイベントを捨てないが、遅れたイベントを本来の過去時刻へ鳴らし直すことはできず、catch-up再生となる。

maxAudioCatchupを超える場合、イベントを黙って捨てずOverrunとし、CompilerがPremixへ移す必要のある出力として扱う。通常の固定Introでは最初からPremixなのでこの問題を避ける。同じSoundを重ねたい場合はPremixを優先し、別SoundPlayerとなる固定Sound recordへの複製は検証した場合だけ使う。単に同じSound名をstartし直すと音が切れる。[SoundPlayer](https://github.com/scratchfoundation/scratch-audio/blob/develop/src/SoundPlayer.js)

任意seekは映像を即時再現し音声を止める。Scratchで音を再開できるのは0秒またはAB_TIMEにある事前生成checkpointからとする。checkpointにはその時点の残響・重なりを含む完成Premixのsuffixを置く。任意tへの音声seekを小分け音源の継ぎ足しで完全再現できるとは主張しない。

Web独立エンジンはsb3内の同じPremix bytesをdecodeして任意offsetから再生できる。Webのaudio seekは拡張機能であり、共通映像IRを変更しない。WebとScratchを同期検証するときは0秒開始または共通checkpointに揃える。


**13.1 Web独立Runtimeの実装構成**

```text
Sb3Reader → AbiValidator → ProgramDecoder → Evaluator → PreparedDrawList
                                                       ↓
                                  WebGL2 Renderer / CPU reference renderer
```

Web RuntimeはScratch VMのスレッド、Hat、My Blocksを解釈しない。block graphは既知Engineの改変検出だけに使う。IRはFloat64Array、indicesはUint32Array、stringsは別配列へdecodeする。Opcodeごとの引数/出力幅を先に解決し、毎Frameの文字列dispatchやJSON解析をしない。Eval順はScratchと同一で、GPU側へ時間依存式を移して評価順を変えない。

Web APIは以下に固定する。

| API | 入力→結果／副作用 |
|---|---|
| loadSb3(bytes) | 完全検証済みrevision handle。失敗時は旧revisionを維持 |
| replaceRevision(projectJson,assets) | sb3と等価なデータ単位で検証し、次Frame境界で切替 |
| evaluateAt(t) | PreparedDrawListとdiagnostics。音を鳴らさない |
| renderAt(t) | evaluate結果をdraw。seek順に依存しない |
| play(t=0) | Clock epoch設定と音声開始。非同期decode完了後に開始 |
| pause() | 現在tを固定、音停止、最後の画面保持 |
| seek(t,{audio}) | 生master t更新。音はaudio=true時に新Sourceを作りoffset再生 |
| dispose() | textures、buffers、audio nodes、revision参照を破棄 |

ZIP Readerはproject.jsonが1つ、相対media名にpath traversalなし、総展開bytesがProfileの上限内を確認する。SVGは外部参照とscriptなし。IG_SOURCEは再生時に展開不要で、Editorが開く時だけgzipをサイズ上限付きでdecodeする。これらはsb3を読む実装上の入力処理であり、ネットワークから追加mediaを勝手に取得しない。

**13.2 Web描画の具体契約**

WebGL2を通常Backendとする。RGBA8 premultiplied target、source-overは `ONE,ONE_MINUS_SRC_ALPHA`、Depth testなし。AA/Mask/BlurをWeb playerだけで追加しない。CPU Backendは同じPreparedDrawListと色式を使い、性能診断は別に出す。最初の製品実装では480×360の互換targetを描き、Canvasの表示拡大は最後に行う。高解像度モードは別設定であり、Scratchとのpixel比較は互換targetで行う。

STAMPはAssetのlogical quadをDL_SIZE/DIR/X/Yから変換し、A_RES/A_UNIT/rotationCenterを反映する。Sampleしたpremultiplied colorにEffectを適用する。color/brightnessが有効ならalpha+0.001でRGBをunpremultiply→HSV処理→brightness加算Clamp→alpha+0.001で戻す→ghost係数を全RGBAへ掛ける。Color effectのHue増分はeffect/200 cycle、brightnessはclamp(effect,−100,100)/100。Color effectが0のときHSV処理自体をskipする。effect=200はHue増分0でも「有効」なので、0と同一視しない。

Color effectの低輝度補正はV<.055でH=0,S=1,V=.055、その他S<.09ならH=0,S=.09。HSVのchromaが0付近でも公式のepsilonを含む式へ合わせる。実装は当該公式Shaderを参照して数式を再現し、差分検査で確認する。[色Shader](https://github.com/scratchfoundation/scratch-render/blob/develop/src/shaders/sprite.frag)、[Effect値の変換](https://github.com/scratchfoundation/scratch-render/blob/develop/src/ShaderManager.js)

LINEは開始dotとsegmentを別のsource-over操作として描く。幅1/3の0.5px補正後、pixel中心から有限segmentまでの距離dに対しcoverage=`clamp((width+1)/2−d,0,1)`。RGBAにcoverageを掛ける。round capを含む。幅0は事前に除去、zero-lengthはdot1回。連続Polylineを勝手に1回の均一Alpha strokeへ置換しない。

SVG textureは最大Scaleに応じて2のべき乗MIPを生成する。Scratch互換モードでは確認済みSVGSkinの選択規則を用い、90度倍数回転かつScaleが99〜101%の近傍ではnearest条件を揃える。他はlinear、wrapはCLAMP_TO_EDGE。Bitmapはresolution2の元Textureを使う。より厳密な比較が必要なAssetはCompilerでPNGへ正規化する。ブラウザのSVG Rasterize差をbit-exactと断言しない。

BatchはDrawListの**隣接する同じ描画状態**だけをまとめる。別の半透明Layerを越えてAsset別sortをしない。Atlasを使う場合は2texel以上の境界複製を設け、UV clampを各entry内へ限定する。巨大Assetは専用Textureへ置く。Texture uploadとProgram decodeをFrame Commit内で行わず、revisionを準備してから切替する。

**13.3 Transport状態機械**

状態はUNLOADED、READY、PLAYING、PAUSED、ENDED、FAULT。load成功→READY、play→PLAYING、pause→PAUSED、D到達→LAST_TIMEを描いてENDED、seek→指定時刻のPAUSED（play中のseekは新epochでPLAYING継続）。FAULTでは新FrameをCommitしない。旧画面を保持し、音を停止する。

Scratch側のUserイベントはIG_REQUEST_SEEK/IG_HAS_SEEK等だけを更新し、次のIG STEPで処理する。pause時は最後のtをIG_SEEK0へ保存、resumeは新wall0から再開する。Scratch音声は対応Checkpointでのみ再開し、映像のpause/resumeを音の停止位置から再開できる機能と混同しない。

WebはAudioContext currentTimeをBGM再生中のClockに使い、無音はperformance.nowベース。Audio sourceはseek/pause後に再作成する。同じSource nodeを再startしない。タブが停止していた後は現在tを再評価し、中間の描画Frameを順に追いつかせない。

# 14. Compiler Passes

各PassはAuthoringの不変Snapshotを入力とし、Compiler-owned Graph/IRだけを変更する。失ってよい情報は**Runtime IRからだけ**削除するという意味である。

| Pass | Input → Output | 変換／保持する情報／IRから失ってよい情報 |
|---|---|---|
| 1 Validate & snapshot | Authoring→validated snapshot | UUID参照、循環、Font/Asset、duration、有限数、effect順を検査。全Source保持。欠損を推測補完しない |
| 2 Resolve layout | Text/Shape→layout＋semantic leaves | run shaping、line break、cluster対応、Glyph origin、Shape寸法。原文/選択構造はSource保持。Runtimeの文字編集構造は不要 |
| 3 Resolve spaces | Nodes/Views→typed spatial graph | World/Screen境界、Composition plane、opacity isolation、Z規約を確定。合成境界は必ず保持 |
| 4 Resolve time | TimeMap/Keys→scalar expression DAG | master/local、Loop、phase、tempo→秒、rotation unwrap。同時Key正規化。BPMや編集位置はSourceだけに残す |
| 5 Lower hierarchy | typed graph→leaf expression DAG | Parent×Child、Glyph/Word/Line、Camera境界を式へ展開。親IDはIRから除去。Transform適用順は保持 |
| 6 Generator planning | Repeat/Scatter/Particle→templates＋rows | nested反復のflatten、乱数固定、birth列挙、Emitter birth評価。instance安定順・local time保持 |
| 7 Analyze composite boundaries | leaf DAG/effects→render islands | mask依存、group alpha、Blend、viewport clipの閉じた区間を求める。z-sort可能域を区別 |
| 8 Precompute numerical data | path/ease/trajectory→tables/programs | Polyline/LUT/Particle軌道。誤差とSource mapping保持。数式は残せる場合は残す |
| 9 Classify transforms | leaf matrices→similarity/residual plan | 静的HをAssetへ、dynamic affineの線は頂点へ。Stampの非対応Transformを検出。外側Cameraをできるだけ保持 |
| 10 Generate candidate assets | shape/glyph/effect/residual→assets | SVG/PNG、反転、小Scale variant、Path whole asset。原点・logical dimensions保持 |
| 11 Optimize | expressions/assets→reduced IR | constant fold、dead code、shared expressions、適切な静的composition統合、asset dedup。合成順を変えない |
| 12 Estimate & fallback | IR＋profile→costed execution plan | 最悪N、Instruction、segments、asset texels、memoryを推定。コスト/非対応/品質に基づき最小区間をSequence化 |
| 13 Rebuild & link | fallback結果→closed linked IR | 新Assetを再dedup、再cost、sort island/ordinal、Template範囲、Asset IDs、Sequence参照を確定 |
| 14 Register allocation & serialize | Programs/Tables→Lists | livenessでslot再利用、最大stack/memory算出、型/参照検査、finite numbers、1-based変換 |
| 15 Link fixed modules & package | Lists/Assets/Source→sb3 | 使用moduleの固定ブロックJSONをlink。Pen拡張宣言、media bytes、Costume/Sound table、非表示Painter、Stage背景を格納 |
| 16 Cross-engine verification | sb3→verification report | 独立Web IR loaderとScratch VMのheadless/実browser検査。境界時刻、乱順seek、Frame skip、画像比較、性能計測 |

**14.1 Incremental Compile**

Web Editorの編集変更はUUID dependency graphでdirtyを伝播する。Text文字列変更はshape/layoutと下流、Camera変更は投影/品質範囲/cost、色変更はPaint Asset、time移動はProgram/active区間をinvalid化する。Asset keyが不変なら再生成しない。

Web再生入力は同じsb3 data modelの新revision。完成したrevisionをframe境界で差し替える。旧Listsと新Costumesを混在させない。ZIP圧縮は毎編集必須ではなく、memory上の `project.json + asset dictionary` をsb3と等価な単位として扱い、実Export時にZIPへする。Webが元Authoring Graphだけから完成映像を再生する経路は作らない。

**14.2 Cost Model**

```text
C(t)=c_op*N_instructions(t)
    +c_track*N_search_steps(t)
    +c_stamp*N_stamps(t)
    +c_line*N_segments(t)
    +c_sort*N_draws(t)*log2(max(1,N_draws(t)))
    +c_switch*N_costume_changes(t)
```

係数は対象のScratch公式VM/Rendererで測定してProfileへ保存する。100粒子が常に軽い、何Stampなら30fps、と測定前に決めない。候補ProfileのtargetFPSは30を初期値とするが保証値ではない。1フレーム予算の例えば70%以内をCompile目標にする場合、その70%も製品Profile設定である。

時刻サンプル平均だけではなく、active数・Generator最大数・Path sample数の上界から最悪候補を出す。カーブの極値、Near-plane接近、Loop境界、全粒子同時生存区間を重点検査する。

代替候補は「数値Precompute」「Generator展開」「Asset一体化」「局所Sequence」。各候補のdraw削減、List増加、Costume増加、decoded memory、画像誤差を比較する。Profileを満たす最小の意味的区間を選ぶ。Sequence化が容量を超えるならExport不可理由と変更候補を返し、低品質化を黙って行わない。

**14.3 合成区間閉包**

最初に問題Effectの依存Leaf集合Sを取る。Painter順でSの間に別Leafが挟まり、その前後合成が外部Layerと交換できない場合、その挟まれたLeafも含める。Mask source、Backdrop-dependent Blend、Blurの必要背景を加え、集合が変わらなくなるまで繰り返す。この連続区間を1つのBake nodeに置換する。外部Camera等を残すと見た目が変わるなら、必要な投影段階まで閉包を広げる。

**14.4 sb3出力**

公式VMで保存した標準Block Templateを土台とし、proccode、argumentids、argumentnames、argumentdefaults、warp、next/parent/input参照を一括検証する。作品ごとに独自opcodeを追加しない。必要なのはScratchの標準opcodeとPen拡張だけ。Sound/Asset recordは公式sb3 Serializerと同じ規約に従う。[Serializer](https://github.com/scratchfoundation/scratch-vm/blob/develop/src/serialization/sb3.js)


**14.5 Compilerを実装するための内部型とAPI**

内部型を `SourceSnapshot, ResolvedGraph, LayoutRun, TemporalExpr, SpatialExpr, LeafPlan, CompositeRegion, AssetPlan, ProgramIR, LinkedTables, ExportReport` に分ける。各型は入力SnapshotのhashとsourceNodeIdを持ち、変更を上流へ書き戻さない。Compiler APIは `compile(snapshot,profile,cancelToken) → {sb3Data,report}`。失敗時はstructured diagnosticsを返し、途中のsb3を完成物として公開しない。

diagnosticは `{code,severity,nodeId,property,masterInterval,reason,candidates}`。codeはSOURCE_SCHEMA、MISSING_ASSET、CYCLE、DOMAIN、UNSUPPORTED_RUNTIME、BOUND_UNPROVEN、BUDGET、ASSET_LIMIT、ABI_INVALID。エラー位置はNode IDとPropertyまで戻す。性能係数不足はBENCHMARK_MISSINGという診断で、構造上の出力可能性とFPS実測を分離する。

**14.6 Generator/HierarchyからProgramへのLowering**

1. Property BindingをExpression DAGへ解決し、各式に`timeScopeId,instanceScopeId,spaceId,valueType`を付ける。
2. TimeMapを外→内の順で合成し、各AnimatorのlocalTimeを別symbolへ置き換える。
3. Layoutの固定originとTRSを行列式へし、親→子の積を作る。
4. Generatorのindex/位相をTemplateのinputに置換し、Nested indexはdiv/modで復元する。
5. Camera、Opacity、Effect境界を含めてLeafPlanを作り、適合Primitive候補を列挙する。
6. 定数畳み込み→同じscopeのCSE→不要出力削除→topological sort→Opcode列→register allocation。
7. Runtimeで使わないEditorの親ID、文字列編集情報、Effect名はIRから除去し、IG_SOURCEへ保持する。

CSEキーは演算種、入力IDs、即値、time/instance/space scopeを含む。見た目が同じ式でも、tとt−delayの式を共有しない。GEOMETRYの過去timeを現在FrameのSH_DATAへ置換しない。float演算の結合順を変える代数最適化は誤差を再評価した場合だけ行う。

**14.7 Cost/Fallbackの決定アルゴリズム**

各Leaf/Regionに以下の候補を作る：native、数値Track、固定Asset、局所Sequence。対応していない候補は理由付きで除外する。各候補は`drawBound,opBound,pathSampleBound,listItems,decodedBytes,zipBytes,geometryError,alphaError,timeError`を持つ。

```text
plan = cheapest exact-or-certified native/precompute candidate per region
repeat:
    close composite dependencies and layer intervals
    calculate structural worst-case bounds
    if all profile bounds satisfied: stop
    enumerate one-step candidate replacements for violating regions
    reject replacements exceeding quality or memory/asset bounds
    rank by largest reduction of normalized violation
    tie-break: smaller baked area*time, then smaller bytes, then sourceNodeId
    if no candidate improves violation: return BUDGET diagnostic
    apply best candidate; rebuild assets and references; repeat
```

違反量は各上限に対する比の最大値 `V=max(draw/maxDraw,ops/maxOps,samples/maxSamples,decoded/maxDecoded,zip/maxZip,list/maxList)`。ratio<=1が構造合格。候補が同じRegionを往復しないよう、native→precompute→asset→sequenceの有限状態と採用済みsignature集合を持つ。各iterationで候補数を減らすため停止する。全体最適を保証するとはせず、決定論的な有界heuristicとして固定する。

最悪Draw数はCommandごとにDirect=Template数、Repeat=R_MAX×Template数、Particle=最大同時生存数×Template数、PATH=最大sample数−1を展開して計算する。active intervalが複雑なときは保守的に全生存/全Templateを数える。Frameの平均値で上限を代用しない。

Portable profileの初期構造上限はDraw1024、op100000、Path sample2048、variant4096、decoded media256MiB、ZIP200MiB、各List200000。これらは製品の初期予算であり、公式Scratchの保証値でも30fps達成の測定結果でもない。benchmarkRefなしでは「構造適合・FPS未認定」とする。実測Profileでは係数から予測時間を計算し、実際のcommit時間も確認して認定する。

**14.8 Bake実装**

CompilerにはAuthoring Graphを指定時刻でRasterizeするBake Rendererを持つ。これはWeb playerとは別のコンパイル用処理であり、Web playerの入力をSourceへ変更しない。Paint/Mask/Blur/Warp/Blendを指定順で合成して透過RGBA frameを生成する。

Bake regionは連続Layer区間の閉包。backdrop-dependent blendは必要な背景を含め、外側Cameraを残せるかは合成結果への投影と各内部要素の投影が交換可能な場合に限る。同一平面・同じdepthのSimilarityなら残せる。異なるZの内部要素を1枚へまとめて後からCameraを動かすと視差が変わるため、そのCamera区間までBakeする。

Frame時刻はsampledならFの共通格子、continuousCertifiedなら時間誤差上界から分割する。Key/Loop/Mask切替などの不連続時刻は必ず境界へ追加する。各Frameは同じ論理Canvas/原点。完全同一bytesだけをdedupし、近似色の画像を同一Assetへまとめない。PNGはRGBA・resolution2、opaque背景を含めない限り透明を保持する。

**14.9 SB3構築と再現性**

ProjectはStage＋IG_PAINTERの2targetを基本とする。Stageの背景は指定RGBの固定Backdrop、動的背景は最初のCommand。Painterはvisible=false、rotationStyle=all around、size100、x/y=0、volume100。Lists/VariablesはPainterへ配置し、Monitorは非表示。CostumesはCarrierの後に最終Asset順、SoundはAU順。同じcontentでも同時再生のSoundPlayer分離が必要ならSound recordは別にする。

ZIPはproject.jsonと`<md5>.<format>`のmediaで構成。重複bytesは1entry。並び順はproject.json→media名の辞書順、ZIP timestampは固定値で、Compiler同一入力の再現性を確保する。Block IDはModule/Procedure/AST pathから決定的に作る。Source nodesからBlock本体IDを増やさない。

検証順はBlock graph参照→mutation引数対応→Lists semantic validation→media hash→Compiler内IR再読込→sb3 ZIP再読込→両Runtime実行Gate。ModuleのTemplate実装時には公式VMでload/saveした結果と比較する。これは未定の仕様ではなく、実装時に満たす必須検証手順である。

**14.10 機能網羅性をCompilerの合格条件へ追加**

各Source機能に対し、(a)Editorで値を変更可能、(b)変更・Undo後も元構造を保持、(c)保存再読込、(d)Compile後の両Runtimeで演出を再現、を検証する。画面全体の動画を読み込めるだけでは、文字・曲線・残像・対称配置の編集機能を満たしたことにしない。

追加機能のLoweringは既存Passへ挿入する。Path解決で任意次数制御点と装飾を解決、Generator/Effect展開で対称コピーと残像、Layer sort前でpassOrderを確定する。再生表へ出した後に順序を復元しようとしない。Baked Clipが必要な場合も元のSourceを保持し、再編集で再Compileする。

新しいPower easingはpower=2..5なら既存POWER Easeへ、それ以外は定数powerのPOW式または品質条件を満たすLUTへ変換する。HSV Paintは色調整の入力表現であり、PDF独自VFXの3回Stampを模倣する指定ではない。静的PaintはAsset生成時に反映する。動的な線色はRGB式へ、動的Stampの彩度変化は適合するAsset変種または局所生成へ変換し、未対応の入力を黙って捨てない。

**14.11 機能契約1.3のCompiler接続**

ValidationでAnchor/MarkerのID、時刻cache、tempo順、放射速度の範囲を確認する。Time解決前にAnchorの意味と秒値の一致を確定する。Compilerは保存元を変更せず、時間解決済みのコピーを使う。Particle生成で放射設定とaccelerationSpaceを既存の初期状態表・軌道ProgramへLowerする。Markersは編集用Source内にのみ同梱する。再生ABI、Header、Opcode、My Blocksを追加しない。

# 15. Six Worked Examples

以下はすべて480×360、StageFit=1の具体例。実Fontが未指定なのでTTROのadvanceを架空数値で固定せず、Shaper出力 `g0..g3` を用いる。指定した数式は作例の設計値であり既存サンプルから抽出した値ではない。

**CASE A — TTRO、文字delay、全体Zoom、背面Ring**

Editor Graph：Scene/WorldRootの下にTitleGroup。TitleGroupのChild順はDecorativeRing、Text(TTRO)。Textは1Line、1Word、4Character handle。Text全体Zoomを `sT(t)=1+0.04*t`、文字delay=0.05秒、登場長0.35秒、初期Y=−80、初期rotation=[−12,8,−6,10]度とする。

```text
q_i=clamp((t-0.05*i)/0.35,0,1)
e_i=easeOutCubic(q_i)
y_i=-80*(1-e_i)
r_i=initialRotation[i]*(1-e_i)
M_gi=S(sT(t))*T(g_i)*T(0,y_i)*R(r_i)
alpha_i=step(t>=0.05*i)
M_ring=R(30*t)
```

Ringは完全に均一な真円では回転が視覚的に現れないため、分割Ringまたはmarker付きRingにする。これはレンダラの問題ではなく素材の回転対称性である。

Compiler：TTROを一括shape→Tの同じGlyph outlineをreuse→4つのGlyph配置ProgramへLower→Ring Asset生成→5Template/5Direct command、またはRing1Direct＋Text4TemplateのDirect commandへまとめる。TextのGroup Zoomと各Character timeを別slotに保持。Parent Treeは出力しない。

IR：AssetはT,R,O,decorated ringの4つ。4GlyphのD_ASSETは `[T,T,R,O]`。TextのTemplateは同じEase Trackをそれぞれq_iで読む。C_ORDERはRingを先、Textを後。D_VIEWはMain View。全体opacityをisolatedで変更していないためGlyph分割のまま保持できる。

Frame t=0.10：文字ageは[0.10,0.05,0,−0.05]秒。最後は非active、3文字目は初期位置、最初の2文字は異なる登場進度。Text Zoomは全字で1.004。Ring回転は3度。4番目が現れた後も同じasset reuseと数式で再生し、seekで再現できる。

Scratch：View評価→Ring Stamp→各Glyph Program→Camera合成→安全なStamp adapter→レイヤー順でcommit。極小Scaleがないので通常はSequence不要。

**CASE B — 32本Radial Line、順次Pulse、全体回転＋Camera Zoom**

Editor Graph：Scene/WorldRoot/RadialGroup/Repeater(Line)。N=32、radius=65、line local `(0,0)→(24,0)`、幅2px。全体回転20度/秒、delay=.03、内部period=1.6秒、Camera orthographic zoom=`1+0.1*t`。

```text
q=t
qi=q-.03*i
w=modp(qi,1.6)/1.6
pulse=1-abs(2*w-1)         // 0→1→0
M_i=R(20*q)*R(360*i/32)*T(65,0)*S(pulse,pulse)
active = qi>=0           // 初回登場以前は隠す
```

Compiler：Lineなので非一様の長さAnimationへ変更しても端点計算が可能。親/instance/内部timeをProgramへ展開。R_MAX=32、Template1つ、Curve/Camera共有。幅を画面一定にする設定ならD_STROKE=1、ここではgeometricとして幅もpulseとzoomで縮む。

IR：C_KIND=REPEAT、R_KIND=RADIAL、D_PRIM=LINE、D_VIEW=Main。描画端点はD Program出力17..20、行列1..6。初回qi<0またはpulse=0のLineはDLを生成しない。1px未満になる幅は、固定Profileの許容を満たす細線Asset経路へCompilerが切り替える。単純にPen最小幅1へClampしない。幅一定という別のAuthoring設定ならこの変換は不要。

Primitive切替はD_PRIMを書き換えるRuntime動作ではなく、CompilerがLINE Template（active=幅>=1）と細線STAMP Template（active=0<幅<1）を作り、排他的active式で選ぶ。細線部分の動的縦横比がAsset表現の限界を超える場合も、この小区間だけSequence Templateを追加する。両方を同時に描いてalphaを重複させない。

Scratch：tから全体Rを1回計算→i=0..31の内部qiを計算→Cameraは全instanceに同じ現在zoom→最大32本のLine/細線Stampをcommit。Frame skipしてもpulseの状態は直接復元される。

**CASE C — 動的Bezier上の光点＋Glow Trail**

Editor Graph：AnimatedPath P0..P3、LightDot(path follower)、TemporalTrail(16sample)、Glow Paint。Control点は例として `P1(t)=(-60,70+20*sin(180*t))`、`P2(t)=(80,-40+15*cos(120*t))`、P0/P3は固定。u(t)=modp(t,2)/2。

Compiler：Control点をGEOMETRY Programへ、最大曲率/最大投影ScaleからHS分割一覧を生成。点Assetとsoft Glow Assetを作る。Trailは16instanceのTemplateへCompileし、各sampleのtimeを `tj=t-j*.025` とする。j=0..15、alpha_jは指数/Trackで減衰、width_jも減衰させる。

IR：H_KIND=DYNAMIC_CUBIC、H_PROGRAMは8coord出力。Dot ProgramはPATH_SAMPLE(u(t),t)。Trail ProgramはPATH_SAMPLE(u(tj),tj)と過去親Transformを使用する。現在形状Path(t)だけを16回読んだものはTemporal Trailではない。Glowの描画順は古いsample→新しいsample→明るいhead。

Scratch：Geometryを各tjで評価→Polyline/cumulative length→その時刻のuをarc lengthでsample→位置/幅/alpha→現在Cameraで投影→soft stamps。同pathでもtjが違うのでframeIDだけのcacheは禁止。16回のGeometry評価が重ければ、Compilerで `WorldTrajectory(t)` を数値TrackへSamplingして置換する。まず数値Precomputeを使い、光点/Trail全体の画像Sequenceを既定にしない。

ここで得るGlowはsource-overのsoft stamps。厳密な加算Glowを要求する場合は背景依存の最小合成区間を追加Bakeする。

**CASE D — 100 Shard、動くEmitter、動くCamera**

Editor Graph：WorldRootのEmitterGroupが動き、ParticleSystemを所有。Cameraが同時にPan/Zoom。Particle mode=WORLD、N=100。ユーザーがいう「Camera空間内を動くEmitter」が画面座標で配置する意味ならVIEW_ATTACHEDとして発生時に逆投影する。

Compiler：seedごとに100birth/life/velocity/rotation/assetを固定。各birth tbでEmitter世界行列を評価しp0を保存する。Cameraへ固定する指定の場合だけCamera(tb)逆変換を使う。その後Camera(t)を追従位置計算へ混ぜない。birth+lifeの生存範囲からCommand/bin候補を生成する。

IR：PS範囲100、PT各行が完全初期状態。TemplateはParticle scalar fieldsを読み、ageからpositionXYZとrotation/scale/alphaを出す。複数curve組ならPSを分割して固定TRACK IDsと対応させる。Shard Assetは形の種類ごとにreuse。

例：birth=.25、Emitter位置 `(10*tb,0)`、v=(4,6)、a=(0,−2)、t=.75ならage=.5でworld position=(4.5,2.75)。現在Emitterが(7.5,0)にいても足さない。現在Cameraが(cx,cy)なら最後にそこを引いて投影する。

Scratch：alive行だけ直接算出→Camera(t)→Shard Stamp。t=.75→.30→.95→.75の順にseekしても最後のpは同じ。Cloneも積算も不要。100という個数だけで性能PASSとは判定しない。

**CASE E — Infinite diagonal stripes＋Screen Frame＋Shake World**

Editor Graph：Scene/ViewのOverlayBackgroundにStripe lattice、WorldRootにTitle/Particles、OverlayForegroundにFrame。背景StripeはScreen Spaceでscrollし、FrameもScreen Spaceで固定。Title/ParticlesだけMain CameraのShakeを受ける。

Compiler：Stripeのnormal方向n=(cos45°,sin45°)、period L、phase=modp(speed*t,L)を使い、Stageを覆うStripe index範囲を確定する。Stripeは長いSegmentまたはperiodic Tile Assetへ変換。配置順はbackground island→world island→foreground island。

IR：StripeはR_KIND=LATTICE、D_VIEW=0。Title/ParticleはD_VIEW=Main。FrameはD_VIEW=0、Generated SVG Frame Assetまたは4本のLINE。Camera ProgramにだけShake Trackを置く。

Scratch：Stripeのperiodic座標→背景描画、WorldのTitle/ParticleへCamera(t)→Frame固定描画。Frameが揺れる、背景がCameraで二重scrollする、画面外stripeがfencingで寄る場合は不正。端点Clip/Tile範囲とAdapterを事前検査する。

Web：同じsb3のD_VIEW/island順から描画する。WebのCameraを別途Canvas全体に掛けない。そうするとScreen Frameまで揺れるためである。

**CASE F — 複雑Text＋Mask＋Blur＋Perspective warp**

Editor Graph：TextのWord/Character Animator→任意動的Mask→Blur→四隅Perspective warp→外側Composition Transform。Text原文、Glyph構造、Mask Path、Blur値、Warp四隅を全て保持する。

Compilerは次の順に判定する。

1. Textは通常通りshapeしてGlyphを生成。ここでは編集構造を破壊しない。
2. Maskが単なるPath trimなら数値trim、静的Maskなら輪郭intersection/PNG alphaへLower可能か検査。
3. Blurが静的で局所ならblur済みGlyph/Group Assetを生成。
4. 四隅Warpが時間不変のAffineならその残差をAssetへ。任意Projectiveまたは動的WarpならStamp不能。
5. Mask/Blur/Warpが内部Animationと非可換なら、このText合成面を透過Sequenceへ置換する。
6. 外側のSimilarity/Opacity/Cameraが合成面へ適用可能ならRuntimeへ残す。背景依存Blendがあれば必要背景区間まで閉包を広げる。

IR：通常、D_PRIM=SEQUENCE、D_SEQUENCE=Q、外側Transform Program、必要なView。QF_ASSETは各透過PNG frame。Textの前後に他のWorld Layerを残す。間に挟まったLayerを勝手に上/下へ移動しない。

Scratch：qからframe取得→Asset resolve→外側Transform/Camera→Stamp。他のParticle/Frameは通常Runtime。Webも同じSequenceを読む。編集元から高品質Textを再生成して別の映像にしない。再編集すると当該Source依存だけを再Compileする。


**15.1 付属Fixtureの範囲**

`fixtures/case-A..F.authoring.json`は各機能の保存構造を検査する小さな入力例、`case-A..F.runtime.json`は計算契約を分離して検査するIR例である。Authoring Fixtureを付属コードが製品Compilerで変換したという意味ではない。TTROの完成映像や100粒子の性能を再現するsb3でもない。

Runtime Aは文字Delay/Zoom、Bは親回転とinstance Phase、Cは別時刻GeometryへのNested call、DはParticle birth state、Eはperiodic offset、FはSequence区間を検証する。AのFontは参照だけで同梱せず、Font Shaping試験済みとはしない。全機能の映像Gateは本章のWorked Examplesを製品CompilerでExportして実施する。

**PDF-FUNCTIONAL-A：PDF機能の組合せによる追加検証**

1. 音楽区間に合わせて速度が変わる繰り返し背景へ、交互の色を設定する。
2. 中心から広がり回転するParticleを重ね、分布と密度を変更する。
3. 連番Effectを時間差なしで複数方向へ配置し、全ての影を本体の背面にまとめる。
4. 4点を超える制御点の曲線に流れる表示区間を作り、両端の装飾・背後の光を設定する。
5. その曲線を対称配置し、元曲線の制御点変更を両側へ反映する。
6. 最前面の文字へ柔らかい残像を加え、文字とCameraの動きの両方を反映する。

各操作の後に保存再読込、Compile、Scratch/Web再生を確認する。回数・点数・旧Costume名が一致することは合格条件ではなく、調整可能な内容と演出結果が維持されることを条件とする。既存CASE A〜Fも回帰対象として残す。

# 16. Fallback Matrix

| 表現／条件 | Runtime | Precompute | SVG/PNG Asset | Baked Clipの条件 |
|---|---|---|---|---|
| Glyph独立Animation | Stamp＋Transform/Track | shaping、origin、delay | Glyph outline/paint | 複雑な動的合成のみ |
| Standard shape | Stamp | 定数/ID | 使用shapeだけ | 原則不要 |
| 任意Rectangle/Ring thickness | 一様Transform | 寸法解決 | exact path | 寸法が動的かつgeometry経路が不適切 |
| Dynamic Arc | Path trim＋Line | circle sampling | fill/端形状が複雑な場合 | 動的fill＋効果が非対応 |
| General affine stroke | 頂点は可、幅は条件付き | 変形輪郭 | 固定affine残差 | 動的輪郭・fillが高コスト |
| Static Glow/Shadow | 軽いshadow stampも可 | 色/offset | blur済みAssetを優先 | 原則不要 |
| Dynamic soft Glow | Multi-stamp | density/alpha | soft brush Asset | 正確なBlend/コストが不適合 |
| Blur | 標準Blur opcodeを仮定しない | 値区間/variant計画 | 静的Blur | 動的Blur＋内容Animation |
| Gradient | Pen color式は線のみ | 色Track | Glyph/shape SVGまたはPNG | 動的複雑Gradient＋mask |
| Extrude | 少数offset stamps | offset/色 | 静的unionを優先 | 動的非可換effect |
| Motion Blur | 少数sampleの明示近似のみ | shutter sample | 静止content blur | 正しい動的screen合成が必要 |
| Mask/Reveal | Path trim、単純Line clip | vector intersection | 静的clip済みAsset | 動的複雑mask/画像clip |
| Flash | 全画面色Stamp＋alpha | 不要 | full-screen Asset | 不要 |
| Scene transition | alpha、slide、path wipe | overlap時刻 | 静的transition matte | 複雑な両Scene合成 |
| Bezier/Spline | bounded Path | 静的sampling | fill/path paint | geometry+effect高コスト |
| Particle/Scatter | analytic stamps | seed、birth、initial world state | Shard種別 | 原則数値軌道を先にBake |
| Infinite Scroll | periodic repeater | lattice bounds | periodic tile | 巨大動的compositeのみ |
| Tunnel/Parallax | camera-facing Stamp＋Z | depth/time | Ring等 | plane内部の任意Warp |
| Local View | 明示投影式 | Flatten | 静的viewport composite | 動的clip/isolation |
| Group opacity | inheritならleaf alpha | 分配可能性証明 | static isolated group | 動的重なり＋isolated alpha |
| Additive/multiply/backdrop blend | source-overへ黙って置換しない | 合成依存閉包 | static合成 | 動的背景依存区間 |

SVG/PNG Asset生成は単一状態を画像化すること、Sequenceは時間方向もSamplingすることとして区別する。Baked Clipはこの文書ではSequenceの意味的な使用目的であり、別Runtime Primitiveではない。


**16.1 Fallback判定の停止条件**

- Runtime対応かつ構造/品質予算内ならNativeを採用する。
- Runtime対応でも高コストなら数値Precompute/Generator展開/Static Assetの候補を比較する。
- 一定Affine残差や静的EffectはGenerated Assetとし、時間方向をBakeしない。
- 動的な非対応合成は最小Composite RegionのSequenceとする。
- 品質/サイズ/メモリのどれも満たせない場合はExport失敗を返す。Editor機能や原文Graphは維持する。
- sampledへの切替やFPS/解像度の変更はProfileの明示変更として扱い、Compilerが隠れて行わない。

この判定は対象の宣言された有限durationとProfileに対して実行する。どんな無制限の作品もScratchで再生可能という意味ではない。

# 17. Failure Analysis

**17.1 反証で確定した修正**

| 破綻候補 | 反例／修正仕様 |
|---|---|
| Parent Keyframeを子に加算 | 親90°回転中の子X移動が曲線になる。行列の時刻依存ProgramへFlatten |
| Anchor二重適用 | Glyph原点を移動したAssetにさらにanchorを引くとズレる。Asset原点とAnimator Pivotを区別 |
| 行列端点だけ補間 | 180°違う行列の中点でScaleが潰れる。回転unwrap＋内部Samplingまたは式保持 |
| Character=Unicode1文字 | ligature/結合文字/RTLで不成立。shaped cluster mappingを保持 |
| 個別文字measure | kerning/context shaping消失。run全体shape後のadvance/offsetを固定 |
| Gradient Assetの過剰reuse | Text全体Gradientは各Glyph位置依存。gradient座標をasset keyへ含める |
| Compositionを全部Cameraにする | 相対Transformと投影が混在。Group/Composition/Viewを分離 |
| Nested TimeMapをoffset加算 | 外側Loopと内側rateで境界が変わる。関数合成を順序通りCompile |
| phaseの単位混同 | 0.03秒を0.03cycleとして使うと周期次第でズレる。秒/cycle/degreeを型付け |
| 親もinstance delay | Ring全体回転までiごとにズレる。親qと内部q_iを別slot |
| Screen/Worldの混在 | Web canvas全体にCameraを掛けるとFrameが揺れる。View単位投影後にOverlay |
| Local/Main Camera二重適用 | 同じWorldへ二度投影しない。Local ViewはComposition平面への明示境界 |
| Group alpha分配 | 不透明2形を各alpha=.5で重ねると重なりalpha=.75。isolated group alpha=.5とは違う。境界を保持 |
| Path等速の誤認 | Bezier v一定速度はarc length一定でない。累積長逆引きを使用 |
| Dynamic Pathの古いlength | Control点が動けば長さも変わる。時刻別Polyline/累積長を生成 |
| Tangent角のframe依存 | 前の角度を覚えるとseekで別結果。導関数と固定近傍規約を使用 |
| Trailが現在Pathしか見ない | Pathが変形すると過去軌跡にならない。過去geometryTime・親行列も評価 |
| ParticleがEmitterに引かれる | 現在Emitter行列を全粒子へ掛けると過去粒子も動く。birth世界状態を固定 |
| Particle/Scatter非決定性 | pick random/積算でseekが変わる。初期値保存＋純粋関数 |
| Emitter retime | birthの逆像が複数ある。Compilerでbranch別event列挙、必要なら軌道Track |
| StampにScaleXYを渡す | Scratchには対応する独立Scaleがない。Similarity残差判定→Asset/geometry |
| 小Scale/巨大Scale | Sprite sizeがClampされる。寸法別variant/局所SequenceとAdapter検査 |
| Stage外のLine | go toがfenceされ端点が変わる。Carrier＋expanded viewport clip＋検査 |
| 半透明Pen Polyline | Pen down開始点/segment overlapでalphaが均一でない。必要ならwhole Path Asset |
| Clipでcapが見える | Stage境界そのもので切ると新capが出る。半幅＋AA余白まで拡張してclip |
| Pen色とStamp色混同 | Pen colorはStampを任意RGBへ染めない。Asset paintとgraphic effectを区別 |
| Costume番号破綻 | dedup/追加で番号が変わる。Asset Table→最終リンク、INIT名照合 |
| Sequence frameの原点 | 個別cropで画面がガタつく。共通論理Canvas、rotationCenter補正 |
| Bake後のLayer移動 | 非連続Layerを1Asset化すると間のLayerが消える/順序が変わる。連続区間閉包 |
| Result Register上書き | Track→Ease、Draw→Path→GeometryでGlobal result消失。caller-owned slots＋F frame |
| Listの存在しない項目 | 空文字が数値0になって静かに誤描画。INIT参照検証、guard、fault |
| 空List/0duration/0scale | 範囲0は読まない。空Track default、0life削除、0Scaleは非描画 |
| negative time/Loop境界 | 言語ごとの負mod差を除去。modp定義、half-open区間 |
| Keyframe極短区間 | epsilonで潰すと意図変更。正durationはそのまま計算しexact境界はupper_bound |
| Frame skip | Frame counterでTrack/Sequence/Eventを進めない。映像はt、Eventは区間走査 |
| Audio seek | start offsetなし。映像seekと音声checkpoint再開を分離 |
| 同音多重再生 | 同SoundPlayer再開始で中断し得る。固定IntroはPremix |
| Warpへの過信 | 500ms yieldがあり原子的ではない。準備→commit分離、実測予算、事前Fallback |
| Runtime負荷爆発 | Generator積/Path分割/Trail過去評価を上界管理。全loop有限、出力Profile超過はExport失敗 |
| Webだけ高機能な描画 | Sourceからの再描画でsb3プレビューが別物になる。Webも同じCompiled IR/Assetを使用 |
| sb3から編集階層を推測 | Flatten済みIRから元Graphは一意復元できない。IG_SOURCEを別保存 |

**17.2 追加の厳密化（ここを含めてv1契約）**

1. **Program output用M領域**：最終配置はM[1..32]=DRAW result、M[33..43]=VIEW result、M[44..75]=helper scratch、M[76..75+G]=GEOMETRY result、評価stackはM[76+G..]。Gは全GEOMETRY P_OUTCOUNTの最大、空なら0。この配置をINITと全Evaluatorで共用する。INITで `IG_GEOM_BASE=76, IG_EVAL_BASE=76+G` を設定する。Geometry出力をDRAW32slot内へcopyして破壊しない。
2. **FRAMEの再入**：pcはF内で更新。IG EXEC OPがPATH_SAMPLEから再帰EVAL PROGRAMを起こすとき、親instruction情報は親FとO Tableから復元する。共有tempの「現在Program ID」を信じない。
3. **My Blockの複合引数省略**：表中matrixはa,b,c,d,tx,tyの6入力、styleはwidth,rgb,alpha,color,brightnessの5入力、keyはisland,depth,command,local,segment,groupの6入力へ展開する。contextはt,i,particleRowの3入力。ScratchにStruct引数を渡す意味ではない。`base,dst`は2個の数値入力。EVAL PROGRAMのsinkも数値入力であり、出力先Listは固定2択のblock分岐で選ぶ。
4. **Asset座標**：Asset TableのA_RESを使用する。SVG=1、Bitmapはcostume.bitmapResolution。画像pixel `(px,py)` のAuthoring基準点は `((px−CX)/RES,(CY−py)/RES)*A_UNIT`。A_W/A_HはRendererのSkin寸法であって元Bitmap px数ではない。Stamp百分率は `100*s*A_UNIT`。
5. **最終時刻**：IG_HEADER item20は `LAST_TIME=nextDown(D)`。Compilerが有限doubleの直前値を保存する。明示seek(t>=D)はLAST_TIMEを描く。通常再生到達時はその終端画像を描いてstop。`D−固定epsilon`で極短末尾を飛ばさない。D=0の作品はExport validation errorとする。
6. **Bin検索**：tを0..LAST_TIMEへClampしてからbin indexを1..binCountへClampする。B_COMMAND内は重複なし、Command全体のisland/ordinalはSortで回復する。IG_BIN_DURATIONは使用時に正数、binCountはlength(B_FIRST)。
7. **Depth Island**：同一island内でdepth sortするLeafは同一の最終View座標系に属すること。depth=`z−cz+depthBias`、大きいものを先に描く。異なるViewのZを直接比較しない。
8. **Angle fallback**：Scratch atan2は `x>0:atan(y/x)`、`x<0:atan(y/x)+(y>=0?180:-180)`、`x=0:y>0?90:y<0?-90:0`。正規化は表示にだけ行い、Track unwrap値は保持する。
9. **Clip演算**：Liang–Barskyは4辺に対しp=0ならq<0で全除外、それ以外は更新なし。p≠0の比でenter/exitを更新しenter>exitなら除外。0長Lineは意図されたdotならPen point相当、通常Lineなら省略することをSourceで確定する。
10. **Faultコード**：1 ABI、2 table length、3 reference/range、4 numeric domain、5 memory/draw limit、6 asset map、7 unsupported transform、8 adapter clamp/fence、9 audio overrun、10 unknown module。Evaluator内はIG_ERROR設定だけ、IG FAILはnon-warp Controllerが呼ぶ。faultを未定義画面で続行しない。
11. **射影境界**：Perspectiveはnear<=d<=far、Orthographicは既定でZ Clipを行わない。OrthographicでもClipを望むSourceはactive式へCompileする。PROJECT_MATRIXはこの規約に従う。zoom=0はinactive、zoom<0はSourceで反転へ分解し最終Camera zoomは正にする。
12. **事前検査の限界**：全連続時刻でのAdapter適合をSamplingのみで証明したとは呼ばない。範囲解析で証明できる区間か、明示の時間Sampling近似へ落とす。未知はexport reportに残し、Runtime PREFLIGHTが検出して旧画面を維持する。

**17.3 今回実行した検査と未実行**

- 二段Transformの行列積と逐次座標変換を乱数10,000ケースで比較。最大絶対誤差 `3.552713678800501e−15`。
- 負時刻を含むLoop/Ping-pongを8ケース、24instanceのStagger時間差、Particleの逆順seek再評価、同時刻を含むAudio Event区間分割を数値検査。
- Group opacityとleaf alpha分配の差が0.25になる反例を確認し、isolated境界を設計へ追加。
- ScratchのStamp、非表示描画、size/fence、Penパラメータ、List範囲、Sound開始、Warp、sb3 media recordを公式ソースで確認。
- **未実行**：この設計のScratch My Blocks実装、sb3ロード/保存往復、実ブラウザ描画、両エンジンの画像差比較、性能測定、音声実測同期。従って本番実装のPASSは未判定。

確認したソースのGit blob SHA（commit SHAではない）：Pen `f6175f96f663d3045165954194684370859d6e40`、RenderedTarget `e4a12e244d93df37c23f760f19fba653384f5b4a`、Renderer `c65e674706ff9e35b853ada9b6c9475a8ac355bc`、Sequencer `504a3e078d1a554fa4eece06d8f5ddd354dd1e93`、Data `824831451c1984a006c010f979fd9a112dc2c8c1`、SoundPlayer `0cbf8687aeb39ee36f1ac1249efd06b45099cd89`、sb3 Serializer `c7db58d0b37dde696949c09db79c8b8c5d3e5e2e`。実装時にはRepository commitと依存パッケージ版も固定し、このソース確認をScratchサイトの配置済み版の特定と混同しない。


**17.4 本改訂で解消した追加の設計不整合**

| 項目 | 1.1の確定処理 |
|---|---|
| HeaderにbinDurationがない | Header[21]へ保存。作品別INIT定数を廃止 |
| sample時刻の規約が曖昧 | Header[22]、continuousCertified/sampleの2契約 |
| 評価中の過去Pathが現在Shared値を読む | timeScope付きCSE、GEOMETRYのSHARED禁止 |
| Scratch sin/cosとWebが微妙に異なる | 同じ10桁丸めをIR評価に適用 |
| Pen幅1/3の半pixel補正がない | Rasterizer内で1回適用 |
| SourceにSpline元データがない | spline原点列とCubicを排他保存 |
| Parent Emitter参照を循環と誤認 | Transform/Geometry/Compositeの依存channel分離 |
| Bitmask/Module名の数値が未定 | 1,2,4,8,16,32,64へ固定 |
| Source hashとIR hashの意味が混同 | それぞれ別のcanonical対象と照合先を固定 |
| 実装言語でJSON number表記が異なる | binary64を含むcanonical token列 |
| Webの色/Alpha/Line合成が概念止まり | premultiplied RGBA、Effect順、coverage、batch規則 |
| CompilerのFallbackが判断任せ | 有限候補、違反ratio、採用順、停止条件 |
| 製品実装前なのにFixtureから広くPASSを推論 | Fixture検査とsb3/描画/性能Gateを明確に分離 |

付属ValidatorはJSON Schemaと主要semantic invariantsの検証用であり、第11.13節の製品Validator全体を実装済みとはしない。未実装のチェックを「検査済み」と数えない。

**17.5 PDF機能照合で修正した不足と過剰な互換方針**

| 問題 | 修正 |
|---|---|
| AuthoringのPathがCubic/Splineだけ | 任意個数のBezier制御点を保存できる形式を追加 |
| Motion Blurだけでは薄い残像＋鮮明な本体の意図が曖昧 | temporalEchoを独立した演出機能として定義 |
| Curveの端点装飾を編集データへ保存する形式がない | decorationsを追加し、線とは別に編集できる |
| 各EffectのShadowを個別描画すると他の本体に被る | Group内で影をまとめて背面に置くpassOrderを追加 |
| 対称配置の制御が単なる負Scaleと混同される | symmetryに中心・空間・内容の向きを維持する選択を追加 |
| 彩度と加減速の強さを名前付きの既定値だけで扱う | HSV Paintと任意Powerを保存可能にした |
| PDFの20回・400点・独自VFX等を互換条件へ入れかけた | ユーザーの訂正に従い撤回。機能と調整内容を受入条件にする |

# 18. Final PASS Specification

**Scratch Runtime v1の固定仕様**

- Authoring Graphは非破壊、出力IRに親Treeを持たせない。
- sb3がWeb/Scratchの共通再生データ。Webは独立IRエンジン、Scratchは固定My Blocks。
- IG_SOURCEは編集情報、IGRT Tables/Assetsは再生情報として分離する。
- Column-major affine6、degree、秒、1-based ID、null=0、finite numberを使用する。
- TimeMapは関数合成。任意tの映像を直接評価し、Delta積算・frame random・過去描画残留へ依存しない。
- Camera/Composition/Groupを分離し、各Space境界で投影を1回だけ行う。
- Textはrun単位shape後に分解し、kerning、cluster、Glyph originを維持する。
- STAMP/LINE/PATH/SEQUENCEを共通Primitiveとし、最終Pen描画はSTAMP/LINE。
- Repeaterはbounded Template、Scatterは保存済み乱数、Particleはbirth世界状態からの時刻関数。
- Pathはarc-length API、動的Pathはbounded sampling、Trailは現在形状追従と過去軌跡を分ける。
- Asset Tableを唯一のCostume対応窓口とする。
- static residual、数値Precompute、最小Generated Assetを先に選び、必要区間だけSequenceにする。
- Group isolation、Mask、Blur、Blend、Layer順を破壊して軽量化しない。
- Resultはcaller-owned memory、Evaluator frameは明示stack。単一Global resultを使わない。
- 準備と描画を分け、erase allは準備成功後。Pen commitの原子性をWarpだけに依存して保証しない。
- Scratch音声は0秒/Premix/checkpoint基準。任意映像seekと任意音声seekの保証を区別する。
- 全loop/working listにCompile済み上限。超過を黙って部分描画しない。

**実装をPASSと判定するためのGate（これから実施）**

1. ABI：全Tables、Opcode arity、出力幅、参照、module closure、assets/hashが検証に通る。
2. Determinism：同じsb3とtを順方向・逆方向・乱順で評価し、prepared draw listが許容数値誤差内で一致する。
3. Text：TTROに加えkerning、ligature、結合文字、RTL、空白、複数Line/Word Animatorをfixture化して一致する。
4. Transform：Nested Group、反転、非一様残差、Anchor、Screen/World、Local View、Near-planeを検証する。
5. Six cases：CASE A〜FがAuthoringから実sb3へExportでき、ScratchとWeb独立再生で同じ構図・順序・時刻になる。
6. Boundary：空範囲、最終Frame、negative q、Loop、0Scale/alpha、極短Key、巨大値、画面外、Frame skipを検証する。
7. Image parity：同じ論理解像度で幾何誤差・alpha・色・crop・順序を比較する。GPUのAA差を画素完全一致と混同しない。
8. Performance：対象機器/公式VM version/Profileごとにp50/p95/最悪frame、commit時間、最大List/texture memoryを実測し、宣言予算を満たす。
9. Audio：0秒/checkpoint開始、Frame skip時のイベント、同音の重なり、停止/seek後の二重発火を実際に確認する。
10. Roundtrip：生成sb3をScratchでload/saveしてIG metadata、Lists、Costumes、Soundsが保持され、Webで再度読めることを確認する。

ここで固定するのは実装の契約と合格条件である。未実装のEngineを「性能PASS」「完全一致」とは宣言しない。

**18.1 実装開始条件の確定**

本改訂で、保存形式、Primitive/Opcode、My Block呼出、メモリ、Camera、色、Compiler判断、Fallback、Packaging、Error/Transport、検証Gateの実装契約を提供した。実装者が主要な意味仕様を選び直すことなく作業を開始できる状態を本書の「実装可能」と呼ぶ。

実装順は、(1)Schema loader/validator、(2)scalar/matrix evaluator、(3)Asset/Stamp/Line Adapter、(4)最小sb3とWeb独立再生、(5)Text/Generator/Path、(6)Bake/Effects/Audio、(7)差分・性能・保存往復Gate。CASE Aだけの試作で全設計を確定済みと見なさず、同じABIに順次機能を接続する。

残る作業は製品コードの実装、使用ライブラリの版固定、Font/Shaping・Renderer・Scratch VMでの実行検証、対象端末での測定である。これらの未実施を隠して、完成済みのEngineやFPS保証として扱わない。変更が必要になった場合は理由とFixtureを追加し、Source schema/ABIをversion管理する。

**18.2 添付検証の範囲**

添付のJSON Schema、Python参照Evaluator、6組の最小Fixtureはデータ契約と数式の反証用である。FixtureのAuthoringとIRは独立して作成しており、製品Compilerが変換した結果ではない。CASE A〜Fの完成映像、フォント整形、Scratch実行、Web GPU描画、音声同期、性能はこの検証では実行していない。検査結果の件数と成否は`verification/results.json`へ記録する。製品実装では本章の全Gateを別途通す。

検証実績：基礎36件、PDF機能保存14件、1.3追加15件、合計65件が成功（失敗0・エラー0）。行列合成の1検査内で10,000組を確認した。これは参照モデルの検査実績であり、上記実機Gateの合格を意味しない。

**18.3 PDF機能の最低要件Gate**

- `PDF_FUNCTIONAL_BASELINE.md`の32機能は最低要件。現行仕様にないからという理由で除外しない。
- 全115ページに対応機能を付け、本文・図から読み取った要件と実装方式を区別する。
- Editorで操作でき、Sourceに保存され、ScratchとWebへ出力した後も機能が失われないことを確認する。
- 旧エンジンのアルゴリズム、固定反復数、固定sample数、固有名、フレーム依存の不具合との互換性は要求しない。
- 添付のSchema検査は保存表現の確認であり、実機の32機能が合格したことを意味しない。

**18.4 機能単位の受入仕様**

`functional-contract.json`の32 PDF要件と18原要求群は、編集・Undo/Redo・保存再読込・Compile・Scratch再生・独立Web再生・seek・Layer順の各段階で確認する。全項目の現在状態はspecified_not_product_testedであり、Schema検査件数を製品機能PASSへ流用しない。追加の保存契約検査はverification/continuation-results.jsonに記録する。
