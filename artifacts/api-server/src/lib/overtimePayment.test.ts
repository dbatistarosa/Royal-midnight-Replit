import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AddonOperation } from './addonOperation.js';
const state=vi.hoisted(()=>({paid:false,mail:false,applied:false,failMail:false,conflict:false,operation:null as any}));
vi.mock('@workspace/db',()=>({db:{
  execute:async(query:any)=>{
    const {sql}=new PgDialect().sqlToQuery(query);
    if(sql.startsWith('INSERT'))return {rows:[]};
    return {rows:state.operation?[state.operation]:[]};
  },
  transaction:async(work:any)=>{
    const next={paid:state.paid,mail:state.mail,applied:state.applied};
    const tx={execute:async(query:any)=>{
      const {sql}=new PgDialect().sqlToQuery(query);
      if(sql.includes('UPDATE bookings SET')){
        if(state.conflict)return {rows:[]};
        next.paid=true;return {rows:[{passenger_name:'QA',passenger_email:'qa@example.invalid',total_price:'110'}]};
      }
      if(sql.includes('INSERT INTO mail_outbox')){
        if(state.failMail)throw new Error('outbox unavailable');next.mail=true;
      }
      if(sql.includes('UPDATE booking_adjustments'))next.applied=true;
      return {rows:[]};
    }};
    const result=await work(tx);Object.assign(state,next);return result;
  },
}}));
vi.mock('./mailer.js',()=>({sendExtraTimeChargedEmail:async()=>{
  const {enqueueMail}=await import('./mailOutbox.js');
  await enqueueMail('qa@example.invalid','Overtime receipt','QA','overtime');
}}));
const {overtimeOperation,settleOvertime}=await import('./overtimePayment.js');
const operation:AddonOperation={id:'extra-time:1',booking_id:1,request_hash:'overtime-v1',
  snapshot:{priced:[],overtimeMinutes:30,charge:{fare:10,taxAmount:0,cardProcessingFee:0,total:10}},
  payment_intent_id:'pi_test',invoice_id:null,response:null};
beforeEach(()=>Object.assign(state,{paid:false,mail:false,applied:false,failMail:false,conflict:false,operation}));
it('rolls back settlement when its receipt cannot be queued, retaining the provider reference for retry',async()=>{
  state.failMail=true;
  await expect(settleOvertime(operation,'pi_test')).rejects.toThrow('outbox unavailable');
  expect([state.paid,state.mail,state.applied]).toEqual([false,false,false]);
  expect(state.operation.payment_intent_id).toBe('pi_test');
  state.failMail=false;
  await expect(settleOvertime(operation,'pi_test')).resolves.toMatchObject({totalPrice:110,paymentIntentId:'pi_test'});
  expect([state.paid,state.mail,state.applied]).toEqual([true,true,true]);
});
it('refuses settlement after the booking changed without queuing a receipt',async()=>{
  state.conflict=true;
  await expect(settleOvertime(operation,'pi_test')).rejects.toThrow('Booking changed');
  expect([state.paid,state.mail,state.applied]).toEqual([false,false,false]);
});
it('retains the first price and duration when rates change before retry',async()=>{
  const result=await overtimeOperation(1,{fare:20,taxAmount:2,cardProcessingFee:1,total:23},60);
  expect(result.snapshot.charge.total).toBe(10);expect(result.snapshot.overtimeMinutes).toBe(30);
});
it('rejects a legacy operation without a frozen duration before changing the booking',async()=>{
  await expect(settleOvertime({...operation,snapshot:{...operation.snapshot,overtimeMinutes:undefined}},'pi_test')).rejects.toThrow('duration needs review');
  expect(state.paid).toBe(false);
});
it('requires reconciliation for historical trips with no durable operation',async()=>{
  state.operation=null;
  await expect(overtimeOperation(1,operation.snapshot.charge,30)).rejects.toMatchObject({status:409});
  expect([state.paid,state.mail,state.applied]).toEqual([false,false,false]);
});
