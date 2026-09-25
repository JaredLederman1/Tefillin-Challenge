import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,StyleSheet,useWindowDimensions,View} from 'react-native';
import {WelcomeBrand} from './WelcomeBrand';

/** A single brand reveal followed by a capped loading bar. */
export function WelcomeReveal({ready,onComplete,preparing=false,visible=true}:{ready:boolean;onComplete:()=>void;preparing?:boolean;visible?:boolean}) {
  return visible?<LoadingSequence ready={ready} onComplete={onComplete}/>:null;
}

function LoadingSequence({ready,onComplete}:{ready:boolean;onComplete:()=>void}) {
  const visible=true;
  const {width}=useWindowDimensions();
  const [assetsReady,setAssetsReady]=useState(false);
  const [logoDone,setLogoDone]=useState(false);
  const [started,setStarted]=useState(false);
  const [barDone,setBarDone]=useState(false);
  const [minimumFillDone,setMinimumFillDone]=useState(false);
  const [reduced,setReduced]=useState(false);
  const content=useRef(new Animated.Value(1)).current;
  const loadingProgress=useRef(new Animated.Value(0)).current;
  const complete=useRef(onComplete);complete.current=onComplete;
  const onBrandReady=useCallback(()=>setAssetsReady(true),[]);
  const onLogoComplete=useCallback(()=>setLogoDone(true),[]);
  useEffect(()=>{
    if(!visible){content.setValue(1);loadingProgress.setValue(0);setLogoDone(false);setStarted(false);setBarDone(false);return;}
    if(!assetsReady)return;
    const timer=setTimeout(()=>setStarted(true),200);
    return ()=>clearTimeout(timer);
  },[visible,assetsReady,content,loadingProgress]);
  useEffect(()=>{
    let active=true;
    AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value);}).catch(()=>{});
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return ()=>{active=false;listener.remove();};
  },[]);
  useEffect(()=>{
    if(!visible||!logoDone)return;
    const slow=Animated.timing(loadingProgress,{toValue:.9,duration:reduced?0:2800,easing:Easing.out(Easing.quad),useNativeDriver:false});
    slow.start(({finished})=>{if(finished)setMinimumFillDone(true);});
    return ()=>slow.stop();
  },[visible,logoDone,reduced,loadingProgress]);
  useEffect(()=>{
    if(!visible||!logoDone||!minimumFillDone||!ready||barDone)return;
    const finish=Animated.timing(loadingProgress,{toValue:1,duration:reduced?0:180,easing:Easing.out(Easing.cubic),useNativeDriver:false});
    finish.start(({finished})=>{if(finished)setBarDone(true);});
    return ()=>finish.stop();
  },[visible,logoDone,minimumFillDone,ready,barDone,reduced,loadingProgress]);
  useEffect(()=>{
    if(!visible||!ready||!barDone)return;
    const animation=Animated.sequence([Animated.delay(220),Animated.timing(content,{toValue:0,duration:reduced?0:500,easing:Easing.inOut(Easing.cubic),useNativeDriver:true})]);
    animation.start(({finished})=>{if(finished)complete.current();});
    return ()=>animation.stop();
  },[visible,ready,barDone,reduced,content]);
  return <Animated.View pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} accessibilityViewIsModal={visible} style={[s.screen,{opacity:visible?content:0}]}>
    <View style={[s.content,{opacity:assetsReady?1:0}]}>
      <WelcomeBrand width={Math.min(width-64,384)} active={visible&&started} onReady={onBrandReady} onAnimationComplete={onLogoComplete}/>
      <View accessibilityRole="progressbar" accessibilityLabel="Loading Ratzon" accessibilityValue={{min:0,max:100}} style={s.track}><Animated.View style={[s.fill,{width:loadingProgress.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/></View>
    </View>
  </Animated.View>;
}
const s=StyleSheet.create({screen:{...StyleSheet.absoluteFill,zIndex:100,elevation:100,justifyContent:'center',alignItems:'center',backgroundColor:'#fff'},content:{alignItems:'center',gap:28},welcome:{includeFontPadding:false,textAlignVertical:'center',fontSize:22,fontWeight:'500',color:'#062B60',textAlign:'center'},track:{height:8,width:188,overflow:'hidden',borderRadius:4,backgroundColor:'#D8E4F5'},fill:{height:'100%',borderRadius:4,backgroundColor:'#062B60'}});
