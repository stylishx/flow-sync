import "server-only";

import { maskMobile } from "@/lib/mobile";

import type { NotificationMessage, NotificationProvider, SendResult } from "./types";

/**
 * Logs instead of sending. This is the default provider, and it exists because Meta
 * requires a business-initiated template to be reviewed before it can be used — days,
 * sometimes longer. The queue must be fully testable before that lands.
 *
 * Numbers are masked even here: development logs get pasted into issues and chats.
 */
export const stubProvider: NotificationProvider = {
  name: "stub",

  async send(message: NotificationMessage): Promise<SendResult> {
    const body =
      message.kind === "almost_up"
        ? `${message.patientName}, you are #${message.tokenNumber} at ${message.clinicName} — ${message.peopleAhead} ahead of you.`
        : `${message.patientName}, token #${message.tokenNumber} — it is your turn at ${message.clinicName}.`;

    console.log(`[notify:stub] -> ${maskMobile(message.to)} :: ${body}`);
    return { ok: true, providerMessageId: null };
  },
};
