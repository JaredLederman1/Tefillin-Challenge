import React, {memo,useCallback,useEffect,useMemo,useRef} from 'react';
import {Animated,Platform,View,ScrollView,Pressable,StyleSheet} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {birthdayForInput,clampSignupBirthday,defaultBirthday,minimumSignupBirthday} from './onboarding-data';

const ROW=44;
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
type Item={value:number;label:string};
function selectionHaptic() {
  if(Platform.OS==='web')return;
  // Older installed development clients may not yet include ExpoHaptics.
  // Keep its JS in Metro, but evaluate it only when the native module exists.
  try{if(!requireOptionalNativeModule('ExpoHaptics'))return;const Haptics=require('expo-haptics') as typeof import('expo-haptics');void Haptics.selectionAsync().catch(()=>{});}catch{}
}
const Wheel=memo(function Wheel({label,items,value,onChange,onMotion,flex=1}:{label:string;items:Item[];value:number;onChange:(value:number)=>void;onMotion:(label:string,moving:boolean)=>void;flex?:number}) {
  const scroll=useRef<ScrollView>(null);
  const selected=Math.max(0,items.findIndex(item=>item.value===value));
  const position=useRef(new Animated.Value(selected*ROW)).current;
  const offset=useRef(selected*ROW);
  const currentIndex=useRef(selected);
  const hapticIndex=useRef(selected);
  const userScrolling=useRef(false);
  const moving=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const latest=useRef({items,onChange,onMotion,label});latest.current={items,onChange,onMotion,label};
  const clearTimer=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
  const motion=(active:boolean)=>{if(moving.current!==active){moving.current=active;latest.current.onMotion(label,active);}};
  const settle=()=>{
    clearTimer();
    const index=Math.max(0,Math.min(latest.current.items.length-1,Math.round(offset.current/ROW)));
    userScrolling.current=false;
    hapticIndex.current=index;
    currentIndex.current=index;
    latest.current.onChange(latest.current.items[index].value);
    if(Math.abs(offset.current-index*ROW)>.5)scroll.current?.scrollTo({y:index*ROW,animated:true});
    motion(false);
  };
  // Only external corrections (e.g. February's shorter day list) reposition a wheel.
  useEffect(()=>{
    if(currentIndex.current!==selected){userScrolling.current=false;hapticIndex.current=selected;currentIndex.current=selected;offset.current=selected*ROW;position.setValue(selected*ROW);scroll.current?.scrollTo({y:selected*ROW,animated:false});}
  },[selected,position]);
  useEffect(()=>()=>{clearTimer();if(moving.current)latest.current.onMotion(latest.current.label,false);},[]);
  return <View style={{flex}} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{text:items[selected]?.label||''}} accessibilityActions={[{name:'increment'},{name:'decrement'}]} onAccessibilityAction={event=>{
    const index=Math.max(0,Math.min(items.length-1,selected+(event.nativeEvent.actionName==='increment'?1:-1)));
    onChange(items[index].value);
  }}>
    <Animated.ScrollView ref={scroll} style={s.wheel} contentOffset={{x:0,y:selected*ROW}} contentContainerStyle={{paddingVertical:ROW*2}} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="normal" bounces={false} scrollEventThrottle={16}
      onScrollBeginDrag={()=>{clearTimer();hapticIndex.current=Math.max(0,Math.min(latest.current.items.length-1,Math.round(offset.current/ROW)));userScrolling.current=true;motion(true);}}
      onScrollEndDrag={event=>{offset.current=event.nativeEvent.contentOffset.y;clearTimer();timer.current=setTimeout(settle,180);}}
      onMomentumScrollBegin={()=>{clearTimer();motion(true);}}
      onMomentumScrollEnd={event=>{offset.current=event.nativeEvent.contentOffset.y;settle();}}
      onScroll={Animated.event([{nativeEvent:{contentOffset:{y:position}}}],{useNativeDriver:Platform.OS!=='web',listener:(event:any)=>{
        offset.current=event.nativeEvent.contentOffset.y;
        const index=Math.max(0,Math.min(latest.current.items.length-1,Math.round(offset.current/ROW)));
        if(userScrolling.current&&index!==hapticIndex.current){hapticIndex.current=index;selectionHaptic();}
        if(Platform.OS==='web'){motion(true);clearTimer();timer.current=setTimeout(settle,140);}
      }})}>
      {items.map((item,index)=><Pressable key={item.value} accessible={false} onPress={()=>{currentIndex.current=index;onChange(item.value);scroll.current?.scrollTo({y:index*ROW,animated:true});}} style={s.row}><Animated.Text style={[s.text,{transform:[{scale:position.interpolate({inputRange:[(index-1)*ROW,index*ROW,(index+1)*ROW],outputRange:[.92,1,.92],extrapolate:'clamp'})}]}]}>{item.label}</Animated.Text></Pressable>)}
    </Animated.ScrollView>
  </View>;
});
export function BirthdayWheel({value,onChange,onScrollingChange}:{value:string;onChange:(value:string)=>void;onScrollingChange?:(moving:boolean)=>void}) {
  const today=new Date();
  const [month,day,year]=(birthdayForInput(value)||defaultBirthday(today)).split('/').map(Number);
  useEffect(()=>{if(!value)onChange(defaultBirthday());},[value,onChange]);
  const [maxMonthValue,maxDayValue,maxYearValue]=minimumSignupBirthday(today).split('/').map(Number);
  const latest=useRef({month,day,year,onChange,onScrollingChange});latest.current={month,day,year,onChange,onScrollingChange};
  const activeWheels=useRef(new Set<string>());
  const onMotion=useCallback((label:string,moving:boolean)=>{if(moving)activeWheels.current.add(label);else activeWheels.current.delete(label);latest.current.onScrollingChange?.(activeWheels.current.size>0);},[]);
  const update=useCallback((part:'month'|'day'|'year',number:number)=>{
    const date={...latest.current,[part]:number};
    const result=clampSignupBirthday(date.year,date.month,date.day);
    const [m,d,y]=result.split('/').map(Number);
    latest.current={...latest.current,month:m,day:d,year:y};
    latest.current.onChange(result);
  },[]);
  const changeMonth=useCallback((n:number)=>update('month',n),[update]);
  const changeDay=useCallback((n:number)=>update('day',n),[update]);
  const changeYear=useCallback((n:number)=>update('year',n),[update]);
  const maxMonth=year===maxYearValue?maxMonthValue:12;
  const maxDay=year===maxYearValue&&month===maxMonthValue?maxDayValue:new Date(year,month,0).getDate();
  const monthItems=useMemo(()=>months.slice(0,maxMonth).map((label,i)=>({value:i+1,label})),[maxMonth]);
  const dayItems=useMemo(()=>Array.from({length:maxDay},(_,i)=>({value:i+1,label:String(i+1)})),[maxDay]);
  const yearItems=useMemo(()=>Array.from({length:maxYearValue-1899},(_,i)=>({value:1900+i,label:String(1900+i)})),[maxYearValue]);
  return <View style={s.frame}>
    <View pointerEvents="none" style={s.selection}/>
    <Wheel label="Birth month" flex={1.7} items={monthItems} value={month} onChange={changeMonth} onMotion={onMotion}/>
    <Wheel label="Birth day" items={dayItems} value={day} onChange={changeDay} onMotion={onMotion}/>
    <Wheel label="Birth year" flex={1.2} items={yearItems} value={year} onChange={changeYear} onMotion={onMotion}/>
  </View>;
}
const s=StyleSheet.create({frame:{flexDirection:'row',backgroundColor:'#fff',borderWidth:1,borderColor:'#D3DEEE',borderRadius:14,overflow:'hidden',paddingHorizontal:8},wheel:{height:ROW*5},row:{height:ROW,justifyContent:'center',alignItems:'center'},text:{includeFontPadding:false,textAlignVertical:'center',fontSize:17,fontWeight:'500',color:'#062B60'},selection:{position:'absolute',top:ROW*2,left:8,right:8,height:ROW,borderRadius:8,backgroundColor:'#E8F1FF'}});
