import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet,Platform,Image} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useIAP,type Purchase} from 'expo-iap';
import {isUserCancelledError} from 'expo-iap';
import {confirmPurchaseSteps,withPurchaseTimeout} from './purchase-confirmation';
import {isSubscriptionConflict} from './subscription-conflict';

export const MONTHLY_CONTRIBUTION_PRODUCT_ID='com.jaredlederman.tefillinchallenge.monthly_contribution';

export function ContributionSetup({appAccountToken,onPurchase,onRefresh,onSkip,onBack,onStartOver}:{appAccountToken:string;onPurchase:(purchase:Purchase)=>Promise<void>;onRefresh:()=>Promise<void>;onSkip?:()=>void;onBack:()=>void;onStartOver:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false);
 const purchaseHandler=useRef(onPurchase);purchaseHandler.current=onPurchase;
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 const processing=useRef(false),attempted=useRef(new Set<string>()),pendingPurchase=useRef<Purchase|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function confirm(purchase:Purchase,retry=false){
  if(purchase.productId!==MONTHLY_CONTRIBUTION_PRODUCT_ID||processing.current)return;
  const id=purchase.transactionId||purchase.id;
  if(!retry&&pendingPurchase.current)return;
  if(!retry&&attempted.current.has(id))return;
  attempted.current.add(id);processing.current=true;pendingPurchase.current=purchase;setBusy(true);setError('');
  try{await confirmPurchaseSteps(()=>purchaseHandler.current(purchase),()=>finishTransaction({purchase,isConsumable:false}),()=>refresh.current());pendingPurchase.current=null;}
  catch(e:any){if(mounted.current)setError(e.message||'We could not confirm this App Store purchase.');}
  finally{processing.current=false;if(mounted.current)setBusy(false);}
 }
 const {connected,subscriptions,fetchProducts,requestPurchase,finishTransaction}=useIAP({
  onPurchaseSuccess:(purchase)=>{void confirm(purchase);},
  onPurchaseError:(purchaseError)=>{if(processing.current)return;setBusy(false);if(!isUserCancelledError(purchaseError))setError(purchaseError.message||'The App Store purchase could not be completed.');},
  onError:(storeError)=>{if(!processing.current)setBusy(false);setError(storeError.message||'The App Store is unavailable right now.');}
 });
 useEffect(()=>{if(Platform.OS!=='ios'){setError('Monthly contributions are available through the iPhone app.');return;}if(connected)void fetchProducts({skus:[MONTHLY_CONTRIBUTION_PRODUCT_ID],type:'subs'}).catch(e=>setError(e.message||'Could not load the App Store purchase.'));},[connected,fetchProducts]);
 useEffect(()=>{setReady(subscriptions.some(product=>product.id===MONTHLY_CONTRIBUTION_PRODUCT_ID));},[subscriptions]);
 useEffect(()=>{if(!busy)return;const timer=setTimeout(()=>{if(!processing.current&&mounted.current){setBusy(false);setError('The App Store did not finish responding. Please try again.');}},90000);return()=>clearTimeout(timer);},[busy]);
 async function pay(){if(busy)return;if(pendingPurchase.current){await confirm(pendingPurchase.current,true);return;}setBusy(true);setError('');try{await withPurchaseTimeout(requestPurchase({request:{apple:{sku:MONTHLY_CONTRIBUTION_PRODUCT_ID,appAccountToken}},type:'subs'}),'The App Store did not finish responding. Please try again.',90000);}catch(e:any){if(!processing.current){setBusy(false);if(!isUserCancelledError(e))setError(e.message||'Could not open the App Store purchase.');}}}
 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><LinearGradient colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/><View style={s.body}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to onboarding" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={27} color="#062B60"/></Pressable>
  <Text accessibilityRole="header" style={s.title}>Monthly Contribution</Text>
  <Text style={s.amount}>$1.80</Text>
  <Text style={s.text}>Your contribution enters the challenge every month. When you wrap tefillin on every required day, you earn a share of the challenge pool. Your available earnings are then donated to the charity you choose. Cancel anytime in your Apple subscriptions.</Text>
  <Text style={s.purchaseNote}>$2.29/month through the App Store, including payment and technology costs. Renews monthly until canceled.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={pendingPurchase.current?'Retry purchase confirmation':'Continue to App Store payment'} style={[s.button,{opacity:busy||(!ready&&!pendingPurchase.current)?0.5:1}]} disabled={busy||(!ready&&!pendingPurchase.current)} onPress={pay}><Text style={s.buttonText}>{busy?'Confirming purchase…':pendingPurchase.current?'Retry confirmation':'Continue to Payment'}</Text></Pressable>
  {!ready&&!error&&<Text style={s.status}>Loading App Store purchase…</Text>}
  {!!onSkip&&<Pressable accessibilityRole="button" accessibilityLabel="Skip monthly contribution for testing" disabled={busy} onPress={onSkip} style={s.skip}><Text style={s.skipText}>Skip for now</Text></Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {isSubscriptionConflict(error)&&<><Pressable accessibilityRole="button" accessibilityLabel="Start Over" disabled={busy} onPress={async()=>{setBusy(true);try{await onStartOver();}catch(e:any){setError(e.message||'Could not return to welcome.');setBusy(false);}}} style={s.startOver}><Text style={s.startOverText}>Start Over</Text></Pressable><Text style={s.status}>Returns to welcome. This does not reset your Apple subscription.</Text></>}
 </View><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.preloadedLoading}><Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} style={s.loadingMark} resizeMode="contain"/></View></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#fff'},body:{flex:1,position:'relative',justifyContent:'center',padding:28,width:'100%',maxWidth:480,alignSelf:'center'},preloadedLoading:{...StyleSheet.absoluteFill,opacity:0,alignItems:'center',justifyContent:'center'},loadingMark:{width:104,height:130},back:{position:'absolute',top:14,left:16,width:44,height:44,alignItems:'center',justifyContent:'center'},title:{fontSize:28,fontWeight:'600',textAlign:'center',color:'#062B60',marginBottom:32},amount:{fontSize:52,fontWeight:'600',color:'#062B60',textAlign:'center',marginBottom:28},text:{fontSize:17,lineHeight:28,color:'#345575'},purchaseNote:{fontSize:15,lineHeight:22,color:'#345575',marginTop:24},button:{height:56,marginTop:28,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:17,fontWeight:'600',color:'#fff'},status:{fontSize:14,color:'#345575',textAlign:'center',marginTop:14},skip:{minHeight:44,alignItems:'center',justifyContent:'center'},skipText:{fontSize:14,color:'#16365F',textDecorationLine:'underline'},error:{color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16},startOver:{minHeight:48,borderWidth:1,borderColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16},startOverText:{fontSize:16,fontWeight:'600',color:'#062B60'}});
