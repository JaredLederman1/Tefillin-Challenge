import Ionicons from '@expo/vector-icons/Ionicons';
import {LinearGradient} from 'expo-linear-gradient';
import {StatusBar} from 'expo-status-bar';
import React,{useState} from 'react';
import {LayoutAnimation,Linking,Platform,Pressable,ScrollView,StyleSheet,Text,UIManager,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

export type CharityChoice={id:string;name:string;description?:string;website_url?:string};
if(Platform.OS==='android'&&UIManager.setLayoutAnimationEnabledExperimental)UIManager.setLayoutAnimationEnabledExperimental(true);
const smooth=()=>LayoutAnimation.configureNext({duration:240,create:{type:LayoutAnimation.Types.easeInEaseOut,property:LayoutAnimation.Properties.opacity},update:{type:LayoutAnimation.Types.easeInEaseOut},delete:{type:LayoutAnimation.Types.easeInEaseOut,property:LayoutAnimation.Properties.opacity}});

export function CharitySetup({charities,onSelect}:{charities:CharityChoice[];onSelect:(id:string)=>Promise<void>}){
 const [expanded,setExpanded]=useState<string|null>(null),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const email='mailto:jared@ratzonapp.com?subject='+encodeURIComponent('Request another charity');
 const proceed=async()=>{if(!selected||busy)return;setBusy(true);setError('');try{await onSelect(selected);}catch(e:any){setError(e.message||'Could not save your charity.');}finally{setBusy(false);}};
 return <SafeAreaView style={s.screen}><StatusBar style="dark"/><LinearGradient colors={['#F8FBFF','#E8F1FF','#D7E7FF']} style={StyleSheet.absoluteFill}/><ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
  <Text accessibilityRole="header" style={s.title}>Choose Your Charity</Text>
  <View style={s.list}>{charities.map(item=>{const active=selected===item.id;return <View key={item.id} style={[s.optionWrap,active&&s.optionSelected]}>
   <View style={s.optionRow}><Pressable accessibilityRole="radio" accessibilityState={{checked:active}} disabled={busy} onPress={()=>{smooth();setSelected(item.id);setError('');}} style={s.choice}><Text style={[s.choiceText,active&&s.selectedText]}>{item.name}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`About ${item.name}`} onPress={()=>{smooth();setExpanded(value=>value===item.id?null:item.id);}} hitSlop={8} style={s.info}><Ionicons name="information-circle-outline" size={24} color={active?'#FFFFFF':'#2478FF'}/></Pressable></View>
   {expanded===item.id&&!!item.description&&<Text style={[s.description,active&&s.selectedDescription]}>{item.description}</Text>}
  </View>})}</View>
  <Pressable accessibilityRole="button" disabled={!selected||busy} onPress={proceed} style={[s.continue,{opacity:!selected||busy?0.45:1}]}><Text style={s.continueText}>{busy?'Saving…':'Continue'}</Text></Pressable>
  <Pressable accessibilityRole="link" accessibilityLabel="Request another charity by email" disabled={busy} onPress={()=>Linking.openURL(email).catch(()=>setError('Email jared@ratzonapp.com'))} style={s.request}><Text style={s.requestText}>Request another charity</Text><Ionicons name="mail-outline" size={19} color="#062B60"/></Pressable>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#fff'},body:{flexGrow:1,justifyContent:'center',padding:28,width:'100%',maxWidth:480,alignSelf:'center'},title:{fontSize:28,lineHeight:34,fontWeight:'700',textAlign:'center',color:'#062B60',marginBottom:28},list:{gap:10},optionWrap:{backgroundColor:'#fff',borderWidth:1,borderColor:'#CAD8EC',borderRadius:14,overflow:'hidden'},optionSelected:{backgroundColor:'#062B60',borderColor:'#062B60'},optionRow:{minHeight:58,flexDirection:'row',alignItems:'center'},choice:{flex:1,minHeight:58,justifyContent:'center',paddingLeft:17,paddingVertical:10},choiceText:{fontSize:16,lineHeight:21,fontWeight:'600',color:'#062B60'},selectedText:{color:'#fff'},info:{width:52,minHeight:58,alignItems:'center',justifyContent:'center'},description:{fontSize:13,lineHeight:19,color:'#345575',paddingHorizontal:17,paddingBottom:15},selectedDescription:{color:'#DCE8F8'},continue:{height:56,marginTop:18,backgroundColor:'#062B60',borderRadius:14,alignItems:'center',justifyContent:'center'},continueText:{fontSize:17,fontWeight:'600',color:'#fff'},request:{minHeight:52,marginTop:12,paddingHorizontal:17,borderWidth:1,borderColor:'#AFC2DD',borderRadius:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},requestText:{fontSize:15,fontWeight:'600',color:'#062B60'},error:{color:'#A12E3B',fontSize:14,lineHeight:21,marginTop:16,textAlign:'center'}});
