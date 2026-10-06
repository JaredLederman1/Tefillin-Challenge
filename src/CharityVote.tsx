import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {supabase} from './supabase';
import {charityVoteRules,companyDonationPolicy,safeReceiptUrl,type CharityVoteStatus} from './charity-vote';

export function CharityVote({refreshKey=0,userId}:{refreshKey?:number|string;userId?:string}) {
 const requestVersion=useRef(0);
 const [status,setStatus]=useState<CharityVoteStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current;
  setStatus(null);
  if(!supabase){setError('Sign in to view charity voting.');return;}
  setError('');
  const result=await supabase.rpc('charity_vote_status');
  if(version!==requestVersion.current)return;
  if(result.error)setError('Charity voting is temporarily unavailable. Please retry.');else setStatus(result.data as CharityVoteStatus);
 },[userId]);
 useEffect(()=>{void refresh();return()=>{requestVersion.current++;};},[refresh,refreshKey,userId]);
 async function vote(cause:string){
  if(!supabase||busy)return;
  setBusy(true);setError('');
  try{const result=await supabase.rpc('cast_charity_vote',{cause});if(result.error)throw result.error;await refresh();}
  catch(e){setError(e instanceof Error?e.message:(e as {message?:string})?.message||'Unable to record your vote. Please retry.');}
  finally{setBusy(false);}
 }
 return <View style={s.container}>
  <Text style={s.heading}>Monthly charity vote</Text>
  {error?<View><Text accessibilityRole="alert" style={s.error}>{error}</Text><Pressable onPress={()=>void refresh()}><Text style={s.link}>Retry</Text></Pressable></View>:null}
  {!status&&!error?<ActivityIndicator/>:null}
  {status?<>
   <Text style={s.text}>{new Date(`${status.month}T12:00:00`).toLocaleDateString(undefined,{month:'long',year:'numeric'})}</Text>
   {status.candidates.length===0?<Text style={s.text}>This month’s candidates are being prepared.</Text>:status.candidates.map(candidate=>{
    const selected=status.voteCauseId===candidate.id,disabled=busy||!!status.voteCauseId||!status.eligible||status.status!=='open';
    return <View key={candidate.id} style={s.card}>
     <Text style={s.label}>{candidate.tieRank}. {candidate.name}</Text>
     {candidate.description?<Text style={s.text}>{candidate.description}</Text>:null}
     <Text style={s.text}>{candidate.votes} {candidate.votes===1?'vote':'votes'}</Text>
     <Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={()=>void vote(candidate.id)} style={[s.button,disabled&&s.disabled]}><Text style={s.buttonText}>{selected?'Vote recorded':'Vote'}</Text></Pressable>
    </View>;
   })}
   {!status.eligible?<Text style={s.text}>An active subscription is required to vote.</Text>:null}
  </>:null}
  <Text style={s.text}>{charityVoteRules}</Text>
  <Text style={s.text}>{companyDonationPolicy}</Text>
  <Text style={s.heading}>Community impact</Text>
  {!status?.reports.length?<Text style={s.text}>Confirmed company donations will appear here after reconciliation.</Text>:status.reports.map(report=><View key={report.month} style={s.card}>
   <Text style={s.label}>{report.month.slice(0,7)} · {report.recipient}</Text>
   <Text style={s.text}>{report.donatedAt&&report.donationCents!==null?`Ratzon donated ${(report.donationCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})}`:'Donation confirmation pending'}</Text>
   {safeReceiptUrl(report.receiptUrl)?<Pressable onPress={()=>void Linking.openURL(safeReceiptUrl(report.receiptUrl)!)}><Text style={s.link}>View donation confirmation</Text></Pressable>:null}
  </View>)}
 </View>;
}
const s=StyleSheet.create({container:{gap:14},heading:{fontSize:20,fontWeight:'700',color:'#062B60'},label:{fontSize:16,fontWeight:'600',color:'#062B60'},text:{fontSize:14,lineHeight:21,color:'#516987'},card:{backgroundColor:'#fff',padding:16,gap:10,borderWidth:1,borderColor:'#CCD9EB',borderRadius:16},button:{backgroundColor:'#2478FF',paddingVertical:12,borderRadius:12,alignItems:'center'},disabled:{opacity:.5},buttonText:{color:'#fff',fontWeight:'600'},link:{color:'#2478FF',textDecorationLine:'underline',paddingVertical:8},error:{color:'#a02929'}});
