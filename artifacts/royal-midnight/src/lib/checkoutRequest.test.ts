import {describe,it,expect} from 'vitest';
import {checkoutRequest} from './checkoutRequest';
function memoryStorage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} as Storage;}
describe('checkout retries',()=>{
 it('reuses the key after a lost response and a page reload',()=>{const storage=memoryStorage(),body={passengerEmail:'test@example.invalid',pickupAt:'2026-10-01T12:00:00Z'};expect(checkoutRequest(body,storage)).toBe(checkoutRequest({...body},storage));});
 it('creates a new checkout when the passenger changes the trip',()=>{const storage=memoryStorage();const first=JSON.parse(checkoutRequest({passengers:1},storage));const next=JSON.parse(checkoutRequest({passengers:2},storage));expect(first.checkoutKey).not.toBe(next.checkoutKey);});
 it('recovers from a corrupt stored draft',()=>{const storage=memoryStorage();storage.setItem('rm_checkout_request','{');expect(JSON.parse(checkoutRequest({passengers:1},storage)).checkoutKey).toMatch(/^[\da-f-]{36}$/);});
});
