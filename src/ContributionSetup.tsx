import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet,Platform,Image,Linking,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useIAP,currentEntitlementIOS,type Purchase} from 'expo-iap';
import {isUserCancelledError} from 'expo-iap';
import {confirmPurchaseSteps,withPurchaseTimeout} from './purchase-confirmation';
import {isSubscriptionConflict} from './subscription-conflict';
import {subscriptionPriceLabel} from './subscription-price';
import {PRIVACY_POLICY_URL,APPLE_EULA_URL,SERVICE_TERMS_URL,APPLE_SUBSCRIPTIONS_URL} from './legal';

export const MONTHLY_CONTRIBUTION_PRODUCT_ID='com.jaredlederman.tefillinchallenge.monthly_contribution';

export function ContributionSetup({appAccountToken,onPurchase,onRefresh,onSkip,onBack,onStartOver}:{appAccountToken:string;onPurchase:(purchase:Purchase)=>Promise<void>;onRefresh:()=>Promise<void>;onSkip?:()=>void;onBack:()=>void;onStartOver:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false);
 const purchaseHandler=useRef(onPurchase);purchaseHandler.current=onPurchase;
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 const processing=useRef(false),attempted=useRef(new Set<string>()),pendingPurchase=useRef<Purchase|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function confirm(purchase:Purchase,retry=false,restored=false){
  if(purchase.productId!==MONTHLY_CONTRIBUTION_PRODUCT_ID||processing.current)return;
  const id=purchase.transactionId||purchase.id;
  if(!retry&&pendingPurchase.current)return;
  if(!retry&&attempted.current.has(id))return;
  attempted.current.add(id);processing.current=true;pendingPurchase.current=purchase;setBusy(true);setError('');
  try{await confirmPurchaseSteps(()=>purchaseHandler.current(purchase),restored?async()=>{}:()=>finishTransaction({purchase,isConsumable:false}),()=>refresh.current());pendingPurchase.current=null;}
  catch(e:any){if(mounted.current)setError(e.message||'We could not confirm this App Store purchase.');}
  finally{processing.current=false;if(mounted.current)setBusy(false);}
 }
 const {connected,subscriptions,fetchProducts,requestPurchase,finishTransaction}=useIAP({
  onPurchaseSuccess:(purchase)=>{void confirm(purchase);},
  onPurchaseError:(purchaseError)=>{if(processing.current)return;setBusy(false);if(!isUserCancelledError(purchaseError))setError(purchaseError.message||'The App Store purchase could not be completed.');},
  onError:(storeError)=>{if(!processing.current)setBusy(false);setError(storeError.message||'The App Store is unavailable right now.');}
 });
 useEffect(()=>{if(Platform.OS!=='ios'){setError('Ratzon subscriptions are available through the iPhone app.');return;}if(connected)void fetchProducts({skus:[MONTHLY_CONTRIBUTION_PRODUCT_ID],type:'subs'}).catch(e=>setError(e.message||'Could not load the App Store purchase.'));},[connected,fetchProducts]);
 const restoreChecked=useRef(false);
 async function restoreExisting(quiet=false){
  if(Platform.OS!=='ios'||processing.current)return;
  setBusy(true);setError('');
  try{
   const existing=await currentEntitlementIOS(MONTHLY_CONTRIBUTION_PRODUCT_ID);
   if(existing)await confirm(existing,true,true);
   else if(mounted.current&&!quiet)setError('No active Ratzon subscription was found for this Apple account.');
  }catch(e:any){if(mounted.current)setError(e.message||'Could not restore the App Store subscription.');}
  finally{if(mounted.current&&!processing.current)setBusy(false);}
 }
 useEffect(()=>{if(Platform.OS==='ios'&&connected&&!restoreChecked.current){restoreChecked.current=true;void restoreExisting(true);}},[connected]);
 const product=subscriptions.find(product=>product.id===MONTHLY_CONTRIBUTION_PRODUCT_ID);
 const priceLabel=subscriptionPriceLabel(product);
 useEffect(()=>{setReady(!!priceLabel);if(product&&!priceLabel)setError('The App Store did not provide complete subscription pricing. Please reopen this screen or contact support.');},[product,priceLabel]);
 async function openLink(url:string){try{await Linking.openURL(url);}catch{setError('Could not open this link. Please try again.');}}
 useEffect(()=>{if(!busy)return;const timer=setTimeout(()=>{if(!processing.current&&mounted.current){setBusy(false);setError('The App Store did not finish responding. Please try again.');}},90000);return()=>clearTimeout(timer);},[busy]);
 async function pay(){if(busy)return;if(pendingPurchase.current){await confirm(pendingPurchase.current,true);return;}setBusy(true);setError('');try{await withPurchaseTimeout(requestPurchase({request:{apple:{sku:MONTHLY_CONTRIBUTION_PRODUCT_ID,appAccountToken}},type:'subs'}),'The App Store did not finish responding. Please try again.',90000);}catch(e:any){if(!processing.current){setBusy(false);if(!isUserCancelledError(e))setError(e.message||'Could not open the App Store purchase.');}}}
 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><LinearGradient colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/><ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to onboarding" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={27} color="#062B60"/></Pressable>
  <Text accessibilityRole="header" style={s.title}>Ratzon Membership</Text>
  <Text style={s.amount}>{priceLabel||"Loading price…"}</Text>
  <Text style={s.text}>Your subscription gives you ongoing access to daily check-ins, streaks, personal history, and community features. Your access does not depend on completing check-ins.</Text>
  <Text style={s.purchaseNote}>Payment is charged to your Apple account when you confirm. The subscription renews automatically for the displayed period unless canceled at least 24 hours before renewal. Manage or cancel in your Apple subscriptions.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={pendingPurchase.current?'Retry purchase confirmation':'Subscribe through the App Store'} style={[s.button,{opacity:busy||(!ready&&!pendingPurchase.current)?0.5:1}]} disabled={busy||(!ready&&!pendingPurchase.current)} onPress={pay}><Text style={s.buttonText}>{busy?'Confirming purchase…':pendingPurchase.current?'Retry confirmation':'Subscribe'}</Text></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel="Restore active Apple subscription" disabled={busy} onPress={()=>{void restoreExisting();}} style={s.skip}><Text style={s.skipText}>Already subscribed? Restore</Text></Pressable>
  <View style={s.links}>{[["Privacy Policy",PRIVACY_POLICY_URL],["Terms of Use (EULA)",APPLE_EULA_URL],["Service Terms",SERVICE_TERMS_URL],["Manage subscriptions",APPLE_SUBSCRIPTIONS_URL]].map(([label,url])=><Pressable key={url} accessibilityRole="link" onPress={()=>{void openLink(url);}} style={s.skip}><Text style={s.skipText}>{label}</Text></Pressable>)}</View>
  {!ready&&!error&&<Text style={s.status}>Loading App Store purchase…</Text>}
  {!!onSkip&&<Pressable accessibilityRole="button" accessibilityLabel="Skip subscription for testing" disabled={busy} onPress={onSkip} style={s.skip}><Text style={s.skipText}>Skip for now</Text></Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {isSubscriptionConflict(error)&&<><Pressable accessibilityRole="button" accessibilityLabel="Start Over" disabled={busy} onPress={async()=>{setBusy(true);try{await onStartOver();}catch(e:any){setError(e.message||'Could not restart signup.');setBusy(false);}}} style={s.startOver}><Text style={s.startOverText}>Start Over</Text></Pressable><Text style={s.status}>Restarts signup. Your Ratzon account and Apple subscription remain unchanged.</Text></>}
 </ScrollView><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.preloadedLoading}><Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} style={s.loadingMark} resizeMode="contain"/></View></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#fff'},body:{flexGrow:1,position:'relative',justifyContent:'center',padding:28,paddingTop:76,width:'100%',maxWidth:480,alignSelf:'center'},preloadedLoading:{...StyleSheet.absoluteFill,opacity:0,alignItems:'center',justifyContent:'center'},loadingMark:{width:104,height:130},back:{position:'absolute',top:14,left:16,width:44,height:44,alignItems:'center',justifyContent:'center'},title:{fontSize:28,fontWeight:'600',textAlign:'center',color:'#062B60',marginBottom:20},links:{marginTop:12},amount:{fontSize:34,fontWeight:'600',color:'#062B60',textAlign:'center',marginBottom:20},text:{fontSize:17,lineHeight:24,color:'#345575'},purchaseNote:{fontSize:15,lineHeight:22,color:'#345575',marginTop:16},button:{height:56,marginTop:20,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:17,fontWeight:'600',color:'#fff'},status:{fontSize:14,color:'#345575',textAlign:'center',marginTop:14},skip:{minHeight:44,alignItems:'center',justifyContent:'center'},skipText:{fontSize:14,color:'#16365F',textDecorationLine:'underline'},error:{color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16},startOver:{minHeight:48,borderWidth:1,borderColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16},startOverText:{fontSize:16,fontWeight:'600',color:'#062B60'}});
