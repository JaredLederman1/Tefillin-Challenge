import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, View } from 'react-native';

/** Start with the R at screen center; reveal the lettering as the R moves left. */
export const WelcomeBrand = memo(function WelcomeBrand({ width, onAnimationComplete, active:enabled=true, loop=false, onReady }: { width: number; onAnimationComplete?: () => void; active?:boolean; loop?:boolean; onReady?:()=>void }) {
  const completion = useRef(onAnimationComplete);
  completion.current = onAnimationComplete;
  const completed = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const [markLoaded, setMarkLoaded] = useState(false);
  const [tailLoaded, setTailLoaded] = useState(false);
  const [laidOut,setLaidOut]=useState(false);
  const markWidth = width * .27;
  const markHeight = markWidth * 992 / 795;
  const tailWidth = width - markWidth;
  const tailHeight = tailWidth * 459 / 1761;
  useEffect(()=>{if(markLoaded&&tailLoaded&&laidOut)onReady?.();},[markLoaded,tailLoaded,laidOut,onReady]);

  useEffect(() => {
    if(!enabled){progress.setValue(0);completed.current=false;return;}
    if (!markLoaded || !tailLoaded || !laidOut) return;
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    let frame=0;
    const finish = () => {if(active&&!completed.current){completed.current=true;completion.current?.();}};
    const showStill = () => { animation?.stop(); progress.setValue(1); finish(); };
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => { if (reduced) showStill(); });
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      if (reduced) { showStill(); return; }
      if(loop){
        progress.setValue(0);
        animation=Animated.loop(Animated.sequence([
          Animated.timing(progress,{toValue:1,duration:900,easing:Easing.out(Easing.cubic),useNativeDriver:true,isInteraction:false}),
          Animated.delay(400),
          Animated.timing(progress,{toValue:0,duration:250,easing:Easing.in(Easing.cubic),useNativeDriver:true,isInteraction:false}),
          Animated.delay(180),
        ]));
        animation.start();
      }else{
        progress.setValue(0);
        animation = Animated.timing(progress, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction:false });
        frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{if(active)animation?.start(({finished})=>{if(finished)finish();});});});
      }
    }).catch(showStill);
    return () => { active = false; cancelAnimationFrame(frame); animation?.stop(); listener.remove(); };
  }, [markLoaded, tailLoaded, laidOut, progress, enabled, loop]);

  const motion=useMemo(()=>({
    mark:progress.interpolate({inputRange:[0,1],outputRange:[(width-markWidth)/2,0]}),
    mask:progress.interpolate({inputRange:[0,1],outputRange:[-tailWidth,0]}),
    tail:progress.interpolate({inputRange:[0,1],outputRange:[tailWidth,0]}),
  }),[progress,width,markWidth,tailWidth]);

  return <View onLayout={()=>setLaidOut(true)} accessible accessibilityLabel="Ratzon" accessibilityRole="image" style={{ width, height: markHeight }}>
    <Animated.View style={{ position: 'absolute', left: 0, transform: [{translateX: motion.mark}], bottom: 0, width: markWidth, height: markHeight }}>
      <Image fadeDuration={0} source={require('../assets/media/logo-trimmed.png')} onLoad={() => setMarkLoaded(true)} onError={() => setMarkLoaded(true)} style={{ width: markWidth, height: markHeight }} resizeMode="contain"/>
      <Animated.View style={{ position: 'absolute', left: markWidth, bottom: 0, height: tailHeight, width: tailWidth, transform: [{translateX: motion.mask}], overflow: 'hidden' }}>
        <Animated.Image fadeDuration={0} onLoad={()=>setTailLoaded(true)} onError={()=>setTailLoaded(true)} source={require('../assets/media/word-mark-without-r-trimmed.png')} style={{ width: tailWidth, height: tailHeight, transform:[{translateX:motion.tail}] }} resizeMode="contain"/>
      </Animated.View>
    </Animated.View>
  </View>;
});
