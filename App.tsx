import { ContributionSetup } from './src/ContributionSetup';
import { CharityVote } from './src/CharityVote';
import { PRIVACY_POLICY_URL, APPLE_EULA_URL } from './src/legal';
import { hasPaidAccess } from './src/contribution';
import { captureAppleName,isAppleIdentity,recoveredIdentityName,savedIdentityName } from './src/apple-identity';
import { WelcomeReveal } from './src/WelcomeReveal';
import { Onboarding } from './src/OnboardingFlow';
import { OnboardingValues, MemberDetails, CommunityOption, parseBirthday, birthdayForInput, formatUsPhone, phoneDigits } from './src/onboarding-data';
import { wrapExemption, isRequiredWrapDay, canPostWrap, commentWordCount, isCholHamoed } from './src/calendar';
import { WelcomeBrand } from './src/WelcomeBrand';
import { CommunityAdmin } from './src/CommunityAdmin';
import { searchUniversities } from './src/universities';
import { searchCommunityCities } from './src/community-locations';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Image, Platform, useWindowDimensions, KeyboardAvoidingView, AppState, Animated, Easing, AccessibilityInfo, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { confirmAppleContribution, billingAction } from './src/payments';
import { supabase, uploadCheckin } from './src/supabase';
import { dateKey, isShabbat, monthDays, streak } from './src/challenge';

