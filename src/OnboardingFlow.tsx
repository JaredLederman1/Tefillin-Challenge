import React, {useEffect,useRef,useState} from 'react';
import {Animated,View,Text,TextInput,Pressable,StyleSheet,KeyboardAvoidingView,Platform,Image,Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import {BirthdayWheel} from './BirthdayWheel';
import {searchUniversities} from './universities';
import {OnboardingValues,CommunityOption,parseBirthday,onboardingSteps,formatUsPhone,phoneDigits,ageOnDate} from './onboarding-data';

export function Onboarding({onComplete,onExit,communities,initialStep=0,initialValues}: {onComplete:(values:OnboardingValues)=>Promise<void>;onExit:()=>Promise<void>;communities:CommunityOption[];initialStep?:number;initialValues?:OnboardingValues}) {
  const [step,setStep]=useState(initialStep),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [values,setValues]=useState<OnboardingValues>(initialValues||{fullName:'',gender:null,phone:'',school:'',birthday:'',tradition:null,ownsTefillin:null,borrowSource:null,communityCode:''});
  const titles=onboardingSteps();
  const lastStep=titles.length-1;
  const [birthdayScrolling,setBirthdayScrolling]=useState(false);
  const [communityConsent,setCommunityConsent]=useState(Boolean(initialValues?.communityCode));
  const [schoolChosen,setSchoolChosen]=useState(false);
  const entryOpacity=useRef(new Animated.Value(initialStep===0?0:1)).current;
  useEffect(()=>{
    if(initialStep!==0)return;
    Animated.timing(entryOpacity,{toValue:1,duration:240,useNativeDriver:true}).start();
  },[entryOpacity,initialStep]);
  const suggestions=schoolChosen?[]:searchUniversities(values.school);
  const change=(patch:Partial<OnboardingValues>)=>{setValues(v=>({...v,...patch}));setError('');};
  async function next(skip=false) {
    if(busy||(step===4&&birthdayScrolling&&!skip))return;
    let draft=values;
    if(skip){if(step===4)return;draft=step===lastStep?{...values,communityCode:''}:{...values,school:''};setValues(draft);}
    try{
      if(step===0&&!draft.fullName.trim())throw new Error('Enter your full name.');
      if(step===1&&!draft.gender)throw new Error('Choose Man or Woman.');
      if(step===2&&phoneDigits(draft.phone).length!==10)throw new Error('Enter a 10-digit phone number.');
      if(step===4){if(!draft.birthday)throw new Error('Select your birthday.');const parsed=parseBirthday(draft.birthday);const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;const age=ageOnDate(parsed,today);if(age===null||age<13)throw new Error('You must be at least 13 years old to create an account.');}
      if(step===5&&!draft.tradition)throw new Error('Choose Ashkenazi or Sephardic.');
      if(step===6&&draft.ownsTefillin===null)throw new Error('Choose whether you own tefillin.');
      if(step===7&&draft.ownsTefillin===false&&!draft.borrowSource)throw new Error('Choose a borrowing option.');
      if(step===lastStep&&!skip&&draft.communityCode.trim()&&!/^[A-Z2-9]{6}$/.test(draft.communityCode.trim()))throw new Error('Enter the 6-character community code, or skip for now.');
      if(step===lastStep&&!skip&&draft.communityCode.trim()&&!communityConsent)throw new Error('Confirm community admin access to continue.');
      if(step===lastStep){setBusy(true);await onComplete(draft);}
      else {setError('');setStep(n=>step===6&&draft.ownsTefillin===true?n+2:n+1);}
    }catch(e:any){setError(e.message || 'Could not save your profile. Please try again.');}finally{setBusy(false);}
  }
  return <SafeAreaView style={s.screen} edges={['top','bottom']}><StatusBar style="dark"/>
    <LinearGradient colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/>
    <KeyboardAvoidingView style={s.body} behavior={Platform.OS==='ios'?'padding':undefined}>
    <Animated.View style={{flex:1,opacity:entryOpacity}}>
      <View style={s.progressHeader}><Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={step===0?'Back to welcome':'Previous step'} onPress={async()=>{if(step>0){setStep(n=>n===8&&values.ownsTefillin===true?6:n-1);setError('');return;}setBusy(true);setError('');try{await onExit();}catch(e:any){setError(e.message||'Could not sign out. Please try again.');}finally{setBusy(false);}}} style={s.back}><Text style={s.backText}>‹</Text></Pressable><Text style={s.step}>Step {step+1} of {titles.length}</Text><Image source={require('../assets/media/logo-trimmed.png')} style={{width:27,height:34}} resizeMode="contain" accessibilityLabel="Ratzon"/></View>
      <View accessibilityRole="progressbar" accessibilityValue={{min:0,max:titles.length,now:step+1,text:`Step ${step+1} of ${titles.length}`}} style={s.progress}>{titles.map((_,i)=><View key={i} style={[s.segment,i<=step&&{backgroundColor:'#062B60'}]}/>)}</View>
      <View key={step} style={[s.content,{flex:1}]}> 
        <Text accessibilityRole="header" style={s.title}>{titles[step]}</Text>
        {step===0&&<TextInput accessibilityLabel="Full name" placeholder="Full Name" placeholderTextColor="#7B8DA5" style={s.input} value={values.fullName} onChangeText={text=>change({fullName:text})} autoComplete="name" textContentType="name" autoCapitalize="words" maxLength={80} editable={!busy} returnKeyType="next" onSubmitEditing={()=>next()}/>}
        {step===1&&<View style={{gap:12}}>{([{value:'man',label:'Man',symbol:'♂'},{value:'woman',label:'Woman',symbol:'♀'}] as const).map(option=>{const selected=values.gender===option.value;return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected}} key={option.value} onPress={()=>change({gender:option.value})} style={[s.choice,selected&&s.selected]}><Text style={[s.choiceText,selected&&s.selectedText]}>{option.label}</Text><Text style={[s.genderSymbol,selected&&s.selectedText]}>{option.symbol}</Text></Pressable>;})}</View>}
        {step===2&&<TextInput accessibilityLabel="Phone number" placeholder="(555) 123-4567" placeholderTextColor="#7B8DA5" style={s.input} value={values.phone} onChangeText={phone=>change({phone:formatUsPhone(phone)})} autoComplete="tel" textContentType="telephoneNumber" keyboardType="phone-pad" maxLength={14} editable={!busy} returnKeyType="next" onSubmitEditing={()=>next()}/>}
        {step===3&&<><TextInput accessibilityLabel="School" placeholder="Start typing your university" placeholderTextColor="#7B8DA5" style={s.input} value={values.school} onChangeText={text=>{change({school:text});setSchoolChosen(false);}} maxLength={120} autoCorrect={false} editable={!busy}/>
          {suggestions.length>0&&<View style={s.suggestions}>{suggestions.map(school=><Pressable accessibilityRole="button" key={school} onPress={()=>{change({school});setSchoolChosen(true);}} style={s.suggestion}><Text style={s.suggestionText}>{school}</Text></Pressable>)}</View>}
          {!!values.school.trim()&&!schoolChosen&&!suggestions.length&&<Text style={s.hint}>You can continue with the school you entered.</Text>}
        </>}
        {step===4&&<BirthdayWheel onScrollingChange={setBirthdayScrolling} value={values.birthday} onChange={birthday=>change({birthday})}/>}
        {step===5&&<View style={{gap:12}}>{(['ashkenazi','sephardic'] as const).map(tradition=><Pressable accessibilityRole="radio" accessibilityState={{checked:values.tradition===tradition}} key={tradition} onPress={()=>change({tradition})} style={s.choice}><Text style={s.choiceText}>{tradition==='ashkenazi'?'Ashkenazi':'Sephardic'}</Text><View accessible={false} style={s.radioRing}>{values.tradition===tradition&&<View style={s.radioDot}/>}</View></Pressable>)}</View>}
        {step===6&&<View style={{gap:12}}>{([{value:true,label:'I own tefillin'},{value:false,label:'I do not own tefillin'}] as const).map(option=><Pressable accessibilityRole="radio" accessibilityState={{checked:values.ownsTefillin===option.value}} key={String(option.value)} onPress={()=>change({ownsTefillin:option.value,borrowSource:option.value?null:values.borrowSource})} style={s.choice}><Text style={s.choiceText}>{option.label}</Text><View accessible={false} style={s.radioRing}>{values.ownsTefillin===option.value&&<View style={s.radioDot}/>}</View></Pressable>)}</View>}
        {step===7&&values.ownsTefillin===false&&<View style={{gap:12}}>{([{value:'campus_chabad',label:'Campus Chabad'},{value:'friend',label:'Friend'},{value:'needs_help',label:'I need help'}] as const).map(option=><Pressable accessibilityRole="radio" accessibilityState={{checked:values.borrowSource===option.value}} key={option.value} onPress={()=>change({borrowSource:option.value})} style={s.choice}><Text style={s.choiceText}>{option.label}</Text><View accessible={false} style={s.radioRing}>{values.borrowSource===option.value&&<View style={s.radioDot}/>}</View></Pressable>)}</View>}
        {step===lastStep&&<><TextInput accessibilityLabel="Community code (optional)" placeholder="6-character community code" placeholderTextColor="#7B8DA5" style={s.input} value={values.communityCode} onChangeText={text=>{setCommunityConsent(false);change({communityCode:text.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6)});}} autoCapitalize="characters" autoCorrect={false} maxLength={6} editable={!busy}/>
          {!!values.communityCode&&<><Text style={s.adminNotice}>Community admins can view your profile, wrap history, captions, and wrap photos, including check-ins you do not share to the feed.</Text><Pressable accessibilityRole="checkbox" accessibilityState={{checked:communityConsent}} onPress={()=>{setCommunityConsent(value=>!value);setError('');}} style={s.confirmRow}><Ionicons name={communityConsent?'checkbox':'square-outline'} size={22} color="#062B60"/><Text style={s.confirmText}>I understand and want to join this community.</Text></Pressable></>}
          <Text style={[s.hint,{fontStyle:'italic',textAlign:'center'}]}>Ask a community admin for a code, or skip for now.</Text>
        </>}
        {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        <View style={s.actions}><Pressable accessibilityRole="button" disabled={busy||(step===4&&birthdayScrolling)} onPress={()=>next()} style={[s.continue,{opacity:(busy||(step===4&&birthdayScrolling))?.6:1}]}><Text style={s.continueText}>{busy?'Saving…':'Continue'}</Text></Pressable>{(step===3||step===lastStep)&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>next(true)} style={s.skip}><Text style={s.skipText}>Skip for now</Text></Pressable>}</View>
      </View>
    </Animated.View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#EDF4FF'},body:{flex:1,width:'100%',maxWidth:480,alignSelf:'center',paddingHorizontal:28},progressHeader:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{width:34,height:44,alignItems:'center',justifyContent:'center'},backText:{includeFontPadding:false,textAlignVertical:'center',fontSize:36,color:'#062B60'},step:{color:'#516987',includeFontPadding:false,textAlignVertical:'center',fontSize:12},progress:{flexDirection:'row',gap:7},segment:{height:4,flex:1,borderRadius:2,backgroundColor:'#CEDBEC'},content:{paddingTop:58,paddingBottom:24},title:{includeFontPadding:false,textAlignVertical:'center',fontSize:30,lineHeight:36,letterSpacing:-.8,color:'#062B60',fontWeight:'600',marginBottom:32,textAlign:'center'},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#D3DEEE',borderRadius:14,paddingHorizontal:17,paddingVertical:17,includeFontPadding:false,textAlignVertical:'center',fontSize:17,color:'#062B60',minHeight:58},suggestions:{borderRadius:14,backgroundColor:'#fff',marginTop:8,overflow:'hidden'},suggestion:{padding:15,minHeight:48,justifyContent:'center',borderBottomWidth:1,borderBottomColor:'#EDF1F7'},suggestionText:{includeFontPadding:false,textAlignVertical:'center',fontSize:14,color:'#16365F'},hint:{includeFontPadding:false,textAlignVertical:'center',fontSize:12,color:'#516987',marginTop:12},adminNotice:{fontSize:12,lineHeight:18,color:'#345575',marginTop:12},confirmRow:{minHeight:44,flexDirection:'row',alignItems:'center',gap:10,marginTop:10},confirmText:{flex:1,fontSize:13,lineHeight:18,color:'#16365F'},choice:{borderRadius:14,borderWidth:1,borderColor:'#CCD9EB',padding:20,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},radioRing:{width:20,height:20,borderRadius:10,borderWidth:1.5,borderColor:'#062B60',alignItems:'center',justifyContent:'center'},radioDot:{width:10,height:10,borderRadius:5,backgroundColor:'#062B60'},choiceText:{includeFontPadding:false,textAlignVertical:'center',fontSize:17,fontWeight:'500',color:'#062B60'},genderSymbol:{includeFontPadding:false,textAlignVertical:'center',fontSize:28,lineHeight:30,color:'#062B60'},selected:{backgroundColor:'#062B60',borderColor:'#062B60'},selectedText:{color:'#fff'},numbers:{flexDirection:'row',gap:8},number:{flex:1,height:57,borderRadius:14,borderWidth:1,borderColor:'#CCD9EB',backgroundColor:'#fff',alignItems:'center',justifyContent:'center'},numberText:{includeFontPadding:false,textAlignVertical:'center',fontSize:22,fontWeight:'600',color:'#062B60'},scale:{flexDirection:'row',justifyContent:'space-between'},error:{color:'#A12E3B',includeFontPadding:false,textAlignVertical:'center',fontSize:14,lineHeight:21,marginTop:20},actions:{paddingTop:14,paddingBottom:12},continue:{height:56,borderRadius:14,backgroundColor:'#062B60',alignItems:'center',justifyContent:'center'},continueText:{includeFontPadding:false,textAlignVertical:'center',fontSize:18,fontWeight:'600',color:'#fff'},skip:{minHeight:44,alignItems:'center',justifyContent:'center'},skipText:{includeFontPadding:false,textAlignVertical:'center',fontSize:13,color:'#16365F',textDecorationLine:'underline'}});
