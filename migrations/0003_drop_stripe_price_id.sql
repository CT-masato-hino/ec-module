-- Stripe Price IDの廃止
-- 決済時はStripe Checkoutのprice_data(サーバー側でD1のprice_displayから動的生成)を使うため、
-- Stripe側でPriceを作成・同期する必要がなくなった。価格の正はD1のproducts.price_displayのみ。
ALTER TABLE products DROP COLUMN stripe_price_id;
