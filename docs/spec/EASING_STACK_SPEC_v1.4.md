# IntroGenerator Easing Stack 仕様 1.4

本書は IntroGenerator の Easing を「1区間に1種類」から「複数Easingを加算合成できるStack」へ拡張する正式設計差分です。

この差分は Authoring Model の拡張です。Scratch/Webの再生意味を分岐させず、CompilerがStackを単一の最終Curveへ畳み込んで既存IGRT/1.1へLowerします。Runtime ABIは変更しません。

## 1. 目的

1つのKeyframe区間へ Power、Back、Elastic、Bounce、Bezier などを複数追加し、それぞれの影響量を独立調整できるようにします。

例:

- Power InOut / Weight 0.60
- Back Out / Weight 0.25
- Elastic Out / Weight 0.10

これらは順番に関数を通すCompositionではありません。各Layerを独立に評価し、そのLinearとの差分を加算します。

## 2. 正規化時間と最終式

Keyframe区間 `[t0,t1]` の正規化時間を

```text
u = clamp((t - t0) / (t1 - t0), 0, 1)
```

とします。

Layer i のEasing関数を `E_i(u)`、Weightを `w_i` とすると、Stackの最終進行率は次です。

```text
E_stack(u) = u + Σ enabled_i * w_i * (E_i(u) - u)
```

ここで `enabled_i` は有効なら1、無効なら0です。

Keyframe値 `v0 → v1` の補間は従来どおり、

```text
value(t) = v0 + (v1 - v0) * E_stack(u)
```

とします。

## 3. 端点保証

全Primitive Easingは厳密に

```text
E_i(0) = 0
E_i(1) = 1
```

を満たすものとして扱います。

実装では浮動小数点誤差を避けるため、Stack評価の入口で

```text
u <= 0 => 0
u >= 1 => 1
```

を先に返します。

したがってLayer数、Weight、Overshootの有無に関係なく、

```text
E_stack(0) = 0
E_stack(1) = 1
```

です。Keyframeの開始値・終了値・区間時刻はEasing Stackの編集では変更されません。

## 4. Linearとの差分を加算する理由

単純な `E1(u)+E2(u)` では、終点が2や3へ増えてKeyframe終値を壊します。

本仕様では各Layerを

```text
Δ_i(u) = E_i(u) - u
```

という「Linearからの変形量」として扱います。

そのためWeight=1のLayerが1個だけなら、

```text
u + (E(u)-u) = E(u)
```

となり、従来の単一Easingと完全に同じ意味になります。

## 5. Weight

各Layerは `weight >= 0` の有限値を持ちます。

- `weight = 0`: Layerは数値的に無効
- `weight = 1`: そのEasing本来の差分量
- `0 < weight < 1`: 効果を弱める
- `weight > 1`: 効果を強調する

WeightはEasing固有parameterとは別です。

例:

- Powerの `power` はCurve自体の形
- Backの `overshoot` はCurve自体の形
- Elasticの `period` は振動周期
- Layerの `weight` はそのCurveをStackへ混ぜる量

を表します。

## 6. OvershootとClamp

Stack出力は0〜1へClampしません。

Back、Elastic、Bezier、複数Layerの加算によるOvershoot/Undershootを保持します。

Clampが必要なPropertyは、従来仕様どおり最終物性の段階でのみ行います。例えばOpacityは最終評価後に有効範囲へClampします。位置、回転、Scale等のEasing結果を途中で0〜1へ丸めてはいけません。

## 7. Layer順

v1.4の合成は純粋な加算なので、Layer順は数値結果へ影響しません。

```text
A + B = B + A
```

です。

Editorは読みやすさのため配列順を保存してよいですが、並べ替えで映像結果を変えてはいけません。将来、順序依存の別Composition modeを追加する場合は別の明示的なmodeとして仕様改訂します。

## 8. Authoring保存形式

Authoring Sourceは IGAUTHOR/1.4 とします。Runtime ABIは IGRT/1.1 を維持します。

Keyの `ease` は新規作品では次のStack形式を標準とします。

```json
{
  "kind": "stack",
  "layers": [
    {
      "id": "easeLayer1",
      "enabled": true,
      "weight": 0.6,
      "curve": {
        "kind": "powerInOut",
        "power": 3
      }
    },
    {
      "id": "easeLayer2",
      "enabled": true,
      "weight": 0.25,
      "curve": {
        "kind": "backOut",
        "overshoot": 1.70158
      }
    }
  ]
}
```

### Easing Layer

各Layerは以下を保持します。

| field | 意味 |
|---|---|
| `id` | 安定した編集ID |
| `enabled` | Layerの有効/無効 |
| `weight` | Linearとの差分を加算する量。0以上の有限値 |
| `curve` | 従来のPrimitive Easing object |

`curve` へ `kind:"stack"` を入れることは禁止し、Stackの入れ子は作りません。

## 9. Primitive Easing

Primitive Curveは従来4.4で定義したものをそのまま使います。

- Hold
- Linear
- Sine In / Out / InOut
- Quad In / Out / InOut
- Cubic In / Out / InOut
- Quart In / Out / InOut
- Quint In / Out / InOut
- Expo In / Out / InOut
- Circ In / Out / InOut
- Back In / Out / InOut
- Elastic In / Out / InOut
- Bounce In / Out / InOut
- Power In / Out / InOut
- User cubic Bezier
- Samples / imported curve

