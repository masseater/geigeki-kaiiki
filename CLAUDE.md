# 迎撃海域

『鋼鉄の咆哮3』風の3D俯瞰リアルタイム海戦ゲーム。自艦1隻で、数で勝る敵艦隊を各個撃破してギリギリ倒しきるのが面白さの核。1対1にはしない。

## 構成

- `src/sim/` 戦闘シミュレーション。three.js と DOM に依存しない純TS。乱数は `createRng(seed)` だけを使い、`Math.random` は禁止（テストの再現性が崩れる）
  - `data.ts` 艦・波・島の数値
  - `world.ts` `createWorld` と `step(world, control, commands, dt)`。演出が必要な出来事は `world.events` に積む
  - `bot.ts` 自艦を操縦するボット。全魚雷の針路が見えている分、人間より有利
- `src/render/` three.js。World を読むだけで書き換えない
- `src/ui/` HUD・2D重ね表示・出撃前と結果の画面
- `src/input.ts` 入力を `Control`（毎ティック）と `Command`（押した瞬間）に変換
- `src/main.ts` 固定刻み 1/60 秒で sim を回し、イベントを演出・音・ログに配る
- `prototype/index.html` 最初の1ファイル版。参照用で、もう更新しない

座標は北が +z、東が -x。方位 h の前方は (sin h, cos h)。h が増えると取舵（左）。

## 確認

- `pnpm check` 型・テスト・ビルドをまとめて実行。マージ前に必ず通す
- `pnpm balance` ボットに各艦で12戦させ、勝ち数と残耐久を表示する。数値を触ったら必ず見る。意図してバランスを変えたら `test/balance.test.ts` の `EXPECTED` を更新する
- `pnpm dev` 手元で遊ぶ

## 公開

`pnpm build:artifact` で three まで焼き込んだ1枚のHTML（`dist-artifact/artifact.html`）ができる。これを claude.ai の Artifact「迎撃海域」（https://claude.ai/artifact/Tw7udF1aCJhs6U4Fq5KXMB）に `url` 指定で再公開すると、同じURLのまま更新される。

## 見た目を変えたとき

画面を変えたらヘッドレスの Chromium でデスクトップ幅とスマホ幅のスクリーンショットを撮って確認する。Playwright と Chromium は環境に入っている（`playwright install` はしない）。
