-- サンプルデータ一括削除
-- 本モジュールを実案件で使い始めるときに実行する。
-- サンプル商品(SAMPLE STORE / サンプルアイテムA・B)と、動作確認で作られた
-- 注文・仮注文・Webhookログをすべて削除し、まっさらな状態にする。
--
-- ローカル:  npm run data:clear:local
-- リモート:  npm run data:clear:remote  (本番D1に対して実行されるので注意)

DELETE FROM email_logs;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM checkout_sessions;
DELETE FROM webhook_events;
DELETE FROM products WHERE id IN ('prod_001', 'prod_002');
