/**
 * Notification transport contract.
 *
 * Everything that sends a message goes through this, so the Meta Cloud API can be
 * swapped for Twilio — or for the stub, while a template sits in Meta's approval
 * queue — without touching the queue logic.
 */

export interface AlmostUpMessage {
  kind: "almost_up";
  /** E.164. */
  to: string;
  patientName: string;
  tokenNumber: number;
  peopleAhead: number;
  clinicName: string;
}

export interface YourTurnMessage {
  kind: "your_turn";
  to: string;
  patientName: string;
  tokenNumber: number;
  clinicName: string;
}

export type NotificationMessage = AlmostUpMessage | YourTurnMessage;

export type SendResult =
  { ok: true; providerMessageId: string | null } | { ok: false; error: string; retryable: boolean };

export interface NotificationProvider {
  readonly name: string;
  send(message: NotificationMessage): Promise<SendResult>;
}
