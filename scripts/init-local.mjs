// ローカル環境をサンプルデータ入りの初期状態にリフレッシュするイニシャライズスクリプト。
// clone直後のセットアップにも、検証で汚れた環境のリセットにも使う。
//
//   npm run init
//
// やること:
//   1. .dev.vars がなければ .dev.vars.example からコピー(ダミーキー=モックモードで動く)
//   2. ローカルD1・R2のstateを削除(商品・注文・会員・画像がすべて消える)
//   3. マイグレーションを適用し、サンプルデータ(商品2件+注文1件)を投入
//
// 注意: devサーバー(npm run dev)が起動中の場合は、実行後に必ず再起動すること
// (古いDBハンドルを掴んだままになり応答が壊れるため)。

import { existsSync, rmSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const step = (msg) => console.log(`\n[init] ${msg}`);

// 1. .dev.vars
const devVars = join(root, '.dev.vars');
if (!existsSync(devVars)) {
  copyFileSync(join(root, '.dev.vars.example'), devVars);
  step('.dev.vars を作成しました(ダミーキー=モック決済/モックメールで動作)');
} else {
  step('.dev.vars は既存のものを維持します');
}

// 2. ローカルstateの削除(D1=商品/注文/会員、R2=アップロード画像)
for (const dir of ['d1', 'r2']) {
  const path = join(root, '.wrangler', 'state', 'v3', dir);
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}
step('ローカルのDB・画像ストレージを初期化しました');

// 3. マイグレーション適用(スキーマ+サンプルデータ)
step('マイグレーションを適用しています…');
execSync('npx wrangler d1 migrations apply ec_db --local', { cwd: root, stdio: 'inherit' });

console.log(`
[init] 完了。サンプルデータ入りの初期状態になりました。
  - 商品: サンプルアイテム A / B(在庫20 / 10)
  - 注文: サンプル注文1件(入金済み・未対応)

次のステップ:
  npm run dev          # http://localhost:8788 (devサーバー起動中だった場合は再起動)
  管理画面: http://localhost:8788/admin (admin / admin1234)

実案件でサンプルデータを消して使い始めるとき:
  npm run data:clear:local  (または /clear-sample-data スラッシュコマンド)
`);
