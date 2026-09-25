import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet,PanResponder,Platform,Image} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import {MAX_CONTRIBUTION,MIN_CONTRIBUTION,sliderCents,chargeWithStripeFeeCovered} from './contribution';
import {prepareContributionPayment} from './payments';

export function ContributionSetup({initialCents=180,initialCoversStripeFee=false,locked=false,pending=false,live,onPay,onRefresh,onEditAmount,onSkip,onBack}:{initialCents?:number;initialCoversStripeFee?:boolean;locked?:boolean;pending?:boolean;live:boolean;onPay:(cents:number,coversStripeFee:boolean)=>Promise<boolean>;onRefresh:()=>Promise<void>;onEditAmount:()=>Promise<void>;onSkip?:()=>void;onBack:()=>void}) {
 const values=[MIN_CONTRIBUTION,...Array.from({length:17},(_,index)=>(index+2)*100)];
 const clamp=(value:number)=>value<=MIN_CONTRIBUTION?MIN_CONTRIBUTION:Math.max(200,Math.min(MAX_CONTRIBUTION,Math.round(value/100)*100));
 const valueIndex=(value:number)=>values.indexOf(clamp(value));
 const [cents,setCents]=useState(clamp(initialCents));
 const [coversStripeFee,setCoversStripeFee]=useState(initialCoversStripeFee);
 const [busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[unlocking,setUnlocking]=useState(false),[skipping,setSkipping]=useState(false),[error,setError]=useState('');
 const [dragging,setDragging]=useState(false),[trackWidth,setTrackWidth]=useState(1);
 const slider=useRef<View>(null),width=useRef(1),left=useRef(0),disabled=useRef(false),unlockStarted=useRef(false);disabled.current=busy||pending||waiting||unlocking;
 async function unlockAmount(){
  if(!locked||unlockStarted.current)return;
  unlockStarted.current=true;setUnlocking(true);setError('');
  try{await onEditAmount();}catch(e:any){unlockStarted.current=false;setCents(clamp(initialCents));setError(e.message||'Could not update the contribution amount.');}finally{setUnlocking(false);}
 }
 const setFromTouch=(pageX:number)=>setCents(sliderCents(pageX-left.current,width.current));
 const responder=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>!disabled.current,onMoveShouldSetPanResponder:()=>!disabled.current,onPanResponderGrant:event=>{void unlockAmount();setDragging(true);setFromTouch(event.nativeEvent.pageX);},onPanResponderMove:event=>setFromTouch(event.nativeEvent.pageX),onPanResponderRelease:event=>{setFromTouch(event.nativeEvent.pageX);setDragging(false);},onPanResponderTerminate:()=>setDragging(false)})).current;
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 useEffect(()=>{void prepareContributionPayment().catch(()=>{});},[]);
 useEffect(()=>{if(!pending&&!waiting)return;let active=true;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{try{await refresh.current();}catch{}if(active)timer=setTimeout(poll,3000);};timer=setTimeout(poll,1500);return()=>{active=false;clearTimeout(timer);};},[pending,waiting]);
 useEffect(()=>{if(locked){setCents(clamp(initialCents));setCoversStripeFee(initialCoversStripeFee);}},[locked,initialCents,initialCoversStripeFee]);
 async function pay(){if(busy)return;setBusy(true);setError('');try{if(await onPay(cents,coversStripeFee)){setWaiting(true);await onRefresh();}}catch(e:any){setError(e.message||'Could not open checkout.');}finally{setBusy(false);}}
 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><LinearGradient colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/><View style={s.body}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to onboarding" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={27} color="#062B60"/></Pressable>
  <Text accessibilityRole="header" style={s.title}>Monthly Contribution</Text>
  <Text style={s.amount}>${(cents/100).toFixed(2)}</Text>
  <View ref={slider} {...responder.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Monthly contribution in dollars" accessibilityValue={{min:1.8,max:18,now:cents/100,text:`${(cents/100).toFixed(2)} dollars per month`}} accessibilityState={{disabled:disabled.current}} accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={event=>{if(!disabled.current)setCents(v=>values[Math.max(0,Math.min(values.length-1,valueIndex(v)+(event.nativeEvent.actionName==='increment'?1:-1)))]);}} onLayout={()=>{slider.current?.measureInWindow((x,_y,measuredWidth)=>{left.current=x;width.current=measuredWidth;setTrackWidth(measuredWidth);});}} style={s.slider}>
   <View pointerEvents="none" style={s.track}/><View pointerEvents="none" style={[s.fill,{width:valueIndex(cents)/17*trackWidth}]}/><View pointerEvents="none" style={[s.thumb,{left:valueIndex(cents)/17*(trackWidth-28)}]}/>
  </View>
  <View style={s.range}><Text style={s.text}>$1.80</Text><Text style={s.text}>$18</Text></View>
  <Text style={[s.text,{marginTop:24}]}>Your selected amount is contributed to the challenge every month and renews monthly until canceled. When you wrap tefillin on every required day, you earn a share of the challenge pool. Your available earnings are then donated to the charity you choose, after processing fees. Cancel anytime under Account → Monthly contribution.</Text>
  <Pressable accessibilityRole="checkbox" accessibilityState={{checked:coversStripeFee,disabled:busy||locked}} disabled={busy||locked} onPress={()=>setCoversStripeFee(value=>!value)} style={s.feeOption}><Ionicons name={coversStripeFee?'checkbox':'square-outline'} size={23} color="#062B60"/><View style={{flex:1}}><Text style={s.feeLabel}>Cover Stripe processing fee</Text><Text style={s.text}>{coversStripeFee?`You will be charged $${(chargeWithStripeFeeCovered(cents)/100).toFixed(2)} so $${(cents/100).toFixed(2)} reaches your wallet.`:'Your wallet receives your contribution less Stripe’s 30¢ + 3% fee.'}</Text></View></Pressable>
  {!live&&<Text style={[s.text,{marginTop:16}]}>Test mode — no real money is charged.</Text>}
  {(pending||waiting)?<><Text accessibilityLiveRegion="polite" style={[s.text,{marginTop:24}]}>Confirming your payment…</Text><Pressable style={s.button} onPress={async()=>{try{setError('');await onRefresh();}catch(e:any){setError(e.message);}}}><Text style={s.buttonText}>Check Payment Status</Text></Pressable></>:<>
   <Pressable accessibilityRole="button" accessibilityLabel="Continue to Payment" style={[s.button,{opacity:(busy||unlocking)?0.5:1}]} disabled={busy||unlocking||dragging} onPress={pay}><Text style={s.buttonText}>Continue to Payment</Text></Pressable>
   {!!onSkip&&<Pressable accessibilityRole="button" accessibilityLabel="Skip monthly contribution for testing" disabled={busy||unlocking||dragging} onPress={onSkip} style={s.skip}><Text style={s.skipText}>Skip for now</Text></Pressable>}
  </>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.preloadedLoading}><Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} style={s.loadingMark} resizeMode="contain"/><Text style={s.loadingText}>Getting Everything Set Up</Text></View></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#fff'},body:{flex:1,position:'relative',justifyContent:'center',padding:28,width:'100%',maxWidth:480,alignSelf:'center'},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:28,paddingHorizontal:28},preloadedLoading:{...StyleSheet.absoluteFill,opacity:0,alignItems:'center',justifyContent:'center',gap:28,paddingHorizontal:28},loadingMark:{width:104,height:130},loadingText:{includeFontPadding:false,textAlignVertical:'center',fontSize:22,fontWeight:'500',color:'#062B60',textAlign:'center'},back:{position:'absolute',top:14,left:16,width:44,height:44,alignItems:'center',justifyContent:'center'},title:{fontSize:28,fontWeight:'600',textAlign:'center',color:'#062B60',marginBottom:32},amount:{fontSize:52,fontWeight:'600',color:'#062B60',textAlign:'center',marginBottom:24},slider:{height:48,justifyContent:'center'},track:{position:'absolute',left:0,right:0,height:6,borderRadius:3,backgroundColor:'#CAD8EC'},fill:{position:'absolute',left:0,height:6,borderRadius:3,backgroundColor:'#062B60'},thumb:{position:'absolute',width:28,height:28,borderRadius:14,backgroundColor:'#062B60',borderWidth:3,borderColor:'#fff'},range:{flexDirection:'row',justifyContent:'space-between'},text:{fontSize:14,lineHeight:21,color:'#345575'},feeOption:{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:20},feeLabel:{fontSize:15,fontWeight:'700',color:'#062B60',marginBottom:2},button:{height:56,marginTop:20,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},applePayLabel:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},buttonText:{fontSize:17,fontWeight:'600',color:'#fff'},skip:{minHeight:44,alignItems:'center',justifyContent:'center'},skipText:{fontSize:14,color:'#16365F',textDecorationLine:'underline'},link:{padding:16,alignItems:'center'},linkText:{fontSize:13,textDecorationLine:'underline',color:'#16365F'},error:{color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16}});
