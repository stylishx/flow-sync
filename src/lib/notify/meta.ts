import "server-only";

import { env } from "@/lib/env";

import type { NotificationMessage, NotificationProvider, SendResult } from "./types";

/**
 * Meta WhatsApp Cloud API.
 *
 * IMPORTANT: these are business-initiated messages sent outside any 24-hour customer
 * service window, so they MUST use a template that Meta has approved in advance. A
 * free-form message here is rejected, not delivered late. The template is expected to
 * have three body parameters, in this order:
 *
 *   1. patient name
 *   2. token number
 *   3. people ahead (or the clinic name, for "your turn")
 *
 * If the approved template's parameter order differs, change it here — not at the call
 * sites.
 */
function buildTemplatePayload(message: NotificationMessage) {
  const parameters =
    message.kind === "almost_up"
      ? [
          { type: "text", text: message.patientName },
          { type: "text", text: String(message.tokenNumber) },
          { type: "text", text: String(message.peopleAhead) },
        ]
      : [
          { type: "text", text: message.patientName },
          { type: "text", text: String(message.tokenNumber) },
          { type: "text", text: message.clinicName },
        ];

  return {
    messaging_product: "whatsapp",
    // Cloud API wants the number without a leading "+".
    to: message.to.replace(/^\+/, ""),
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [{ type: "body", parameters }],
    },
  };
}

/** Meta rate limits and transient 5xx are worth retrying; a rejected template is not. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

export const metaProvider: NotificationProvider = {
  name: "meta",

  async send(message: NotificationMessage): Promise<SendResult> {
    // env validation guarantees these when NOTIFY_PROVIDER=meta.
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) {
      return { ok: false, error: "WhatsApp credentials missing.", retryable: false };
    }

    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

    try {
      // A patient-facing notification must never hold a request open; the queue has
      // already moved on by the time this resolves.
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildTemplatePayload(message)),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          ok: false,
          error: `WhatsApp ${response.status}: ${detail.slice(0, 300)}`,
          retryable: isRetryable(response.status),
        };
      }

      const payload = (await response.json()) as { messages?: Array<{ id?: string }> };
      return { ok: true, providerMessageId: payload.messages?.[0]?.id ?? null };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown WhatsApp error",
        retryable: true,
      };
    }
  },
};
