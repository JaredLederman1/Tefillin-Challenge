import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Image, Platform, useWindowDimensions, KeyboardAvoidingView, Switch, AppState, Animated, Easing, AccessibilityInfo } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { requireOptionalNativeModule } from 'expo';
import Svg, { Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeContribution, billingAction, paymentsLive } from './src/payments';
import { supabase, uploadCheckin } from './src/supabase';
import { dateKey, isShabbat, monthDays, money, parseContribution, streak } from './src/challenge';

const C = { bg: '#000000', card: '#101114', raised: '#191B20', line: '#26282F', text: '#FFFFFF', muted: '#9398A4', dim: '#656B77', gold: '#2478FF', green: '#2478FF' };
type Tab = 'Today' | 'Community' | 'Challenge' | 'Wallet' | 'You';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Checkin = { date: string; uri?: string; caption?: string; shared?: boolean };
type Transaction = { id: string; title: string; cents: number; date: string };
type Demo = { name: string; contribution: number; checks: Checkin[]; balance: number; transactions: Transaction[]; reminder: boolean };
type Post = { id: string; name: string; caption: string; date: string; uri?: string; initials: string; color: string };
const tabs: { name: Tab; icon: IconName }[] = [{ name: 'Today', icon: 'sunny-outline' }, { name: 'Community', icon: 'people-outline' }, { name: 'Challenge', icon: 'trophy-outline' }, { name: 'Wallet', icon: 'wallet-outline' }, { name: 'You', icon: 'person-outline' }];
const demoKey = 'tefillin-demo-v1';
function initialDemo(): Demo {
  const today = dateKey();
  return { name: 'Jared', contribution: 1800, checks: monthDays(today).filter(d => d < today && !isShabbat(d)).map(date => ({ date })), balance: 8450, transactions: [
    { id: 'one', title: 'August challenge reward', cents: 2460, date: '2026-08-31' },
    { id: 'two', title: 'July challenge reward', cents: 1990, date: '2026-07-31' },
    { id: 'three', title: 'June challenge reward', cents: 4000, date: '2026-06-30' },
  ], reminder: true };
}
function Icon({ name, size = 22, color = C.muted }: { name: IconName; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color}/>; }
function Button({ label, onPress, secondary = false, icon, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; icon?: IconName; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, { opacity: disabled ? .4 : pressed ? .75 : 1 }]}>{icon && <Icon name={icon} color={secondary ? C.text : C.text} size={19}/>}<Text style={[s.buttonText, secondary && { color: C.text }]}>{label}</Text></Pressable>;
}
function Tag({ label, color = C.green }: { label: string; color?: string }) { return <View style={[s.tag, { backgroundColor: `${color}14` }]}><View style={[s.dot, { backgroundColor: color }]}/><Text style={[s.tagText, { color }]}>{label}</Text></View>; }
function Section({ title, link, onPress }: { title: string; link?: string; onPress?: () => void }) { return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text>{link && <Pressable onPress={onPress} accessibilityRole="button"><Text style={s.textLink}>{link} <Text style={{ fontSize: 17 }}>↗</Text></Text></Pressable>}</View>; }
function Ring({ count, total }: { count: number; total: number }) {
  const size = 142, r = 62, circumference = 2 * Math.PI * r;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><Svg width={size} height={size} style={StyleSheet.absoluteFill}><Circle cx="71" cy="71" r={r} stroke="#22252C" strokeWidth="7" fill="none"/><Circle cx="71" cy="71" r={r} stroke={C.green} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${circumference * Math.min(count / total, 1)} ${circumference}`} transform="rotate(-90 71 71)"/></Svg><Text style={{ color: C.text, fontSize: 37, fontWeight: '500', letterSpacing: -2 }}>{count}<Text style={{ color: C.dim, fontSize: 19, letterSpacing: 0 }}> / {total}</Text></Text><Text style={[s.caption, { marginTop: 3 }]}>days wrapped</Text></View>;
}
function BrandLogo({ size = 64 }: { size?: number }) {
  return <Image source={require('./assets/brand.png')} accessibilityLabel="Levav" style={{ width: size, height: size }} resizeMode="contain"/>;
}
function PageTransition({ children }: { children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!mounted || reduced) return;
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }).catch(() => {});
    return () => { mounted = false; progress.stopAnimation(); };
  }, [progress]);
  return <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>{children}</Animated.View>;
}
function AppContent() {
  const { width } = useWindowDimensions();
  const [entered, setEntered] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {}); }, []);
  const [tab, setTab] = useState<Tab>('Today');
  const [demo, setDemo] = useState<Demo>(initialDemo);
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState(dateKey());
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [liveChecks, setLiveChecks] = useState<Checkin[]>([]);
  const [liveBalance, setLiveBalance] = useState(0);
  const [liveTransactions, setLiveTransactions] = useState<Transaction[]>([]);
  const [livePosts, setLivePosts] = useState<Post[]>([]);
  const [sheet, setSheet] = useState<'photo' | 'contribution' | 'transfer' | 'auth' | 'rules' | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [recurringConsent, setRecurringConsent] = useState(false);
  const [membership, setMembership] = useState<any>(null);
  const [enrolledMonths, setEnrolledMonths] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<{id:string;name:string}[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [sharePhoto, setSharePhoto] = useState(true);
  const [amount, setAmount] = useState('18');
  const donationAttempt = useRef<{id:string;cause:string;cents:number}|null>(null);
  const [donations, setDonations] = useState<{id:string;cause_name:string;amount_cents:number;status:string;fulfillment_reference?:string}[]>([]);
  const [cause, setCause] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [signup, setSignup] = useState(true);
  const [liked, setLiked] = useState<string[]>([]);
  const [feedFilter, setFeedFilter] = useState<'Everyone' | 'My wraps'>('Everyone');
  const isDemo = !user;
  const checks = isDemo ? demo.checks : liveChecks;
  const balance = isDemo ? demo.balance : liveBalance;
  const contribution = isDemo ? demo.contribution : (membership?.amount_cents || profile?.contribution_cents || 1800);
  const firstName = isDemo ? demo.name : (profile?.display_name || user?.user_metadata?.display_name || 'Friend');
  const timeZone = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const days = monthDays(today);
  const required = days.filter(d => !isShabbat(d));
  const monthChecks = checks.filter(c => c.date.startsWith(today.slice(0, 7)) && !isShabbat(c.date));
  const completed = checks.some(c => c.date === today);
  const rest = isShabbat(today);
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long' });
  const streakCount = streak(checks.map(c => c.date), today);
  const missed = required.some(d => d < today && !checks.some(c => c.date === d));
  const transactions = isDemo ? demo.transactions : liveTransactions;

  useEffect(() => { AsyncStorage.getItem(demoKey).then(raw => { if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed.checks) && Array.isArray(parsed.transactions) && Number.isFinite(parsed.balance)) setDemo(parsed); } catch {} } }).finally(() => setHydrated(true)); }, []);
  useEffect(() => { if (hydrated) AsyncStorage.setItem(demoKey, JSON.stringify(demo)).catch(() => setNotice('Your device could not save this demo session.')); }, [demo, hydrated]);
  useEffect(() => { const update = () => setToday(dateKey(new Date(), timeZone)); update(); const timer = setInterval(update, 60000); const sub = AppState.addEventListener('change', update); return () => { clearInterval(timer); sub.remove(); }; }, [timeZone]);
  useEffect(() => { if (!supabase) return; supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null)); const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null)); return () => data.subscription.unsubscribe(); }, []);
  useEffect(() => { if (user) refreshLive().catch(e => setNotice(e.message)); else { setProfile(null); setLiveChecks([]); setLiveBalance(0); setLivePosts([]); } }, [user?.id, tab]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 7000); return () => clearTimeout(timer); }, [notice]);
  async function refreshLive() {
    if (!supabase || !user) return;
    const [p, c, l, f] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('checkins').select('*').eq('user_id', user.id).order('checkin_date', { ascending: false }),
      supabase.from('ledger').select('*').eq('livemode', paymentsLive).eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('checkins').select('*, profiles(display_name)').eq('shared', true).order('created_at', { ascending: false }).limit(30),
    ]);
    for (const result of [p,c,l,f]) if (result.error) throw result.error;
    const billing = await billingAction('status');
    setMembership(billing.membership); setEnrolledMonths((billing.enrollments || []).map((e:any)=>e.month)); setRecipients(billing.recipients || []); setDonations(billing.donations || []);
    setProfile(p.data);
    const paths = [...new Set([...(c.data || []), ...(f.data || [])].map(row => row.photo_path))];
    const urls = paths.length ? await supabase.storage.from('checkins').createSignedUrls(paths, 3600) : null;
    const byPath = new Map(urls?.data?.map(row => [row.path, row.signedUrl]) || []);
    setLiveChecks((c.data || []).map(row => ({ date: row.checkin_date, uri: byPath.get(row.photo_path) || undefined, caption: row.caption, shared: row.shared })));
    setLiveBalance((l.data || []).reduce((sum, row) => sum + row.amount_cents, 0));
    setLiveTransactions((l.data || []).map(row => ({ id: row.id, title: row.description, cents: row.amount_cents, date: row.created_at.slice(0, 10) })));
    setLivePosts((f.data || []).map(row => ({ id: row.id, name: row.profiles?.display_name || 'Community member', caption: row.caption, date: row.checkin_date, uri: byPath.get(row.photo_path) || undefined, initials: (row.profiles?.display_name || 'M').slice(0, 2).toUpperCase(), color: C.green })));
  }
  async function pickPhoto(camera: boolean) {
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice(`Allow ${camera ? 'camera' : 'photo library'} access to add your daily wrap.`); return; }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: .75, base64: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const asset = result.assets[0];
        const context = ImageManipulator.manipulate(asset.uri);
        context.resize(asset.width >= asset.height ? { width: isDemo ? 640 : 1200 } : { height: isDemo ? 800 : 1500 });
        const image = await context.renderAsync();
        const normalized = await image.saveAsync({ compress: .72, format: SaveFormat.JPEG, base64: true });
        setPhoto(`data:image/jpeg;base64,${normalized.base64}`); setSheet('photo');
      }
    } catch (e: any) { setNotice(e.message || 'Could not open the camera. Try choosing a photo.'); }
  }
  async function postPhoto() {
    if (!photo || busy) return;
    if (rest || completed) { setNotice(rest ? 'Shabbat is a rest day. No check-in needed.' : 'You have already wrapped today.'); return; }
    setBusy(true);
    try {
      if (isDemo) {
        setDemo(d => ({ ...d, checks: [...d.checks.filter(c => c.date !== today), { date: today, uri: photo, caption, shared: sharePhoto }].map(c => c.date < today.slice(0, 7) + '-01' ? { ...c, uri: undefined } : c) }));
      } else { await uploadCheckin(user.id, photo, caption, sharePhoto); await refreshLive(); }
      setSheet(null); setPhoto(null); setCaption(''); setNotice(isDemo ? 'Demo wrap saved. One more day of showing up.' : 'Your wrap is posted. One more day of showing up.');
    } catch (e: any) { setNotice(e.message); } finally { setBusy(false); }
  }
  async function saveContribution() {
    try {
      const cents = parseContribution(amount);
      if (!isDemo) {
        if (busy) return;
        setBusy(true);
        if (!recurringConsent) throw new Error('Accept monthly billing before subscribing.');
        if (await subscribeContribution(cents)) { setSheet(null); setNotice(paymentsLive ? 'Payment submitted. Enrollment appears after server confirmation.' : 'Test subscription submitted. No real funds charged.'); await refreshLive(); }
        return;
      }
      setDemo(d => ({ ...d, contribution: cents })); setSheet(null); setNotice('Demo contribution updated. No payment was taken.');
    } catch (e: any) { setNotice(e.message); } finally { setBusy(false); }
  }
  async function moveMoney() {
    if (busy) return;
    try {
      setBusy(true);
      if (!cause || balance <= 0) throw new Error('Choose a cause and an available balance.');
      if (!isDemo) {
        if (!recipients.some(r => r.id === cause)) throw new Error('Choose an available cause.');
        if (!donationAttempt.current || donationAttempt.current.cause !== cause || donationAttempt.current.cents !== balance) {
          const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); });
          donationAttempt.current = {id, cause, cents:balance};
        }
        const attempt=donationAttempt.current;
        const {donation}=await billingAction('donate', {amountCents:attempt.cents, requestId:attempt.id, causeId:attempt.cause});
        setSheet(null); setLiveBalance(0);
        setNotice(`${money(donation.amount_cents)} committed to ${donation.cause_name}. Levav will make the donation on your behalf.`);
        await refreshLive(); donationAttempt.current=null; return;
      }
      setDemo(d => ({ ...d, balance: 0, transactions: [{ id: String(Date.now()), title: `Demo donation request · ${cause}`, cents: -d.balance, date: today }, ...d.transactions] }));
      setSheet(null); setNotice('Demo donation request recorded. No real money moved.');
    } catch (e: any) { setNotice(e.message); } finally { setBusy(false); }
  }
  async function signInWithApple() {
    if (busy) return;
    if (!appleAvailable) { setNotice('Apple signup is available in the iPhone app.'); return; }
    if (!supabase) { setNotice('Account signup is not connected yet.'); return; }
    setBusy(true);
    try {
      // Existing development clients may predate the optional Apple crypto dependency.
      // Never evaluate expo-crypto until its native module is present.
      if (!requireOptionalNativeModule('ExpoCrypto')) {
        throw new Error('Apple sign-in needs an updated development build. Use email signup or Preview app for now.');
      }
      const Crypto = await import('expo-crypto');
      const nonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashedNonce,
      });
      if (!credential.identityToken) throw new Error('Apple did not return a sign-in token.');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
      if (error) throw error;
      setEntered(true);
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') setNotice(error.message || 'Apple signup could not finish.');
    } finally { setBusy(false); }
  }
  async function authenticate() {
    if (!supabase) { setNotice('Live signup needs the Supabase publishable key. You can explore the demo now.'); return; }
    if (!email.includes('@') || password.length < 8 || (signup && !name.trim())) { setNotice('Enter your name, a valid email, and a password of at least 8 characters.'); return; }
    setBusy(true);
    try {
      const { data, error } = signup ? await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } }) : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setSheet(null); setPassword(''); setNotice(data.session ? 'Welcome to your daily practice.' : 'Check your email to confirm your account, then sign in.');
    } catch (e: any) { setNotice(e.message); } finally { setBusy(false); }
  }
  const openContribution = () => { setRecurringConsent(false); setAmount(String(contribution / 100)); setSheet('contribution'); };
  const openTransfer = () => { setCause(isDemo?'Jewish community fund':recipients.length===1?recipients[0].id:''); setSheet('transfer'); };
  const localPosts: Post[] = checks.filter(c => c.uri && c.shared).map(c => ({ id: c.date, name: `${firstName} (you)`, caption: c.caption || 'Another day. Another connection.', date: c.date, uri: c.uri, initials: firstName.slice(0, 2).toUpperCase(), color: C.gold }));
  const samplePosts: Post[] = [
    { id: 'd1', name: 'David S.', initials: 'DS', color: '#B9CBA5', caption: 'A few quiet minutes before the day begins. Grateful for this community.', date: today },
    { id: 'd2', name: 'Ari L.', initials: 'AL', color: '#D0B598', caption: 'Travel day, same commitment. Showing up wherever life takes me.', date: today },
    { id: 'd3', name: 'Moshe K.', initials: 'MK', color: '#A7BAC4', caption: 'Small actions, every day. That’s where the change happens.', date: today },
  ];
  const posts = feedFilter === 'My wraps' ? localPosts : isDemo ? [...localPosts, ...samplePosts] : livePosts;
  const renderCalendar = () => <View><View style={s.weekLabels}>{['S','M','T','W','T','F','S'].map((d,i) => <Text key={i} style={s.weekLabel}>{d}</Text>)}</View><View style={s.calendar}>{Array.from({ length: new Date(`${days[0]}T12:00:00Z`).getUTCDay() }, (_, i) => <View key={`blank${i}`} style={s.dayCell}/>)}{days.map(d => {
    const checked = checks.some(c => c.date === d), shabbat = isShabbat(d), active = d === today;
    return <View key={d} style={s.dayCell}><View accessibilityLabel={`${d}${shabbat ? ', Shabbat' : checked ? ', wrapped' : active ? ', today' : ''}`} style={[s.dayInner, checked && { backgroundColor: '#16396B' }, active && { borderWidth: 1, borderColor: C.gold }, shabbat && { backgroundColor: '#14161A' }]}>{checked ? <Icon name="checkmark" color={C.green} size={17}/> : shabbat ? <Icon name="moon-outline" size={13} color={C.dim}/> : <Text style={{ color: active ? C.gold : d < today ? C.muted : C.dim, fontSize: 12 }}>{Number(d.slice(-2))}</Text>}</View></View>;
  })}</View><View style={[s.row, { gap: 15, marginTop: 15 }]}><View style={[s.row,{gap:5}]}><View style={[s.dot,{backgroundColor:C.green}]}/><Text style={s.tiny}>Wrapped</Text></View><View style={[s.row,{gap:5}]}><Icon name="moon-outline" size={11}/><Text style={s.tiny}>Shabbat · rest day</Text></View></View></View>;

  const showCover = !user && !entered;
  const todayScreen = <>
    <Text style={s.title}>{new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</Text>
    <View style={s.dailyCard}>
      
      <Text style={s.dailyTitle}>{rest ? 'Shabbat shalom.' : completed ? 'Mission complete.' : 'Show up.'}</Text>
      <Button label={rest ? 'Rest day' : completed ? 'View wrap' : 'Post your wrap'} icon={completed ? 'checkmark' : 'camera-outline'} disabled={rest} onPress={() => { if (completed) { setFeedFilter('My wraps'); setTab('Community'); } else { setPhoto(null); setSheet('photo'); } }}/>
    </View>
    <View style={[s.card,s.row,{marginTop:18,gap:12}]}><Icon name="flame" color={C.gold} size={25}/><Text style={{color:C.text,fontSize:22,fontWeight:'600'}}>{streakCount} day streak</Text></View>
    <Section title="Calendar"/>
    <View style={s.card}>{renderCalendar()}</View>
  </>;
  const challengeScreen = <>
    <Text style={s.title}>Challenge</Text>
    {!isDemo&&<Text style={[s.caption,{marginBottom:18}]}>{paymentsLive?'':'Test mode · '}{enrolledMonths.includes(today.slice(0,7)+'-01')?'Enrolled this month':membership?.cancel_at_period_end?'Renewal canceled':membership?.status==='active'?(enrolledMonths.some(m=>m>today)?'Next month enrolled':'Payment confirmation pending'):membership?`Membership: ${membership.status}`:'No paid membership'}</Text>}
    <View style={s.card}><View style={[s.row,{justifyContent:'space-between'}]}><Text style={s.sectionTitle}>{monthName}</Text><Text style={{color:C.gold,fontSize:15}}>{monthChecks.length}/{required.length}</Text></View><View style={{alignItems:'center',paddingVertical:24}}><Ring count={monthChecks.length} total={required.length}/></View>{renderCalendar()}</View>
    <Section title="Monthly contribution"/>
    <Pressable style={[s.card,s.row,{justifyContent:'space-between'}]} onPress={openContribution}><Text style={s.statNumber}>{money(contribution)}</Text><Icon name="chevron-forward"/></Pressable>
    <View style={{marginTop:20}}><Button label="Challenge rules" secondary onPress={()=>setSheet('rules')}/></View>
  </>;
  const communityScreen = <>
    <Text style={s.title}>Community</Text>
    <View style={[s.row,{gap:8,marginBottom:20}]}>{(['Everyone','My wraps'] as const).map(f=><Pressable key={f} onPress={()=>setFeedFilter(f)} style={[s.filter,feedFilter===f&&{backgroundColor:C.gold}]}><Text style={{fontSize:14,fontWeight:'600',color:feedFilter===f?'#fff':C.muted}}>{f}</Text></Pressable>)}</View>
    <View style={{gap:16}}>{posts.length===0?<View style={[s.card,{alignItems:'center',padding:35}]}><Icon name="camera-outline" size={36} color={C.gold}/><Text style={[s.sectionTitle,{marginVertical:22}]}>No wraps yet.</Text><Button label="Post a wrap" onPress={()=>setSheet('photo')} disabled={completed||rest}/></View>:posts.map(post=><View key={post.id} style={[s.card,s.postCard]}><View style={[s.row,{gap:12,padding:18}]}><View style={[s.avatar,{backgroundColor:'#13264B'}]}><Text style={s.avatarText}>{post.initials}</Text></View><Text style={[s.body,{color:C.text,flex:1,fontWeight:'600'}]}>{post.name}</Text>{!post.uri&&<Text style={s.caption}>Demo</Text>}</View>{post.uri?<Image source={{uri:post.uri}} style={s.postPhoto} accessibilityLabel={`${post.name}'s wrap`}/>:<View style={s.samplePost}><BrandLogo size={110}/></View>}<View style={{padding:18}}><Text style={[s.body,{color:C.text}]}>{post.caption}</Text><Pressable onPress={()=>{if(!isDemo){setNotice('Reactions are coming soon.');return;}setLiked(v=>v.includes(post.id)?v.filter(id=>id!==post.id):[...v,post.id]);}} accessibilityRole="button" accessibilityLabel="Encourage" style={{marginTop:16,alignSelf:'flex-start',padding:4}}><Icon name={liked.includes(post.id)?'heart':'heart-outline'} color={liked.includes(post.id)?C.gold:C.muted}/></Pressable></View></View>)}</View>
  </>;
  const walletScreen = <>
    <Text style={s.title}>Wallet</Text>
    <View style={[s.card,{padding:25}]}><Text style={s.caption}>{isDemo?'Demo giving balance':'Giving balance'}</Text><Text style={[s.bigMoney,{fontSize:52,marginVertical:22}]}>{money(balance)}</Text><Button label="Donate" onPress={openTransfer} disabled={balance<=0}/></View>
    {!isDemo&&donations.length>0&&<><Section title="Donations"/><View style={s.card}>{donations.map(d=><View key={d.id} style={{paddingVertical:12,gap:7}}><Text style={s.body}>{d.cause_name} · {money(d.amount_cents)}</Text><Text style={{color:C.gold}}>{d.status==='fulfilled'?'Donated':d.status==='canceled'?'Canceled · balance returned':'Pending donation'}</Text>{d.status==='fulfilled'&&<Text selectable style={s.body}>Confirmation: {d.fulfillment_reference}</Text>}</View>)}</View></>}
    <Section title="Activity"/>
    <View style={s.card}>{transactions.length?transactions.map((tx,i)=><View key={tx.id} style={[s.transaction,i>0&&{borderTopWidth:1,borderTopColor:C.line}]}><Icon name={tx.cents>0?'arrow-down-outline':'arrow-up-outline'} color={C.gold} size={20}/><Text style={[s.body,{color:C.text,flex:1}]}>{tx.title}</Text><Text style={[s.body,{color:C.text}]}>{tx.cents>0?'+':''}{money(tx.cents)}</Text></View>):<Text style={s.body}>No transactions yet.</Text>}</View>
    <Text style={[s.caption,{marginTop:20}]}>{isDemo?'Demo only. No real money moves.':'Levav makes donations on your behalf. Completed donations appear here.'}</Text>
  </>;
  const youScreen = <>
    <Text style={s.title}>You</Text>
    <View style={[s.card,s.row,{gap:16}]}><View style={[s.avatar,{width:54,height:54,borderRadius:27,backgroundColor:'#11254A'}]}><Text style={[s.avatarText,{fontSize:22}]}>{firstName.slice(0,1)}</Text></View><Text style={[s.sectionTitle,{fontSize:22}]}>{firstName}</Text></View>
    <View style={{gap:12,marginTop:22}}><Button label="Monthly contribution" secondary onPress={openContribution}/><Button label="Rules & privacy" secondary onPress={()=>setSheet('rules')}/>{isDemo?<><Button label="Create account" onPress={()=>{setSignup(true);setSheet('auth');}}/><Button label="Back to welcome" secondary onPress={()=>setEntered(false)}/><Button label="Reset demo" secondary onPress={()=>{setDemo(initialDemo());setNotice('Demo reset.');}}/></>:<Button label="Sign out" secondary onPress={async()=>{await supabase!.auth.signOut();setEntered(false);}}/>}</View>
  </>;
  return <SafeAreaView style={{flex:1,backgroundColor:'#000'}} edges={['top','left','right']}><StatusBar style="light"/><View style={s.app}>
    {showCover ? <SafeAreaView edges={['bottom']} style={s.cover}>
      <View style={s.coverCenter}><View style={s.coverMark}><BrandLogo size={210}/></View><Text style={s.coverTitle}>Levav</Text></View>
      <View style={{gap:12}}>{appleAvailable?<AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE} cornerRadius={12} style={{height:54,width:'100%'}} onPress={signInWithApple}/>:<Pressable accessibilityRole="button" onPress={signInWithApple} style={s.appleButton}><Icon name="logo-apple" color="#000" size={22}/><Text style={{fontSize:17,color:'#000',fontWeight:'600'}}>Sign up with Apple</Text></Pressable>}<Button label="Sign up with email" onPress={()=>{setSignup(true);setSheet('auth');}}/><Pressable onPress={()=>{setSignup(false);setSheet('auth');}} style={{alignItems:'center',padding:13}}><Text style={{color:C.text,fontSize:16}}>Sign in</Text></Pressable><Pressable onPress={()=>setEntered(true)} style={{alignItems:'center',padding:9}}><Text style={{color:C.muted,fontSize:14}}>Preview app</Text></Pressable></View>
    </SafeAreaView> : <>
      <View style={s.topbar}><BrandLogo size={52}/></View>
      <PageTransition key={tab}><ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>{tab==='Today'?todayScreen:tab==='Challenge'?challengeScreen:tab==='Community'?communityScreen:tab==='Wallet'?walletScreen:youScreen}</ScrollView></PageTransition>
      <SafeAreaView edges={['bottom']} style={s.bottomBar}><View style={[s.row,{justifyContent:'space-around'}]}>{tabs.map(item=><Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.name} accessibilityState={{selected:tab===item.name}} onPress={()=>setTab(item.name)} style={s.bottomTab}><Icon name={item.icon} size={24} color={tab===item.name?C.gold:C.dim}/><Text style={{fontSize:11,color:tab===item.name?C.gold:C.dim,marginTop:6,fontWeight:'500'}}>{item.name}</Text></Pressable>)}</View></SafeAreaView>
    </>}
    </View>
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={()=>!busy&&setSheet(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={()=>!busy&&setSheet(null)} accessibilityLabel="Close dialog"/><View style={[s.modal,{maxHeight:'90%',width:Math.min(width-32,480)}]}><View style={[s.row,{justifyContent:'space-between',marginBottom:24}]}><Text style={s.sectionTitle}>{sheet==='photo'?'Your daily moment':sheet==='contribution'?'Make your commitment':sheet==='transfer'?'Give to a cause':sheet==='auth'?(signup?'Welcome to the community':'Welcome back'):'The challenge, simply.'}</Text><Pressable onPress={()=>!busy&&setSheet(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}><Icon name="close"/></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    {sheet==='photo'&&<>{rest||completed?<View><Text style={[s.body,{marginBottom:20}]}>{rest?'Shabbat shalom. No photo needed today.':'You already posted today. Come back tomorrow for your next wrap.'}</Text><Button label="Back to today" onPress={()=>{setTab('Today');setSheet(null);}}/></View>:<>{photo?<Image source={{uri:photo}} style={{width:'100%',height:280,borderRadius:16,marginBottom:18}}/>:<View style={s.photoPlaceholder}><Icon name="camera-outline" size={44} color={C.gold}/><Text style={[s.body,{textAlign:'center',marginTop:15}]}>Add your photo</Text></View>}<View style={[s.row,{gap:10,marginBottom:18}]}><View style={{flex:1}}><Button label="Camera" icon="camera-outline" secondary onPress={()=>pickPhoto(true)}/></View><View style={{flex:1}}><Button label="Choose photo" secondary onPress={()=>pickPhoto(false)}/></View></View><TextInput style={[s.input,{minHeight:80}]} placeholder="A thought from today (optional)" placeholderTextColor={C.dim} value={caption} onChangeText={setCaption} multiline maxLength={500}/><View style={[s.row,{justifyContent:'space-between',marginVertical:20}]}><View style={{flex:1}}><Text style={[s.body,{color:C.text}]}>Share with the community</Text></View><Switch value={sharePhoto} onValueChange={setSharePhoto} trackColor={{false:C.line,true:'#2478FF'}} thumbColor={C.text}/></View><Button label={busy?'Posting…':isDemo?'Save demo wrap':'Post today’s wrap'} onPress={postPhoto} disabled={!photo||busy}/><Text style={[s.tiny,{marginTop:15,textAlign:'center'}]}>{isDemo?'Demo photos are saved on this device only.':'Members can see shared photos. Private photos stay yours.'}</Text></>}</>}
    {sheet==='contribution'&&<><View style={[s.row,{gap:10,marginBottom:20}]}>{['5','18','36','54'].map(v=><Pressable key={v} onPress={()=>setAmount(v)} style={[s.amountChip,amount===v&&{borderColor:C.gold,backgroundColor:'#11254A'}]}><Text style={{color:amount===v?C.gold:C.text,fontSize:18,fontWeight:'500'}}>${v}</Text>{v==='18'&&<Text style={{color:C.gold,fontSize:8,marginTop:4}}>RECOMMENDED</Text>}</Pressable>)}</View><Text style={[s.caption,{marginBottom:9}]}>Monthly contribution (USD)</Text><TextInput accessibilityLabel="Monthly contribution in dollars" style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/><Text style={[s.tiny,{marginVertical:18}]}>$5 minimum. For the demo, changes apply immediately. Paid challenges will begin on the first of the next month.</Text>{!isDemo&&<View style={[s.row,{gap:12,marginBottom:18}]}><Switch accessibilityLabel="Agree to monthly billing" value={recurringConsent} onValueChange={setRecurringConsent}/><Text style={[s.caption,{flex:1}]}>I agree to {money(Math.round(Number(amount||0)*100))} monthly, starting now. Each paid invoice funds the next calendar month. Cancel renewal anytime.</Text></View>}<Button label={busy?'Opening checkout…':isDemo?'Set demo contribution':paymentsLive?'Subscribe':'Subscribe in test mode'} disabled={busy||(!isDemo&&!recurringConsent)} onPress={saveContribution}/>{!isDemo&&membership&&<Button label={membership.cancel_at_period_end?'Renewal canceled':'Cancel renewal'} disabled={busy||membership.cancel_at_period_end} secondary onPress={async()=>{try{setBusy(true);await billingAction('cancel');await refreshLive();setNotice('Renewal canceled. Your paid month remains enrolled.');}catch(e:any){setNotice(e.message);}finally{setBusy(false);}}}/>}<Text style={[s.tiny,{marginTop:14,textAlign:'center'}]}>{isDemo?'No charge will be made.':paymentsLive?'Payment is verified before enrollment. Processing fees are deducted from the pool.':'Stripe test mode. Test enrollments and balances stay separate.'}</Text></>}
    {sheet==='transfer'&&<><Text style={[s.bigMoney,{marginBottom:20}]}>{money(balance)}</Text><View style={{gap:8,marginBottom:20}}>{(isDemo?[{id:'Jewish community fund',name:'Jewish community fund'},{id:'Food assistance',name:'Food assistance'},{id:'Jewish education',name:'Jewish education'}]:recipients).map(r=><Pressable key={r.id} accessibilityRole="radio" accessibilityState={{checked:cause===r.id}} style={[s.causeOption,cause===r.id&&{borderColor:C.gold}]} onPress={()=>setCause(r.id)}><Icon name={cause===r.id?'radio-button-on':'radio-button-off'} color={cause===r.id?C.gold:C.dim} size={18}/><Text style={s.body}>{r.name}</Text></Pressable>)}</View>{!isDemo&&recipients.length===0&&<Text style={s.body}>This month’s cause will be announced soon.</Text>}<Text style={[s.body,{marginBottom:20}]}>Your full available balance will be committed to this cause. Levav will submit the donation and record confirmation here.</Text><Button label={busy?'Submitting…':isDemo?'Simulate donation':paymentsLive?'Donate full balance':'Donate test balance'} disabled={busy||!cause||balance<=0} onPress={moveMoney}/>{!isDemo&&!paymentsLive&&<Text style={s.body}>Test funds only.</Text>}</>}

    {sheet==='auth'&&<>{!supabase&&<Text style={[s.noticeInline,{marginBottom:20}]}>Live signup is being connected. The full demo is ready to explore.</Text>}{signup&&<TextInput accessibilityLabel="Your first name" placeholder="Your first name" placeholderTextColor={C.dim} style={[s.input,{marginBottom:12}]} value={name} onChangeText={setName} autoComplete="given-name"/>}<TextInput accessibilityLabel="Email address" placeholder="Email address" placeholderTextColor={C.dim} style={[s.input,{marginBottom:12}]} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"/><TextInput accessibilityLabel="Password" placeholder="Password (8+ characters)" placeholderTextColor={C.dim} style={[s.input,{marginBottom:20}]} value={password} onChangeText={setPassword} secureTextEntry autoComplete={signup?'new-password':'current-password'}/><Button label={busy?'Please wait…':signup?'Create account':'Sign in'} disabled={busy} onPress={authenticate}/><Pressable onPress={()=>setSignup(!signup)} style={{padding:20,alignItems:'center'}}><Text style={s.textLink}>{signup?'Already a member? Sign in':'New here? Create an account'}</Text></Pressable></>}
    {sheet==='rules'&&<>{[{title:'A full month of intention',body:'Choose $5 or more; $18 is recommended. A paid challenge begins on the first day of a calendar month. Everyone contributes before the month starts.'},{title:'One photo, every required day',body:'Post a photo of yourself wearing tefillin each day, using your account’s timezone. Saturdays are excluded. Only one check-in per date is accepted; past dates cannot be backfilled.'},{title:'Your share of the pool',body:'Miss one required day and your contribution goes to the reward pool. After payment processing fees are deducted from the full pool, finishers divide the remaining money in proportion to their contributions. Fees may reduce the amount of principal returned.'},{title:'Rewards, over time',body:'Your returned contributions and earnings stay in your giving balance until you donate. Donations commit the full available balance; Levav fulfills them on your behalf. Pending challenge contributions cannot be donated before settlement. The proposed no-finisher rule is to roll the forfeited pool forward; this needs confirmation before real-money launch. Processing fees are deducted before distribution. Refunds and disputes pause affected funds for review.'},{title:'Calendar details',body:'This preview implements the requested Saturday exemption only. Holiday, Chol Hamoed, and daylight cutoff rules need to be finalized before live challenges.'},{title:'Photo privacy',body:'Demo photos stay in local device storage. With a connected account, photos are stored in a private Supabase bucket. Shared photos are visible to signed-in members through temporary links. Photo authenticity review is not yet automated.'},{title:'About this preview',body:'The app clearly labels test-mode payments. Live mode charges real money after you accept monthly billing. Enrollment requires server-confirmed payment. Donation requests remain pending until Levav records fulfillment. These confirmations are not tax receipts.'}].map(item=><View key={item.title} style={{marginBottom:23}}><Text style={[s.body,{color:C.text,fontWeight:'600',marginBottom:7}]}>{item.title}</Text><Text style={s.body}>{item.body}</Text></View>)}</>}
    </ScrollView></View>{notice&&<View accessibilityRole="alert" style={s.modalToast}><Text style={[s.body,{color:C.text}]}>{notice}</Text></View>}</KeyboardAvoidingView></Modal>
    {!!notice&&!sheet&&<Pressable onPress={()=>setNotice('')} accessibilityRole="alert" style={[s.toast,{bottom:showCover?30:100,left:20,right:20}]}><Icon name="information-circle-outline" color={C.gold}/><Text style={[s.body,{flex:1,color:C.text}]}>{notice}</Text><Icon name="close" size={17}/></Pressable>}
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><AppContent/></SafeAreaProvider>; }
const s = StyleSheet.create({
  appName:{fontSize:20,fontWeight:'700',letterSpacing:-.6,color:C.gold},
  cover:{flex:1,paddingHorizontal:28,paddingBottom:20},
  coverCenter:{flex:1,justifyContent:'center',alignItems:'center',paddingVertical:28},
  coverMark:{height:210,width:210,alignItems:'center',justifyContent:'center',marginBottom:40},
  markBox:{position:'absolute',width:34,height:34,backgroundColor:C.gold,borderRadius:2,transform:[{rotate:'-12deg'}]},
  coverTitle:{fontSize:45,lineHeight:47,color:C.gold,fontWeight:'900',letterSpacing:-1.8,textAlign:'center'},
  appleButton:{height:54,backgroundColor:'#fff',borderRadius:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8},
  dailyCard:{backgroundColor:C.card,borderRadius:22,padding:24},
  dailyEmblem:{height:110,alignItems:'center',justifyContent:'center'},
  dailyTitle:{fontSize:29,fontWeight:'700',letterSpacing:-.8,color:C.text,textAlign:'center',marginTop:5,marginBottom:27},
  weekCircle:{height:32,width:32,borderRadius:16,backgroundColor:'#191B20',alignItems:'center',justifyContent:'center'},

  app:{flex:1,width:'100%',maxWidth:480,alignSelf:'center'},row:{flexDirection:'row',alignItems:'center'},sidebar:{width:238,borderRightWidth:1,borderRightColor:'#272B23',paddingTop:32,backgroundColor:'#131610'},brandIcon:{width:35,height:40,alignItems:'center',justifyContent:'center'},brandName:{color:C.text,fontSize:26,fontWeight:'600',letterSpacing:-1.1},brandSub:{color:C.dim,fontSize:7,letterSpacing:1.5,marginTop:4},navItem:{marginHorizontal:15,paddingVertical:15,paddingHorizontal:16,borderRadius:10,flexDirection:'row',alignItems:'center',gap:15},navActive:{backgroundColor:'#292B21'},navText:{color:C.muted,fontSize:14,fontWeight:'500'},sidebarNote:{borderTopWidth:1,borderBottomWidth:1,borderColor:C.line,paddingVertical:24},topbar:{height:70,paddingHorizontal:24,alignItems:'center',justifyContent:'center'},breadcrumb:{fontSize:12,color:C.muted},demoChip:{flexDirection:'row',alignItems:'center',gap:6,borderWidth:1,borderColor:'#49402D',borderRadius:6,paddingHorizontal:9,paddingVertical:6},content:{paddingHorizontal:24,paddingTop:12,paddingBottom:30},pageHeading:{marginBottom:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},eyebrow:{fontSize:10,fontWeight:'600',letterSpacing:1.7,color:C.muted,marginBottom:14},title:{fontSize:32,lineHeight:40,letterSpacing:-1,fontWeight:'700',color:C.text,marginBottom:24},subtitle:{fontSize:14,color:C.muted,marginTop:14,lineHeight:22},headingMark:{width:52,height:52,alignItems:'center',justifyContent:'center',borderRadius:26,borderWidth:1,borderColor:C.line},columns:{flexDirection:'row',alignItems:'flex-start',gap:22},mainColumn:{flex:1,gap:0,minWidth:0,width:'100%'},sideColumn:{width:304,gap:20},hero:{borderRadius:19,padding:24,borderWidth:1,borderColor:'#3B4632',overflow:'hidden'},heroTitle:{color:C.text,fontSize:39,lineHeight:42,letterSpacing:-1.2,fontWeight:'500'},body:{fontSize:15,lineHeight:23,color:C.muted},caption:{fontSize:14,color:C.muted,lineHeight:20},tiny:{fontSize:12,color:C.muted,lineHeight:18},button:{minHeight:54,borderRadius:12,backgroundColor:C.gold,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:13},buttonText:{fontSize:16,color:'#fff',fontWeight:'600'},secondary:{backgroundColor:'#171A20',borderWidth:1,borderColor:'#292D35'},tag:{paddingHorizontal:9,paddingVertical:6,borderRadius:20,flexDirection:'row',alignItems:'center',gap:5},tagText:{fontSize:9,fontWeight:'500'},dot:{width:5,height:5,borderRadius:4},card:{backgroundColor:C.card,borderWidth:1,borderColor:'#24272D',borderRadius:16,padding:22},statRow:{flexDirection:'row',gap:15,marginTop:18},statCard:{flex:1,padding:19},statNumber:{color:C.text,fontSize:30,letterSpacing:-1,fontWeight:'600',marginBottom:5},statUnit:{fontSize:12,fontWeight:'400',color:C.muted,letterSpacing:0},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:28,marginBottom:15},sectionTitle:{fontSize:15,color:C.text,fontWeight:'600',letterSpacing:-.2},textLink:{fontSize:14,color:C.gold,fontWeight:'500'},communityTeaser:{flexDirection:'row',gap:13,alignItems:'center',padding:19},avatarStack:{flexDirection:'row'},avatar:{width:39,height:39,borderRadius:22,alignItems:'center',justifyContent:'center'},avatarText:{fontSize:12,fontWeight:'600',color:C.text},quote:{alignItems:'center',paddingVertical:35},quoteLine:{height:1,width:25,backgroundColor:C.gold,marginBottom:20},quoteText:{color:'#BBC1B2',fontSize:14,fontStyle:'italic',textAlign:'center'},weekLabels:{flexDirection:'row',marginBottom:9},weekLabel:{width:'14.2857%',textAlign:'center',fontSize:9,color:C.dim},calendar:{flexDirection:'row',flexWrap:'wrap'},dayCell:{width:'14.2857%',height:35,alignItems:'center',justifyContent:'center'},dayInner:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},divider:{height:1,backgroundColor:C.line,marginVertical:20},footer:{marginTop:26,paddingTop:22,borderTopWidth:1,borderColor:'#272B23',flexDirection:'row',justifyContent:'space-between',gap:10},bottomBar:{borderTopWidth:1,borderColor:C.line,backgroundColor:'#000'},bottomTab:{alignItems:'center',justifyContent:'center',minWidth:58,paddingVertical:11},filter:{paddingVertical:10,paddingHorizontal:18,borderRadius:22,backgroundColor:C.card},feedGrid:{flexDirection:'row',flexWrap:'wrap',gap:20,justifyContent:'space-between'},postCard:{padding:0,overflow:'hidden'},postPhoto:{width:'100%',height:300,resizeMode:'cover'},samplePost:{height:240,backgroundColor:'#071326',alignItems:'center',justifyContent:'center'},sampleQuote:{color:C.text,fontSize:22,textAlign:'center',letterSpacing:-.5,lineHeight:28,marginTop:-12},bigMoney:{color:C.text,fontSize:40,letterSpacing:-1.5,fontWeight:'500'},transaction:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16},transactionIcon:{width:37,height:37,borderRadius:12,backgroundColor:C.raised,alignItems:'center',justifyContent:'center'},modalBackdrop:{flex:1,backgroundColor:'#000000BB',alignItems:'center',justifyContent:'flex-end',paddingTop:50,paddingBottom:24},modal:{padding:25,borderRadius:22,borderWidth:1,borderColor:'#30343D',backgroundColor:'#101114'},input:{backgroundColor:'#07080A',borderWidth:1,borderColor:'#292D35',borderRadius:10,padding:14,color:C.text,fontSize:15,minHeight:50},photoPlaceholder:{height:220,borderRadius:14,borderWidth:1,borderStyle:'dashed',borderColor:'#30343D',alignItems:'center',justifyContent:'center',marginBottom:18,backgroundColor:'#090C12'},amountChip:{flex:1,borderWidth:1,borderColor:C.line,borderRadius:10,minHeight:67,alignItems:'center',justifyContent:'center'},causeOption:{flexDirection:'row',gap:12,alignItems:'center',padding:12,borderWidth:1,borderColor:C.line,borderRadius:9},noticeInline:{fontSize:12,lineHeight:19,color:C.gold,padding:12,borderRadius:9,backgroundColor:'#11254A'},toast:{position:'absolute',borderWidth:1,borderColor:'#254878',backgroundColor:'#101C30',borderRadius:13,padding:16,flexDirection:'row',alignItems:'center',gap:12,maxWidth:700,alignSelf:'center'},modalToast:{position:'absolute',bottom:10,left:20,right:20,backgroundColor:'#101C30',padding:14,borderRadius:12,borderWidth:1,borderColor:'#254878'},
});
