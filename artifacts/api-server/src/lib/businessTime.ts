export const BUSINESS_TIME_ZONE='America/New_York';
export function businessDate(date:Date):string {
 return new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function addBusinessDays(date:string,days:number):string {
 const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
/** Resolve midnight in Florida independently of the host time zone, including DST. */
export function businessMidnight(date:string):Date {
 const target=Date.parse(date+'T00:00:00Z');let guess=target;
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:BUSINESS_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));
  const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const observed=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
  guess+=target-observed;
 }
 return new Date(guess);
}
