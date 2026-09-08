/** Keep one key for identical retries, including reloads after a lost response. */
export function checkoutRequest(body: Record<string, unknown>, storage: Storage = sessionStorage): string {
 const fingerprint=JSON.stringify(body);
 let saved:{fingerprint:string;key:string}|null=null;
 try{saved=JSON.parse(storage.getItem('rm_checkout_request')??'null');}catch{/* Corrupt drafts get a new key. */}
 const key=saved?.fingerprint===fingerprint?saved.key:crypto.randomUUID();
 try{storage.setItem('rm_checkout_request',JSON.stringify({fingerprint,key}));}catch{/* In-memory retries still use the reservation id once received. */}
 return JSON.stringify({...body,checkoutKey:key});
}
