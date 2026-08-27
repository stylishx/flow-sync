/**
 * Builds every index declared in the schemas and prints what the database ended up
 * with. Non-destructive, unlike `npm run seed`.
 *
 * Run with: npm run db:indexes
 *
 * This is the ONLY thing that creates indexes in production — `autoIndex` is disabled
 * there, so adding an index to a schema has no effect on a deployed database until
 * this runs. `syncIndexes()` also DROPS indexes that are no longer declared, which is
 * what makes it safe to rename one.
 */
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db";
import { ClinicModel, SessionModel, TokenModel } from "@/models";

const MODELS = [ClinicModel, SessionModel, TokenModel];

async function main() {
  await connectToDatabase();
  console.log("connected\n");

  for (const model of MODELS) {
    const dropped = await model.syncIndexes();
    const existing = await model.collection.indexes();

    console.log(`${model.modelName}`);
    if (dropped.length > 0) console.log(`  dropped: ${dropped.join(", ")}`);

    for (const index of existing) {
      const keys = Object.entries(index.key)
        .map(([field, direction]) => `${field}:${direction}`)
        .join(", ");
      const flags = [
        index.unique ? "unique" : null,
        index.partialFilterExpression ? "partial" : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(`  ${index.name}  { ${keys} }${flags ? `  [${flags}]` : ""}`);
    }
    console.log();
  }

  console.log("Indexes are in sync.");
}

main()
  .catch((error) => {
    console.error("\nIndex sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase();
  });
