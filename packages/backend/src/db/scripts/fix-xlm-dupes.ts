import "dotenv/config";
import { db } from "../index";
import { tokens } from "../schema";
import { eq } from "drizzle-orm";

async function fixXlmDuplicates() {
  const xlmRows = await db
    .select()
    .from(tokens)
    .where(eq(tokens.assetCode, "XLM"));

  console.log(`Found ${xlmRows.length} XLM rows:`);
  xlmRows.forEach((r) => {
    console.log(`  id=${r.id} type=${r.assetType} issuer=${r.assetIssuer} image=${r.tomlImage}`);
  });

  if (xlmRows.length <= 1) {
    console.log("No duplicates. Done.");
    process.exit(0);
  }

  const keeper = xlmRows.find(
    (r) => r.assetType === "native" && r.assetIssuer === null
  );

  if (!keeper) {
    console.log("No native XLM row found — keeping row with lowest id.");
    const sorted = xlmRows.sort((a, b) => a.id - b.id);
    const deleteIds = sorted.slice(1).map((r) => r.id);
    for (const id of deleteIds) {
      await db.delete(tokens).where(eq(tokens.id, id));
      console.log(`  Deleted id=${id}`);
    }
  } else {
    const deleteIds = xlmRows.filter((r) => r.id !== keeper.id).map((r) => r.id);
    for (const id of deleteIds) {
      await db.delete(tokens).where(eq(tokens.id, id));
      console.log(`  Deleted id=${id}`);
    }

    await db
      .update(tokens)
      .set({
        tomlImage: "https://cryptologos.cc/logos/stellar-xlm-logo.png",
        tomlName: "Stellar Lumens",
        tomlOrg: "Stellar Development Foundation",
        isFeatured: true,
        isVerified: true,
        ratingAverage: "10.0",
        updatedAt: new Date(),
      })
      .where(eq(tokens.id, keeper.id));

    console.log(`  Updated keeper id=${keeper.id} with correct image`);
  }

  console.log("Done!");
  process.exit(0);
}

fixXlmDuplicates().catch((err) => {
  console.error(err);
  process.exit(1);
});
