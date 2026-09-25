import React,{useEffect,useState} from 'react';
import {Image,ImageSourcePropType,LayoutAnimation,Platform,Pressable,StyleSheet,Text,TextInput,UIManager,View} from 'react-native';
import {supabase} from './supabase';
import {dateKey,monthDays,streak} from './challenge';
import {wrapExemption} from './calendar';

type Community={community_id:string;community_name:string};
type Member={user_id:string;full_name:string;school:string|null;joined_at:string};
type Wrap={checkin_date:string;photo_path:string;caption:string;review_status:string};
const navy='#062B60';
const titleMonth=(month:string)=>new Date(`${month}-15T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'});
const shiftMonth=(month:string,offset:number)=>{const [year,m]=month.split('-').map(Number);const date=new Date(year,m-1+offset,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;};
if(Platform.OS==='android'&&UIManager.setLayoutAnimationEnabledExperimental)UIManager.setLayoutAnimationEnabledExperimental(true);
const smooth=()=>LayoutAnimation.configureNext({duration:260,create:{type:LayoutAnimation.Types.easeInEaseOut,property:LayoutAnimation.Properties.opacity},update:{type:LayoutAnimation.Types.easeInEaseOut},delete:{type:LayoutAnimation.Types.easeInEaseOut,property:LayoutAnimation.Properties.opacity}});

export function CommunityAdmin({userId,communityId}:{userId:string|null;communityId:string|null}) {
  const [communities,setCommunities]=useState<Community[]>([]);
  const [open,setOpen]=useState(false);
  const [community,setCommunity]=useState<Community|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [selected,setSelected]=useState<Member|null>(null);
  const [wraps,setWraps]=useState<Wrap[]>([]);
  const [month,setMonth]=useState(dateKey().slice(0,7));
  const [target,setTarget]=useState('');
  const [savedTarget,setSavedTarget]=useState<number|null>(null);
  const [photo,setPhoto]=useState<{date:string;source:ImageSourcePropType;caption:string}|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    setCommunities([]);setCommunity(null);setOpen(false);setSelected(null);
    if(userId&&communityId&&supabase)void supabase.rpc('my_admin_communities').then(({data,error})=>{
      if(!active)return;
      if(error){setError(error.message);return;}
      const rows=((data||[]) as Community[]).filter(item=>item.community_id===communityId);setCommunities(rows);setCommunity(rows[0]||null);
    });
    return ()=>{active=false;};
  },[userId,communityId]);
  useEffect(()=>{
    if(!open||!community||!supabase)return;
    let active=true;setLoading(true);setError('');setSelected(null);
    void Promise.all([
      supabase.rpc('community_admin_roster',{p_community_id:community.community_id}),
      supabase.from('community_challenges').select('streak_target').eq('community_id',community.community_id).maybeSingle(),
    ]).then(([roster,challenge])=>{
      if(!active)return;
      if(roster.error||challenge.error)throw roster.error||challenge.error;
      setMembers((roster.data||[]) as Member[]);
      const current=challenge.data?.streak_target??null;setSavedTarget(current);setTarget(current===null?'':String(current));
    }).catch(e=>{if(active)setError(e.message||'Could not load community.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[open,community?.community_id]);
  async function saveTarget(){
    if(!community||!supabase)return;
    const number=Number(target);
    if(!/^[0-9]+$/.test(target.trim())||number<1||number>365){setError('Choose a target from 1 to 365 days.');return;}
    setLoading(true);setError('');
    const {error}=await supabase.rpc('set_community_streak_target',{p_community_id:community.community_id,p_target:number});
    if(error)setError(error.message);else setSavedTarget(number);
    setLoading(false);
  }
  async function openMember(member:Member){
    if(!community||!supabase)return;
    smooth();
    setSelected(member);setWraps([]);setMonth(dateKey().slice(0,7));setLoading(true);setError('');
    const {data,error}=await supabase.rpc('community_admin_wraps',{p_community_id:community.community_id,p_user_id:member.user_id});
    if(error)setError(error.message);else setWraps((data||[]) as Wrap[]);
    setLoading(false);
  }
  async function openDay(day:string){
    const wrap=wraps.find(item=>item.checkin_date===day);
    if(!wrap||!supabase){setError('No wrap photo for this day.');return;}
    setLoading(true);setError('');
    const {data,error}=await supabase.storage.from('checkins').createSignedUrl(wrap.photo_path,300);
    if(error||!data?.signedUrl)setError(error?.message||'Could not open photo.');
    else setPhoto({date:day,source:{uri:data.signedUrl},caption:wrap.caption});
    setLoading(false);
  }
  if(!communities.length)return null;
  const days=monthDays(`${month}-01`);
  const firstWeekday=new Date(`${month}-01T12:00:00`).getDay();
  const wrapped=new Set(wraps.map(item=>item.checkin_date));
  const currentStreak=selected?streak(wraps.map(item=>item.checkin_date),dateKey()):0;
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={open?'Close member roster':'View member roster'} accessibilityState={{expanded:open}} onPress={()=>{smooth();setOpen(value=>!value);}} style={s.heading}><Text style={s.headingText}>{open?'Community admin':'View member roster'}</Text><Text style={s.headingText}>{open?'−':'+'}</Text></Pressable>
    {open&&<View style={s.body}>
      {communities.length>1&&<View style={s.row}>{communities.map(item=><Pressable key={item.community_id} onPress={()=>setCommunity(item)} style={[s.chip,community?.community_id===item.community_id&&s.activeChip]}><Text style={{color:community?.community_id===item.community_id?'#fff':navy}}>{item.community_name}</Text></Pressable>)}</View>}
      {community&&<Text style={s.title}>{community.community_name}</Text>}
      {!selected?<>
        <Text style={s.label}>Streak challenge</Text>
        <View style={s.row}><TextInput accessibilityLabel="Streak target in days" keyboardType="number-pad" placeholder="Days" placeholderTextColor="#7185A3" value={target} onChangeText={setTarget} maxLength={3} style={s.input}/><Pressable accessibilityRole="button" disabled={loading} onPress={saveTarget} style={s.button}><Text style={s.buttonText}>Set target</Text></Pressable></View>
        {savedTarget!==null&&<Text style={s.detail}>Current target: {savedTarget} days</Text>}
        <Text style={s.label}>Members ({members.length})</Text>
        {members.map(member=><Pressable key={member.user_id} accessibilityRole="button" accessibilityLabel={`View ${member.full_name}`} onPress={()=>openMember(member)} style={s.member}><View><Text style={s.memberName}>{member.full_name}</Text>{member.school&&<Text style={s.detail}>{member.school}</Text>}</View><Text style={s.memberName}>›</Text></Pressable>)}
        {!loading&&!members.length&&<Text style={s.detail}>No members yet.</Text>}
      </>:<>
        <Pressable accessibilityRole="button" onPress={()=>{smooth();setSelected(null);setPhoto(null);setError('');}}><Text style={s.link}>‹ All members</Text></Pressable>
        <Text style={s.title}>{selected.full_name}</Text>
        {selected.school&&<Text style={s.detail}>{selected.school}</Text>}
        <Text style={s.detail}>Current streak: {currentStreak} days{savedTarget!==null?` · Target: ${savedTarget} days`:''}</Text>
        <View style={s.monthRow}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={()=>setMonth(value=>shiftMonth(value,-1))}><Text style={s.monthArrow}>‹</Text></Pressable><Text style={s.monthTitle}>{titleMonth(month)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={()=>setMonth(value=>shiftMonth(value,1))}><Text style={s.monthArrow}>›</Text></Pressable></View>
        <View style={s.calendar}>{['S','M','T','W','T','F','S'].map((label,index)=><Text key={index} style={s.weekday}>{label}</Text>)}{Array.from({length:firstWeekday},(_,index)=><View key={`blank-${index}`} style={s.day}/>)}{days.map(day=>{const hasWrap=wrapped.has(day),exempt=wrapExemption(day);return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${day}, ${hasWrap?'wrap photo':exempt||'no wrap'}`} onPress={()=>openDay(day)} style={[s.day,hasWrap&&s.wrappedDay]}><Text style={[s.dayText,hasWrap&&s.wrappedText]}>{Number(day.slice(-2))}</Text></Pressable>;})}</View>
        {photo&&<View style={s.photoPanel}><Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={()=>setPhoto(null)} style={{alignSelf:'flex-end'}}><Text style={s.link}>Close</Text></Pressable><Text style={s.memberName}>{new Date(`${photo.date}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</Text><Image source={photo.source} style={s.photo} resizeMode="contain"/>{!!photo.caption&&<Text style={s.detail}>{photo.caption}</Text>}</View>}
      </>}
      {loading&&<Text style={s.detail}>Loading…</Text>}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>}
  </View>;
}

const s=StyleSheet.create({section:{borderWidth:1,borderColor:'#CCD9EB',borderRadius:18,backgroundColor:'#fff',overflow:'hidden'},heading:{minHeight:58,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},headingText:{fontSize:16,fontWeight:'700',color:navy},body:{padding:18,paddingTop:4,gap:12},communityTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},title:{fontSize:20,fontWeight:'700',color:navy,flex:1},inviteButton:{width:34,height:34,borderRadius:17,backgroundColor:navy,alignItems:'center',justifyContent:'center'},inviteButtonText:{color:'#fff',fontSize:24,lineHeight:26,fontWeight:'400'},label:{fontSize:15,fontWeight:'700',color:navy,marginTop:6},row:{flexDirection:'row',gap:9,alignItems:'center',flexWrap:'wrap'},chip:{padding:9,borderRadius:9,borderWidth:1,borderColor:'#CCD9EB'},activeChip:{backgroundColor:navy},input:{minWidth:80,flex:1,height:44,borderWidth:1,borderColor:'#CCD9EB',borderRadius:10,paddingHorizontal:12,color:navy,fontSize:16},button:{minHeight:44,backgroundColor:navy,borderRadius:10,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},buttonText:{color:'#fff',fontWeight:'700'},detail:{fontSize:13,color:'#516987'},member:{minHeight:58,borderTopWidth:1,borderTopColor:'#E5ECF5',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},memberName:{fontSize:16,fontWeight:'600',color:navy},link:{fontSize:14,fontWeight:'600',color:navy},monthRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},monthTitle:{fontSize:17,fontWeight:'700',color:navy},monthArrow:{fontSize:30,color:navy,paddingHorizontal:12},calendar:{flexDirection:'row',flexWrap:'wrap',rowGap:8},weekday:{width:'14.2857%',textAlign:'center',fontSize:12,fontWeight:'700',color:'#516987'},day:{width:'14.2857%',height:40,alignItems:'center',justifyContent:'center',borderRadius:8},dayText:{fontSize:15,color:navy},wrappedDay:{backgroundColor:navy},wrappedText:{color:'#fff',fontWeight:'700'},photoPanel:{gap:10,marginTop:12,borderTopWidth:1,borderTopColor:'#CCD9EB',paddingTop:12},photo:{width:'100%',height:300,backgroundColor:'#EDF4FF',borderRadius:12},error:{fontSize:13,color:'#B42318'}});
