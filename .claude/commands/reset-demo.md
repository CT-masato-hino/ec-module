---
description: サンプルデータ入りの初期状態にリフレッシュ(イニシャライズ)する
---

このECモジュールのローカル環境を、サンプルデータ入りの初期状態(商品2件+サンプル注文1件)にリフレッシュしてください。

手順:

1. devサーバーが起動中か確認する。起動中なら一度停止する(initはDB stateを消すため、起動したままだと古いDBハンドルで応答が壊れる)
2. `npm run init` を実行する(.dev.varsの用意 → ローカルDB/画像ストレージの初期化 → マイグレーション+サンプルデータ投入まで自動で行われる)
3. devサーバーを起動(`npm run dev`)する
4. 初期状態になったことを検証する:
   - `curl -s http://localhost:8788/api/products` → サンプルアイテム A(在庫20)/ B(在庫10)の2件
   - `curl -s -u admin:admin1234 http://localhost:8788/api/admin/orders` → サンプル注文 `order_sample_001` の1件のみ
5. ユーザーに完了を報告する(ストア: http://localhost:8788 / 管理画面: /admin admin/admin1234)

注意: このコマンドはローカル環境のみが対象。本番D1には触れない。実案件用にサンプルデータを消したい場合は `/clear-sample-data` を使う。
