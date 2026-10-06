import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from './supabase';
import {charityVoteRules,votePromptKey,canPromptCharityVote,companyBudgetLabel,type CharityVoteStatus} from './charity-vote';

export function CharityVote({refreshKey=0,userId,autoPrompt=false}:{refreshKey?:number|string;userId?:string;autoPrompt?:boolean}) {
 const requestVersion=useRef(0),account=useRef(userId),alive=useRef(true),promptAttempt=useRef('');
 account.current=userId;
 const [status,setStatus]=useState<CharityVoteStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false);
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current;
  setError('');
  if(!supabase||!userId){setError('Sign in to view charity voting.');return;}
  try{
   const result=await supabase.rpc('charity_vote_status');
   if(!alive.current||account.current!==userId||version!==requestVersion.current)return;
   if(result.error)throw result.error;
   setStatus(result.data as CharityVoteStatus);
  }catch{if(alive.current&&account.current===userId&&version===requestVersion.current)setError('Charity voting is temporarily unavailable. Please retry.');}
 },[userId]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;requestVersion.current++;};},[]);
 useEffect(()=>{setVisible(false);setBusy(false);setStatus(null);},[userId]);
 useEffect(()=>{void refresh();return()=>{requestVersion.current++;};},[refresh,refreshKey]);
 useEffect(()=>{
  if(!userId)return;
  const monthToken=()=>new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/New_York'}).format(new Date());
  let currentMonth=monthToken();
  const subscription=AppState.addEventListener('change',state=>{if(state==='active'){currentMonth=monthToken();void refresh();}});
  const timer=setInterval(()=>{const nextMonth=monthToken();if(nextMonth!==currentMonth){currentMonth=nextMonth;void refresh();}},60000);
  return()=>{subscription.remove();clearInterval(timer);};
 },[userId,refresh]);
 useEffect(()=>{
  if(!autoPrompt||status&&!canPromptCharityVote(status))setVisible(false);
 },[autoPrompt,status]);
 useEffect(()=>{
  if(!status?.votingWindowOpen)return;
  const remaining=Date.parse(status.closesAt)-Date.now();
  if(remaining<=0){setVisible(false);return;}
  const timer=setTimeout(()=>{setVisible(false);void refresh();},Math.min(remaining,2147483647));
  return()=>clearTimeout(timer);
 },[status?.closesAt,status?.votingWindowOpen,refresh]);
 useEffect(()=>{
  if(!userId||!autoPrompt||!status||!canPromptCharityVote(status))return;
  const key=votePromptKey(userId,status.month);
  if(promptAttempt.current===key)return;
  let active=true;
  void AsyncStorage.getItem(key).then(seen=>{
   if(!active||!alive.current||account.current!==userId||seen||Date.now()>=Date.parse(status.closesAt))return;
   promptAttempt.current=key;setVisible(true);
  }).catch(()=>{});
  return()=>{active=false;};
 },[userId,autoPrompt,status]);
 async function remember(month:string){if(userId)await AsyncStorage.setItem(votePromptKey(userId,month),'dismissed').catch(()=>{});}
 function dismiss(){setVisible(false);if(status)void remember(status.month);}
 async function vote(cause:string){
  if(!supabase||busy||!status||!userId)return;
  const votingUser=userId,month=status.month;
  setBusy(true);setError('');
  try{
   const result=await supabase.rpc('cast_charity_vote',{cause});
   if(!alive.current||account.current!==votingUser)return;
   if(result.error)throw result.error;
   await remember(month);
   if(!alive.current||account.current!==votingUser)return;
   setVisible(false);await refresh();
  }catch(e){if(alive.current&&account.current===votingUser)setError(e instanceof Error?e.message:(e as {message?:string})?.message||'Unable to record your vote. Please retry.');}
  finally{if(alive.current&&account.current===votingUser)setBusy(false);}
 }
 const budget=companyBudgetLabel(status?.budgetCents);
 const qualificationLabel=status?.qualificationMonth?new Date(`${status.qualificationMonth}T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'}):'the previous month';
 const eligible=Boolean(status?.eligible===true&&status.completionEligible===true&&status.qualificationMonthEnded===true);
 const errorNotice=error?<View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable accessibilityRole="button" onPress={()=>void refresh()}><Text style={s.link}>Retry</Text></Pressable></View>:null;
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
   <View style={s.backdrop}><View accessibilityViewIsModal style={s.modal}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close charity allocation" onPress={dismiss} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
    <ScrollView contentContainerStyle={s.modalContent}>
     <Text accessibilityRole="header" style={s.heading}>{eligible?`Congratulations on wrapping every required day in ${qualificationLabel}!`:'Monthly charity allocation'}</Text>
     {eligible?<Text style={s.text}>Choose the charity you want Ratzon to support with its company donation.</Text>:null}
     <Text style={s.text}>{budget?`Recorded funds available for this allocation: ${budget}`:'Donation total awaiting reconciliation.'}</Text>
     {errorNotice}
     {!status&&!error?<ActivityIndicator/>:null}
     {status?.candidates.length===0?<Text style={s.text}>This month’s candidates are being prepared.</Text>:status?.candidates.map(candidate=>{
      const selected=status.voteCauseId===candidate.id,disabled=busy||!!status.voteCauseId||!status.eligible||status.status!=='open';
      return <View key={candidate.id} style={s.card}>
       <Text style={s.label}>{candidate.tieRank}. {candidate.name}</Text>
       {candidate.description?<Text style={s.text}>{candidate.description}</Text>:null}
       <Text style={s.text}>{candidate.votes} {candidate.votes===1?'vote':'votes'}</Text>
       <Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={()=>void vote(candidate.id)} style={[s.button,disabled&&s.disabled]}><Text style={s.buttonText}>{selected?'Vote recorded':busy?'Recording…':'Vote'}</Text></Pressable>
      </View>;
     })}
     <Text style={s.text}>{charityVoteRules}</Text>
     <Pressable accessibilityRole="button" onPress={dismiss}><Text style={s.link}>Done</Text></Pressable>
    </ScrollView>
   </View></View>
  </Modal>;
}
const s=StyleSheet.create({container:{gap:14},heading:{fontSize:20,fontWeight:'700',color:'#062B60',includeFontPadding:false},label:{fontSize:16,fontWeight:'600',color:'#062B60'},text:{fontSize:14,lineHeight:21,color:'#516987'},card:{backgroundColor:'#fff',padding:16,gap:10,borderWidth:1,borderColor:'#CCD9EB',borderRadius:16},button:{backgroundColor:'#2478FF',paddingVertical:12,borderRadius:12,alignItems:'center'},disabled:{opacity:.5},buttonText:{color:'#fff',fontWeight:'600'},link:{color:'#2478FF',textDecorationLine:'underline',paddingVertical:8},error:{color:'#a02929'},backdrop:{flex:1,backgroundColor:'rgba(0,20,48,.48)',justifyContent:'center',padding:24},modal:{backgroundColor:'#F5F9FF',borderRadius:22,maxHeight:'88%',width:'100%',maxWidth:480,alignSelf:'center'},modalContent:{padding:24,paddingTop:52,gap:16},close:{position:'absolute',top:6,right:8,width:44,height:44,alignItems:'center',justifyContent:'center',zIndex:1},closeText:{fontSize:30,color:'#062B60',includeFontPadding:false}});