Backのovershoot、Elasticのperiod、Powerのpower、Bezierのcontrol points等は各Layerごとに独立保持します。

## 10. 旧IGAUTHOR/1.3との互換

IGAUTHOR/1.3の単一Easing:

```json
{
  "kind": "powerInOut",
  "power": 3
}
```

はImport時に意味上、次と同一として扱います。

```json
{
  "kind": "stack",
  "layers": [
    {
      "id": "<generated-stable-id>",
      "enabled": true,
      "weight": 1,
      "curve": {
        "kind": "powerInOut",
        "power": 3
      }
    }
  ]
}
```

移行時にKeyの時刻・値・Time Anchorを変更してはいけません。

旧Sourceを読み込んだだけでは見た目を変更しません。1.4形式で保存した時点でStack形式へ正規化します。

## 11. Empty Stack

`layers=[]` はLinearと同一です。

```text
E_stack(u) = u
```

Layerを全削除した場合もKeyframe区間自体は削除しません。

## 12. Holdの扱い

HoldもPrimitive Layerとして使用できます。

端点保証のため `u=1` ではStack全体を先に1として返します。区間内部ではHold Primitiveの定義に従います。

複数Layerと組み合わせた場合、HoldのLinearとの差分も他Layerと同じ式で加算します。Holdを特別な後処理としてStack全体へ適用してはいけません。

## 13. Editor UI契約

Easing編集UIでは、1 Key区間に対して複数Layerを扱える必要があります。

必須操作:

- `＋ Easing` でLayer追加
- 各Layerの有効/無効
- Easing種類
- In / Out / InOut
- Weight
- Easing固有parameter
- Layer削除
- Layer複製
- Layer順の表示・並べ替え

並べ替えはv1.4では表示整理のみで、数値結果は変わりません。

Stack全体を編集してもKeyframeの時刻と値を変えてはいけません。

追加・削除・複製・並べ替え・Weight変更は通常のUndo/Redo対象です。

UI実装はIntroGeneratorの既存UIパターンとUI Implementation Qualityのルールに従います。

## 14. Compiler契約

Easing StackはAuthoring専用構造です。IGRT/1.1へ新しいStack Opcodeや作品別My Blockを追加しません。

Compilerは各Key区間について `E_stack(u)` を1本の最終Curveとして評価します。

- `sampled` profile: 共通sample時刻で最終Stack値を評価
- `continuousCertified`: Stack全体を誤差保証付きで適応Samplingし、単一LUTへLower

各LayerをRuntimeで別々に足し合わせることを必須にしません。ScratchとWebはCompile後の同一結果を読む必要があります。

Compiler最適化はAuthoring SourceのLayerを削除・結合・書換えしてはいけません。

## 15. 数値安定性

各Layer評価値、差分、Weight積、合計は有限値である必要があります。

非有限値が発生した場合、対象KeyとLayer IDを含むCompileエラーを返します。該当Layerを黙って無効化して出力してはいけません。

`continuousCertified` で誤差上界を証明できないStackは、既存契約どおり明示的にsampledへ変更するか、診断を返します。

## 16. PDF-F09の更新後受入条件

PDF-F09は従来の単一Easing操作に加え、Easing Stackを最低要件とします。

受入試験:

1. 同一区間 `0 → 100` へPower InOutをWeight 1で1Layerだけ設定し、従来Powerと全時刻で同じになる。
2. Power、Back、Elasticを3Layer追加し、開始値0、終了値100を厳密に維持する。
3. 中間時刻では `u + Σw(E(u)-u)` の計算結果と一致する。
4. LayerのWeightを0にすると、そのLayerだけが結果から消える。
5. Layerをdisabledにすると、そのLayerだけが結果から消える。
6. Layerを削除しても他LayerとKeyframe値・時刻は変更されない。
7. Layer順を並べ替えてもv1.4では映像結果が変わらない。
8. Back/Elastic/Bezier等のOvershootはStack合成後も保持する。
9. Undo/Redoで追加・削除・Weight・parameter変更を1操作単位で戻せる。
10. 保存→再読込でLayer ID、enabled、weight、curve parameter、配列順を保持する。
11. IGAUTHOR/1.3の単一Easingを読み込むと見た目を変えず1Layer Stackとして移行できる。
12. sb3出力後、Scratchと独立Web Runtimeで同じ最終Curveを再生する。

## 17. PDF-F02との関係

PDF-F02「複数の変化を重ねる」とEasing Stackは別概念です。

- PDF-F02: Propertyへの複数Animation/Effect変化を重ねる
- Easing Stack: 1つのKeyframe区間内部の時間進行Curveを複数Easingで合成する

両者を混同して、Easing LayerをProperty加算Layerへ変換してはいけません。

## 18. Version

この設計差分をAuthoring 1.4の変更として扱います。

```text
Authoring Source: IGAUTHOR/1.4
Runtime ABI:      IGRT/1.1
Easing Stack:     additive-deviation-v1
```

既存IGRT/1.1のTable・Opcode・Headerをこの変更だけのために改訂しません。
