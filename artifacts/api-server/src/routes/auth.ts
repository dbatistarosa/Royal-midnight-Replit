import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, driversTable, sessionsTable, passwordResetTokensTable } from "@workspace/db";
import { RegisterBody, LoginBody, SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/hash.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { sendOtpSms } from "../lib/sms.js";

const router: IRouter = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(_userId: number): string {
  return crypto.randomBytes(32).toString("hex");
}

// In-memory OTP store (production would use Redis)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// Purge expired OTPs every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) otpStore.delete(phone);
  }
}, 5 * 60 * 1000);

router.post("/auth/register", async (req, res): Promise<void> => {
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
      passwordHash: hashPassword(password),
    })
    .returning();

  const token = generateToken(user.id);
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

router.post("/auth/login", async (req, res): Promise<void> => {
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

  if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user.id);
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

router.post("/auth/send-otp", async (req, res): Promise<void> => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone } = parsed.data;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

  req.log.info({ phone }, "OTP generated — sending via SMS");
  sendOtpSms(phone, otp).catch(err => req.log.error({ err }, "OTP SMS failed (non-fatal)"));
  res.json({ message: "OTP sent successfully" });
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone, otp } = parsed.data;
  const stored = otpStore.get(phone);

  if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  otpStore.delete(phone);

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (!user) {
    const [newUser] = await db
      .insert(usersTable)
      .values({ name: "Royal Midnight User", email: `${phone.replace(/\D/g, "")}@royalmidnight.temp`, phone, role: "passenger" })
      .returning();
    user = newUser;
  }

  const token = generateToken(user.id);
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

router.post("/auth/driver-register", async (req, res): Promise<void> => {
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

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(usersTable)
      .values({ name, email, phone, role: "driver", passwordHash: hashPassword(password) })
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

    const token = generateToken(user.id);
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
      passwordHash: hashPassword(password),
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
      passwordHash: hashPassword(password),
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
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
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

  const APP_URL = process.env.APP_URL ?? "https://royalmidnight.com";
  const resetLink = `${APP_URL}/auth/reset-password?token=${token}`;

  // Fire email non-blocking — do not expose whether the email exists in the response
  sendPasswordResetEmail(user.email, user.name, resetLink)
    .catch(err => console.error("[auth] password reset email failed:", err));

  res.json({ message: "If that email is registered, a password reset link has been sent." });
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

  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(usersTable.id, resetToken.userId));
    await tx
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, resetToken.id));
  });

  res.json({ message: "Password updated successfully. You can now sign in." });
});

export default router;
