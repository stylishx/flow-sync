import { Schema, Types, model, models, type InferSchemaType, type Model } from "mongoose";

export const SESSION_STATUSES = ["scheduled", "active", "paused", "closed"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

const SessionSchema = new Schema(
  {
    clinicId: { type: Types.ObjectId, ref: "Clinic", required: true, index: true },
    /** UTC midnight of the clinic-local day. One session document per clinic per day. */
    sessionDate: { type: Date, required: true },
    startTime: { type: String, required: true }, // "09:30"
    endTime: { type: String, required: true }, // "13:00"
    maxPatients: { type: Number, required: true, min: 1 },
    estimatedConsultMinutes: { type: Number, required: true, min: 1, default: 5 },
    status: { type: String, enum: SESSION_STATUSES, default: "scheduled" },

    /**
     * Public, unguessable handle. The QR code points at /s/<qrToken>, never at the
     * ObjectId — ObjectIds are sequential enough to enumerate other clinics' sessions.
     */
    qrToken: { type: String, required: true, unique: true },

    /** Highest token number handed out. Only ever mutated via an atomic $inc. */
    lastIssuedNumber: { type: Number, default: 0, min: 0 },
    /** Token the doctor is currently seeing. 0 means "not started". */
    currentTokenNumber: { type: Number, default: 0, min: 0 },

    counters: {
      issued: { type: Number, default: 0, min: 0 },
      completed: { type: Number, default: 0, min: 0 },
      skipped: { type: Number, default: 0, min: 0 },
      cancelled: { type: Number, default: 0, min: 0 },
      /** Online bookings issued so far. Guards `onlineQuota` atomically. */
      online: { type: Number, default: 0, min: 0 },
    },

    /** Added to every wait estimate when the doctor declares an emergency. */
    emergencyDelayMinutes: { type: Number, default: 0, min: 0 },
    /** How many of maxPatients are reserved for remote bookings. */
    onlineQuota: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

SessionSchema.index({ clinicId: 1, sessionDate: -1 }, { unique: true });
SessionSchema.index({ status: 1, sessionDate: -1 });

export type Session = InferSchemaType<typeof SessionSchema>;

export const SessionModel: Model<Session> =
  (models.Session as Model<Session>) ?? model<Session>("Session", SessionSchema);
