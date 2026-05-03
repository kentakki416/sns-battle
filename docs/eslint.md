# ESLint トラブルシューティング: `eslint-plugin-react-hooks` の minor バージョン揺れ

このドキュメントは、2026-05-03 に発生した `apps/admin` の lint エラーと、その原因・対処をまとめたメモです。同じ症状が再発したとき、または姉妹リポジトリ（project-template など）で類似の現象が起きたときの参考にしてください。

## 目次

- [起きたこと](#起きたこと)
- [なぜ起きたのか](#なぜ起きたのか)
  - [前提: `eslint-plugin-react-hooks` とは](#前提-eslint-plugin-react-hooks-とは)
  - [前提: transitive dependency（間接依存）とは](#前提-transitive-dependency間接依存とは)
  - [今回の核心: 7.0.x と 7.1.x で挙動が変わった](#今回の核心-70x-と-71x-で挙動が変わった)
  - [なぜ project-template と sns-battle で違ったのか](#なぜ-project-template-と-sns-battle-で違ったのか)
- [取った対処](#取った対処)
  - [sns-battle 側](#sns-battle-側)
  - [project-template 側](#project-template-側)
- [今後再発を防ぐために](#今後再発を防ぐために)
- [付録: 自分で調査するときのコマンド](#付録-自分で調査するときのコマンド)
- [関連リンク](#関連リンク)

---

## 起きたこと

`apps/admin` 配下で `pnpm lint` を実行したら、以下 3 件のエラーが出ました。

```
apps/admin/src/components/features/ecommerce/CountryMap.tsx
  50:9   error  This assertion is unnecessary since it does not change the type of the expression
                @typescript-eslint/no-unnecessary-type-assertion

apps/admin/src/components/layout/AppSidebar.tsx
  228:26 error  Compilation Skipped: Existing memoization could not be preserved
                react-hooks/preserve-manual-memoization
  254:5  error  Calling setState synchronously within an effect can trigger cascading renders
                react-hooks/set-state-in-effect

✖ 3 problems (3 errors, 0 warnings)
```

直前に派生元として使っている **project-template** リポジトリ（同じ階層の sibling）でまったく同じファイルに対して `pnpm lint` を走らせると **0 errors**。「ファイルもルールも同じはずなのに、なぜ片方だけ落ちる？」という所から調査が始まりました。

---

## なぜ起きたのか

ひとことで言うと **`eslint-plugin-react-hooks` の minor バージョンが両プロジェクトでズレていたから** です。

| プロジェクト | `eslint-plugin-react-hooks` |
|---|---|
| sns-battle / apps/admin | **7.1.1** |
| project-template / apps/admin | **7.0.1** |

このプラグインは「どちらのプロジェクトの `package.json` にも書かれていない」のに、勝手に node_modules に入ってきます。書いていないのに入っている、しかもバージョンが違う ── これが今回つまずいたポイントです。順を追って解説します。

### 前提: `eslint-plugin-react-hooks` とは

React 公式が提供している ESLint プラグインで、「Hooks のルール違反」を検出します。例:

- `useEffect(..., [])` の依存配列に書き忘れた変数を指摘
- `useState` を if 文の中で呼んでしまうのを指摘
- React Compiler 観点での最適化阻害コードを指摘（**7.x 以降の追加機能**）

Next.js プロジェクトでは `eslint-config-next` を使うのが普通で、そこに **このプラグインのルールセットがあらかじめ組み込まれています**。なので開発者は意識しなくても、Next.js プロジェクトで自動的にこのプラグインが効きます。

### 前提: transitive dependency（間接依存）とは

`package.json` に **直接書いた依存** を「直接依存（direct dependency）」、**直接依存が連れてくる依存** を「間接依存（transitive dependency）」と呼びます。

```
apps/admin/package.json
└── "eslint-config-next": "16.0.3"     ← 直接依存（自分で書いた）
    └── "eslint-plugin-react-hooks": "^7.x.x"  ← 間接依存（連れてきた）
                                       ↑
                                  この `^` が今回の落とし穴
```

`^7.x.x` のような **範囲指定** は「7 系の最新を取ってきていい」という意味です。実際にどのバージョンが選ばれるかは `pnpm install` を実行した時点での npm レジストリの状態次第で、実行のたびに違うバージョンが固定される可能性があります。

`pnpm install` 後は `pnpm-lock.yaml` に「今回はこのバージョンを使った」という記録が残るので、同じ lock を使う限り再現性はあります。が、**新しくリポジトリを作って初めて `pnpm install` した時点** の最新値で固定されるため、姉妹プロジェクト間でズレが起きます。

### 今回の核心: 7.0.x と 7.1.x で挙動が変わった

`eslint-plugin-react-hooks` 7.x 系の recommended 設定（`eslint-config-next` が自動で読み込むデフォルト構成）には、以下のような **React Compiler 系のルール群** が含まれています:

- `react-hooks/preserve-manual-memoization`
- `react-hooks/set-state-in-effect`
- `react-hooks/static-components`
- `react-hooks/immutability` …他

両バージョンとも「ルール ID は recommended に含まれている」「重みも error」と完全に同じ扱いです（`pnpm eslint --print-config <file>` で実証済み）。

ところが調査の結果、

- **7.0.x**: ルール ID は登録されているが、**実装が実質的に no-op**（コードを見ても何も指摘しない）
- **7.1.x**: ルールの実装が入って、**実際にコードを検出するようになった**

という違いがありました。つまり「設定は変わっていないのに、ある日プラグインを更新したら急に大量のエラーが出る」状況が起こり得ます。

> 補足: React Compiler 関連のルールは React 19 / React Compiler の正式リリースに伴って段階的に有効化されています。「将来の React で警告される書き方を、今のうちに直しておく」という性質のルールなので、**指摘自体は正しい**ものです（黙らせるのではなく直すのが基本）。

### なぜ project-template と sns-battle で違ったのか

両者とも `eslint-config-next@16.0.3` を直接依存に持ち、本来は同じ間接依存になるはずです。違いを生んだ要因は **`pnpm install` した時刻** です。

```
時系列:
  T1  project-template で pnpm install
        → このとき npm レジストリの 7.x 最新は 7.0.1 だった
        → lock に 7.0.1 が記録される

  T2  npm レジストリに 7.1.1 が公開される

  T3  sns-battle で pnpm install
        → このとき 7.x 最新は 7.1.1
        → lock に 7.1.1 が記録される
```

加えて pnpm には **Safe-chain プラグイン**（`config.minimumReleaseAge` 設定など）があり、「公開されたばかりの package は最低公開期間を満たすまで採用しない」というセーフティが効きます。これも分岐の要因になります。

> 実証: project-template 側で `pnpm add -D eslint-plugin-react-hooks@7.1.1` を実行すると sns-battle と完全に同じ 2 件のエラー（`preserve-manual-memoization` / `set-state-in-effect`）が再現できました。

なお、もう一つの `CountryMap.tsx` のエラー（`@typescript-eslint/no-unnecessary-type-assertion`）はこの React Compiler 系の話とは別系統で、TypeScript 型推論ベースのルールです。`@typescript-eslint/parser`・`typescript`・`@react-jvectormap/core` のいずれかの解決バージョン差が原因と推測されます（こちらも minor 揺れの一種）。

---

## 取った対処

### sns-battle 側

コミット `e3c03a4` ("fix: lintの修正") で、エラー検出されたコード自体を React Compiler が許容する書き方へ修正しました。

- **`CountryMap.tsx`**: 不要な `as MarkerStyle` を削除
- **`AppSidebar.tsx`**: `useMemo + useEffect で state を同期するアンチパターン` を、`useState の初期化関数 + 前回 pathname との比較で render 中同期するパターン` に置き換え

#### AppSidebar の修正前後

修正前（`useEffect` 内で `setState` するのは React Compiler 的に NG）:

```tsx
const initialSubmenu = useMemo(() => { /* pathname から逆引き */ }, [pathname])
const [openSubmenu, setOpenSubmenu] = useState(initialSubmenu)

useEffect(() => {
  setOpenSubmenu(initialSubmenu)  // ← set-state-in-effect で叱られる
}, [initialSubmenu])
```

修正後（外部関数化 + render 中比較同期 ＝ React 19 推奨パターン）:

```tsx
const findSubmenuByPathname = (pathname: string): SubmenuState => {
  /* pathname から逆引き */
}

// component 内
const [openSubmenu, setOpenSubmenu] = useState<SubmenuState>(() =>
  findSubmenuByPathname(pathname)
)
const [prevPathname, setPrevPathname] = useState(pathname)

if (pathname !== prevPathname) {
  setPrevPathname(pathname)
  setOpenSubmenu(findSubmenuByPathname(pathname))
}
```

このパターンは公式ドキュメントの「[You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)」で推奨されている書き方で、`useEffect` 経由よりレンダー回数が減りパフォーマンスも良くなります。

### project-template 側

PR [#1](https://github.com/kentakki416/project-template/pull/1) で以下を実施しました（テンプレ側でも将来同じ症状が出ないようにするため）:

1. `apps/admin/package.json` と `apps/web/package.json` に `"eslint-plugin-react-hooks": "7.1.1"` を **直接依存として固定**
2. `apps/admin/src/components/layout/AppSidebar.tsx` を sns-battle と同じパターンへ修正
3. `apps/web/src/app/page.tsx` のマウント時自動 fetch（`useEffect` 内 setState）に意図的な `// eslint-disable-next-line react-hooks/set-state-in-effect` を付与（サンプル目的のため）

---

## 今後再発を防ぐために

### 方針 1: 影響の大きい間接依存はバージョンを固定する（推奨）

「lint ルールやビルド成果物の振る舞いに直接影響する間接依存」は、`package.json` に **直接依存として明示的に書く** のが安全です。範囲指定（`^`）も避け、固定バージョンで書くと姉妹プロジェクト間で揺れません。

```jsonc
// apps/admin/package.json (推奨例)
"devDependencies": {
  "eslint-plugin-react-hooks": "7.1.1"  // 固定
}
```

固定対象として **lint プラグイン全般 / TypeScript / Prisma** など、コードの判定や生成物に直接影響するものを選ぶと費用対効果が高いです。

### 方針 2: lock ファイルを信頼する（前提）

`pnpm-lock.yaml` をコミット対象にして、CI でも開発者の環境でも同じ lock を再生する限りバージョンは揃います。**lock を消して `pnpm install` し直すと別の minor を引きに行く** ので、原則として lock は触らないでください。

### 方針 3: 他の sibling プロジェクトと差を作らない

姉妹プロジェクト（project-template, money-management 等）と Next.js / React のバージョンを揃えるなら、**同じ lint プラグイン構成** にしておくと、片方だけ落ちる症状を防げます。テンプレート側に修正が入ったら sns-battle 側にも反映する、という流れを推奨します。

---

## 付録: 自分で調査するときのコマンド

> 「自分のリポジトリで似た現象が出たときに何を確認するか」のチートシートです。

#### 1. プラグインのバージョンが本当に何で解決されているか

```bash
# 直接見る
cat apps/admin/node_modules/eslint-plugin-react-hooks/package.json | grep version

# pnpm に聞く
pnpm --filter admin why eslint-plugin-react-hooks
```

#### 2. ESLint が最終的にどのルールを有効にしているか

```bash
cd apps/admin
pnpm exec eslint --print-config src/components/layout/AppSidebar.tsx | jq '.rules'
```

ルール一覧と重み（`0`=off, `1`=warn, `2`=error）が JSON で出ます。**「ルールはあるのに動いていない」「ルールが無いと思っていたのに有効だった」を切り分けるための最強コマンド**です。

#### 3. 姉妹プロジェクトと比較する

```bash
diff <(cd /path/to/project-A/apps/admin && pnpm exec eslint --print-config <file>) \
     <(cd /path/to/project-B/apps/admin && pnpm exec eslint --print-config <file>)
```

設定が一致しているのに挙動が違うなら、それはコードかプラグイン実装の差です。

#### 4. プラグインのバージョンだけ意図的にズラして再現する

```bash
pnpm --filter admin add -D eslint-plugin-react-hooks@<version>
pnpm --filter admin lint
```

確認後は `git restore apps/admin/package.json pnpm-lock.yaml && pnpm install` で戻せます。

---

## 関連リンク

- React 公式: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- React 公式: [Rules of React (Compiler)](https://react.dev/reference/rules)
- `eslint-plugin-react-hooks` リポジトリ: <https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks>
- 関連 PR
  - sns-battle: コミット `e3c03a4` "fix: lintの修正"
  - project-template: <https://github.com/kentakki416/project-template/pull/1>
