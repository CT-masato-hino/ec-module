import type { Env } from './env';
import { newId, nowIso } from './db';
import { isEmailMockMode } from './mock';

export type EmailType = 'order_confirmation' | 'payment_confirmed' | 'shipped';

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  emailType: EmailType;
  orderId: string | null;
}

/**
 * メール送信。RESEND_API_KEYが未設定/ダミーの場合は実送信せずemail_logsにstatus='mocked'で記録する。
 * 実キーがある場合はResend APIにfetchし、成功=sent/失敗=failedを記録する。
 * 例外が起きても購入フローを止めない(呼び出し側でtry-catchしなくてもここで吸収する)。
 */
export async function sendEmail(env: Env, params: SendEmailParams): Promise<void> {
  // 宛先が空の場合は送信もログ記録も行わない(不正な空リクエストで無駄なログを残さない)
  if (!params.to) {
    console.warn('sendEmail skipped: empty recipient', { emailType: params.emailType, orderId: params.orderId });
    return;
  }

  const db = env.DB;
  const logId = newId('elog');
  const now = nowIso();

  if (isEmailMockMode(env)) {
    try {
      await db
        .prepare(
          `INSERT INTO email_logs (id, order_id, to_email, subject, body, email_type, status, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'mocked', NULL, ?)`
        )
        .bind(logId, params.orderId, params.to, params.subject, params.text, params.emailType, now)
        .run();
    } catch (err) {
      console.error('failed to record mocked email log', err);
    }
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: params.subject,
        text: params.text,
      }),
    });

    if (res.ok) {
      await db
        .prepare(
          `INSERT INTO email_logs (id, order_id, to_email, subject, body, email_type, status, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, ?)`
        )
        .bind(logId, params.orderId, params.to, params.subject, params.text, params.emailType, now)
        .run();
    } else {
      const errorText = await res.text().catch(() => `HTTP ${res.status}`);
      await db
        .prepare(
          `INSERT INTO email_logs (id, order_id, to_email, subject, body, email_type, status, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?)`
        )
        .bind(logId, params.orderId, params.to, params.subject, params.text, params.emailType, errorText.slice(0, 500), now)
        .run();
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('sendEmail failed', err);
    try {
      await db
        .prepare(
          `INSERT INTO email_logs (id, order_id, to_email, subject, body, email_type, status, error_message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?)`
        )
        .bind(logId, params.orderId, params.to, params.subject, params.text, params.emailType, errorMessage.slice(0, 500), now)
        .run();
    } catch (logErr) {
      console.error('failed to record failed email log', logErr);
    }
  }
}

/** 注文確認メールの本文を組み立てる。 */
export function buildOrderConfirmationEmail(params: {
  orderId: string;
  items: { productName: string; unitPrice: number; quantity: number; subtotal: number }[];
  amountTotal: number;
  shippingName: string;
  paymentStatus: string;
  shippingFee: number;
}): { subject: string; text: string } {
  const itemLines = params.items
    .map((item) => `- ${item.productName} × ${item.quantity} = ¥${item.subtotal.toLocaleString('ja-JP')}`)
    .join('\n');

  const pendingNote = params.paymentStatus === 'unpaid' ? '\n\nお支払い確認後に発送します。' : '';

  const hasShippingFee = params.shippingFee > 0;
  const shippingLine = hasShippingFee ? `\n送料: ¥${params.shippingFee.toLocaleString('ja-JP')}` : '';
  const totalLabel = hasShippingFee ? '(税込)' : '(税込・送料込み)';

  const text = `${params.shippingName} 様

この度はご注文いただきありがとうございます。
以下の内容でご注文を承りました。

注文番号: ${params.orderId}

${itemLines}${shippingLine}

合計: ¥${params.amountTotal.toLocaleString('ja-JP')}${totalLabel}${pendingNote}

引き続きよろしくお願いいたします。`;

  return { subject: 'ご注文ありがとうございます', text };
}

export function buildPaymentConfirmedEmail(params: { orderId: string; shippingName: string }): {
  subject: string;
  text: string;
} {
  const text = `${params.shippingName} 様

ご注文番号 ${params.orderId} のご入金を確認しました。
発送までもうしばらくお待ちください。`;

  return { subject: 'ご入金を確認しました', text };
}

export function buildShippedEmail(params: { orderId: string; shippingName: string }): {
  subject: string;
  text: string;
} {
  const text = `${params.shippingName} 様

ご注文番号 ${params.orderId} の商品を発送しました。
到着まで今しばらくお待ちください。`;

  return { subject: '商品を発送しました', text };
}
