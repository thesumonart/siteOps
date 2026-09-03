import { type EmailDeliveryResult, type EmailMessage } from '@siteops/shared';
import { Resend } from 'resend';

import { env, isProduction } from '../config/env.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('email');

/**
 * Transactional email delivery for the worker.
 *
 * Deliberately not a NestJS provider — the worker has no framework — but
 * otherwise mirrors the API's `EmailService` exactly: without
 * `RESEND_API_KEY` it logs instead of sending, which is refused in production
 * by the environment schema, and a delivery failure is reported rather than
 * thrown so a failed alert email can never roll back the incident that
 * triggered it.
 */
export class EmailService {
  private readonly resend: Resend | null = env.RESEND_API_KEY
    ? new Resend(env.RESEND_API_KEY)
    : null;

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    if (!this.resend) {
      logger.warn(
        { to: message.to, subject: message.subject, preview: extractFirstUrl(message.text) },
        'email.not_configured',
      );
      return { delivered: false, reason: 'No email provider configured.' };
    }

    try {
      const response = await this.resend.emails.send({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (response.error) {
        logger.error(
          { to: message.to, subject: message.subject, reason: response.error.message },
          'email.failed',
        );
        return { delivered: false, reason: response.error.message };
      }

      logger.info(
        { to: message.to, subject: message.subject, providerId: response.data?.id },
        'email.sent',
      );
      return { delivered: true, providerId: response.data?.id };
    } catch (error) {
      logger.error({ to: message.to, subject: message.subject, err: error }, 'email.failed');
      return {
        delivered: false,
        reason: error instanceof Error ? error.message : 'Unknown delivery error.',
      };
    }
  }
}

/** Only shown outside production, in the "no provider configured" log line. */
function extractFirstUrl(text: string): string | undefined {
  if (isProduction) return undefined;
  const match = /https?:\/\/\S+/.exec(text);
  return match?.[0];
}
