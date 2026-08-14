import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, usersTable, driversTable, sessionsTable, passwordResetTokensTable, corporateAccountsTable } from "@workspace/db";
import { RegisterBody, LoginBody, SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin, SESSION_COOKIE } from "../middleware/auth.js";
import { hashPassword, verifyPassword, isLegacyHash } from "../lib/hash.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { sendOtpSms } from "../lib/sms.js";
import { storeOtp, verifyOtp } from "../lib/otpStore.js";
import { ensureUniqueReferralCode, issueRefereeWelcomePromo } from "../lib/referrals.js";

const router: IRouter = Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Throttle credential-guessing / account-creation abuse. Keyed by IP (express-rate-limit default).
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

// Tighter limit for OTP send/verify — SMS has a real per-message cost and a 6-digit
// code is brute-forceable within minutes without this.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many OTP requests. Please try again later." },
});

function generateToken(_userId: number): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Issue the session as an HttpOnly cookie.
 *
 *  The web app used to keep this token in localStorage, where any script on the
 *  origin could read it — a single XSS anywhere in the SPA exfiltrated a full
 *  30-day admin session (CN-014). As a cookie it is invisible to page
 *  JavaScript. The token is still returned in the response body because the
 *  React Native driver app has no cookie jar and stores it in expo-secure-store.
 *
 *  SameSite=Lax is correct here: the SPA calls the API on its own origin via the
 *  Vercel /api rewrite, so the cookie is never a cross-site request. */
function setSessionCookie(res: import("express").Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

router.post("/auth/register", credentialLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, password, phone, role } = parsed.data;
  // referralCode isn't part of the generated RegisterBody contract — read it loosely so
  // older/other clients that don't send it keep working unchanged.
  const referralCodeUsed = typeof (req.body as Record<string, unknown> | undefined)?.["referralCode"] === "string"
    ? ((req.body as Record<string, string>)["referralCode"]).trim().toUpperCase()
    : undefined;

  const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }
  // Prevent a driver's email from being used to open a passenger/admin account
  const [existingDriver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.email, email));
  if (existingDriver) {
    res.status(400).json({ error: "This email is already associated with a driver account. Each email can only be used for one portal." });
    return;
  }

  let referredByUserId: number | null = null;
  if (referralCodeUsed) {
    const [referrer] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, referralCodeUsed));
    if (referrer) referredByUserId = referrer.id;
  }

  const newReferralCode = await ensureUniqueReferralCode(name);

  const [user] = await db
    .insert(usersTable)
    .values({
      name,
      email,
      phone: phone ?? null,
      role,
      passwordHash: hashPassword(password),
      referralCode: newReferralCode,
      referredByUserId,
    })
    .returning();

  const token = generateToken(user.id);
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  setSessionCookie(res, token);

  if (referredByUserId) {
    issueRefereeWelcomePromo(user.name)
      .then(({ code, amount }) => {
        import("../lib/mailer.js").then(({ sendReferralWelcomeEmail }) =>
          sendReferralWelcomeEmail({ name: user.name, email: user.email, promoCode: code, amount }),
        );
      })
      .catch(err => console.error("[auth] referral welcome promo failed (non-fatal):", err));
  }

  res.status(201).json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/auth/login", credentialLimiter, async (req, res): Promise<void> => {
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
    req.log.warn({ ip: req.ip, email: user.email }, "authentication_failed");
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Transparently migrate a legacy SHA-256 hash to bcrypt — this is the only
  // moment the plaintext is available. Non-blocking: a write failure must not
  // stop a valid login, the account just gets upgraded on the next one (CN-012).
  if (isLegacyHash(user.passwordHash)) {
    const upgraded = hashPassword(password);
    db.update(usersTable)
      .set({ passwordHash: upgraded })
      .where(eq(usersTable.id, user.id))
      .then(() => req.log.info({ userId: user.id }, "legacy password hash upgraded to bcrypt"))
      .catch(err => req.log.error({ err, userId: user.id }, "legacy password upgrade failed"));
  }

  const token = generateToken(user.id);
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  setSessionCookie(res, token);

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

/** End the current session.
 *
 *  Previously there was no logout route at all, so a token could only expire,
 *  never be revoked. With an HttpOnly cookie the client cannot clear it itself,
 *  so this endpoint is required rather than optional (CN-014). */
router.post("/auth/logout", async (req, res): Promise<void> => {
  const cookies = req.cookies as Record<string, string> | undefined;
  const authHeader = req.headers.authorization;
  const token =
    cookies?.[SESSION_COOKIE]?.trim() ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "");

  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }

  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ message: "Signed out" });
});

