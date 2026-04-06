import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "royal_midnight_salt").digest("hex");
}

function isValidHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

async function seedDatabase(): Promise<void> {
  try {
    const adminEmail = "admin@royalmidnight.com";
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));

    if (!existing) {
      await db.insert(usersTable).values({
        name: "Royal Midnight Admin",
        email: adminEmail,
        phone: null,
        role: "admin",
        passwordHash: hashPassword("admin2024!"),
      });
      logger.info("Admin user seeded successfully");
    } else {
      logger.info("Admin user already exists — skipping seed");
    }

    const allUsers = await db.select().from(usersTable);
    for (const user of allUsers) {
      if (user.passwordHash && !isValidHash(user.passwordHash)) {
        const fixedHash = hashPassword(user.passwordHash);
        await db
          .update(usersTable)
          .set({ passwordHash: fixedHash })
          .where(eq(usersTable.id, user.id));
        logger.info({ email: user.email }, "Fixed corrupted password hash");
      }
    }
  } catch (err) {
    logger.error({ err }, "Database seed failed");
  }
}

seedDatabase().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
});
