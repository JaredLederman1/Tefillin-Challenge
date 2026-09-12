import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse, G, Rect } from 'react-native-svg';
export function TefillinArt({ size = 260 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 320 320" accessibilityLabel="Illustration of tefillin and their leather straps">
    <Defs>
      <LinearGradient id="box" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#50534B"/><Stop offset="1" stopColor="#151814"/></LinearGradient>
      <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#77796A"/><Stop offset="1" stopColor="#33372D"/></LinearGradient>
      <LinearGradient id="strap" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#5A5D4A"/><Stop offset="1" stopColor="#22271E"/></LinearGradient>
    </Defs>
    <Ellipse cx="169" cy="250" rx="110" ry="24" fill="#0C100B" opacity=".4"/>
    <Path d="M130 151 C56 144 35 196 70 218 C97 235 134 235 113 260 C94 283 49 252 74 240 M198 190 C273 198 294 229 261 245 C230 258 165 251 155 275" fill="none" stroke="#171C14" strokeWidth="18"/>
    <Path d="M130 146 C56 139 35 191 70 213 C97 230 134 230 113 255 C94 278 49 247 74 235 M198 185 C273 193 294 224 261 240 C230 253 165 246 155 270" fill="none" stroke="url(#strap)" strokeWidth="13"/>
    <G transform="translate(68 51) rotate(-12 80 90)">
      <Path d="M9 110 L94 83 L157 115 L74 147 Z" fill="#4E5345" stroke="#71765E" strokeWidth="1"/>
      <Path d="M9 110 L9 122 L74 161 L74 147 Z" fill="#252B20"/>
      <Path d="M74 147 L157 115 L157 128 L74 161 Z" fill="#161D14"/>
      <Path d="M27 52 L101 30 L138 50 L67 75 Z" fill="url(#top)" stroke="#7B7F6B" strokeWidth=".8"/>
      <Path d="M27 52 L67 75 L67 137 L27 113 Z" fill="url(#box)"/>
      <Path d="M67 75 L138 50 L138 113 L67 137 Z" fill="#22271F" stroke="#4F5544" strokeWidth=".6"/>
      <Path d="M37 57 L37 116 M47 63 L47 122 M57 69 L57 129" stroke="#1D231B" strokeWidth="2"/>
      <Path d="M89 88 L95 103 L100 90 M106 82 L107 106 L91 112 L86 96 M119 83 L118 106 L91 116" fill="none" stroke="#737762" strokeWidth="2.5"/>
    </G>
    <G transform="translate(150 141) rotate(10 52 52)">
      <Path d="M0 48 L65 29 L114 56 L51 78 Z" fill="#464D3D" stroke="#6C7557" strokeWidth="1"/>
      <Path d="M0 48 L0 59 L51 90 L51 78 Z" fill="#2A3123"/>
      <Path d="M51 78 L114 56 L114 67 L51 90 Z" fill="#171E13"/>
      <Path d="M14 13 L66 0 L98 18 L45 34 Z" fill="url(#top)"/>
      <Path d="M14 13 L45 34 L45 70 L14 51 Z" fill="url(#box)"/>
      <Path d="M45 34 L98 18 L98 53 L45 70 Z" fill="#252D20" stroke="#556046" strokeWidth=".6"/>
    </G>
  </Svg>;
}
