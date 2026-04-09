import { Router, type IRouter } from "express";
import { eq, lt } from "drizzle-orm";
import { db, usersTable, driversTable, sessionsTable, passwordResetTokensTable, otpCodesTable } from "@workspace/db";
import { RegisterBody, LoginBody, SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { requireAdmin } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/hash.js";

const router: IRouter = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, phone, role } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone: phone ?? null,
      role,
      passwordHash: await hashPassword(password),
    })
    .returning();

  const token = generateToken();
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const { valid, needsRehash } = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (needsRehash) {
    const newHash = await hashPassword(password);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  }

  const token = generateToken();
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });

  let driverId: number | null = null;
  if (user.role === "driver") {
    const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, user.id));
    driverId = driver?.id ?? null;
  }

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    ...(driverId != null ? { driverId } : {}),
  });
});

router.post("/auth/send-otp", authRateLimit, async (req, res): Promise<void> => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone } = parsed.data;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Replace any existing OTP for this phone number
  await db.delete(otpCodesTable).where(eq(otpCodesTable.phone, phone));
  await db.insert(otpCodesTable).values({ phone, otp, expiresAt });

  // Also clean up expired OTPs across all numbers (opportunistic housekeeping)
  void db.delete(otpCodesTable).where(lt(otpCodesTable.expiresAt, new Date())).catch(() => null);

  req.log.info({ phone }, "OTP generated (SMS integration required for production)");
  res.json({ message: "OTP sent successfully" });
});

router.post("/auth/verify-otp", authRateLimit, async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone, otp } = parsed.data;
  const [stored] = await db
    .select()
    .from(otpCodesTable)
    .where(eq(otpCodesTable.phone, phone));

  if (!stored || stored.otp !== otp || new Date() > stored.expiresAt) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  await db.delete(otpCodesTable).where(eq(otpCodesTable.id, stored.id));

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (!user) {
    const [newUser] = await db
      .insert(usersTable)
      .values({ name: "Royal Midnight User", email: `${phone.replace(/\D/g, "")}@royalmidnight.temp`, phone, role: "passenger" })
      .returning();
    user = newUser;
  }

  const token = generateToken();
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

const DriverRegisterBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(6),
  serviceArea: z.string().optional(),
  vehicleYear: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehicleClass: z.string().optional(),
  passengerCapacity: z.coerce.number().optional(),
  luggageCapacity: z.coerce.number().optional(),
  hasCarSeat: z.boolean().optional(),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  licenseDoc: z.string().optional(),
  regVin: z.string().optional(),
  regPlate: z.string().optional(),
  regExpiry: z.string().optional(),
  regDoc: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  insuranceDoc: z.string().optional(),
  profilePicture: z.string().optional(),
});

router.post("/auth/driver-register", authRateLimit, async (req, res): Promise<void> => {
  const parsed = DriverRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, phone, password, ...driverFields } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({ name, email, phone, role: "driver", passwordHash })
      .returning();

    const [driver] = await tx
      .insert(driversTable)
      .values({
        userId: user.id,
        name,
        email,
        phone,
        approvalStatus: "pending",
        status: "pending",
        ...driverFields,
      })
      .returning();

    const token = generateToken();
    await tx.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });

    return { user, driver, token };
  });

  res.status(201).json({
    token: result.token,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      phone: result.user.phone,
      role: result.user.role,
      createdAt: result.user.createdAt.toISOString(),
    },
    driverId: result.driver.id,
  });
});

// Admin-only: create another admin account
const CreateAdminBody = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().nullish(),
});

router.post("/auth/admin-register", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, phone } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone: phone ?? null,
      role: "admin",
      passwordHash: await hashPassword(password),
    })
    .returning();

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

// Admin-only: create a corporate account
const CreateCorporateBody = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().nullish(),
});

router.post("/auth/corporate-register", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCorporateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { companyName, contactName, email, password, phone } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      name: `${companyName} — ${contactName}`,
      email,
      phone: phone ?? null,
      role: "corporate",
      passwordHash: await hashPassword(password),
    })
    .returning();

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

// Admin-only: list all corporate accounts
router.get("/auth/corporate-accounts", requireAdmin, async (req, res): Promise<void> => {
  const accounts = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.role, "corporate"));

  res.json(accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// POST /auth/forgot-password — generate reset token and return link
router.post("/auth/forgot-password", authRateLimit, async (req, res): Promise<void> => {
  const email = (req.body?.email as string | undefined)?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    // Return 200 to avoid user enumeration
    res.json({ message: "If that email is registered, a reset link has been generated." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({ userId: user.id, token, expiresAt });

  const resetLink = `/auth/reset-password?token=${token}`;

  res.json({
    message: "Reset link generated. In production this would be emailed.",
    resetLink,
    token,
  });
});

// POST /auth/reset-password — validate token and set new password
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const token = (req.body?.token as string | undefined)?.trim();
  const password = (req.body?.password as string | undefined);

  if (!token || !password || password.length < 6) {
    res.status(400).json({ error: "token and password (min 6 chars) are required" });
    return;
  }

  const [resetToken] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.token, token));

  if (!resetToken) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  if (resetToken.usedAt) {
    res.status(400).json({ error: "Reset token has already been used" });
    return;
  }

  if (new Date() > resetToken.expiresAt) {
    res.status(400).json({ error: "Reset token has expired" });
    return;
  }

  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(usersTable.id, resetToken.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, resetToken.id));

  res.json({ message: "Password updated successfully. You can now sign in." });
});

export default router;
