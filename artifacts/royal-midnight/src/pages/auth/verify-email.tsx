import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/contexts/auth';
import { API_BASE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
export default function VerifyEmail(){
 const {user,isLoading}=useAuth();
 const [token,setToken]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [verified,setVerified]=useState(false);
 useEffect(()=>{const value=window.location.hash.slice(1);if(value){setToken(value);window.history.replaceState(null,'',window.location.pathname);}},[]);
 useEffect(()=>{
  if(!user)return;let active=true;
  fetch(`${API_BASE}/auth/email-verification`).then(r=>r.ok?r.json():null).then(data=>{if(active&&data)setVerified(data.verified);}).catch(()=>{});
  return()=>{active=false;};
 },[user]);
 async function submit(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch(`${API_BASE}/auth/${token?'verify-email':'email-verification'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{token}:{})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Please try again.');
   if(token){setVerified(true);setToken('');setMessage('Email verified. Your previous reservations are now available.');}
   else setMessage('Check your inbox shortly. The link expires in 30 minutes.');
  }catch(error){setMessage(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}
 }
 return <section className="max-w-lg mx-auto px-6 py-16 space-y-6">
  <h1 className="text-3xl font-serif">Verify your email</h1>
  <p>Confirm your email address to securely access reservations previously made with it.</p>
  {isLoading?<p role="status">Loading…</p>:!user?<p><Link href="/auth/login" className="underline">Sign in</Link>, then reopen the verification link from your email.</p>:verified?<p>Your email is verified.</p>:<><p>{user.email}</p><Button onClick={submit} disabled={busy}>{busy?'Please wait…':token?'Confirm email':'Send verification email'}</Button></>}
  <p role="status" aria-live="polite">{message}</p>
  {user&&<Link href="/passenger/rides" className="underline">Back to reservations</Link>}
 </section>;
}
