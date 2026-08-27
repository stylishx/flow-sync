/**
 * Development seed: one clinic, one active session for today, and a partially
 * worked-through queue so the portal and patient screens have something real to
 * render before those flows exist.
 *
 * Run with: npm run seed
 * Destructive — it clears the three collections first. Never point it at production.
 */
import { hashPasscode } from "@/lib/auth";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db";
import { generateQrToken } from "@/lib/ids";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

/** Development only. Real clinics set their own passcode. */
const DEV_PASSCODE = "clinic1234";

const PATIENTS = [
  { name: "Anita Deshpande", age: 34, mobile: "+919812345001" },
  { name: "Rahul Menon", age: 52, mobile: "+919812345002" },
  { name: "Farida Sheikh", age: 27, mobile: "+919812345003" },
  { name: "Joseph Mathew", age: 61, mobile: "+919812345004" },
  { name: "Priya Nair", age: 19, mobile: "+919812345005" },
  { name: "Vikram Choudhury", age: 45, mobile: "+919812345006" },
];

/** UTC midnight of today, matching how Session.sessionDate is stored. */
function todayUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function seed() {
  await connectToDatabase();
  console.log("connected");

  // Build the indexes declared in the schemas, including the partial unique ones
  // the anti-abuse rules depend on. autoIndex is off in production, so this is the
  // only thing that creates them there.
  await Promise.all([
    ClinicModel.syncIndexes(),
    SessionModel.syncIndexes(),
    TokenModel.syncIndexes(),
  ]);
  console.log("indexes synced");

  await Promise.all([
    TokenModel.deleteMany({}),
    SessionModel.deleteMany({}),
    ClinicModel.deleteMany({}),
  ]);
  console.log("collections cleared");

  const clinic = await ClinicModel.create({
    name: "Sunrise Family Clinic",
    slug: "sunrise-family-clinic",
    doctorName: "Dr. Meera Iyer",
    specialization: "General Physician",
    phone: "+919820011223",
    address: { line1: "12 Link Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    onlineBooking: { enabled: true, feeInPaise: 3000, provider: "razorpay" },
    whatsapp: { enabled: false },
    portalPasscodeHash: await hashPasscode(DEV_PASSCODE),
  });

  const session = await SessionModel.create({
    clinicId: clinic._id,
    sessionDate: todayUtcMidnight(),
    startTime: "09:30",
    endTime: "13:00",
    maxPatients: 40,
    estimatedConsultMinutes: 6,
    status: "active",
    qrToken: generateQrToken(),
    lastIssuedNumber: PATIENTS.length,
    currentTokenNumber: 3,
    counters: { issued: PATIENTS.length, completed: 2, skipped: 0, cancelled: 0 },
    onlineQuota: 10,
  });

  // Tokens 1-2 done, 3 in the chair, 4-6 waiting.
  const statuses = ["completed", "completed", "serving", "waiting", "waiting", "waiting"] as const;

  await TokenModel.insertMany(
    PATIENTS.map((patient, index) => ({
      sessionId: session._id,
      clinicId: clinic._id,
      tokenNumber: index + 1,
      publicId: generateQrToken(20),
      patient,
      source: index === 4 ? "online" : "walkin",
      status: statuses[index],
      calledAt: index <= 2 ? new Date() : undefined,
      completedAt: index <= 1 ? new Date() : undefined,
      device: { fingerprint: `seed-device-${index + 1}` },
      payment:
        index === 4
          ? { status: "paid", amountInPaise: 3000, provider: "razorpay" }
          : { status: "not_required" },
    })),
  );

  console.log(`\nSeeded ${PATIENTS.length} tokens.`);
  console.log(`Clinic:      ${clinic.name} (${clinic.slug})`);
  console.log(`Session QR:  /s/${session.qrToken}`);
  console.log(`Now serving: token #${session.currentTokenNumber}`);
  console.log(`
Portal login -> /portal/login`);
  console.log(`  Clinic ID: ${clinic.slug}`);
  console.log(`  Passcode:  ${DEV_PASSCODE}`);
}

seed()
  .catch((error) => {
    console.error("\nSeed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
