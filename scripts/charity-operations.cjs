// Run with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already in the environment.
// node scripts/charity-operations.cjs list
// node scripts/charity-operations.cjs configure 2026-11-01 UUID_A UUID_B UUID_C
// node scripts/charity-operations.cjs close 2026-10-01
// node scripts/charity-operations.cjs publish 2026-10-01 12345 2026-11-10T12:00:00Z https://ratzon.app/receipts/october
const {createClient}=require('@supabase/supabase-js');
(async()=>{
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
 const db=createClient(url,key,{auth:{persistSession:false}});
 const [action,target,...args]=process.argv.slice(2);
 let result;
 if(action==='list')result=await db.from('donation_causes').select('id,name').eq('enabled',true).eq('livemode',true).order('name');
 else if(action==='configure')result=await db.rpc('configure_charity_vote_round',{target,causes:args});
 else if(action==='close')result=await db.rpc('close_charity_vote_round',{target});
 else if(action==='publish'){
  const cents=Number(args[0]);
  if(!Number.isSafeInteger(cents)||cents<0)throw new Error('Amount must be actual reconciled donation cents.');
  result=await db.rpc('publish_company_donation',{target,cents,fulfilled:args[1],receipt:args[2]});
 }else throw new Error('Choose list, configure, close, or publish.');
 if(result.error)throw new Error(result.error.message);
 console.log(JSON.stringify(result.data??{ok:true},null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
