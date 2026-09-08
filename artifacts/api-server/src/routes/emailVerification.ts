import { Router } from 'express';
import crypto from 'node:crypto';
import { db, usersTable, bookingsTable } from '@workspace/db';
import { sql, eq, and, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { rows, withLock } from '../lib/durability.js';
import { enqueueMail } from '../lib/mailOutbox.js';
import { bookingLimiter } from '../lib/rateLimit.js';

const router=Router();
router.get('/auth/email-verification',requireAuth,async(req,res)=>{
 const [user]=rows<{verified:boolean}>(await db.execute(sql`SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id=${req.currentUser!.userId}`));
 res.json({verified:!!user?.verified});
});
router.post('/auth/email-verification',requireAuth,bookingLimiter(),async(req,res)=>{
 const userId=req.currentUser!.userId;
 const [user]=await db.select({email:usersTable.email}).from(usersTable).where(eq(usersTable.id,userId));
 if(!user){res.status(404).json({error:'Account not found'});return;}
 const token=crypto.randomBytes(32).toString('hex');
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const expires=new Date(Date.now()+30*60_000);
 await withLock(`verify-email:${userId}`,async tx=>{
   const [recent]=rows<{present:boolean}>(await tx.execute(sql`SELECT true AS present FROM email_verifications WHERE user_id=${userId} AND created_at>now()-interval '1 minute'`));
   if(recent) return;
   await tx.execute(sql`INSERT INTO email_verifications(user_id,email,token_hash,expires_at) VALUES(${userId},${user.email},${hash},${expires})
     ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=now()`);
   const url=new URL('/auth/verify-email',process.env.APP_URL??'https://www.royalmidnight.com');url.hash=token;
   // Outbox insert uses this transaction so issuing a token cannot lose its email.
   await tx.execute(sql`INSERT INTO mail_outbox(recipient,subject,html,kind) VALUES(${JSON.stringify([user.email])}::jsonb,
     'Verify your Royal Midnight email',${`<p>Verify your email to securely recover your previous reservations.</p><p><a href="${url.toString()}">Verify email</a></p><p>This link expires in 30 minutes.</p>`},'email_verification')`);
 });
 res.json({ok:true,message:'Verification email queued. Check your inbox shortly.'});
});
router.post('/auth/verify-email',requireAuth,bookingLimiter(),async(req,res)=>{
 const token=typeof req.body?.token==='string'?req.body.token:'';
 if(!/^[a-f0-9]{64}$/.test(token)){res.status(400).json({error:'Invalid verification link'});return;}
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 const ok=await withLock(`verify-email:${req.currentUser!.userId}`,async tx=>{
  const [verification]=rows<{email:string}>(await tx.execute(sql`DELETE FROM email_verifications
   WHERE user_id=${req.currentUser!.userId} AND token_hash=${hash} AND expires_at>now() RETURNING email`));
  if(!verification)return false;
  const result=await tx.execute(sql`UPDATE users SET email_verified_at=now() WHERE id=${req.currentUser!.userId} AND email=${verification.email} RETURNING id`);
  if(!rows(result).length)return false;
  await tx.update(bookingsTable).set({userId:req.currentUser!.userId}).where(and(isNull(bookingsTable.userId),eq(bookingsTable.passengerEmail,verification.email)));
  return true;
 });
 res.status(ok?200:400).json(ok?{ok:true}:{error:'This verification link has expired or was already used'});
});
export default router;
