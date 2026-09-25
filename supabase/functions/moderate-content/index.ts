import {createClient} from 'npm:@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='POST')return reply({error:'Method not allowed.'},405);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'Sign in first.'},401);
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:'Sign in first.'},401);
  const {data:admin,error:adminError}=await db.from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError) return reply({error:'Could not verify administrator access.'},500);
  if(!admin)return reply({error:'Administrator access required.'},403);
  try {
    const body=await req.json();
    if(body.action==='list-reports'){
      const {data,error}=await db.from('content_reports').select('id,checkin_id,reason,status,created_at,checkins(id,user_id,caption,photo_path,created_at,profiles(display_name))').eq('status','open').order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      const paths=(data||[]).map((report:any)=>report.checkins?.photo_path).filter(Boolean);
      const urls=paths.length?(await db.storage.from('checkins').createSignedUrls(paths,3600)).data||[]:[];
      const byPath=new Map(urls.map((item:any)=>[item.path,item.signedUrl]));
      return reply({reports:(data||[]).filter((report:any)=>report.checkins).map((report:any)=>({
        id:report.id,checkinId:report.checkin_id,reason:report.reason,status:report.status,createdAt:report.created_at,
        caption:report.checkins.caption,author:report.checkins.profiles?.display_name||'Community member',imageUrl:byPath.get(report.checkins.photo_path)||null
      }))});
    }
    if(body.action==='delete-post'){
      if(typeof body.checkinId!=='string')return reply({error:'Post id is required.'},400);
      const {data:post,error:postError}=await db.from('checkins').select('id,photo_path').eq('id',body.checkinId).maybeSingle();
      if(postError)throw postError;
      if(!post)return reply({error:'That post is no longer available.'},404);
      const {error:storageError}=await db.storage.from('checkins').remove([post.photo_path]);
      if(storageError)throw storageError;
      const {error:deleteError}=await db.from('checkins').delete().eq('id',post.id);
      if(deleteError)throw deleteError;
      return reply({deleted:true});
    }
    if(body.action==='resolve-report'){
      if(typeof body.reportId!=='string'||!['resolved','dismissed'].includes(body.status))return reply({error:'Invalid report update.'},400);
      const {error}=await db.from('content_reports').update({status:body.status,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq('id',body.reportId);
      if(error)throw error;
      return reply({updated:true});
    }
    return reply({error:'Unknown action.'},400);
  } catch(error) { return reply({error:error instanceof Error?error.message:'Could not complete moderation action.'},400); }
});
