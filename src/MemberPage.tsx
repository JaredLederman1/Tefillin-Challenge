import React,{useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';

type Props={wallet:React.ReactNode;activity:React.ReactNode;account:React.ReactNode;goalEnabled:boolean;onEnableGoal:()=>Promise<void>};
export function MemberPage({wallet,activity,account,goalEnabled,onEnableGoal}:Props) {
 const s=makeStyles();
 const [showActivity,setShowActivity]=useState(false),[showAccount,setShowAccount]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <View style={{gap:20}}>
   {wallet}
   <View><Pressable accessibilityRole="button" accessibilityState={{expanded:showActivity}} onPress={()=>setShowActivity(v=>!v)} style={s.disclosure}><Text style={s.heading}>Wallet Activity</Text><Text style={s.muted}>{showActivity?'−':'+'}</Text></Pressable>{showActivity&&activity}</View>
   <View><Pressable accessibilityRole="button" accessibilityState={{expanded:showAccount}} onPress={()=>setShowAccount(v=>!v)} style={s.disclosure}><Text style={s.heading}>Account</Text><Text style={s.muted}>{showAccount?'−':'+'}</Text></Pressable>{showAccount&&<View style={{gap:12,paddingTop:12}}>{!goalEnabled&&<Pressable accessibilityRole="button" disabled={busy} onPress={async()=>{setBusy(true);setError('');try{await onEnableGoal();}catch(e:any){setError(e.message||'Could not set up the tefillin goal.');}finally{setBusy(false);}}} style={s.disclosure}><Text style={s.text}>{busy?'Setting up…':'Set up Tefillin Goal'}</Text><Text style={s.muted}>›</Text></Pressable>}{account}</View>}</View>
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View>;
}
function makeStyles(){const text='#062B60',muted='#516987';return StyleSheet.create({text:{fontSize:16,lineHeight:23,color:text,includeFontPadding:false,textAlignVertical:'center'},muted:{fontSize:13,lineHeight:20,color:muted,includeFontPadding:false,textAlignVertical:'center'},heading:{fontSize:18,lineHeight:24,fontWeight:'600',color:text,includeFontPadding:false,textAlignVertical:'center'},disclosure:{minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderBottomColor:'#CCD9EB'},error:{color:'#A12E3B',fontSize:14,lineHeight:20}});}