router.post("/auth/send-otp", otpLimiter, async (req, res): Promise<void> => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone } = parsed.data;

  // Math.random() is not a CSPRNG: V8's internal state is recoverable from a
  // handful of observed outputs, which would let an attacker who can request
  // codes to their own phone predict the code issued to anyone else — including
  // an admin (CN-011). crypto.randomInt is uniform and unpredictable.
  const otp = String(crypto.randomInt(100000, 1000000));
  // Persisted (hashed) in otp_codes rather than a per-instance Map — see
  // lib/otpStore.ts for why the Map was both a security and a functional bug.
  await storeOtp(phone, otp);

  // Log only the last 4 digits — the full number is PII and this line is not
  // covered by the redaction list (CN-050).
  req.log.info({ phone: `••••${phone.slice(-4)}` }, "OTP generated — sending via SMS");
  sendOtpSms(phone, otp).catch(err => req.log.error({ err }, "OTP SMS failed (non-fatal)"));
  res.json({ message: "OTP sent successfully" });
});

router.post("/auth/verify-otp", otpLimiter, async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone, otp } = parsed.data;

  // Burns the code after too many wrong guesses, so a single issued code cannot
  // be ground down by requests spread across many IPs, and compares in constant
  // time — a plain !== leaks the shared prefix length through timing.
  const verdict = await verifyOtp(phone, String(otp));
  if (verdict === "too_many_attempts") {
    req.log.warn({ phone: `••••${phone.slice(-4)}` }, "otp_attempts_exceeded");
  }
  if (verdict !== "ok") {
    // One message for wrong, expired and burned alike — distinguishing them
    // tells an attacker whether a code is still live.
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));

  // An SMS code is a weaker factor than a password, and phone numbers get
  // recycled or SIM-swapped. Privileged accounts must use the password flow.
  if (user && (user.role === "admin" || user.role === "corporate")) {
    req.log.warn({ userId: user.id, role: user.role }, "otp_login_refused_privileged_account");
    res.status(403).json({ error: "This account must sign in with its password." });
    return;
  }

  if (!user) {
    const [newUser] = await db
      .insert(usersTable)
      .values({ name: "Royal Midnight User", email: `${phone.replace(/\D/g, "")}@royalmidnight.temp`, phone, role: "passenger" })
      .returning();
    user = newUser;
  }

  const token = generateToken(user.id);
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  setSessionCookie(res, token);

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

router.post("/auth/driver-register", credentialLimiter, async (req, res): Promise<void> => {
  const parsed = DriverRegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, phone, password, ...driverFields } = parsed.data;

  const [existingUser] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.email, email));
  if (existingUser) {
    const msg = existingUser.role === "driver"
      ? "A driver account with this email already exists."
      : "This email is already registered as a passenger or admin account. Each email can only be used for one portal.";
    res.status(400).json({ error: msg });
    return;
  }
  const [existingDriverRecord] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.email, email));
  if (existingDriverRecord) {
    res.status(400).json({ error: "A driver record with this email already exists. Please contact support." });
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
    setSessionCookie(res, token);

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
  // Billing terms for the new company account — all optional, sensible defaults.
  billingEmail: z.string().email().nullish(),
  netTermsDays: z.number().int().positive().nullish(),
  volumeDiscountPct: z.number().min(0).max(100).nullish(),
});

router.post("/auth/corporate-register", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCorporateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { companyName, contactName, email, password, phone, billingEmail, netTermsDays, volumeDiscountPct } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const [account] = await db
    .insert(corporateAccountsTable)
    .values({
      companyName,
      billingEmail: billingEmail ?? email,
      netTermsDays: netTermsDays ?? 30,
      volumeDiscountPct: String(volumeDiscountPct ?? 0),
    })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      name: `${companyName} — ${contactName}`,
      email,
      phone: phone ?? null,
      role: "corporate",
      passwordHash: hashPassword(password),
      corporateAccountId: account.id,
    })
    .returning();

  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      corporateAccountId: user.corporateAccountId,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

// Admin-only: list all corporate accounts (one row per user; multiple users can
// share a corporateAccountId — see GET /admin/corporate-accounts for the
// company-level billing view with unbilled totals).
router.get("/auth/corporate-accounts", requireAdmin, async (req, res): Promise<void> => {
  const accounts = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, corporateAccountId: usersTable.corporateAccountId, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.role, "corporate"));

  res.json(accounts.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// POST /auth/forgot-password — generate reset token and return link
router.post("/auth/forgot-password", credentialLimiter, async (req, res): Promise<void> => {
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
router.post("/auth/reset-password", credentialLimiter, async (req, res): Promise<void> => {
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
