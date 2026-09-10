import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { AddonOperation } from "./addonOperation.js";
const state=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('@workspace/db',()=>({db:{execute:state.save}}));
const {payAddonCard,invoiceAddon}=await import('./addonPayment.js');
const card={stripeCustomerId:'cus_test',defaultPaymentMethodId:'pm_test'};
const op=():AddonOperation=>({id:'op_test',booking_id:1,request_hash:'hash',payment_intent_id:null,invoice_id:null,response:null,
  snapshot:{priced:[{id:1,name:'Car seat',quantity:1,price:10}],charge:{fare:10,taxAmount:0,cardProcessingFee:0,total:10}}});
const intent=(status='requires_confirmation')=>({id:'pi_test',status,amount:1000,currency:'usd',customer:'cus_test',metadata:{adjustmentId:'op_test'}});
const invoice=(status='draft')=>({id:'in_test',status,customer:'cus_test',total:1000,currency:'usd',metadata:{adjustmentId:'op_test'},hosted_invoice_url:'https://invoice.stripe.com/test',invoice_pdf:null});
function provider(){return {paymentIntents:{create:vi.fn().mockResolvedValue(intent()),retrieve:vi.fn().mockResolvedValue(intent('succeeded')),confirm:vi.fn().mockResolvedValue(intent('succeeded'))},
  customers:{create:vi.fn().mockResolvedValue({id:'cus_test'})}, invoices:{create:vi.fn().mockResolvedValue(invoice()),retrieve:vi.fn().mockResolvedValue(invoice('open')),finalizeInvoice:vi.fn().mockResolvedValue(invoice('open'))},
  invoiceItems:{list:vi.fn().mockResolvedValue({data:[],has_more:false}),create:vi.fn().mockResolvedValue({id:'ii_test'})}};}
beforeEach(()=>vi.resetAllMocks());
describe('recoverable add-on payments',()=>{
  it('does not charge if saving the unconfirmed intent fails',async()=>{
    const s=provider();state.save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(payAddonCard(s as unknown as Stripe,op(),card)).rejects.toThrow('database unavailable');
    expect(s.paymentIntents.create.mock.calls[0][0]).toMatchObject({confirm:false});
    expect(s.paymentIntents.confirm).not.toHaveBeenCalled();
  });
  it('recovers a lost confirmation response using the stored intent, even without a saved card',async()=>{
    const s=provider(),operation=op();s.paymentIntents.confirm.mockRejectedValueOnce(new Error('response lost'));
    await expect(payAddonCard(s as unknown as Stripe,operation,card)).rejects.toThrow('response lost');
    expect(operation.payment_intent_id).toBe('pi_test');
    await expect(payAddonCard(s as unknown as Stripe,operation,null)).resolves.toBe('pi_test');
    expect(s.paymentIntents.create).toHaveBeenCalledOnce();expect(s.paymentIntents.confirm).toHaveBeenCalledOnce();
  });
  it('does not reconfirm a processing payment or create a replacement',async()=>{
    const s=provider(),operation={...op(),payment_intent_id:'pi_test'};
    s.paymentIntents.retrieve.mockResolvedValue(intent('processing'));
    await expect(payAddonCard(s as unknown as Stripe,operation,card)).rejects.toThrow('processing');
    expect(s.paymentIntents.create).not.toHaveBeenCalled();expect(s.paymentIntents.confirm).not.toHaveBeenCalled();
  });
  it('rejects a changed amount before confirming a saved intent',async()=>{
    const s=provider();s.paymentIntents.retrieve.mockResolvedValue({...intent(),amount:2000});
    await expect(payAddonCard(s as unknown as Stripe,{...op(),payment_intent_id:'pi_test'},card)).rejects.toThrow('does not match');
    expect(s.paymentIntents.confirm).not.toHaveBeenCalled();
  });
  it('does not finalize or populate an invoice before its reference is saved',async()=>{
    const s=provider();state.save.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(invoiceAddon(s as unknown as Stripe,op(),{email:'qa@example.invalid',name:'QA'})).rejects.toThrow('database unavailable');
    expect(s.invoiceItems.create).not.toHaveBeenCalled();expect(s.invoices.finalizeInvoice).not.toHaveBeenCalled();
  });
  it('reuses a finalized invoice after a lost local response',async()=>{
    const s=provider();
    await invoiceAddon(s as unknown as Stripe,{...op(),invoice_id:'in_test'},{email:'qa@example.invalid',name:'QA'});
    expect(s.invoices.create).not.toHaveBeenCalled();expect(s.invoiceItems.create).not.toHaveBeenCalled();
    expect(s.invoices.finalizeInvoice).not.toHaveBeenCalled();
  });
  it('does not create another line after the first item response was lost',async()=>{
    const s=provider();s.invoices.retrieve.mockResolvedValue(invoice());
    s.invoiceItems.list.mockResolvedValue({data:[{amount:1000,metadata:{adjustmentId:'op_test'}}],has_more:false} as never);
    await invoiceAddon(s as unknown as Stripe,{...op(),invoice_id:'in_test'},{email:'qa@example.invalid',name:'QA'});
    expect(s.invoiceItems.create).not.toHaveBeenCalled();expect(s.invoices.finalizeInvoice).toHaveBeenCalledOnce();
  });
});

it('preserves supplemental overtime metadata while saving before confirmation', async () => {
  const s = provider();
  await payAddonCard(s as unknown as Stripe, op(), card, 'extra_time');
  expect(s.paymentIntents.create.mock.calls[0][0]).toMatchObject({confirm:false,metadata:{type:'extra_time'}});
  expect(state.save.mock.invocationCallOrder[0]).toBeLessThan(s.paymentIntents.confirm.mock.invocationCallOrder[0]!);
});
