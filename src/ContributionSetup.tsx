import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet,Platform,Image,Linking,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useIAP,currentEntitlementIOS,type Purchase} from 'expo-iap';
import {isUserCancelledError} from 'expo-iap';
import {confirmPurchaseSteps,withPurchaseTimeout} from './purchase-confirmation';
import {isSubscriptionConflict} from './subscription-conflict';
import {subscriptionPriceLabel} from './subscription-price';
import {PRIVACY_POLICY_URL,APPLE_EULA_URL,SERVICE_TERMS_URL,APPLE_SUBSCRIPTIONS_URL} from './legal';

export const MONTHLY_CONTRIBUTION_PRODUCT_ID='com.jaredlederman.tefillinchallenge.monthly_contribution';

export function ContributionSetup({appAccountToken,onPurchase,onRefresh,onBack,onStartOver,onLoadingStart,onLoadingError}:{appAccountToken:string;onPurchase:(purchase:Purchase)=>Promise<void>;onRefresh:()=>Promise<void>;onBack:()=>void;onStartOver:()=>Promise<void>;onLoadingStart:()=>void;onLoadingError:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[billingDetails,setBillingDetails]=useState(false);
 const purchaseHandler=useRef(onPurchase);purchaseHandler.current=onPurchase;
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 const userInitiated=useRef(false);
 const processing=useRef(false),attempted=useRef(new Set<string>()),pendingPurchase=useRef<Purchase|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function confirm(purchase:Purchase,retry=false,restored=false){
  if(!userInitiated.current||purchase.productId!==MONTHLY_CONTRIBUTION_PRODUCT_ID||processing.current)return;
  const id=purchase.transactionId||purchase.id;
  if(!retry&&pendingPurchase.current)return;
  if(!retry&&attempted.current.has(id))return;
  onLoadingStart();attempted.current.add(id);processing.current=true;pendingPurchase.current=purchase;setBusy(true);setError('');
  try{await confirmPurchaseSteps(()=>purchaseHandler.current(purchase),restored?async()=>{}:()=>finishTransaction({purchase,isConsumable:false}),()=>refresh.current());pendingPurchase.current=null;}
  catch(e:any){onLoadingError();if(mounted.current)setError(e.message||'We could not confirm this App Store purchase.');}
  finally{processing.current=false;if(mounted.current)setBusy(false);}
 }
 const {connected,subscriptions,fetchProducts,requestPurchase,finishTransaction}=useIAP({
  onPurchaseSuccess:(purchase)=>{void confirm(purchase);},
  onPurchaseError:(purchaseError)=>{if(processing.current)return;setBusy(false);if(!isUserCancelledError(purchaseError))setError(purchaseError.message||'The App Store purchase could not be completed.');},
  onError:(storeError)=>{if(!processing.current)setBusy(false);setError(storeError.message||'The App Store is unavailable right now.');}
 });
 useEffect(()=>{if(Platform.OS!=='ios'){setError('Ratzon subscriptions are available through the iPhone app.');return;}if(connected)void fetchProducts({skus:[MONTHLY_CONTRIBUTION_PRODUCT_ID],type:'subs'}).catch(e=>setError(e.message||'Could not load the App Store purchase.'));},[connected,fetchProducts]);
 async function restoreExisting(){
  if(Platform.OS!=='ios'||processing.current)return;
  userInitiated.current=true;onLoadingStart();setBusy(true);setError('');
  try{
   const existing=await withPurchaseTimeout(currentEntitlementIOS(MONTHLY_CONTRIBUTION_PRODUCT_ID),'The App Store did not finish restoring. Please try again.');
   if(existing)await confirm(existing,true,true);
   else {onLoadingError();if(mounted.current)setError('No active Ratzon subscription was found for this Apple account.');}
  }catch(e:any){onLoadingError();if(mounted.current)setError(e.message||'Could not restore the App Store subscription.');}
  finally{if(mounted.current&&!processing.current)setBusy(false);}
 }
 const product=subscriptions.find(product=>product.id===MONTHLY_CONTRIBUTION_PRODUCT_ID);
 const priceLabel=subscriptionPriceLabel(product);
 useEffect(()=>{setReady(!!priceLabel);if(product&&!priceLabel)setError('The App Store did not provide complete subscription pricing. Please reopen this screen or contact support.');},[product,priceLabel]);
 async function openLink(url:string){try{await Linking.openURL(url);}catch{setError('Could not open this link. Please try again.');}}
 useEffect(()=>{if(!busy)return;const timer=setTimeout(()=>{if(!processing.current&&mounted.current){setBusy(false);setError('The App Store did not finish responding. Please try again.');}},90000);return()=>clearTimeout(timer);},[busy]);
 async function pay(){
  if(busy||processing.current)return;
  userInitiated.current=true;
  if(pendingPurchase.current){await confirm(pendingPurchase.current,true);return;}
  onLoadingStart();setBusy(true);setError('');
  try{
   const existing=await withPurchaseTimeout(currentEntitlementIOS(MONTHLY_CONTRIBUTION_PRODUCT_ID),'Could not check your Apple subscription. Please try again.',10000);
   if(processing.current)return;
   if(existing){await confirm(existing,true,true);return;}
   // A new purchase needs Apple's sheet; dismiss our loading overlay until it succeeds.
   onLoadingError();
   await withPurchaseTimeout(requestPurchase({request:{apple:{sku:MONTHLY_CONTRIBUTION_PRODUCT_ID,appAccountToken}},type:'subs'}),'The App Store did not finish responding. Please try again.',30000);
  }catch(e:any){if(!processing.current){onLoadingError();setBusy(false);if(!isUserCancelledError(e))setError(e.message||'Could not open the App Store purchase.');}}
 }

 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} bounces={false}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to onboarding" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={27} color="#062B60"/></Pressable>
  <View style={s.main}>
  <Text accessibilityRole="header" style={s.title}>Join the Ratzon Community</Text>
  <View accessible accessibilityLabel={priceLabel||'Loading subscription price'} style={s.priceRow}>{priceLabel&&product?.displayPrice?<><Text style={s.amount}>{product.displayPrice}</Text><Text style={s.period}>{priceLabel.slice(product.displayPrice.length).trim()}</Text></>:<Text style={s.period}>Loading price…</Text>}</View>
  <View style={s.charity}>
   <Text style={s.charityText}>100% of profits go to charity.</Text>
   <Text style={s.explanation}>We estimate $1.80 per member each month will go to charity.</Text>
   <View style={s.divider}/>
   <Text style={s.explanation}>Wrap tefillin every day you are obligated during the month to earn the right to vote on which charity receives the funds.</Text>
  </View>
  <View style={s.purchase}>
  <Pressable accessibilityRole="button" accessibilityLabel={pendingPurchase.current?'Retry purchase confirmation':'Subscribe through the App Store'} style={[s.button,{opacity:busy||(!ready&&!pendingPurchase.current)?0.5:1}]} disabled={busy||(!ready&&!pendingPurchase.current)} onPress={pay}><Text style={s.buttonText}>{busy?'Confirming purchase…':pendingPurchase.current?'Retry confirmation':'Subscribe'}</Text></Pressable>
  {!ready&&!error&&<Text style={s.status}>Loading App Store purchase…</Text>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {isSubscriptionConflict(error)&&<><Pressable accessibilityRole="button" accessibilityLabel="Start Over" disabled={busy} onPress={async()=>{setBusy(true);try{await onStartOver();}catch(e:any){setError(e.message||'Could not restart signup.');setBusy(false);}}} style={s.startOver}><Text style={s.startOverText}>Start Over</Text></Pressable><Text style={s.status}>Restarts signup. Your Ratzon account and Apple subscription remain unchanged.</Text></>}
  </View>
  </View>
  <View style={s.footer}>
   <Text style={s.purchaseNote}>The $1.80 estimate is after fees and operating costs and is not guaranteed. Membership includes check-ins, streaks, history and community access, regardless of wrap completion. Charged to Apple at confirmation. Renews automatically for the displayed period. Cancel at least 24 hours before renewal.</Text>
   <View style={s.links}>
    <Pressable accessibilityRole="button" accessibilityLabel="Restore active Apple subscription" disabled={busy} onPress={()=>{void restoreExisting();}} style={s.legalLink}><Text style={s.legalText}>Restore</Text></Pressable>
    {[["Terms",APPLE_EULA_URL],["Privacy",PRIVACY_POLICY_URL]].map(([label,url])=><Pressable key={url} accessibilityRole="link" accessibilityLabel={label==='Terms'?'Terms of Use (EULA)':'Privacy Policy'} onPress={()=>{void openLink(url);}} style={s.legalLink}><Text style={s.legalText}>{label}</Text></Pressable>)}
    <Pressable accessibilityRole="button" accessibilityState={{expanded:billingDetails}} onPress={()=>setBillingDetails(value=>!value)} style={s.legalLink}><Text style={s.legalText}>Details</Text></Pressable>
   </View>
   {billingDetails&&<View style={s.details}><Text style={s.detailText}>Net profits are positive monthly subscription revenue after App Store fees, refunds, applicable taxes and documented operating costs. Voting opens on the last day of the month after all obligated wraps since signup are approved. Following months require a complete calendar month. Your membership access does not depend on qualifying to vote.</Text><View style={s.detailLinks}>{[["Service Terms",SERVICE_TERMS_URL],["Manage subscriptions",APPLE_SUBSCRIPTIONS_URL]].map(([label,url])=><Pressable key={url} accessibilityRole="link" onPress={()=>{void openLink(url);}} style={s.legalLink}><Text style={s.legalText}>{label}</Text></Pressable>)}</View></View>}
  </View>
 </ScrollView><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.preloadedLoading}><Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} style={s.loadingMark} resizeMode="contain"/></View></SafeAreaView>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#FAFCFF'},body:{flexGrow:1,position:'relative',paddingHorizontal:28,paddingBottom:20,paddingTop:52,width:'100%',maxWidth:480,alignSelf:'center'},
 preloadedLoading:{...StyleSheet.absoluteFill,opacity:0,alignItems:'center',justifyContent:'center'},loadingMark:{width:104,height:130},
 back:{position:'absolute',top:12,left:16,width:44,height:44,alignItems:'center',justifyContent:'center'},
 title:{textAlign:'center',fontSize:30,lineHeight:36,fontWeight:'700',letterSpacing:-.4,color:'#062B60',marginTop:8,marginBottom:14,includeFontPadding:false},
 priceRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,minHeight:64},amount:{fontSize:48,fontWeight:'600',letterSpacing:-1.5,color:'#062B60',includeFontPadding:false,textAlignVertical:'center'},period:{fontSize:16,fontWeight:'400',letterSpacing:0,color:'#61748D'},
 charity:{marginTop:24,gap:14,marginBottom:20},charityText:{textAlign:'center',fontSize:25,lineHeight:32,fontWeight:'600',letterSpacing:-.6,color:'#062B60',includeFontPadding:false},explanation:{textAlign:'center',fontSize:16,lineHeight:25,color:'#345575',includeFontPadding:false},target:{textAlign:'center',fontSize:13,lineHeight:20,color:'#61748D',includeFontPadding:false},divider:{height:1,backgroundColor:'#DCE5EF',marginVertical:4},
 main:{flexGrow:1,justifyContent:'center',paddingVertical:16},purchase:{paddingTop:16},footer:{paddingTop:16},purchaseNote:{fontSize:11,lineHeight:16,color:'#61748D',textAlign:'center'},
 button:{minHeight:54,paddingVertical:14,paddingHorizontal:16,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'600',color:'#fff',includeFontPadding:false},
 status:{fontSize:13,lineHeight:19,color:'#61748D',textAlign:'center',marginTop:12},skip:{minHeight:54,paddingVertical:14,borderRadius:14,backgroundColor:'#E4E7EB',alignItems:'center',justifyContent:'center',marginTop:10},skipText:{fontSize:16,fontWeight:'500',color:'#516070',includeFontPadding:false},
 links:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:22,marginTop:4},legalLink:{minHeight:44,justifyContent:'center',paddingVertical:10},legalText:{fontSize:11,color:'#61748D',textDecorationLine:'underline',includeFontPadding:false},
 details:{borderTopWidth:1,borderColor:'#DCE5EF',paddingTop:16,gap:12,marginTop:8},detailText:{textAlign:'center',fontSize:13,lineHeight:20,color:'#61748D'},detailLinks:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:18},
 error:{textAlign:'center',color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16},startOver:{minHeight:48,borderWidth:1,borderColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16},startOverText:{fontSize:16,fontWeight:'600',color:'#062B60'}
});
