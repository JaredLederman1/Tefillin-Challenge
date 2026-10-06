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

export function ContributionSetup({appAccountToken,onPurchase,onRefresh,onSkip,onBack,onStartOver}:{appAccountToken:string;onPurchase:(purchase:Purchase)=>Promise<void>;onRefresh:()=>Promise<void>;onSkip?:()=>void;onBack:()=>void;onStartOver:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[billingDetails,setBillingDetails]=useState(false);
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
 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
  <Pressable accessibilityRole="button" accessibilityLabel="Back to onboarding" disabled={busy} onPress={onBack} style={s.back}><Ionicons name="chevron-back" size={27} color="#062B60"/></Pressable>
  <Text accessibilityRole="header" style={s.title}>Membership</Text>
  <Text accessibilityLabel={priceLabel||'Loading subscription price'} style={s.amount}>{priceLabel&&product?.displayPrice?<>{product.displayPrice}<Text style={s.period}>{priceLabel.slice(product.displayPrice.length)}</Text></>:'Loading price…'}</Text>
  <View style={s.features}>{([{icon:'camera-outline',label:'Daily wrap check-ins'},{icon:'flame-outline',label:'Streaks & personal history'},{icon:'people-outline',label:'Your community'}] as const).map(feature=><View key={feature.icon} style={s.featureRow}><Ionicons accessible={false} name={feature.icon} size={22} color="#062B60"/><Text style={s.featureText}>{feature.label}</Text></View>)}</View>
  <View style={s.charity}><Text style={s.charityText}>All net proceeds are donated to charity.</Text><Text style={s.target}>Target: $1.80 per member each month.</Text></View>
  <View style={s.purchase}>
  <Text style={s.purchaseNote}>Charged to Apple at confirmation. Renews automatically for the displayed period. Cancel at least 24 hours before renewal in Apple subscriptions.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={pendingPurchase.current?'Retry purchase confirmation':'Subscribe through the App Store'} style={[s.button,{opacity:busy||(!ready&&!pendingPurchase.current)?0.5:1}]} disabled={busy||(!ready&&!pendingPurchase.current)} onPress={pay}><Text style={s.buttonText}>{busy?'Confirming purchase…':pendingPurchase.current?'Retry confirmation':'Subscribe'}</Text></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel="Restore active Apple subscription" disabled={busy} onPress={()=>{void restoreExisting();}} style={s.skip}><Text style={s.skipText}>Already subscribed? Restore</Text></Pressable>
  <View style={s.links}>{[["Terms",APPLE_EULA_URL],["Privacy",PRIVACY_POLICY_URL]].map(([label,url])=><Pressable key={url} accessibilityRole="link" accessibilityLabel={label==='Terms'?'Terms of Use (EULA)':'Privacy Policy'} onPress={()=>{void openLink(url);}} style={s.legalLink}><Text style={s.legalText}>{label}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{expanded:billingDetails}} onPress={()=>setBillingDetails(value=>!value)} style={s.legalLink}><Text style={s.legalText}>Billing details</Text></Pressable></View>
  {billingDetails&&<View style={s.details}><Text style={s.detailText}>Membership access is independent of wrapping completion. Manage or cancel your subscription in Apple subscriptions.</Text><Text style={s.detailText}>Net proceeds are positive monthly net profit after App Store fees, refunds, applicable taxes, and documented operating costs. The $1.80 amount is a target, not a guaranteed donation. Eligible members vote through a popup on the first of each month.</Text><View style={s.detailLinks}>{[["Service Terms",SERVICE_TERMS_URL],["Manage subscriptions",APPLE_SUBSCRIPTIONS_URL]].map(([label,url])=><Pressable key={url} accessibilityRole="link" onPress={()=>{void openLink(url);}} style={s.legalLink}><Text style={s.legalText}>{label}</Text></Pressable>)}</View></View>}
  {!ready&&!error&&<Text style={s.status}>Loading App Store purchase…</Text>}
  {!!onSkip&&<Pressable accessibilityRole="button" accessibilityLabel="Skip subscription for testing" disabled={busy} onPress={onSkip} style={s.skip}><Text style={s.skipText}>Skip for now</Text></Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {isSubscriptionConflict(error)&&<><Pressable accessibilityRole="button" accessibilityLabel="Start Over" disabled={busy} onPress={async()=>{setBusy(true);try{await onStartOver();}catch(e:any){setError(e.message||'Could not restart signup.');setBusy(false);}}} style={s.startOver}><Text style={s.startOverText}>Start Over</Text></Pressable><Text style={s.status}>Restarts signup. Your Ratzon account and Apple subscription remain unchanged.</Text></>}
  </View>
 </ScrollView><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.preloadedLoading}><Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} style={s.loadingMark} resizeMode="contain"/></View></SafeAreaView>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#FAFCFF'},body:{flexGrow:1,position:'relative',paddingHorizontal:28,paddingBottom:24,paddingTop:76,width:'100%',maxWidth:480,alignSelf:'center'},
 preloadedLoading:{...StyleSheet.absoluteFill,opacity:0,alignItems:'center',justifyContent:'center'},loadingMark:{width:104,height:130},
 back:{position:'absolute',top:12,left:16,width:44,height:44,alignItems:'center',justifyContent:'center'},
 title:{fontSize:28,fontWeight:'600',letterSpacing:-.8,color:'#062B60',marginTop:12,marginBottom:26,includeFontPadding:false},
 amount:{fontSize:48,fontWeight:'600',letterSpacing:-1.5,color:'#062B60',includeFontPadding:false},period:{fontSize:16,fontWeight:'400',letterSpacing:0,color:'#61748D'},
 features:{gap:22,marginTop:34,marginBottom:28},featureRow:{flexDirection:'row',alignItems:'center',gap:14,minHeight:28},featureText:{flex:1,fontSize:16,color:'#062B60',includeFontPadding:false},
 charity:{gap:8,marginBottom:20},charityText:{fontSize:15,lineHeight:22,color:'#062B60',includeFontPadding:false},target:{fontSize:13,lineHeight:19,color:'#61748D',includeFontPadding:false},
 purchase:{marginTop:'auto',paddingTop:24},purchaseNote:{fontSize:13,lineHeight:20,color:'#61748D',marginBottom:16},
 button:{minHeight:54,paddingVertical:14,paddingHorizontal:16,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'600',color:'#fff',includeFontPadding:false},
 status:{fontSize:13,lineHeight:19,color:'#61748D',textAlign:'center',marginTop:12},skip:{minHeight:44,paddingVertical:12,alignItems:'center',justifyContent:'center',marginTop:6},skipText:{fontSize:14,color:'#062B60',includeFontPadding:false},
 links:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',columnGap:18},legalLink:{minHeight:44,justifyContent:'center',paddingVertical:10},legalText:{fontSize:12,color:'#61748D',textDecorationLine:'underline',includeFontPadding:false},
 details:{borderTopWidth:1,borderColor:'#DCE5EF',paddingTop:16,gap:12,marginTop:8},detailText:{fontSize:13,lineHeight:20,color:'#61748D'},detailLinks:{flexDirection:'row',flexWrap:'wrap',columnGap:18},
 error:{color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16},startOver:{minHeight:48,borderWidth:1,borderColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:16},startOverText:{fontSize:16,fontWeight:'600',color:'#062B60'}
});
