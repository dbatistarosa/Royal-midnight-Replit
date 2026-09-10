import type Stripe from "stripe";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { AddonOperation } from "./addonOperation.js";

const fail = (message: string) => Object.assign(new Error(message), {status:409});
/** Save an unconfirmed intent before it can take money. Retry the same Stripe object. */
export async function payAddonCard(stripe: Stripe, op: AddonOperation, card: {stripeCustomerId:string;defaultPaymentMethodId:string} | null, paymentType: "addon_extras" | "extra_time" = "addon_extras") {
  const amount = Math.round(op.snapshot.charge.total * 100);
  if(!op.payment_intent_id&&!card)throw fail('No saved card; this operation has not charged anything');
  let intent = op.payment_intent_id
    ? await stripe.paymentIntents.retrieve(op.payment_intent_id)
    : await stripe.paymentIntents.create({ amount, currency:"usd", customer:card!.stripeCustomerId,
      payment_method:card!.defaultPaymentMethodId, confirm:false,
      metadata:{bookingId:String(op.booking_id),type:paymentType,adjustmentId:op.id},
    }, {idempotencyKey:"addon-intent-"+op.id});
  if (intent.amount !== amount || intent.currency !== "usd" || intent.metadata.adjustmentId !== op.id) throw fail("Stored add-on payment does not match the operation");
  if (!op.payment_intent_id) {
    await db.execute(sql`UPDATE booking_adjustments SET payment_intent_id=${intent.id} WHERE id=${op.id}`);
    op.payment_intent_id=intent.id;
  }
  if (intent.status === "succeeded") return intent.id;
  if(!card)throw fail('No saved card for the pending add-on payment');
  if (!["requires_confirmation","requires_payment_method"].includes(intent.status)) throw fail("Add-on payment is " + intent.status + ". Resolve this payment before starting another charge.");
  const customer=typeof intent.customer==='string'?intent.customer:intent.customer?.id;
  if(customer!==card.stripeCustomerId)throw fail("Saved card customer changed; review the pending payment");
  intent=await stripe.paymentIntents.confirm(intent.id,{payment_method:card.defaultPaymentMethodId,off_session:true},
    {idempotencyKey:'addon-confirm-'+intent.id+'-'+card.defaultPaymentMethodId});
  if(intent.status!=='succeeded')throw fail("Add-on payment is " + intent.status + ". Resolve this payment before starting another charge.");
  return intent.id;
}

export async function invoiceAddon(stripe: Stripe, op: AddonOperation, passenger: {email:string;name:string}) {
  const amount=Math.round(op.snapshot.charge.total*100);
  let invoice: Stripe.Invoice;
  if(op.invoice_id)invoice=await stripe.invoices.retrieve(op.invoice_id);
  else {
    const customer=await stripe.customers.create(passenger,{idempotencyKey:'addon-customer-'+op.id});
    invoice=await stripe.invoices.create({customer:customer.id,collection_method:'send_invoice',days_until_due:7,
      auto_advance:false,pending_invoice_items_behavior:'exclude',
      metadata:{bookingId:String(op.booking_id),type:'addon_extras',adjustmentId:op.id},
    },{idempotencyKey:'addon-invoice-'+op.id});
    await db.execute(sql`UPDATE booking_adjustments SET invoice_id=${invoice.id} WHERE id=${op.id}`);
    op.invoice_id=invoice.id;
  }
  if(invoice.metadata?.adjustmentId!==op.id)throw fail('Stored invoice does not match the operation');
  if(invoice.status==='draft') {
    const items=await stripe.invoiceItems.list({invoice:invoice.id,limit:2});
    if(items.data.length===0){
      const customer=typeof invoice.customer==='string'?invoice.customer:invoice.customer!.id;
      await stripe.invoiceItems.create({customer,invoice:invoice.id,amount,currency:'usd',
        description:op.snapshot.priced.map(e=>`${e.name} ×${e.quantity}`).join(', '),metadata:{adjustmentId:op.id},
      },{idempotencyKey:'addon-invoice-item-'+op.id});
    }else if(items.has_more||items.data.length!==1||items.data[0]!.amount!==amount||items.data[0]!.metadata?.adjustmentId!==op.id){
      throw fail('Unexpected items on add-on invoice; review before finalizing');
    }
    invoice=await stripe.invoices.finalizeInvoice(invoice.id,{auto_advance:false},{idempotencyKey:'addon-finalize-'+op.id});
  }
  if(!['open','paid'].includes(invoice.status??'')||invoice.total!==amount||invoice.currency!=='usd'||!invoice.hosted_invoice_url)throw fail('Add-on invoice needs review before recording the extras');
  return {invoiceUrl:invoice.hosted_invoice_url,invoicePdfUrl:invoice.invoice_pdf ?? null};
}
