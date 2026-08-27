import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";

export const TOKEN_STATUSES = [
  "waiting",
  "serving",
  "completed",
  "skipped",
  "cancelled",
  "no_show",
] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

const TokenSchema = new Schema(
  {
    sessionId: { type: Types.ObjectId, ref: "Session", required: true },
    clinicId: { type: Types.ObjectId, ref: "Clinic", required: true },
    tokenNumber: { type: Number, required: true, min: 1 },

    /**
     * Unguessable handle for the patient's own status page (/t/<publicId>). The
     * ObjectId is not used: it is sequential enough to walk, and the document holds
     * a name, age and mobile number.
     */
    publicId: { type: String, required: true, unique: true },

    patient: {
      name: { type: String, required: true, trim: true },
      age: { type: Number, required: true, min: 0, max: 130 },
      /** Normalized to E.164 (+91XXXXXXXXXX) before saving. */
      mobile: { type: String, required: true, trim: true },
    },

    source: { type: String, enum: ["walkin", "online"], default: "walkin" },
    status: { type: String, enum: TOKEN_STATUSES, default: "waiting" },

    issuedAt: { type: Date, default: Date.now },
    calledAt: { type: Date },
    completedAt: { type: Date },
    /** Recomputed whenever the queue moves; drives the patient's countdown. */
    estimatedCallTime: { type: Date },

    device: {
      fingerprint: { type: String },
      /** Hashed, never the raw IP — an IP is personal data and we only need equality. */
      ipHash: { type: String },
      userAgent: { type: String },
    },

    payment: {
      status: {
        type: String,
        enum: ["not_required", "pending", "paid", "failed", "refunded"],
        default: "not_required",
      },
      amountInPaise: { type: Number, default: 0, min: 0 },
      provider: { type: String },
      orderId: { type: String },
      paymentId: { type: String },
    },

    notify: {
      twoAwaySentAt: { type: Date },
      calledSentAt: { type: Date },
      failures: { type: Number, default: 0, min: 0 },
    },

    /**
     * Anti-abuse guard. Present (true) while this token occupies a slot; `$unset` on
     * cancellation so the patient can rebook. The uniqueness indexes below filter on
     * it because MongoDB partial indexes only support $eq/$exists/$gt/$gte/$lt/$lte/
     * $type/$and — there is no way to express "status is not cancelled" directly.
     */
    activeHold: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Two patients must never hold the same number in one session.
TokenSchema.index({ sessionId: 1, tokenNumber: 1 }, { unique: true });

// The hot read: the queue for one session, in order.
TokenSchema.index({ sessionId: 1, status: 1, tokenNumber: 1 });

// Anti-abuse, enforced by the database rather than by application checks, which race.
// Sparse on the guard so cancelled tokens release the slot.
TokenSchema.index(
  { sessionId: 1, "device.fingerprint": 1 },
  {
    unique: true,
    partialFilterExpression: { activeHold: true, "device.fingerprint": { $type: "string" } },
  },
);
TokenSchema.index(
  { sessionId: 1, "patient.mobile": 1 },
  { unique: true, partialFilterExpression: { activeHold: true } },
);

// Drives the "2 patients remaining" WhatsApp sweep in Phase 4.
TokenSchema.index({ sessionId: 1, "notify.twoAwaySentAt": 1 });

export type Token = InferSchemaType<typeof TokenSchema>;

export const TokenModel: Model<Token> =
  (models.Token as Model<Token>) ?? model<Token>("Token", TokenSchema);
