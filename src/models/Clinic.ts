import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const ClinicSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    doctorName: { type: String, required: true, trim: true },
    specialization: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    address: {
      line1: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },
    /** IANA zone. Session dates are stored as UTC midnight *of this zone*. */
    timezone: { type: String, default: "Asia/Kolkata" },
    onlineBooking: {
      enabled: { type: Boolean, default: false },
      // Money is stored as integer paise. Floats cannot represent currency exactly.
      feeInPaise: { type: Number, default: 0, min: 0 },
      provider: { type: String, enum: ["razorpay", "stripe"], default: "razorpay" },
    },
    whatsapp: {
      enabled: { type: Boolean, default: false },
      phoneNumberId: { type: String },
      templateName: { type: String },
    },
    /** scrypt "salt:hash" for the staff portal passcode. Never store the passcode. */
    portalPasscodeHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type Clinic = InferSchemaType<typeof ClinicSchema>;

// `models.Clinic ??` prevents "OverwriteModelError" when Next's dev HMR
// re-evaluates this module.
export const ClinicModel: Model<Clinic> =
  (models.Clinic as Model<Clinic>) ?? model<Clinic>("Clinic", ClinicSchema);
