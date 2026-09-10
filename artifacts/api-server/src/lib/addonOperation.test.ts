import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@workspace/db',()=>({db:{execute:state.read}}));
const {addonRequestHash,loadAddonOperation}=await import('./addonOperation.js');
describe('add-on operation identity',()=>{
  it('treats reordered extras and default quantity as the same request',()=>{
    expect(addonRequestHash('card',[{id:2},{id:1,quantity:2}])).toBe(addonRequestHash('card',[{id:1,quantity:2},{id:2,quantity:1}]));
  });
  it('separates different quantities and payment methods',()=>{
    const hash=addonRequestHash('card',[{id:1}]);
    expect(hash).not.toBe(addonRequestHash('invoice',[{id:1}]));
    expect(hash).not.toBe(addonRequestHash('card',[{id:1,quantity:2}]));
  });
  it('rejects reusing a persisted key for another booking or payload',async()=>{
    state.read.mockResolvedValue({rows:[{id:'op',booking_id:1,request_hash:'first'}]});
    await expect(loadAddonOperation('op',2,'first')).rejects.toThrow('different extras');
    await expect(loadAddonOperation('op',1,'changed')).rejects.toThrow('different extras');
  });
});
