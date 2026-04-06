import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, driversTable, sessionsTable } from "@workspace/db";
import { RegisterBody, LoginBody, SendOtpBody, VerifyOtpBody } from "@workspace/api-zod";
import crypto from "crypto";
import { z } from "zod";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "royal_midnight_salt").digest("hex");
}

function generateToken(userId: number): string {
  return crypto.createHash("sha256").update(`${userId}_${Date.now()}_rm_secret`).digest("hex");
}

// In-memory OTP store (production would use Redis)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

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
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role });

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

  const hashed = hashPassword(password);
  if (user.passwordHash && user.passwordHash !== hashed) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(user.id);
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role });

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

router.post("/auth/send-otp", async (req, res): Promise<void> => {
  const parsed = SendOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { phone } = parsed.data;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

  req.log.info({ phone }, "OTP generated (SMS integration required for production)");
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
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role });

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

  const [user] = await db
    .insert(usersTable)
    .values({ name, email, phone, role: "driver", passwordHash: hashPassword(password) })
    .returning();

  const [driver] = await db
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
  await db.insert(sessionsTable).values({ userId: user.id, token, role: user.role });

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
    driverId: driver.id,
  });
});

export default router;
