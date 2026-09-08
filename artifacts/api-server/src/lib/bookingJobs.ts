import { db } from '@workspace/db';
import {sql} from 'drizzle-orm';
import {rows,withLock} from './durability.js';
import {withMailScope} from './mailOutbox.js';

export async function enqueueBookingNotification(bookingId:number,executor:Pick<typeof db,'execute'>=db){
 await executor.execute(sql`INSERT INTO app_jobs(key,kind,booking_id) VALUES(${'booking-confirmation:'+bookingId},'booking-confirmation',${bookingId}) ON CONFLICT DO NOTHING`);
}
export async function drainBookingJobs(){
 const deadline=Date.now()+15_000;
 for(let i=0;i<5 && Date.now()<deadline;i++){
  const [job]=rows<{key:string;kind:string;booking_id:number;attempts:number}>(await db.execute(sql`
   UPDATE app_jobs SET status='running',attempts=attempts+1,lease_until=now()+interval '2 minutes'
   WHERE key=(SELECT key FROM app_jobs WHERE (status IN ('pending','failed') AND available_at<=now() AND attempts<8)
     OR (status='running' AND lease_until<now() AND attempts<8) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
   RETURNING key,kind,booking_id,attempts`));
  if(!job)break;
  try{
   const {firePostPaymentEmails}=await import('../routes/payments.js');
   await withMailScope(job.key,()=>withLock('payment:'+job.booking_id,async()=>{
    if(job.kind==='booking-cancellation'){
     const {settleBookingCancellation}=await import('./cancellationSettlement.js');await settleBookingCancellation(job.booking_id);
    }else await firePostPaymentEmails(job.booking_id);
   }));
   await db.execute(sql`UPDATE app_jobs SET status='done',lease_until=NULL,last_error=NULL WHERE key=${job.key}`);
  }catch(err){
   await db.execute(sql`UPDATE app_jobs SET status='failed',lease_until=NULL,last_error=${String((err as Error).message).slice(0,500)},available_at=now()+interval '2 minutes' WHERE key=${job.key}`);
   throw err;
  }
 }
}