const THEME = { bg: '#EDF4FF', card: '#FFFFFF', raised: '#E4EEFC', line: '#CCD9EB', text: '#062B60', muted: '#516987', dim: '#7B8DA5', gold: '#2478FF', green: '#2478FF' };
let C = THEME;
const DISPLAY_FONT = Platform.select({ ios: 'AvenirNextCondensed-Heavy', android: 'sans-serif-condensed', default: 'Arial Rounded MT Bold' });
type Tab = 'Today' | 'Community' | 'Account';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Checkin = { date: string; uri?: string; caption?: string; shared?: boolean };
type Demo = { name: string; checks: Checkin[]; reminder: boolean };
type Post = { id: string; userId?:string; name: string; caption: string; date: string; createdAt?: string; likes?: number; uri?: string; asset?: number; initials: string; color: string };
const tabs: { name: Tab; icon: IconName }[] = [{ name: 'Community', icon: 'people-outline' }, { name: 'Today', icon: 'sunny-outline' }, { name: 'Account', icon: 'person-outline' }];
const demoKey = 'tefillin-demo-v1';
function initialDemo(): Demo {
  const today = dateKey();
  return { name: 'Jared', checks: monthDays(today).filter(d => d < today && isRequiredWrapDay(d)).map(date => ({ date })), reminder: true };
}
function Icon({ name, size = 22, color = C.muted }: { name: IconName; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color}/>; }
function Button({ label, onPress, secondary = false, icon, disabled = false, fontSize = 16, authOption = false, nav = false, disabledTextColor }: { label: string; onPress: () => void; secondary?: boolean; icon?: IconName; disabled?: boolean; fontSize?: number; authOption?: boolean; nav?:boolean; disabledTextColor?:string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, nav && {backgroundColor:C.text}, secondary && s.secondary, secondary && {backgroundColor:C.raised,borderColor:C.line}, authOption && s.authOption, { opacity: disabled ? .4 : pressed ? .75 : 1 }]}>{icon && <Icon name={icon} color={C.text} size={19}/>}<Text style={[s.buttonText, {fontSize}, secondary && { color: C.text },disabled&&disabledTextColor&&{color:disabledTextColor}]}>{label}</Text></Pressable>;
}
function Tag({ label, color = C.green }: { label: string; color?: string }) { return <View style={[s.tag, { backgroundColor: `${color}14` }]}><View style={[s.dot, { backgroundColor: color }]}/><Text style={[s.tagText, { color }]}>{label}</Text></View>; }
function Section({ title, link, onPress }: { title: string; link?: string; onPress?: () => void }) { return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text>{link && <Pressable onPress={onPress} accessibilityRole="button"><Text style={s.textLink}>{link} <Text style={{ includeFontPadding:false,textAlignVertical:'center',fontSize: 17 }}>↗</Text></Text></Pressable>}</View>; }
function BrandLogo({ size = 64, onReady }: { size?: number; onReady?:()=>void }) {
  return <Image source={require('./assets/media/logo-trimmed.png')} fadeDuration={0} onLoadEnd={onReady} accessibilityLabel="Ratzon" style={{ width: size, height: size }} resizeMode="contain"/>;
}
function PageTransition({ children, animate=true, fadeOnly=false, duration=240 }: { children: React.ReactNode; animate?:boolean; fadeOnly?:boolean; duration?:number }) {
  const animateOnMount=useRef(animate).current;
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    let mounted = true;
    if(!animateOnMount)return;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted) return;
      if (reduced) { progress.setValue(1); return; }
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }).catch(() => { progress.setValue(1); });
    return () => { mounted = false; progress.stopAnimation(); };
  }, [progress,animateOnMount,duration]);
  return <Animated.View style={{ flex: 1, opacity: progress, ...(fadeOnly?{}:{transform:[{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }]}) }}>{children}</Animated.View>;
}
function AppContent() {
  const { width, height } = useWindowDimensions();
  // Warm the bundled images without blocking authentication or onboarding.
  useEffect(()=>{
    const sources=[require('./assets/media/logo-trimmed.png'),require('./assets/media/word-mark-without-r-trimmed.png'),require('./assets/media/today-jerusalem-background-v2.png'),require('./assets/media/community-tel-aviv-background.png'),require('./assets/media/account-masada-background.png')];
    if (Platform.OS !== 'web') sources.forEach(source=>{void Image.prefetch(Image.resolveAssetSource(source).uri).catch(()=>false);});
  },[]);
  const [mainAssetsReady,setMainAssetsReady]=useState(false);
  const mainAssetsLoaded=useRef(new Set<string>());
  const readinessCover=useRef(new Animated.Value(1)).current;
  const markMainAsset=(key:string)=>{
    mainAssetsLoaded.current.add(key);
    if(['jerusalem','tel-aviv','masada','today-mark'].every(asset=>mainAssetsLoaded.current.has(asset)))setMainAssetsReady(true);
  };
  useEffect(()=>{
    if(!mainAssetsReady)return;
    let frame=requestAnimationFrame(()=>{
      Animated.timing(readinessCover,{toValue:0,duration:180,useNativeDriver:true}).start();
    });
    return ()=>cancelAnimationFrame(frame);
  },[mainAssetsReady,readinessCover]);
  const [entered, setEntered] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {}); }, []);
  const [tab, setTab] = useState<Tab>('Today');
  const swipeStart=useRef<{x:number;y:number;horizontal:boolean|null}|null>(null);
  const pagerPosition=useRef(new Animated.Value(1)).current;
  const paging=useRef(false);
  const [navigationHeight, setNavigationHeight] = useState(98);
  const [demo, setDemo] = useState<Demo>(initialDemo);
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState(dateKey());
  const [user, setUser] = useState<any>(null);
  const [identityName,setIdentityName]=useState('');
  const currentUserId=useRef<string|null>(null);
  currentUserId.current=user?.id||null;
  const [profile, setProfile] = useState<any>(null);
  const [memberDetails,setMemberDetails]=useState<MemberDetails|null>(null);
  const [homeLaidOut,setHomeLaidOut]=useState(false);
  const [welcomeReveal,setWelcomeReveal] = useState(false);
  const [welcomePreparing,setWelcomePreparing] = useState(false);
  const [onboardingState,setOnboardingState] = useState<'loading'|'needed'|'complete'|'error'>('loading');
  const [liveChecks, setLiveChecks] = useState<Checkin[]>([]);
  const [livePosts, setLivePosts] = useState<Post[]>([]);
  const [communityPosts,setCommunityPosts]=useState<Post[]>([]);
  const [communities,setCommunities]=useState<CommunityOption[]>([]);
  const [myCommunityId,setMyCommunityId]=useState<string|null>(null);
  const [communityView,setCommunityView]=useState<'global'|'mine'>('global');
  const [communityCode,setCommunityCode]=useState('');
  const [newCommunityName,setNewCommunityName]=useState('');
  const [newCommunityLocation,setNewCommunityLocation]=useState('');
  const [newCommunitySchool,setNewCommunitySchool]=useState('');
  const [communitySchoolChosen,setCommunitySchoolChosen]=useState(false);
  const [communityLocationChosen,setCommunityLocationChosen]=useState(false);
  const [createdCommunityCode,setCreatedCommunityCode]=useState<string|null>(null);
  const [sheet, setSheet] = useState<'photo' | 'subscription' | 'auth' | 'rules' | 'delete-account' | 'post-menu' | 'reports' | 'community' | 'community-create' | 'community-join' | null>(null);
  const [editingProfileField,setEditingProfileField]=useState<'name'|'birthday'|'school'|'phone'|null>(null);
  const [profileEditValue,setProfileEditValue]=useState('');
  const [profileDetailsOpen,setProfileDetailsOpen]=useState(false);
  const [accountActionsOpen,setAccountActionsOpen]=useState(false);
  useEffect(()=>{setProfileDetailsOpen(false);setAccountActionsOpen(false);},[user?.id]);
  const [exemptionInfoOpen,setExemptionInfoOpen]=useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [billingState,setBillingState]=useState<'loading'|'ready'|'error'>('loading');
  const [billingError,setBillingError]=useState('');
  const [paymentTestBypass,setPaymentTestBypass]=useState(false);
  const [returnToOnboarding,setReturnToOnboarding]=useState(false);
  C=THEME;
  s=makeStyles();
  const pendingWelcome=useRef(false);
  const [membership, setMembership] = useState<any>(null);
  const tabIndex=(name:Tab)=>tabs.findIndex(item=>item.name===name);
  const tabSlideStyle=(name:Tab)=>({transform:[{translateX:Animated.add(Animated.multiply(pagerPosition,-width),tabIndex(name)*width)}]});
  useLayoutEffect(()=>{if(!paging.current)pagerPosition.setValue(tabIndex(tab));},[tab,width,pagerPosition]);
  const canSwipe=(dx:number)=>tab==='Today'||(tab==='Community'&&dx<0)||(tab==='Account'&&dx>0);
  const handleMainSwipeMove=(moveX:number,moveY:number)=>{
    const start=swipeStart.current;if(!start)return;
    const dx=moveX-start.x,dy=moveY-start.y;
    if(start.horizontal===null&&Math.max(Math.abs(dx),Math.abs(dy))>=10)start.horizontal=Math.abs(dx)>Math.abs(dy)*1.2;
    if(start.horizontal!==true||!canSwipe(dx))return;
    pagerPosition.setValue(tabIndex(tab)-Math.max(-width*.92,Math.min(width*.92,dx))/width);
  };
  const handleMainSwipe=(endX:number,endY:number)=>{
    const start=swipeStart.current;swipeStart.current=null;
    if(!start)return;
    const dx=endX-start.x,dy=endY-start.y;
    if(start.horizontal!==true)return;
    const valid=start.horizontal===true&&Math.abs(dx)>=70&&Math.abs(dx)>Math.abs(dy)*1.35&&canSwipe(dx);
    const next=valid?(tab==='Today'?(dx>0?'Community':'Account'):tab==='Community'?'Today':'Today'):null;
    const destination=next?tabIndex(next):tabIndex(tab);
    paging.current=true;
    Animated.timing(pagerPosition,{toValue:destination,duration:180,useNativeDriver:true,easing:Easing.out(Easing.cubic)}).start(({finished})=>{
      if(!finished)return;
      if(next)setTab(next);
      paging.current=false;
    });
  };
  const selectTab=(next:Tab)=>{
    swipeStart.current=null;
    pagerPosition.stopAnimation();
    paging.current=false;
    pagerPosition.setValue(tabIndex(next));
    setTab(next);
  };
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [name, setName] = useState('');
  const [signup, setSignup] = useState(true);
  const authMotion = useRef(new Animated.Value(0)).current;
  const [reduceMotion,setReduceMotion] = useState(false);
  const [homeSloganVisible,setHomeSloganVisible] = useState(false);
  const homeSloganOpacity = useRef(new Animated.Value(0)).current;
  const homeActionsOpacity = useRef(new Animated.Value(0)).current;
  const closingAuth = useRef(false);
  useEffect(()=>{
    let active=true;
    AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduceMotion(value);});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);
    return ()=>{active=false;subscription.remove();};
  },[]);
  useEffect(()=>{
    if(sheet!=='auth')return;
    closingAuth.current=false;
    authMotion.setValue(reduceMotion?1:0);
    Animated.timing(authMotion,{toValue:1,duration:reduceMotion?0:240,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();
    return ()=>authMotion.stopAnimation();
  },[sheet,reduceMotion,authMotion]);
  const closeSheet = () => {
    if(busy||closingAuth.current)return;
    if(sheet!=='auth'){setSheet(null);return;}
    closingAuth.current=true;
    Animated.timing(authMotion,{toValue:0,duration:reduceMotion?0:180,easing:Easing.in(Easing.cubic),useNativeDriver:true}).start(({finished})=>{
      closingAuth.current=false;
      if(finished){setSheet(null);setNotice('');}
    });
  };
  const deleteOwnAccount = async () => {
    if(!supabase||busy)return;
    setBusy(true);setNotice('');
    try {
      const {data,error}=await supabase.functions.invoke('dev-delete-account',{body:{confirmation:'DELETE'}});
      if(error){let message=error.message;try{const detail=await error.context.json();message=detail.error||detail.message||message;if(error.context.status===404||detail.code==='NOT_FOUND')message='Account deletion is not enabled yet. The dev endpoint still needs to be deployed.';}catch{}throw new Error(message);}
      if(!data?.deleted)throw new Error(data?.error||'Account was not deleted.');
      await supabase.auth.signOut({scope:'local'});
      setUser(null);setProfile(null);setEntered(false);setSheet(null);setTab('Today');setWelcomeReveal(false);
      setNotice(data.appStoreSubscriptionMayRemain?'Account deleted. Cancel any active subscription in Apple subscription settings.':'Account deleted. You can sign up again.');
    } catch(error:any){setNotice(error.message||'Could not delete account.');} finally {setBusy(false);}
  };
  const openAuth = (createAccount: boolean) => {
    setSignup(createAccount);setNotice('');setSheet('auth');
  };
  const [liked, setLiked] = useState<string[]>([]);
  const [hiddenPostIds,setHiddenPostIds]=useState<string[]>([]);
  const [blockedUserIds,setBlockedUserIds]=useState<string[]>([]);
  const [menuPost,setMenuPost]=useState<Post|null>(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [reports,setReports]=useState<{id:string;checkinId:string;reason:string;createdAt:string;caption:string;author:string;imageUrl:string|null}[]>([]);
  const pendingLikeTaps=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const toggleLike=(id:string)=>setLiked(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  const handlePostTap=(id:string)=>{
    const pending=pendingLikeTaps.current.get(id);
    if(pending){clearTimeout(pending);pendingLikeTaps.current.delete(id);toggleLike(id);return;}
    pendingLikeTaps.current.set(id,setTimeout(()=>pendingLikeTaps.current.delete(id),260));
  };
  const isDemo = !user;
  const checks = isDemo ? demo.checks : liveChecks;
  const communitySchoolSuggestions=communitySchoolChosen?[]:searchUniversities(newCommunitySchool);
  const communityLocationSuggestions=communityLocationChosen?[]:searchCommunityCities(newCommunityLocation);
  const firstName = isDemo ? demo.name : (profile?.display_name || user?.user_metadata?.display_name || 'Friend');
  const timeZone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = monthDays(today);
  const required = days.filter(isRequiredWrapDay);
  const todaysWrap = checks.find(c => c.date === today);
  const completed = Boolean(todaysWrap);
  const exemption = wrapExemption(today);
  const postingBlocked = !canPostWrap(today);
  const cholHamoed = isCholHamoed(today);
  const exemptionExplanation=cholHamoed
    ? 'It is Chol Hamoed. Wrapping is optional today; follow your custom, and your streak is protected either way.'
    : exemption==='Shabbat'
      ? 'It is Shabbat. Tefillin are not worn on Shabbat, so no wrap is needed today.'
      : exemption==='Rosh Hashanah'
        ? 'It is Rosh Hashanah. Tefillin are not worn on Rosh Hashanah, so no wrap is needed today.'
        : `It is ${exemption}. Tefillin are not worn on this day, so no wrap is needed today.`;
  const captionWords = commentWordCount(caption);
  const cameraOpening = useRef(false);
  const streakCount = streak(checks.map(c => c.date), today);

  useEffect(() => { AsyncStorage.getItem(demoKey).then(raw => { if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed.checks)) setDemo({name:parsed.name||'Jared',checks:parsed.checks,reminder:parsed.reminder!==false}); } catch {} } }).finally(() => setHydrated(true)); }, []);
  useEffect(() => { if (hydrated) AsyncStorage.setItem(demoKey, JSON.stringify(demo)).catch(() => setNotice('Your device could not save this demo session.')); }, [demo, hydrated]);
  useEffect(() => { const update = () => setToday(dateKey(new Date(), timeZone)); update(); const timer = setInterval(update, 60000); const sub = AppState.addEventListener('change', update); return () => { clearInterval(timer); sub.remove(); }; }, [timeZone]);
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null)); const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null)); return () => data.subscription.unsubscribe(); }, []);
  useEffect(()=>{
    let active=true;
    setIdentityName('');
    if(!user)return;
    void recoveredIdentityName(AsyncStorage,user).then(value=>{if(active)setIdentityName(value);}).catch(()=>{});
    return ()=>{active=false;};
  },[user?.id]);
  useEffect(() => { if (user) refreshLive().catch(e => setNotice(e.message)); else { setProfile(null); setLiveChecks([]);  setLivePosts([]); setBlockedUserIds([]); } }, [user?.id]);
  useEffect(()=>{
    if(!supabase||!user){setCommunities([]);setMyCommunityId(null);setCommunityPosts([]);setCommunityView('global');return;}
    let active=true;
    supabase.from('communities').select('id,name').eq('active',true).order('name').then(({data,error})=>{
      if(active){if(error)setNotice('Could not load communities. Please try again.');else setCommunities(data||[]);}
    });
    return ()=>{active=false;};
  },[user?.id]);
  useEffect(() => {
    let active=true;
    setOnboardingState('loading');setBillingState('loading');setMemberDetails(null);setMembership(null);setPaymentTestBypass(false);setReturnToOnboarding(false);
    if(user&&supabase) supabase.from('member_onboarding').select('full_name,gender,phone,school,birthday,tradition,completed_at').eq('user_id',user.id).maybeSingle().then(({data,error})=>{
      if(active){setMemberDetails(data as MemberDetails|null);setOnboardingState(error?'error':data?'complete':'needed');}
    });
    return ()=>{active=false;};
  },[user?.id]);
  async function exitOnboarding() {
    if(!supabase)throw new Error('Sign-in is not configured.');
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(error)throw error;
    setUser(null);setEntered(false);setSheet(null);setNotice('');
    setReturnToOnboarding(false);setWelcomeReveal(false);setWelcomePreparing(false);
    pendingWelcome.current=false;
  }
  async function restartSignup() {
    if(!supabase||!user)throw new Error('Please sign in again.');
    const {error}=await supabase.rpc('restart_onboarding');
    if(error)throw error;
    setMemberDetails(null);setReturnToOnboarding(false);setOnboardingState('needed');
    setNotice('');pendingWelcome.current=false;
  }
  async function finishOnboarding(values:OnboardingValues) {
    if(!supabase||!user)throw new Error('Please sign in again.');
    pendingWelcome.current=true;
    try {
    const {data,error}=await supabase.rpc('complete_onboarding_with_community_code',{p_full_name:values.fullName.trim(),p_gender:values.gender,p_phone:values.phone.trim(),p_school:values.school.trim()||null,p_birthday:parseBirthday(values.birthday),p_tradition:values.tradition,p_owns_tefillin:values.ownsTefillin,p_borrow_source:null,p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_community_code:values.communityCode.trim()||null});
    if(error)throw error;
    setProfile((p:any)=>({...p,display_name:values.fullName.trim().split(/\s+/)[0]||p?.display_name||'Member',timezone:p?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}));
    setMemberDetails({full_name:values.fullName.trim(),gender:values.gender,phone:values.phone.trim(),school:values.school.trim()||null,birthday:parseBirthday(values.birthday),tradition:values.tradition!,tefillin_goal_enabled:false});
    setMyCommunityId(data||null);setCommunityView('global');
    void refreshLive().catch(error=>setNotice(error.message||'Could not refresh the feed.'));
    setSheet(null);setReturnToOnboarding(false);setOnboardingState('complete');setTab('Today');
    if(hasPaidAccess(membership,[],today)){pendingWelcome.current=false;setHomeLaidOut(false);setWelcomePreparing(false);setWelcomeReveal(true);}
    } catch(error) {setWelcomeReveal(false);throw error;}
  }
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  async function refreshBilling() {
    const requestUserId=user?.id;
    if(!requestUserId)return;
    try {
      const billing=await billingAction('status');
      if(currentUserId.current!==requestUserId)return;
      if(pendingWelcome.current&&hasPaidAccess(billing.membership,[],today)){
        pendingWelcome.current=false;setHomeLaidOut(false);setWelcomePreparing(false);setWelcomeReveal(true);setTab('Today');
      }
      setMembership(billing.membership);setBillingState('ready');setBillingError('');
      return billing;
    } catch(e:any){if(currentUserId.current!==requestUserId)return;setBillingState('error');setBillingError(e.message);throw e;}
  }
  const paidAccess=paymentTestBypass||hasPaidAccess(membership,[],today);
  useEffect(()=>{
    if(!user)return;
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refreshBilling().catch(()=>{});});
    return ()=>subscription.remove();
  },[user?.id]);
  useEffect(()=>{
    const expiry=Date.parse(membership?.access_expires_at||'');
    if(!user||!Number.isFinite(expiry)||expiry<=Date.now())return;
    const timer=setTimeout(()=>{setMembership((current:any)=>({...current,status:'expired'}));void refreshBilling().catch(()=>{});},Math.min(expiry-Date.now()+20,2147483647));
    return ()=>clearTimeout(timer);
  },[user?.id,membership?.access_expires_at]);

  async function refreshLive() {
    if (!supabase || !user) return;
    const requestUserId=user.id;
    await refreshBilling();
    if(currentUserId.current!==requestUserId)return;
    const [p, c, f, admin, membershipResult, communityFeedResult,blocks] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('checkins').select('*').eq('user_id', user.id).order('checkin_date', { ascending: false }),
      supabase.from('checkins').select('*, profiles(display_name)').eq('shared', true).order('created_at', { ascending: false }).limit(30),
      supabase.rpc('is_app_admin'),
      supabase.from('community_memberships').select('community_id').eq('user_id',user.id).maybeSingle(),
      supabase.rpc('my_community_feed'),
      supabase.from('blocked_users').select('blocked_user_id').eq('blocker_id',user.id),
    ]);
    if(currentUserId.current!==requestUserId)return;
    for (const result of [p,c,f,admin,membershipResult,communityFeedResult,blocks]) if (result.error) throw result.error;
    setBlockedUserIds((blocks.data||[]).map(row=>row.blocked_user_id));
    setMyCommunityId(membershipResult.data?.community_id||null);
    setIsAdmin(admin.data===true);
    setProfile(p.data);
    const paths = [...new Set([...(c.data || []), ...(f.data || []), ...(communityFeedResult.data || [])].map(row => row.photo_path))];
    const urls = paths.length ? await supabase.storage.from('checkins').createSignedUrls(paths, 3600) : null;
    const byPath = new Map(urls?.data?.map(row => [row.path, row.signedUrl]) || []);
    setLiveChecks((c.data || []).map(row => ({ date: row.checkin_date, uri: byPath.get(row.photo_path) || undefined, caption: row.caption, shared: row.shared })));
    setLivePosts((f.data || []).map(row => ({ id: row.id, userId:row.user_id,name: row.profiles?.display_name || 'Community member', caption: row.caption, date: row.checkin_date, createdAt: row.created_at, uri: byPath.get(row.photo_path) || undefined, initials: (row.profiles?.display_name || 'M').slice(0, 2).toUpperCase(), color: C.green })));
    setCommunityPosts((communityFeedResult.data || []).map((row:{id:string;user_id:string;display_name:string|null;caption:string;checkin_date:string;created_at:string;photo_path:string})=>({id:row.id,userId:row.user_id,name:row.display_name||'Community member',caption:row.caption,date:row.checkin_date,createdAt:row.created_at,uri:byPath.get(row.photo_path)||undefined,initials:(row.display_name||'M').slice(0,2).toUpperCase(),color:C.green})));
  }
  // Foregrounding the app rechecks entitlement and settlement state.
  useEffect(()=>{
    if(!user)return;
    const subscription=AppState.addEventListener('change',state=>{
      if(state==='active')void refreshLive().catch(()=>{});
    });
    return ()=>subscription.remove();
  },[user?.id]);
  const reportPost=async(post:Post)=>{
    if(isDemo){
      setHiddenPostIds(current=>current.includes(post.id)?current:[...current,post.id]);
      setNotice('Thanks. This post is hidden from your feed and is being reviewed by Ratzon.');
      return;
    }
    if(!supabase){setNotice('Sign in to report a post.');return;}
    try {
      const {error}=await supabase.rpc('report_checkin',{p_checkin_id:post.id,p_reason:''});
      if(error)throw error;
      setHiddenPostIds(current=>current.includes(post.id)?current:[...current,post.id]);
      setNotice('Thanks. This post is hidden from your feed and is being reviewed by Ratzon.');
    }
    catch(error:any){setNotice(error.message||'Could not report this post.');}
  };
  const loadReports=async()=>{
    if(!supabase)return;
    setBusy(true);
    try { const {data,error}=await supabase.functions.invoke('moderate-content',{body:{action:'list-reports'}}); if(error)throw error; setReports(data?.reports||[]); setSheet('reports'); }
    catch(error:any){setNotice(error.message||'Could not load reports.');} finally {setBusy(false);}
  };
  const moderateReport=async(report:{id:string;checkinId:string},action:'delete-post'|'dismissed')=>{
    if(!supabase||busy)return;
    setBusy(true);
    try {
      if(action==='delete-post'){
        const {error}=await supabase.functions.invoke('moderate-content',{body:{action:'delete-post',checkinId:report.checkinId}});if(error)throw error;
      } else {
        const {error}=await supabase.functions.invoke('moderate-content',{body:{action:'resolve-report',reportId:report.id,status:'dismissed'}});if(error)throw error;
      }
      setReports(current=>current.filter(item=>item.id!==report.id));
      if(action==='delete-post')await refreshLive();
    } catch(error:any){setNotice(error.message||'Could not update this report.');} finally {setBusy(false);}
  };
  const adminDeletePost=async(post:Post)=>{
    if(!supabase||busy)return;
    setBusy(true);
    try {
      const {error}=await supabase.functions.invoke('moderate-content',{body:{action:'delete-post',checkinId:post.id}});
      if(error)throw error;
      setHiddenPostIds(current=>[...current,post.id]);
      setSheet(null);setMenuPost(null);
      await refreshLive();
      setNotice('Post deleted.');
    } catch(error:any){setNotice(error.message||'Could not delete this post.');} finally {setBusy(false);}
  };
  const blockPostAuthor=async(post:Post)=>{
    if(isDemo&&post.userId){
      setBlockedUserIds(current=>current.includes(post.userId!)?current:[...current,post.userId!]);
      setSheet(null);setMenuPost(null);setNotice(`${post.name} has been blocked.`);
      return;
    }
    if(!supabase||!user||!post.userId||post.userId===user.id||busy)return;
    setBusy(true);
    try{
      const {error}=await supabase.from('blocked_users').upsert({blocker_id:user.id,blocked_user_id:post.userId});
      if(error)throw error;
      setBlockedUserIds(current=>current.includes(post.userId!)?current:[...current,post.userId!]);
      setSheet(null);setMenuPost(null);setNotice(`${post.name} has been blocked.`);
    }catch(error:any){setNotice(error.message||'Could not block this user.');}finally{setBusy(false);}
  };
  async function takePhoto() {
    if (busy || cameraOpening.current) return;
    if (postingBlocked || completed) { setNotice(postingBlocked ? `${exemption} · No wrap required today.` : 'You have already posted today.'); return; }
    if (Platform.OS === 'web') { setNotice('Open the iPhone or Android app to take your daily photo.'); return; }
    cameraOpening.current = true;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setNotice('Allow camera access in Settings to take your daily wrap photo.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: .8, base64: false });
      if (!result.canceled) {
        const asset = result.assets[0];
        const context = ImageManipulator.manipulate(asset.uri);
        context.resize(asset.width >= asset.height ? { width: isDemo ? 640 : 1200 } : { height: isDemo ? 800 : 1500 });
        const image = await context.renderAsync();
        const normalized = await image.saveAsync({ compress: .72, format: SaveFormat.JPEG, base64: true });
        if (!normalized.base64) throw new Error('Could not prepare your photo. Please take it again.');
        setPhoto(`data:image/jpeg;base64,${normalized.base64}`); setCaption(''); setSheet('photo');
      }
    } catch (e: any) { setNotice(e.message || 'Could not open the camera. Please try again.'); }
    finally { cameraOpening.current = false; setBusy(false); }
  }
  async function postPhoto() {
    if (!photo || busy) return;
    if (postingBlocked || completed) { setNotice(postingBlocked ? `${exemption} · No wrap required today.` : 'You have already wrapped today.'); return; }
    if (captionWords > 10) { setNotice('Keep your comment to 10 words or fewer.'); return; }
    const postCaption=caption.trim()||`Day ${streak([...checks.map(c=>c.date),today],today)} of the streak`;
    setBusy(true);
    try {
      if (isDemo) {
        setDemo(d => ({ ...d, checks: [...d.checks.filter(c => c.date !== today), { date: today, uri: photo, caption:postCaption, shared: true }].map(c => c.date < today.slice(0, 7) + '-01' ? { ...c, uri: undefined } : c) }));
      } else { await uploadCheckin(user.id, photo, postCaption, true); await refreshLive(); }
      setSheet(null); setPhoto(null); setCaption(''); setNotice(isDemo ? 'Demo wrap saved. One more day of showing up.' : 'Your wrap is posted. One more day of showing up.');
    } catch (e: any) { setNotice(e.message); } finally { setBusy(false); }
  }
  async function signInWithApple() {
    if (busy) return;
    if (!appleAvailable) { setNotice('Apple sign-in is available in the iPhone app.'); return; }
    if (!supabase) { setNotice('Account signup is not connected yet.'); return; }
    setBusy(true);
    try {
      // Existing development clients may predate the optional Apple crypto dependency.
      // Never evaluate expo-crypto until its native module is present.
      if (!requireOptionalNativeModule('ExpoCrypto')) {
        throw new Error('Apple sign-in needs an updated iPhone build.');
      }
      // Keep dependencies in the main Metro bundle; evaluate only after the native check.
      const Crypto = require('expo-crypto') as typeof import('expo-crypto');
      const nonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('Apple did not return a sign-in token.');
      const captured=await captureAppleName(AsyncStorage,credential);
      setIdentityName(captured);
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
      if (error) throw error;
      if(captured){
        const {data:updated,error:metadataError}=await supabase.auth.updateUser({data:{full_name:captured,name:captured}});
        if(metadataError)setNotice('Your name is saved on this device. You can update your profile in Settings.');
        if(updated.user)setUser(updated.user);
      }
      if(!captured&&data.user)setUser(data.user);
      setEntered(true); setSheet(null);
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') setNotice(error.message || 'Apple sign-in could not finish.');
    } finally { setBusy(false); }
  }
  const openSubscription = () => { setSheet('subscription'); };

  const localPosts: Post[] = checks.filter(c => c.uri && c.shared).map(c => ({ id: c.date, name: `${firstName} (you)`, caption: c.caption || 'Another day. Another connection.', date: c.date, uri: c.uri, initials: firstName.slice(0, 2).toUpperCase(), color: C.gold }));
  const demoPosts: Post[] = [
    {id:'demo-community-one',userId:'demo-daniel',name:'Daniel',caption:'Starting the morning with intention.',date:today,asset:require('./assets/media/community-demo-daniel-v2.png'),initials:'DA',color:'#2478FF',likes:12},
    {id:'demo-community-two',userId:'demo-aaron',name:'Aaron',caption:'One day at a time.',date:today,asset:require('./assets/media/community-demo-aaron-v2.png'),initials:'AR',color:'#062B60',likes:8},
  ];
  const posts = isDemo ? (communityView==='global'?[...localPosts,...demoPosts]:[]) : communityView==='mine' ? communityPosts : livePosts;
  const myCommunityName=communities.find(item=>item.id===myCommunityId)?.name;
  const changeCommunity=async(communityId:string|null)=>{
    if(!supabase||!user){setSheet(null);setNotice('Sign in to join a community.');return;}
    setBusy(true);
    try{
      const {error}=await supabase.rpc('set_my_community',{p_community_id:communityId});
      if(error)throw error;
      await refreshLive();
      setCommunityView(communityId?'mine':'global');
      setSheet(null);
    }catch(error:any){setNotice(error.message||'Could not update your community.');}
    finally{setBusy(false);}
  };
  const joinCommunityByCode=async()=>{
    if(!supabase||!user)return;
    setBusy(true);
    try { const {data,error}=await supabase.rpc('join_community_by_code',{p_join_code:communityCode}); if(error)throw error; setMyCommunityId(data);setCommunityCode('');await refreshLive();setCommunityView('mine');setSheet(null); }
    catch(error:any){setNotice(error.message||'Could not join that community.');} finally{setBusy(false);}
  };
  const createCommunity=async()=>{
    if(!supabase||!user)return;
    setBusy(true);
    try { const {data,error}=await supabase.rpc('create_my_community',{p_name:newCommunityName,p_location:newCommunityLocation,p_school:newCommunitySchool}); if(error)throw error; const row=(data||[])[0];setMyCommunityId(row.community_id);setCreatedCommunityCode(row.join_code);setNewCommunityName('');setNewCommunityLocation('');setNewCommunitySchool('');setCommunityLocationChosen(false);setCommunitySchoolChosen(false);await refreshLive();setCommunityView('mine');setSheet('community'); }
    catch(error:any){setNotice(error.message||'Could not create your community.');} finally{setBusy(false);}
  };
  const openCommunityMembership=(mode:'create'|'join')=>{
    if(!user){openAuth(true);return;}
    setCreatedCommunityCode(null);
    setSheet(mode==='create'?'community-create':'community-join');
  };
  const showCommunityInviteCode=async()=>{
    if(!supabase||!myCommunityId)return;
    setBusy(true);
    try{const {data,error}=await supabase.rpc('community_invite_code',{p_community_id:myCommunityId});if(error||!data)throw error||new Error('Could not load the invite code.');setCreatedCommunityCode(data);setSheet('community');}
    catch(error:any){setNotice(error.message||'Could not load the invite code.');}
    finally{setBusy(false);}
  };
  const trendScore=(post:Post)=>{
    const ageHours=post.createdAt?Math.max(0,(Date.now()-Date.parse(post.createdAt))/3600000):24;
    const freshness=Math.exp(-ageHours/18);
    return ((post.likes||0)+(liked.includes(post.id)?1:0)+4)*freshness;
  };
  const displayedPosts = posts.filter(post=>!hiddenPostIds.includes(post.id)&&(!post.userId||!blockedUserIds.includes(post.userId))).sort((a,b)=>{
    const aAge=a.createdAt?Math.max(0,Date.now()-Date.parse(a.createdAt)):86400000;
    const bAge=b.createdAt?Math.max(0,Date.now()-Date.parse(b.createdAt)):86400000;
    const aRecent=aAge<86400000,bRecent=bAge<86400000;
    if(aRecent!==bRecent)return aRecent?-1:1;
    return trendScore(b)-trendScore(a);
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - 3 + index);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const todayRingSize = Math.min(width - 104, 292);
  const renderWeeklyCheckins = () => <View style={s.todayWeek}>
    {weekDays.map(day => {
      const exempt = wrapExemption(day);
      const checked = !exempt && checks.some(check => check.date === day);
      const active = day === today;
      const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
      return <View key={day} style={s.todayWeekItem}>
        <Text style={[s.todayWeekLabel, { color: active ? C.text : C.muted }]}>{weekday}</Text>
        <View accessibilityLabel={`${day}${active ? ', today' : ''}${checked ? ', wrapped' : exempt ? `, ${exempt}` : ''}`} style={[
          s.todayWeekCircle,
          { backgroundColor: checked ? C.gold : C.card, borderColor: C.line },
          exempt && { backgroundColor: C.raised, borderColor: C.line },
          active && { backgroundColor: C.text, borderColor: C.text, borderWidth: 2 },
        ]}>
          {checked ? <Icon name="checkmark" size={17} color="#FFFFFF" /> : exempt ? <Icon name={isShabbat(day) ? 'moon-outline' : 'sparkles-outline'} size={14} color={active ? '#FFFFFF' : C.muted} /> : <Text style={[s.todayWeekDate, { color: active ? '#FFFFFF' : C.muted }]}>{Number(day.slice(-2))}</Text>}
        </View>
        {active ? <Text style={s.todayMarker}>TODAY</Text> : <View style={{height:12}}/>}
      </View>;
    })}
  </View>;

  const showCover = !user && !entered;
  useEffect(()=>{
    if(!showCover){setHomeSloganVisible(false);homeSloganOpacity.setValue(0);homeActionsOpacity.setValue(0);}
  },[showCover,homeSloganOpacity,homeActionsOpacity]);
  useEffect(()=>{
    if(!homeSloganVisible)return;
    homeSloganOpacity.setValue(0);
    homeActionsOpacity.setValue(0);
    const animation=Animated.sequence([
      Animated.timing(homeSloganOpacity,{toValue:1,duration:reduceMotion?0:300,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
      Animated.timing(homeActionsOpacity,{toValue:1,duration:reduceMotion?0:300,easing:Easing.out(Easing.cubic),useNativeDriver:true}),
    ]);
    animation.start();
    return ()=>animation.stop();
  },[homeSloganVisible,reduceMotion,homeSloganOpacity,homeActionsOpacity]);
  const todayScreen = <View style={s.todayLayout}>
    {postingBlocked&&<View style={s.exemptionNoticeGroup}><View style={s.todayRestNotice}><Icon name="sparkles-outline" color={C.text} size={20}/><Text style={s.todayRestText}>No wrap required today</Text><Pressable accessibilityRole="button" accessibilityLabel="Why no wrap is required today" accessibilityState={{expanded:exemptionInfoOpen}} onPress={()=>setExemptionInfoOpen(open=>!open)} hitSlop={8} style={s.exemptionInfo}><Icon name="information" color={C.text} size={13}/></Pressable></View>{exemptionInfoOpen&&<View style={s.exemptionPopover}><View style={s.exemptionPointer}/><Text style={s.exemptionPopoverText}>{exemptionExplanation}</Text></View>}</View>}
    <View style={s.todayHero}>
      <View style={[s.todayRing, { width: todayRingSize, height: todayRingSize, borderRadius: todayRingSize / 2, backgroundColor: C.raised, borderColor: C.line }]}>
        <View style={[s.todayRingInner, { backgroundColor: C.card, borderRadius: (todayRingSize - 26) / 2,overflow:'hidden' }]}>
          <BrandLogo size={Math.round(todayRingSize * .43)} onReady={()=>markMainAsset('today-mark')} />
          {todaysWrap?.uri&&<Image source={{uri:todaysWrap.uri}} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} accessibilityLabel="Your wrap photo for today"/>}
        </View>
      </View>
    </View>
    {!postingBlocked&&!completed&&<Pressable accessibilityRole="button" accessibilityLabel="Post your wrap" disabled={busy} onPress={takePhoto} style={({ pressed }) => [s.todayPrimary, { backgroundColor: '#062B60', opacity: pressed ? .8 : 1 }]}>
      <Icon name="camera-outline" color="#FFFFFF" size={20}/>
      <Text style={[s.todayPrimaryText, { color: '#FFFFFF' }]}>Post your wrap</Text>
    </Pressable>}
    {renderWeeklyCheckins()}
    {cholHamoed&&<Text style={[s.todayNote, { color: C.muted }]}>On weekdays during Chol Hamoed, wrapping is optional. Follow your custom; your streak is protected.</Text>}
  </View>;
  const communityScreen = <View style={s.communityLayout}>
    <View style={s.communitySelector}>{(['global','mine'] as const).map(view=>{const label=view==='global'?'Global':myCommunityName||'Join a Community';return <Pressable key={view} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:communityView===view}} onPress={()=>setCommunityView(view)} style={[s.communitySelectorOption,communityView===view&&s.communitySelectorSelected]}><Text numberOfLines={1} style={[s.communitySelectorText,communityView===view&&s.communitySelectorSelectedText]}>{label}</Text></Pressable>;})}</View>
    {communityView==='mine'&&user&&!myCommunityId&&<View style={s.communityMembershipActions}><Button label="Create a Community" nav onPress={()=>openCommunityMembership('create')}/><Button label="Join with a code" secondary onPress={()=>openCommunityMembership('join')}/></View>}
    {communityView==='mine'&&<CommunityAdmin userId={user?.id||null} communityId={myCommunityId}/>} 
    <View style={s.communityFeed}>{displayedPosts.length===0?null:displayedPosts.map(post=>{
      const likes=(post.likes||0)+(liked.includes(post.id)?1:0);
      return <View key={post.id} style={s.communityPost}>
        <View style={s.communityPostHeader}><View style={[s.communityAvatar,{backgroundColor:post.color}]}><Text style={s.communityAvatarText}>{post.initials}</Text></View><View style={{flex:1}}><Text style={s.communityName}>{post.name}</Text><Text style={s.communityDate}>{new Date(`${post.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Post options for ${post.name}`} onPress={()=>{setMenuPost(post);setSheet('post-menu');}} hitSlop={10}><Icon name="ellipsis-horizontal" color={C.muted} size={22}/></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Double tap to like" onPress={()=>handlePostTap(post.id)}>{post.uri?<Image fadeDuration={0} source={{uri:post.uri}} style={s.communityPhoto} accessibilityLabel={`${post.name}'s wrap`}/>:post.asset?<Image fadeDuration={0} source={post.asset} style={s.communityPhoto} accessibilityLabel={`${post.name}'s wrap`}/>:<Image fadeDuration={0} source={require('./assets/media/community-tel-aviv-background.png')} style={s.communityPhoto} accessibilityLabel="Sample community post"/>}</Pressable>
        <View style={s.communityPostFooter}><Text style={s.communityCaption}>{post.caption}</Text><Pressable onPress={()=>toggleLike(post.id)} accessibilityRole="button" accessibilityLabel={`Like, ${likes} likes`} style={s.communityLike}><Icon name={liked.includes(post.id)?'heart':'heart-outline'} color={C.text} size={25}/><Text style={s.communityLikes}>{likes}</Text></Pressable></View>
      </View>;
    })}</View>
  </View>;
  const openProfileEditor=(field:'name'|'birthday'|'school'|'phone')=>{
    const birthday=memberDetails?.birthday;
    const birthdayInput=birthday?`${birthday.slice(5,7)}/${birthday.slice(8,10)}/${birthday.slice(0,4)}`:'';
    setEditingProfileField(field);
    setProfileEditValue(field==='name'?memberDetails?.full_name||firstName:field==='birthday'?birthdayInput:field==='school'?memberDetails?.school||'':formatUsPhone(memberDetails?.phone||''));
    setNotice('');
  };
  const saveProfileEdit=async()=>{
    if(!supabase||!memberDetails||!editingProfileField||busy)return;
    const value=profileEditValue.trim();
    const fullName=editingProfileField==='name'?value:memberDetails.full_name;
    const phone=editingProfileField==='phone'?value:memberDetails.phone||null;
    const school=editingProfileField==='school'?value||null:memberDetails.school;
    let birthday=memberDetails.birthday;
    try{
      if(editingProfileField==='name'&&!fullName)throw new Error('Enter your full name.');
      if(editingProfileField==='phone'&&value&&phoneDigits(value).length!==10)throw new Error('Enter a 10-digit phone number.');
      if(editingProfileField==='birthday')birthday=parseBirthday(value);
      setBusy(true);
      const {error}=await supabase.rpc('update_member_profile',{p_full_name:fullName,p_phone:phone,p_school:school,p_birthday:birthday});
      if(error)throw error;
      setMemberDetails(current=>current?{...current,full_name:fullName,phone,school,birthday}:current);
      setProfile((current:any)=>({...current,display_name:fullName.split(/\s+/)[0]}));
      setEditingProfileField(null);
    }catch(error:any){setNotice(error.message||'Could not update your information.');}finally{setBusy(false);}
  };
  const accountName:string=String(memberDetails?.full_name||firstName||'Member');
  const accountBirthday=memberDetails?.birthday ? new Date(`${memberDetails.birthday}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : 'Not provided';
  const accountSchool=memberDetails?.school||'Not provided';
  const accountPhone=memberDetails?.phone?formatUsPhone(memberDetails.phone):'Not provided';

  const settingsInfoRow=(label:string,field:'name'|'birthday'|'school'|'phone',value:string)=>editingProfileField===field
    ? <View key={field} style={s.settingsInfoRow}><Text style={s.settingsInfoLabel}>{label}</Text><TextInput autoFocus accessibilityLabel={`Edit ${label}`} style={s.settingsInlineInput} value={profileEditValue} onChangeText={text=>setProfileEditValue(field==='phone'?formatUsPhone(text):text)} autoCapitalize={field==='name'?'words':'none'} autoCorrect={false} keyboardType={field==='phone'?'phone-pad':'default'} placeholder={field==='birthday'?'MM/DD/YYYY':field==='phone'?'(555) 123-4567':''} placeholderTextColor={C.dim} maxLength={field==='name'?80:field==='phone'?14:field==='school'?120:10} editable={!busy} onSubmitEditing={saveProfileEdit}/><Pressable accessibilityRole="button" accessibilityLabel={`Save ${label}`} disabled={busy} onPress={saveProfileEdit} hitSlop={8}><Icon name="checkmark" size={20} color={C.text}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Cancel editing ${label}`} disabled={busy} onPress={()=>setEditingProfileField(null)} hitSlop={8}><Icon name="close" size={19} color={C.muted}/></Pressable></View>
    : <Pressable key={field} accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={()=>openProfileEditor(field)} style={s.settingsInfoRow}><Text style={s.settingsInfoLabel}>{label}</Text><Text style={s.settingsInfoValue}>{value}</Text></Pressable>;
  const accountHome = <View style={s.accountHome}>
    <View style={s.accountHeader}><Text accessibilityRole="header" style={s.pageTitle}>You</Text><Pressable accessibilityRole="button" accessibilityLabel="Account settings" accessibilityState={{expanded:accountActionsOpen}} onPress={()=>setAccountActionsOpen(value=>!value)} style={s.accountSettingsIcon}><Icon name="options-outline" size={23} color={C.text}/></Pressable></View>
    <View style={s.accountIdentity}><View style={s.accountInitials}><Text style={s.accountInitialsText}>{accountName.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</Text></View><Text style={s.accountNameText}>{accountName}</Text></View>
  </View>;
  const settingsScreen = <View style={s.settingsPage}>
    <View style={s.settingsSection}>
      <Pressable accessibilityRole="button" accessibilityLabel="Personal information" accessibilityState={{expanded:profileDetailsOpen}} onPress={()=>setProfileDetailsOpen(value=>!value)} style={s.settingsAction}><Icon name="person-outline" size={19} color={C.text}/><Text style={s.settingsActionText}>Personal information</Text><Icon name={profileDetailsOpen?'chevron-down':'chevron-forward'} size={19}/></Pressable>
      {profileDetailsOpen&&<>
      {settingsInfoRow('Name','name',accountName)}
      {settingsInfoRow('Birthday','birthday',accountBirthday)}
      {settingsInfoRow('School','school',accountSchool)}
      {settingsInfoRow('Phone Number','phone',accountPhone)}
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel="Community" onPress={()=>myCommunityId?setSheet('community'):openCommunityMembership('join')} style={s.settingsAction}><Icon name="people-outline" size={19} color={C.text}/><Text style={s.settingsActionText}>Community</Text><Text style={s.settingsInfoValue}>{myCommunityName||'Join'}</Text><Icon name="chevron-forward" size={17} color={C.muted}/></Pressable>
    </View>
    <View style={s.settingsSection}>
      <Pressable accessibilityRole="button" accessibilityLabel="Ratzon Membership" onPress={openSubscription} style={s.settingsAction}><Icon name="checkmark-circle-outline" size={19} color={C.text}/><Text style={s.settingsActionText}>Membership</Text><Icon name="chevron-forward" size={19} color={C.muted}/></Pressable>
    </View>
    {accountActionsOpen&&<><View style={s.settingsSection}>
      <Pressable accessibilityRole="button" accessibilityLabel="Rules and privacy" onPress={()=>setSheet('rules')} style={s.settingsAction}><Text style={s.settingsActionText}>Rules & privacy</Text><Icon name="chevron-forward" size={19} color={C.muted}/></Pressable>
      {isAdmin&&<Pressable accessibilityRole="button" accessibilityLabel="Reported posts" disabled={busy} onPress={loadReports} style={s.settingsAction}><Text style={s.settingsActionText}>Reported posts</Text><Icon name="shield-checkmark-outline" size={19} color={C.muted}/></Pressable>}
    </View>
    <View style={s.settingsSection}>
      <Pressable accessibilityRole="link" accessibilityLabel="Contact Jared at Ratzon" onPress={()=>Linking.openURL('mailto:jared@ratzonapp.com').catch(()=>setNotice('Email jared@ratzonapp.com'))} style={s.settingsAction}><Text style={s.settingsActionText}>Contact</Text><Text style={s.settingsInfoValue}>jared@ratzonapp.com</Text></Pressable>
      {isDemo?<><Pressable accessibilityRole="button" onPress={()=>openAuth(true)} style={s.settingsAction}><Text style={s.settingsActionText}>Create account</Text><Icon name="chevron-forward" size={19} color={C.muted}/></Pressable><Pressable accessibilityRole="button" onPress={()=>setEntered(false)} style={s.settingsAction}><Text style={s.settingsActionText}>Back to welcome</Text><Icon name="chevron-forward" size={19} color={C.muted}/></Pressable><Pressable accessibilityRole="button" onPress={()=>{setDemo(initialDemo());setNotice('Demo reset.');}} style={s.settingsAction}><Text style={s.settingsActionText}>Reset demo</Text><Icon name="refresh-outline" size={19} color={C.muted}/></Pressable></>:<><Pressable accessibilityRole="button" onPress={()=>{setNotice('');setSheet('delete-account');}} style={s.settingsAction}><Text style={[s.settingsActionText,{color:'#B42318'}]}>Delete account</Text><Icon name="trash-outline" size={19} color="#B42318"/></Pressable><Pressable accessibilityRole="button" onPress={async()=>{await supabase!.auth.signOut();setEntered(false);}} style={s.settingsAction}><Text style={s.settingsActionText}>Sign out</Text><Icon name="log-out-outline" size={19} color={C.muted}/></Pressable></>}
    </View></>}
  </View>;
  const profileScreen = user&&(onboardingState==='needed'||returnToOnboarding)? <Onboarding onExit={exitOnboarding} onComplete={finishOnboarding} communities={communities} skipFullName={isAppleIdentity(user)} initialStep={returnToOnboarding?6:0} initialValues={returnToOnboarding?{fullName:memberDetails?.full_name||'',gender:memberDetails?.gender||null,phone:memberDetails?.phone||'',school:memberDetails?.school||'',birthday:birthdayForInput(memberDetails?.birthday),tradition:memberDetails?.tradition||null,ownsTefillin:null,borrowSource:null,communityCode:''}:{fullName:savedIdentityName(user)||identityName,gender:null,phone:'',school:'',birthday:'',tradition:null,ownsTefillin:null,borrowSource:null,communityCode:''}}/> : user&&(onboardingState==='loading'||onboardingState==='error')? <SafeAreaView style={{flex:1,backgroundColor:'#EDF4FF',justifyContent:'center',padding:28}}><StatusBar style="dark"/>{onboardingState==='error'&&<><Text style={{textAlign:'center',color:'#062B60',marginBottom:20}}>Could not load your profile.</Text><Button label="Try again" onPress={async()=>{setOnboardingState('loading');const {data,error}=await supabase!.from('member_onboarding').select('full_name,gender,phone,school,birthday,tradition,completed_at').eq('user_id',user.id).maybeSingle();setMemberDetails(data as MemberDetails|null);setOnboardingState(error?'error':data?'complete':'needed');}}/></>}</SafeAreaView> : null;
  const contributionScreen=user&&onboardingState==='complete'&&!paidAccess ? billingState==='error'?<SafeAreaView style={{flex:1,backgroundColor:'#EDF4FF',justifyContent:'center',padding:28}}><Text style={{color:'#062B60',marginBottom:18}}>{billingError}</Text><Button label="Try Again" onPress={()=>{refreshBilling().catch(()=>{});}}/></SafeAreaView>:<PageTransition fadeOnly duration={360}><ContributionSetup appAccountToken={user.id} onPurchase={confirmAppleContribution} onRefresh={async()=>{await refreshBilling();}} onSkip={__DEV__?()=>setPaymentTestBypass(true):undefined} onBack={()=>setReturnToOnboarding(true)} onStartOver={restartSignup}/></PageTransition>:null;
  const onboardingScreen=profileScreen||contributionScreen;
  const backgroundStyle={position:'absolute' as const,top:0,left:0,width,height:Math.max(0,height-navigationHeight)};
  return <><View style={{flex:1,backgroundColor:C.bg}}>{onboardingScreen || <View style={{flex:1,backgroundColor:showCover?'#EDF4FF':C.bg,overflow:'hidden'}}>{!showCover&&<><Animated.Image source={require('./assets/media/today-jerusalem-background-v2.png')} resizeMode="stretch" fadeDuration={0} onLoadEnd={()=>markMainAsset('jerusalem')} style={[backgroundStyle,tabSlideStyle('Today')]} accessibilityIgnoresInvertColors/><Animated.Image source={require('./assets/media/community-tel-aviv-background.png')} resizeMode="stretch" fadeDuration={0} onLoadEnd={()=>markMainAsset('tel-aviv')} style={[backgroundStyle,tabSlideStyle('Community')]} accessibilityIgnoresInvertColors/><Animated.Image source={require('./assets/media/account-masada-background.png')} resizeMode="stretch" fadeDuration={0} onLoadEnd={()=>markMainAsset('masada')} style={[backgroundStyle,tabSlideStyle('Account')]} accessibilityIgnoresInvertColors/></>}<SafeAreaView style={{flex:1}} edges={showCover?['left','right']:['top','left','right']}><StatusBar style="dark"/><View style={s.app} onTouchStart={event=>{if(paging.current)return;swipeStart.current={x:event.nativeEvent.pageX,y:event.nativeEvent.pageY,horizontal:null};}} onTouchMove={event=>{if(!paging.current)handleMainSwipeMove(event.nativeEvent.pageX,event.nativeEvent.pageY);}} onTouchEnd={event=>{if(!paging.current)handleMainSwipe(event.nativeEvent.pageX,event.nativeEvent.pageY);}} onTouchCancel={()=>{if(!paging.current){swipeStart.current=null;Animated.timing(pagerPosition,{toValue:tabIndex(tab),duration:140,useNativeDriver:true}).start();}}}>
    {showCover ? <SafeAreaView edges={['bottom']} style={s.cover}>
      <LinearGradient pointerEvents="none" colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/>
      <View pointerEvents="none" style={[s.coverCenter,{top:'50%',transform:[{translateY:-(Math.min(width - 64,384)*.27*992/795)/2-16}]}]}><WelcomeBrand width={Math.min(width - 64, 384)} onAnimationComplete={()=>setHomeSloganVisible(true)}/><Animated.Text style={{opacity:homeSloganOpacity,marginTop:24,textAlign:'center',color:'#062B60',includeFontPadding:false,textAlignVertical:'center',fontSize:18,fontWeight:'500',letterSpacing:.4}}>Live With Intention</Animated.Text></View>
      <Animated.View style={{gap:0,width:'100%',maxWidth:384,alignSelf:'center',opacity:homeActionsOpacity}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Get Started" disabled={busy} onPress={()=>{setSignup(true);setNotice('');void signInWithApple();}} style={({pressed})=>[s.getStarted,{opacity:busy?.45:pressed?.8:1}]}><Text style={s.getStartedText}>Get Started</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Already have an account? Log In" onPress={()=>openAuth(false)} style={{alignItems:'center',justifyContent:'center',minHeight:44}}><Text style={{color:'#16365F',includeFontPadding:false,textAlignVertical:'center',fontSize:11}}>Already have an account? <Text style={{fontWeight:'600',textDecorationLine:'underline'}}>Log In</Text></Text></Pressable>
      </Animated.View>
    </SafeAreaView> : <>
      <View style={{flex:1}}>
        <Animated.View accessibilityElementsHidden={tab!=='Today'} importantForAccessibility={tab==='Today'?'auto':'no-hide-descendants'} pointerEvents={tab==='Today'?'auto':'none'} style={[s.tabLayer,tabSlideStyle('Today'),{zIndex:tab==='Today'?1:0}]}><View style={[s.topbar,{justifyContent:'center'}]} onLayout={()=>{if(welcomeReveal)setHomeLaidOut(true);}}><Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={[s.pageTitle,{textAlign:'center',transform:[{translateY:30}]}]}>{new Date(`${today}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</Text></View><View style={[s.content,{flex:1}]}>{todayScreen}</View></Animated.View>
        <Animated.View accessibilityElementsHidden={tab!=='Community'} importantForAccessibility={tab==='Community'?'auto':'no-hide-descendants'} pointerEvents={tab==='Community'?'auto':'none'} style={[s.tabLayer,tabSlideStyle('Community'),{zIndex:tab==='Community'?1:0}]}><ScrollView removeClippedSubviews={false} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>{communityScreen}</ScrollView>{communityView==='mine'&&myCommunityId&&<Pressable accessibilityRole="button" accessibilityLabel="Show community invite code" disabled={busy} onPress={showCommunityInviteCode} style={({pressed})=>[s.floatingInviteButton,{opacity:busy?.5:pressed?.75:1}]}><Text style={s.floatingInviteText}>+</Text></Pressable>}</Animated.View>
        <Animated.View accessibilityElementsHidden={tab!=='Account'} importantForAccessibility={tab==='Account'?'auto':'no-hide-descendants'} pointerEvents={tab==='Account'?'auto':'none'} style={[s.tabLayer,tabSlideStyle('Account'),{zIndex:tab==='Account'?1:0,backgroundColor:'#FAFCFF'}]}><ScrollView style={{flex:1}} contentContainerStyle={[s.content,{paddingTop:18,paddingBottom:22}]} bounces={false} alwaysBounceVertical={false} overScrollMode="never" contentInsetAdjustmentBehavior="never" automaticallyAdjustKeyboardInsets={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{accountHome}{settingsScreen}</ScrollView></Animated.View>
      </View>
      <SafeAreaView edges={['bottom']} onLayout={event=>setNavigationHeight(event.nativeEvent.layout.height)} style={s.bottomBar}><View style={[s.row,{justifyContent:'space-around',alignItems:'center'}]}>{tabs.map(item=><Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.name==='Account'?'You':item.name} accessibilityState={{selected:tab===item.name}} onPress={()=>selectTab(item.name)} style={s.bottomTab}>
        {item.name==='Today'?<View style={s.todayNavigationMark}><Image source={require('./assets/media/logo-trimmed.png')} resizeMode="contain" style={{width:30,height:34,tintColor:'#FFFFFF'}}/></View>:<Icon name={item.icon} size={30} color={tab===item.name?C.gold:C.dim}/>}
        <Text style={{includeFontPadding:false,textAlignVertical:'center',fontSize:11,color:tab===item.name?C.gold:C.muted,marginTop:4,fontWeight:'600'}}>{item.name==='Account'?'You':item.name}</Text>
      </Pressable>)}</View></SafeAreaView>
    </>}
    </View>
    <Modal visible={!!sheet} transparent animationType={sheet==='auth'?'none':'fade'} onRequestClose={closeSheet}><KeyboardAvoidingView behavior={['community','community-create','community-join'].includes(sheet||'')?undefined:Platform.OS === 'ios' ? 'padding' : undefined} style={[s.modalBackdrop,['community','community-create','community-join'].includes(sheet||'')&&s.communityModalBackdrop]}><Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close dialog"/><Animated.View style={[s.modal,{maxHeight:'90%',width:Math.min(width-32,480)},sheet==='auth'&&{padding:20,opacity:authMotion,transform:[{translateY:authMotion.interpolate({inputRange:[0,1],outputRange:[220,0]})}]}]}>{sheet==='community-create'?<View style={s.communityCreateHeader}><Text style={s.communityCreateHeaderText}>Create Community</Text></View>:sheet!=='auth'&&<View style={[s.row,{justifyContent:'flex-end',marginBottom:sheet==='subscription'?8:24}]}>{sheet!=='subscription'&&<Text style={[s.sectionTitle,{marginRight:'auto'}]}>{sheet==='photo'?'Post your wrap':sheet==='delete-account'?'Delete Account':sheet==='post-menu'?'Post options':sheet==='reports'?'Reported posts':sheet==='community-join'?'Join community':sheet==='community'?'Community':'Rules & privacy'}</Text>}<Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}><Icon name="close"/></Pressable></View>}<ScrollView scrollEnabled bounces={false} alwaysBounceVertical={false} overScrollMode="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    {sheet==='community'&&<View style={{gap:12}}>{createdCommunityCode?<><Text style={s.body}>Share this code with people you want to invite. You are this community’s admin.</Text><View style={s.inviteCode}><Text selectable style={s.inviteCodeText}>{createdCommunityCode}</Text></View><Button label="Done" onPress={()=>{setCreatedCommunityCode(null);setSheet(null);}}/></>:<><Text style={s.body}>Community admins can view members’ profiles, wrap history, captions, and wrap photos, including check-ins not shared to the feed.</Text><Button label={busy?'Saving…':'Leave community'} secondary disabled={busy} onPress={()=>changeCommunity(null)}/></>}</View>}
    {sheet==='community-create'&&<View style={{gap:12}}><TextInput accessibilityLabel="Community name" placeholder="Community name" placeholderTextColor={C.dim} style={s.input} value={newCommunityName} onChangeText={setNewCommunityName} editable={!busy}/><View><TextInput accessibilityLabel="Location" placeholder="City" placeholderTextColor={C.dim} style={s.input} value={newCommunityLocation} onChangeText={text=>{setNewCommunityLocation(text);setCommunityLocationChosen(false);}} autoCorrect={false} editable={!busy}/>{communityLocationSuggestions.length>0&&<View style={s.communitySuggestions}>{communityLocationSuggestions.map(city=><Pressable key={city} accessibilityRole="button" onPress={()=>{setNewCommunityLocation(city);setCommunityLocationChosen(true);}} style={s.communitySuggestion}><Text style={s.communitySuggestionText}>{city}</Text></Pressable>)}</View>}</View><View><TextInput accessibilityLabel="School (optional)" placeholder="School (optional)" placeholderTextColor={C.dim} style={s.input} value={newCommunitySchool} onChangeText={text=>{setNewCommunitySchool(text);setCommunitySchoolChosen(false);}} autoCorrect={false} editable={!busy}/>{communitySchoolSuggestions.length>0&&<View style={s.communitySuggestions}>{communitySchoolSuggestions.map(school=><Pressable key={school} accessibilityRole="button" onPress={()=>{setNewCommunitySchool(school);setCommunitySchoolChosen(true);}} style={s.communitySuggestion}><Text style={s.communitySuggestionText}>{school}</Text></Pressable>)}</View>}</View><Button label={busy?'Creating…':'Create a Community'} nav disabled={busy||!newCommunityName.trim()} onPress={createCommunity}/></View>}
    {sheet==='community-join'&&<View style={{gap:12}}><TextInput accessibilityLabel="Community invite code" placeholder="6-character code" placeholderTextColor={C.dim} style={s.input} value={communityCode} onChangeText={text=>setCommunityCode(text.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6))} autoCapitalize="characters" autoCorrect={false} maxLength={6} editable={!busy}/><Button label={busy?'Joining…':'Join with code'} disabled={busy||communityCode.length!==6} onPress={joinCommunityByCode}/></View>}
    {sheet==='delete-account'&&<><Text style={[s.body,{marginBottom:20}]}>Permanently delete this account, signup details, and wrap photos?</Text><Text style={[s.body,{marginBottom:20}]}>For your security, sign out and sign back in before deleting your account.</Text><View style={{gap:12}}><Button label={busy?'Deleting…':'Delete account'} disabled={busy} onPress={deleteOwnAccount}/><Button label="Cancel" secondary disabled={busy} onPress={closeSheet}/></View></>}
    {sheet==='post-menu'&&<View style={{gap:12}}><Button label="Hide post" secondary onPress={()=>{if(menuPost)setHiddenPostIds(ids=>[...ids,menuPost.id]);setMenuPost(null);setSheet(null);}}/><Button label="Report post" secondary onPress={()=>{const post=menuPost;setMenuPost(null);setSheet(null);if(post)void reportPost(post);}}/>{menuPost?.userId&&menuPost.userId!==user?.id&&<Button label={busy?'Blocking…':'Block user'} secondary disabled={busy} onPress={()=>{if(menuPost)void blockPostAuthor(menuPost);}}/>}{isAdmin&&<Button label={busy?'Deleting…':'Delete post'} disabled={busy||!menuPost} onPress={()=>{if(menuPost)void adminDeletePost(menuPost);}}/>}</View>}
    {sheet==='reports'&&<View style={{gap:16}}>{reports.length===0?<Text style={s.body}>No open reports.</Text>:reports.map(report=><View key={report.id} style={[s.card,{padding:14,gap:9}]}>{report.imageUrl&&<Image source={{uri:report.imageUrl}} style={{height:170,width:'100%',borderRadius:10}} resizeMode="cover"/>}<Text style={[s.sectionTitle,{fontSize:16}]}>{report.author}</Text>{report.caption?<Text style={s.body}>{report.caption}</Text>:null}<Text style={s.tiny}>{report.reason||'No details provided'} · {new Date(report.createdAt).toLocaleDateString()}</Text><View style={{flexDirection:'row',gap:10}}><View style={{flex:1}}><Button label="Remove post" disabled={busy} onPress={()=>moderateReport(report,'delete-post')}/></View><View style={{flex:1}}><Button label="Dismiss" secondary disabled={busy} onPress={()=>moderateReport(report,'dismissed')}/></View></View></View>)}</View>}
    {sheet==='photo'&&<>
      {photo&&<Image source={{uri:photo}} style={{width:'100%',height:280,borderRadius:16,marginBottom:18}} accessibilityLabel="Your captured wrap photo"/>}
      <TextInput accessibilityLabel="Comment, up to 10 words" style={[s.input,{minHeight:80,backgroundColor:C.card,borderColor:C.line}]} placeholder="Comment (optional)" placeholderTextColor={C.dim} value={caption} onChangeText={setCaption} multiline maxLength={500} editable={!busy}/>
      <Text accessibilityLiveRegion="polite" style={[s.tiny,{textAlign:'right',marginTop:8,color:captionWords>10?'#FF8C8C':C.muted}]}>{captionWords}/10 words{captionWords>10?' · Please shorten your comment':''}</Text>
      <View style={{marginTop:20}}><Button label={busy?'Posting…':'Post to community'} onPress={postPhoto} disabled={!photo||busy||captionWords>10||postingBlocked||completed}/></View>
    </>}
    {sheet==='subscription'&&<><Text style={[s.sectionTitle,{marginBottom:18}]}>Ratzon Membership</Text><Text style={[s.body,{marginBottom:14}]}>Monthly access to daily check-ins, streak tracking, wrap history, and community features. Renews monthly until canceled. Check-in completion does not affect membership access.</Text><Button label="Manage in Apple subscriptions" onPress={()=>Linking.openURL('https://apps.apple.com/account/subscriptions').catch(()=>setNotice('Open Settings, tap your name, then Subscriptions.'))}/><Pressable accessibilityRole="link" onPress={()=>Linking.openURL(PRIVACY_POLICY_URL).catch(()=>setNotice('Could not open the privacy policy.'))}><Text style={[s.textLink,{textAlign:'center',marginTop:20}]}>Privacy Policy</Text></Pressable><Pressable accessibilityRole="link" onPress={()=>Linking.openURL(APPLE_EULA_URL).catch(()=>setNotice('Could not open the Terms of Use.'))}><Text style={[s.textLink,{textAlign:'center',marginTop:16}]}>Terms of Use (EULA)</Text></Pressable></>}

    {sheet==='auth'&&<View style={{gap:12}}>
      <View pointerEvents={busy?'none':'auto'} accessibilityState={{busy}} style={{opacity:busy?.5:1}}>
        <Pressable accessibilityRole="button" accessibilityLabel={signup?'Sign up with Apple':'Sign in with Apple'} disabled={busy} onPress={signInWithApple} style={[s.appleButton,s.authOption,{opacity:busy?0.45:1}]}><Icon name="logo-apple" color={C.text} size={22}/><Text style={{includeFontPadding:false,textAlignVertical:'center',fontSize:17,color:C.text,fontWeight:'600'}}>{signup?'Sign up with Apple':'Sign in with Apple'}</Text></Pressable>
      </View>
    </View>}
    {sheet==='rules'&&<>{[{body:'Privacy: Ratzon collects the information you provide for your account—name, phone number, school, birthday, tradition, optional community membership, and wrap photos and captions. We use it to operate your account, manage subscriptions and charity votes, and provide support. Shared wrap posts appear in the Global feed for signed-in members. If you join a community, its designated admins can view your profile, complete wrap history, captions, and photos, including unshared check-ins, for challenge administration and support.'},{body:'Payments are processed by Apple through the App Store. Ratzon does not receive or store your card number. We retain records required for payment, fraud prevention, tax, or legal obligations; other account data, including shared posts and stored photos, is deleted when you delete your account.'},{body:'Community safety: you can report a post or block its author from the post options menu. Blocking hides that person’s posts from your feeds. Ratzon reviews reports and can remove content or restrict an account. Contact jared@ratzonapp.com for privacy, safety, or account concerns.'},{body:'Rules: you must be at least 13. Post only a new photo you have the right to share. Do not post unlawful, abusive, sexually explicit, threatening, or deceptive content. Shabbat and exempt Jewish holidays do not require a check-in.'},{body:'Account deletion: Settings includes Delete account. It removes your profile, onboarding details, posts, and stored photos. Manage or cancel any recurring App Store subscription in your Apple subscriptions. Payment records required by law may be retained; historical financial obligations or disputes may need support review.'}].map((item,index)=><View key={index} style={{marginBottom:23}}><Text style={s.body}>{item.body}</Text></View>)}<Pressable accessibilityRole="link" onPress={()=>Linking.openURL(PRIVACY_POLICY_URL).catch(()=>setNotice('Could not open the privacy policy.'))}><Text style={[s.textLink,{textAlign:'center'}]}>View full privacy policy</Text></Pressable><Pressable accessibilityRole="link" onPress={()=>Linking.openURL(APPLE_EULA_URL).catch(()=>setNotice('Could not open the Terms of Use.'))}><Text style={[s.textLink,{textAlign:'center',marginTop:20}]}>Terms of Use (EULA)</Text></Pressable></>}
    </ScrollView></Animated.View>{notice&&<View accessibilityRole="alert" style={[s.modalToast,{backgroundColor:C.card,borderColor:C.line}]}><Text style={[s.body,{color:C.text}]}>{notice}</Text></View>}</KeyboardAvoidingView></Modal>
    {!!notice&&!sheet&&<Pressable onPress={()=>setNotice('')} accessibilityRole="alert" style={[s.toast,{bottom:showCover?30:100,left:20,right:20,backgroundColor:C.card,borderColor:C.line}]}><Icon name="information-circle-outline" color={C.gold}/><Text style={[s.body,{flex:1,color:C.text}]}>{notice}</Text><Icon name="close" size={17}/></Pressable>}
  </SafeAreaView>{!showCover&&<Animated.View pointerEvents={mainAssetsReady?'none':'auto'} style={[StyleSheet.absoluteFill,{backgroundColor:C.bg,opacity:readinessCover}]}/>}</View>}</View><CharityVote key={user?.id||'demo'} refreshKey={user?.id||'demo'} userId={user?.id||null} autoPrompt={!!user&&onboardingState==='complete'&&paidAccess&&!welcomeReveal&&!welcomePreparing&&!showCover&&mainAssetsReady&&!sheet}/>{<WelcomeReveal visible={welcomeReveal} preparing={welcomePreparing} ready={onboardingState==='complete'&&homeLaidOut&&mainAssetsReady} onComplete={()=>{setWelcomePreparing(false);setWelcomeReveal(false);}}/>}</>;
}
export default function App() { return <SafeAreaProvider><AppContent/></SafeAreaProvider>; }
let s = makeStyles();
function makeStyles() { const base = StyleSheet.create({
  todayLayout:{flex:1,justifyContent:'center',paddingBottom:8},todayRestNotice:{minHeight:57,borderRadius:14,backgroundColor:C.raised,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,marginBottom:17,paddingHorizontal:18},todayRestText:{includeFontPadding:false,textAlignVertical:'center',fontSize:17,fontWeight:'700',color:C.text},todayHero:{alignItems:'center',paddingBottom:26},todayRing:{borderWidth:1,alignItems:'center',justifyContent:'center',padding:13},todayRingInner:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#FFFFFF88'},todayPrimary:{minHeight:57,borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:18},todayPrimaryText:{includeFontPadding:false,textAlignVertical:'center',fontSize:17,fontWeight:'700'},todayWeek:{flexDirection:'row',justifyContent:'space-between',marginTop:30,paddingHorizontal:2},todayWeekItem:{alignItems:'center',gap:8},todayWeekLabel:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,fontWeight:'600'},todayWeekCircle:{width:35,height:35,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},todayWeekDate:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,fontWeight:'600'},todayNote:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,lineHeight:18,textAlign:'center',marginTop:22,paddingHorizontal:8},
  appName:{includeFontPadding:false,textAlignVertical:'center',fontSize:20,fontWeight:'700',letterSpacing:-.6,color:C.gold},
  cover:{flex:1,paddingHorizontal:28,paddingBottom:4,justifyContent:'flex-end'},
  coverCenter:{position:'absolute',top:'50%',left:0,right:0,alignItems:'center'},
  coverMark:{height:210,width:210,alignItems:'center',justifyContent:'center',marginBottom:40},
  markBox:{position:'absolute',width:34,height:34,backgroundColor:C.gold,borderRadius:2,transform:[{rotate:'-12deg'}]},
  coverTitle:{includeFontPadding:false,textAlignVertical:'center',fontSize:45,lineHeight:47,color:C.gold,fontWeight:'900',letterSpacing:-1.8,textAlign:'center'},
  getStarted:{height:56,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},
  getStartedText:{includeFontPadding:false,textAlignVertical:'center',fontSize:21,color:'#fff',fontWeight:'600'},
  authOption:{height:44,minHeight:44,borderRadius:22},
  appleButton:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},
  dailyCard:{backgroundColor:C.card,borderRadius:22,padding:24},
  dailyEmblem:{height:110,alignItems:'center',justifyContent:'center'},
  dailyTitle:{includeFontPadding:false,textAlignVertical:'center',fontSize:29,fontWeight:'700',letterSpacing:-.8,color:C.text,textAlign:'center',marginTop:5,marginBottom:27},
  weekCircle:{height:32,width:32,borderRadius:16,backgroundColor:'#191B20',alignItems:'center',justifyContent:'center'},

  app:{flex:1,width:'100%',maxWidth:480,alignSelf:'center'},row:{flexDirection:'row',alignItems:'center'},sidebar:{width:238,borderRightWidth:1,borderRightColor:'#272B23',paddingTop:32,backgroundColor:'#131610'},brandIcon:{width:35,height:40,alignItems:'center',justifyContent:'center'},brandName:{color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:26,fontWeight:'600',letterSpacing:-1.1},brandSub:{color:C.dim,includeFontPadding:false,textAlignVertical:'center',fontSize:7,letterSpacing:1.5,marginTop:4},navItem:{marginHorizontal:15,paddingVertical:15,paddingHorizontal:16,borderRadius:10,flexDirection:'row',alignItems:'center',gap:15},navActive:{backgroundColor:'#292B21'},navText:{color:C.muted,includeFontPadding:false,textAlignVertical:'center',fontSize:14,fontWeight:'500'},sidebarNote:{borderTopWidth:1,borderBottomWidth:1,borderColor:C.line,paddingVertical:24},topbar:{minHeight:96,paddingHorizontal:24,paddingVertical:20,flexDirection:'row',alignItems:'center',justifyContent:'flex-start'},pageTitle:{includeFontPadding:false,textAlignVertical:'center',fontFamily:DISPLAY_FONT,fontSize:34,lineHeight:40,fontWeight:'900',letterSpacing:-.9,color:C.text,flexShrink:1,textAlign:'left'},breadcrumb:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,color:C.muted},demoChip:{flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'#49402D',borderRadius:6,paddingHorizontal:9,paddingVertical:6},content:{paddingHorizontal:24,paddingTop:12,paddingBottom:48},pageHeading:{marginBottom:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{includeFontPadding:false,textAlignVertical:'center',fontSize:10,fontWeight:'600',letterSpacing:1.7,color:C.muted,marginBottom:14},title:{includeFontPadding:false,textAlignVertical:'center',fontSize:32,lineHeight:40,letterSpacing:-1,fontWeight:'700',color:C.text,marginBottom:24},headingMark:{width:52,height:52,alignItems:'center',justifyContent:'center',borderRadius:26,borderWidth:1,borderColor:C.line},columns:{flexDirection:'row',alignItems:'flex-start',gap:22},mainColumn:{flex:1,gap:0,minWidth:0,width:'100%'},sideColumn:{width:304,gap:20},hero:{borderRadius:19,padding:24,borderWidth:1,borderColor:'#3B4632',overflow:'hidden'},heroTitle:{color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:39,lineHeight:42,letterSpacing:-1.2,fontWeight:'500'},body:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,lineHeight:23,color:C.muted},caption:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:C.muted,lineHeight:20},tiny:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,color:C.muted,lineHeight:18},button:{minHeight:54,borderRadius:12,backgroundColor:C.gold,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:13},buttonText:{includeFontPadding:false,textAlignVertical:'center',fontSize:16,color:'#fff',fontWeight:'600'},secondary:{backgroundColor:'#171A20',borderWidth:1,borderColor:'#292D35'},tag:{paddingHorizontal:9,paddingVertical:6,borderRadius:20,flexDirection:'row',alignItems:'center',gap:5},tagText:{includeFontPadding:false,textAlignVertical:'center',fontSize:9,fontWeight:'500'},dot:{width:5,height:5,borderRadius:4},card:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:20,padding:22},statRow:{flexDirection:'row',gap:15,marginTop:18},statCard:{flex:1,padding:19},statNumber:{color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:30,letterSpacing:-1,fontWeight:'600',marginBottom:5},statUnit:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,fontWeight:'400',color:C.muted,letterSpacing:0},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:28,marginBottom:15},sectionTitle:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,color:C.text,fontWeight:'600',letterSpacing:-.2},textLink:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:C.gold,fontWeight:'500'},communityTeaser:{flexDirection:'row',gap:13,alignItems:'center',padding:19},avatarStack:{flexDirection:'row'},avatar:{width:39,height:39,borderRadius:22,alignItems:'center',justifyContent:'center'},avatarText:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,fontWeight:'600',color:C.text},quote:{alignItems:'center',paddingVertical:35},quoteLine:{height:1,width:25,backgroundColor:C.gold,marginBottom:20},quoteText:{color:'#BBC1B2',includeFontPadding:false,textAlignVertical:'center',fontSize:14,fontStyle:'italic',textAlign:'center'},weekLabels:{flexDirection:'row',marginBottom:9},weekLabel:{width:'14.2857%',textAlign:'center',includeFontPadding:false,textAlignVertical:'center',fontSize:9,color:C.dim},calendar:{flexDirection:'row',flexWrap:'wrap'},dayCell:{width:'14.2857%',height:35,alignItems:'center',justifyContent:'center'},dayInner:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},divider:{height:1,backgroundColor:C.line,marginVertical:20},footer:{alignItems:'center',marginTop:26,paddingTop:22,borderTopWidth:1,borderColor:'#272B23',flexDirection:'row',justifyContent:'space-between',gap:10},bottomBar:{borderTopWidth:1,borderColor:C.line,backgroundColor:C.bg},bottomTab:{flex:1,alignItems:'center',justifyContent:'center',paddingTop:14,paddingBottom:10},centerTab:{paddingTop:0,marginTop:-23},todayCircle:{height:64,width:64,borderRadius:32,borderWidth:5,borderColor:C.bg,alignItems:'center',justifyContent:'center'},filter:{paddingVertical:10,paddingHorizontal:18,alignItems:'center',justifyContent:'center',borderRadius:22,backgroundColor:C.card},feedGrid:{flexDirection:'row',flexWrap:'wrap',gap:20,justifyContent:'space-between'},postCard:{padding:0,overflow:'hidden'},postPhoto:{width:'100%',height:300,resizeMode:'cover'},samplePost:{height:240,backgroundColor:'#071326',alignItems:'center',justifyContent:'center'},sampleQuote:{color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:22,textAlign:'center',letterSpacing:-.5,lineHeight:28,marginTop:-12},bigMoney:{color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:40,letterSpacing:-1.5,fontWeight:'500'},transaction:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16,},transactionIcon:{width:37,height:37,borderRadius:12,backgroundColor:C.raised,alignItems:'center',justifyContent:'center'},modalBackdrop:{flex:1,backgroundColor:'#000000BB',alignItems:'center',justifyContent:'flex-end',paddingTop:50,paddingBottom:24},modal:{padding:25,borderRadius:22,borderWidth:1,borderColor:'#30343D',backgroundColor:C.card},input:{backgroundColor:'#07080A',borderWidth:1,borderColor:'#292D35',borderRadius:10,padding:14,color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:15,minHeight:50},photoPlaceholder:{height:220,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:'#30343D',alignItems:'center',justifyContent:'center',marginBottom:18,backgroundColor:'#090C12'},amountChip:{flex:1,borderWidth:1,borderColor:C.line,borderRadius:10,minHeight:67,alignItems:'center',justifyContent:'center'},causeOption:{flexDirection:'row',gap:12,alignItems:'center',padding:12,borderWidth:1,borderColor:C.line,borderRadius:9},noticeInline:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,lineHeight:19,color:C.gold,padding:12,borderRadius:9,backgroundColor:'#11254A'},toast:{position:'absolute',borderWidth:1,borderColor:'#254878',backgroundColor:'#101C30',borderRadius:13,padding:16,flexDirection:'row',alignItems:'center',gap:12,maxWidth:700,alignSelf:'center'},modalToast:{position:'absolute',bottom:10,left:20,right:20,backgroundColor:'#101C30',padding:14,borderRadius:12,borderWidth:1,borderColor:'#254878'},
}); return StyleSheet.create({...base,
  bottomTab:{...base.bottomTab,paddingTop:5,paddingBottom:2},
  commitSuccess:{alignItems:'center',paddingHorizontal:8,paddingTop:20,paddingBottom:6},
  commitMark:{width:86,height:86,borderRadius:43,backgroundColor:C.gold,alignItems:'center',justifyContent:'center',marginBottom:22,shadowColor:C.gold,shadowOpacity:.28,shadowRadius:16,shadowOffset:{width:0,height:7}},
  commitAmount:{includeFontPadding:false,textAlignVertical:'center',fontSize:42,lineHeight:48,fontWeight:'700',letterSpacing:-1.5,color:C.text,marginBottom:9},
  commitCause:{includeFontPadding:false,textAlignVertical:'center',fontSize:19,lineHeight:26,fontWeight:'700',color:C.text,textAlign:'center',marginBottom:18},
  tabLayer:{...StyleSheet.absoluteFill},
  communityBrand:{flexDirection:'row',alignItems:'flex-end',justifyContent:'center',gap:2,height:50},
  communityWordmark:{width:112,height:30},
  communityLayout:{gap:18},
  communitySelector:{flexDirection:'row',borderRadius:15,borderWidth:1.5,borderColor:C.text,backgroundColor:'#F8FBFFEE',padding:4},
  communitySelectorOption:{flex:1,minHeight:43,borderRadius:11,alignItems:'center',justifyContent:'center'},
  communitySelectorSelected:{backgroundColor:C.text},
  communitySelectorText:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,fontWeight:'700',color:C.text},
  communitySelectorSelectedText:{color:'#FFFFFF'},
  communityMembershipHeader:{alignItems:'center',gap:10},
  communityMembershipControls:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:16},
  communityGroupName:{includeFontPadding:false,textAlignVertical:'center',fontFamily:DISPLAY_FONT,fontSize:25,lineHeight:30,fontWeight:'900',letterSpacing:-.5,color:C.text,textAlign:'center'},
  communityManageLink:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,fontWeight:'700',color:C.text},
  communityMembershipActions:{width:'100%',gap:10},
  floatingInviteButton:{position:'absolute',left:24,bottom:22,width:54,height:54,borderRadius:27,backgroundColor:C.text,alignItems:'center',justifyContent:'center',elevation:6,shadowColor:'#062B60',shadowOpacity:.25,shadowRadius:8,shadowOffset:{width:0,height:3}},
  floatingInviteText:{includeFontPadding:false,textAlignVertical:'center',fontSize:32,lineHeight:34,fontWeight:'400',color:'#fff'},
  communityModalOption:{minHeight:55,paddingHorizontal:16,borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:C.card,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  communityModalBackdrop:{justifyContent:'flex-start',paddingTop:96},
  communityCreateHeader:{minHeight:42,alignItems:'center',justifyContent:'center',marginBottom:20},
  communityCreateHeaderText:{includeFontPadding:false,textAlignVertical:'center',fontSize:18,fontWeight:'800',color:C.text,textAlign:'center'},
  communitySuggestions:{marginTop:6,borderWidth:1,borderColor:C.line,borderRadius:10,backgroundColor:C.card,overflow:'hidden'},
  communitySuggestion:{minHeight:44,paddingHorizontal:14,justifyContent:'center',borderBottomWidth:1,borderBottomColor:C.line},
  communitySuggestionText:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:C.text},
  communityModalSelected:{borderColor:C.text,backgroundColor:C.raised},
  communityModalText:{includeFontPadding:false,textAlignVertical:'center',fontSize:16,fontWeight:'600',color:C.text},
  inviteCode:{minHeight:64,borderRadius:12,backgroundColor:C.raised,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},
  inviteCodeText:{includeFontPadding:false,textAlignVertical:'center',fontSize:28,letterSpacing:5,fontWeight:'700',color:C.text},
  communityFeed:{gap:18},
  communityPost:{borderRadius:22,borderWidth:1.5,borderColor:C.text,backgroundColor:'#F8FBFFEE',padding:20,overflow:'hidden'},
  communityPostHeader:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:16},
  communityAvatar:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center'},
  communityAvatarText:{includeFontPadding:false,textAlignVertical:'center',fontSize:17,fontWeight:'700',color:C.text},
  communityName:{includeFontPadding:false,textAlignVertical:'center',fontSize:22,fontWeight:'700',color:C.text},
  communityDate:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:C.muted,marginTop:3},
  communityPhoto:{width:'100%',height:250,borderRadius:16,resizeMode:'cover'},
  communityPostFooter:{paddingTop:16},
  communityCaption:{includeFontPadding:false,textAlignVertical:'center',fontSize:18,lineHeight:25,color:C.text},
  communityLike:{flexDirection:'row',alignItems:'center',gap:8,alignSelf:'flex-start',marginTop:14,paddingVertical:3},
  communityLikes:{includeFontPadding:false,textAlignVertical:'center',fontSize:18,fontWeight:'600',color:C.text},
  communityEmpty:{borderRadius:22,borderWidth:1.5,borderColor:C.text,backgroundColor:'#F8FBFFEE',padding:35},
  accountHome:{gap:18,paddingBottom:30},
  todayNavigationMark:{width:56,height:56,borderRadius:28,backgroundColor:C.text,borderWidth:5,borderColor:C.card,alignItems:'center',justifyContent:'center',marginTop:-22},
  accountHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:56},
  accountSettingsIcon:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  accountIdentity:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:12},
  accountInitials:{width:46,height:46,borderRadius:23,backgroundColor:C.raised,alignItems:'center',justifyContent:'center'},
  accountInitialsText:{fontSize:17,fontWeight:'500',color:C.text,includeFontPadding:false},
  accountNameText:{fontSize:20,fontWeight:'500',color:C.text,flex:1,includeFontPadding:false},
  accountName:{includeFontPadding:false,textAlignVertical:'center',fontSize:30,lineHeight:37,fontWeight:'700',letterSpacing:-.7,color:C.text,textAlign:'center'},
  accountWallet:{borderRadius:24,borderWidth:1.5,borderColor:C.text,backgroundColor:'#F8FBFFEE',padding:25,alignItems:'center'},
  walletLabelRow:{flexDirection:'row',alignItems:'center',gap:5},
  accountWalletLabel:{includeFontPadding:false,textAlignVertical:'center',fontSize:16,fontWeight:'700',color:C.text},
  accountBalance:{includeFontPadding:false,textAlignVertical:'center',fontSize:48,lineHeight:58,fontWeight:'700',letterSpacing:-1.8,color:C.text,marginTop:10},
  accountGoal:{width:'100%',marginTop:18},
  accountGoalLabel:{includeFontPadding:false,textAlignVertical:'center',fontSize:13,fontWeight:'600',color:C.muted},
  accountGoalTrack:{height:8,width:'100%',borderRadius:4,backgroundColor:C.line,overflow:'hidden',marginTop:9},
  accountGoalProgress:{height:'100%',borderRadius:4,backgroundColor:C.gold},
  accountDonate:{marginTop:24,minHeight:52,borderRadius:14,backgroundColor:C.text,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,paddingHorizontal:22},
  accountDonateText:{includeFontPadding:false,textAlignVertical:'center',fontSize:16,fontWeight:'700',color:'#FFFFFF'},
  accountSettings:{minHeight:58,borderRadius:16,borderWidth:1.5,borderColor:C.text,backgroundColor:'#F8FBFFEE',paddingHorizontal:19,flexDirection:'row',alignItems:'center',gap:12},
  accountSettingsText:{includeFontPadding:false,textAlignVertical:'center',fontSize:16,fontWeight:'700',color:C.text,flex:1},
  settingsBack:{width:35,height:35,alignItems:'center',justifyContent:'center',marginRight:5},
  settingsPage:{gap:0,paddingTop:0,paddingBottom:0},
  cancelRenewal:{alignSelf:'center',minHeight:36,justifyContent:'center',marginTop:8,paddingHorizontal:12},
  cancelRenewalText:{includeFontPadding:false,textAlignVertical:'center',fontSize:13,fontWeight:'600',color:C.muted,textDecorationLine:'underline'},
  stripeFeeOption:{flexDirection:'row',alignItems:'flex-start',gap:10,marginTop:16},
  stripeFeeTitle:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,fontWeight:'700',color:C.text,marginBottom:2},
  settingsSection:{overflow:'hidden'},
  settingsSectionTitle:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,fontWeight:'700',color:C.text,paddingHorizontal:18,paddingTop:18,paddingBottom:8},
  settingsInfoRow:{minHeight:55,paddingHorizontal:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:18,borderBottomWidth:1,borderBottomColor:C.line},
  settingsInfoLabel:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:C.muted},
  settingsInfoValue:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,fontWeight:'600',color:C.text,textAlign:'right',flexShrink:1},
  settingsInlineInput:{flex:1,minWidth:0,includeFontPadding:false,textAlignVertical:'center',fontSize:14,fontWeight:'600',color:C.text,textAlign:'right',paddingVertical:4},
  settingsAction:{minHeight:57,paddingHorizontal:0,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:C.line},
  settingsActionText:{includeFontPadding:false,textAlignVertical:'center',fontSize:15,fontWeight:'400',color:C.text,flex:1},
  walletActivityWindow:{minHeight:100,justifyContent:'center'},
  emptyActivity:{minHeight:72,alignItems:'center',justifyContent:'center'},
  todayRestNotice:{...base.todayRestNotice,borderWidth:1,borderColor:C.text,marginBottom:0},
  exemptionNoticeGroup:{position:'relative',zIndex:10,marginBottom:17},
  exemptionInfo:{width:22,height:22,borderRadius:11,borderWidth:1.25,borderColor:C.text,alignItems:'center',justifyContent:'center',marginLeft:2},
  exemptionPopover:{position:'absolute',top:'100%',left:0,right:0,marginTop:10,zIndex:11,backgroundColor:'#F8FBFF',borderWidth:1,borderColor:C.text,borderRadius:14,padding:15},
  exemptionPointer:{position:'absolute',top:-7,right:22,width:13,height:13,backgroundColor:'#F8FBFF',borderTopWidth:1,borderLeftWidth:1,borderColor:C.text,transform:[{rotate:'45deg'}]},
  exemptionPopoverText:{includeFontPadding:false,textAlignVertical:'center',fontSize:13,lineHeight:19,color:C.text,textAlign:'center'},
  todayWeek:{...base.todayWeek,backgroundColor:C.raised,borderWidth:1,borderColor:C.text,borderRadius:14,paddingHorizontal:10,paddingTop:14,paddingBottom:10},
  todayWeekItem:{...base.todayWeekItem,flex:1},
  todayMarker:{includeFontPadding:false,textAlignVertical:'center',height:12,fontSize:9,fontWeight:'800',letterSpacing:.5,color:C.text},
  secondary:{backgroundColor:C.raised,borderWidth:1,borderColor:C.line},
  samplePost:{height:240,backgroundColor:C.raised,alignItems:'center',justifyContent:'center'},
  modal:{padding:25,borderRadius:22,borderWidth:1,borderColor:C.line,backgroundColor:C.card},
  input:{backgroundColor:C.card,borderWidth:1,borderColor:C.line,borderRadius:10,padding:14,color:C.text,includeFontPadding:false,textAlignVertical:'center',fontSize:15,minHeight:50},
  photoPlaceholder:{height:220,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:C.line,alignItems:'center',justifyContent:'center',marginBottom:18,backgroundColor:C.raised},
  noticeInline:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,lineHeight:19,color:C.gold,padding:12,borderRadius:9,backgroundColor:C.raised},
  toast:{position:'absolute',zIndex:100,elevation:100,borderWidth:1,borderColor:C.line,backgroundColor:C.card,borderRadius:13,padding:16,flexDirection:'row',alignItems:'center',gap:12,maxWidth:700,alignSelf:'center'},
  modalToast:{position:'absolute',zIndex:100,elevation:100,bottom:10,left:20,right:20,backgroundColor:C.card,padding:14,borderRadius:12,borderWidth:1,borderColor:C.line},
}); }
