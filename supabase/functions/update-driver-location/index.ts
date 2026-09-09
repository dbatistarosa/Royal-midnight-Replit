// Retired: use the authenticated Express API. Never restore the legacy privileged handler.
Deno.serve(() => new Response(JSON.stringify({error:"This endpoint has been retired"}), {status:410,headers:{"Content-Type":"application/json"}}));
