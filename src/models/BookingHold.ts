import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";

export const HOLD_STATUSES = ["held", "consumed", "released", "orphaned"] as const;
export type HoldStatus = (typeof HOLD_STATUSES)[number];

/**
 * A reservation against `Session.onlineQuota` while a patient is inside the Razorpay
 * checkout modal.
 *
 * This exists because the token is now issued only AFTER the payment signature is
 * verified. Without a hold, two people could both open checkout for the last online
 * slot and only one could be served — after both had paid. The hold claims the quota
 * slot up front and releases it if the checkout is abandoned.
 *
 * It deliberately does NOT reserve the token number: an abandoned hold would then leak
 * one of `maxPatients` permanently. The rare case where a session fills between payment
 * and issuance is handled explicitly as `orphaned`, which flags it for a refund.
 */
const BookingHoldSchema = new Schema(
  {
    sessionId: { type: Types.ObjectId, ref: "Session", required: true, index: true },
    clinicId: { type: Types.ObjectId, ref: "Clinic", required: true },

    patient: {
      name: { type: String, required: true, trim: true },
      age: { type: Number, required: true, min: 0, max: 130 },
      mobile: { type: String, required: true, trim: true },
    },

    device: {
      fingerprint: { type: String },
      ipHash: { type: String },
    },

    provider: { type: String, required: true },
    orderId: { type: String, required: true, unique: true },
    amountInPaise: { type: Number, required: true, min: 0 },

    status: { type: String, enum: HOLD_STATUSES, default: "held" },
    /** Set once the payment verifies and a token exists. */
    tokenPublicId: { type: String },
    paymentId: { type: String },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// The sweep query: which holds have lapsed?
BookingHoldSchema.index({ status: 1, expiresAt: 1 });

// One live hold per device and per mobile, mirroring the Token anti-abuse rules so a
// patient cannot open five checkout modals and sit on five slots.
BookingHoldSchema.index(
  { sessionId: 1, "device.fingerprint": 1 },
  {
    unique: true,
    partialFilterExpression: { status: "held", "device.fingerprint": { $type: "string" } },
  },
);
BookingHoldSchema.index(
  { sessionId: 1, "patient.mobile": 1 },
  { unique: true, partialFilterExpression: { status: "held" } },
);

export type BookingHold = InferSchemaType<typeof BookingHoldSchema>;

export const BookingHoldModel: Model<BookingHold> =
  (models.BookingHold as Model<BookingHold>) ??
  model<BookingHold>("BookingHold", BookingHoldSchema);
