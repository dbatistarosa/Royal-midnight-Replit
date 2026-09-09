import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { rows } from "./durability.js";

const scope = new AsyncLocalStorage<string>();
export function withMailScope<T>(key: string, work: () => Promise<T>) {
  return scope.run(key, work);
}

export async function enqueueMail(
  to: string | string[],
  subject: string,
  html: string,
  kind: string,
) {
  const recipient = Array.isArray(to) ? to : [to];
  const parent = scope.getStore();
  const key = parent
    ? crypto
        .createHash("sha256")
        .update(JSON.stringify([parent, recipient, subject, kind]))
        .digest("hex")
    : null;
  await db.execute(sql`INSERT INTO mail_outbox(dedupe_key,recipient,subject,html,kind)
    VALUES(${key},${JSON.stringify(recipient)}::jsonb,${subject},${html},${kind})
    ON CONFLICT(dedupe_key) DO NOTHING`);
}

type Mail = {
  id: string;
  recipient: string[];
  subject: string;
  html: string;
  kind: string;
  attempts: number;
};
/** Bounded worker. Delivery remains queued when the provider is unavailable. */
export async function drainMailOutbox() {
  if (
    !process.env.RESEND_API_KEY &&
    !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ) {
    throw new Error("Email provider is not configured");
  }
  const deadline = Date.now() + 18_000;
  for (let i = 0; i < 10 && Date.now() < deadline; i++) {
    const [mail] = rows<Mail>(
      await db.execute(sql`
      UPDATE mail_outbox SET status='sending',lease_until=now()+interval '2 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM mail_outbox WHERE
        (status IN ('pending','failed') AND attempts<8 AND available_at<=now()) OR
        (status='sending' AND lease_until<now() AND attempts<8)
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id,recipient,subject,html,kind,attempts`),
    );
    if (!mail) break;
    try {
      const payload = {
        from:
          process.env.SMTP_FROM ?? "Royal Midnight <noreply@royalmidnight.com>",
        to: mail.recipient,
        subject: mail.subject,
        html: mail.html,
        replyTo: process.env.REPLY_TO ?? "support@royalmidnight.com",
      };
      let providerId: string | null = null;
      if (process.env.RESEND_API_KEY) {
        const { replyTo, ...content } = payload;
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(8000),
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json",
            "Idempotency-Key": mail.id,
          },
          body: JSON.stringify({ ...content, reply_to: replyTo }),
        });
        const result = (await response.json()) as {
          id?: string;
          message?: string;
        };
        if (!response.ok || !result.id)
          throw new Error(result.message ?? "Email provider rejected delivery");
        providerId = result.id;
      } else {
        const transport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_PORT === "465",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          connectionTimeout: 5000,
          socketTimeout: 8000,
        });
        try {
          providerId = (
            await transport.sendMail({
              ...payload,
              messageId: `<${mail.id}@royalmidnight.com>`,
            })
          ).messageId;
        } finally {
          transport.close();
        }
      }
      await db.execute(
        sql`UPDATE mail_outbox SET status='sent',sent_at=now(),lease_until=NULL,last_error=NULL,provider_id=${providerId} WHERE id=${mail.id}::uuid`,
      );
      await db
        .execute(
          sql`INSERT INTO email_logs("to",subject,type,status) VALUES(${mail.recipient.join(", ")},${mail.subject},${mail.kind},'sent')`,
        )
        .catch(() => {});
    } catch (err) {
      await db.execute(sql`UPDATE mail_outbox SET status='failed',lease_until=NULL,last_error=${String((err as Error).message).slice(0, 500)},
        available_at=now()+${Math.min(3600, 30 * 2 ** mail.attempts)}*interval '1 second' WHERE id=${mail.id}::uuid AND status='sending'`);
      throw err;
    }
  }
}
