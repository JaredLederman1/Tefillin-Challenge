// SDK 57's ExpoModulesJSI needs these source compatibility fixes on Swift 6.2.
// https://github.com/expo/expo/issues/49214
// The callback pointers remain call-scoped and synchronous: no lifetime/thread change.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
if(process.platform!=='darwin')process.exit(0);
const version=execFileSync('xcodebuild',['-version'],{encoding:'utf8'}).match(/Xcode (\d+)\.(\d+)/);
if(!version||Number(version[1])!==26||Number(version[2])>3)process.exit(0);
const root=path.dirname(require.resolve('expo-modules-jsi/package.json'));
if(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version!=='57.1.0')throw new Error('Review the Xcode 26 compatibility patch for the installed ExpoModulesJSI version.');
function rewrite(file,pairs,marker){
 const target=path.join(root,file);let source=fs.readFileSync(target,'utf8');
 if(source.includes(marker))return;
 for(const [before,after,count] of pairs){
  if(source.split(before).length-1!==count)throw new Error(`ExpoModulesJSI patch no longer matches ${file}`);
  source=source.replaceAll(before,after);
 }
 fs.writeFileSync(target,source);
}
rewrite('apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h',[
 ['SWIFT_RETURNS_RETAINED RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept','/* Xcode 26 constructor compatibility */ RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept',1],
 ['SWIFT_RETURNS_RETAINED RuntimeScheduler() {}','RuntimeScheduler() {}',1],
],'Xcode 26 constructor compatibility');
rewrite('apple/Sources/ExpoModulesJSI/Runtime/JavaScriptRuntime.swift',[
 ['private func createFunctionClosure(\n  runtime: JavaScriptRuntime, name: String? = nil, _ closure:',
  '// Call-scoped pointers used only inside the existing synchronous callback.\nprivate struct SynchronousCallbackPointer<T>: @unchecked Sendable {\n  let value: T\n  init(_ value: T) { self.value = value }\n}\n\nprivate func createFunctionClosure(\n  runtime: JavaScriptRuntime, name: String? = nil, _ closure:',1],
 ['nonisolated(unsafe) let resultPtr = resultPtr','let resultPtr = SynchronousCallbackPointer(resultPtr)',3],
 ['nonisolated(unsafe) let thisPtr = thisPtr','let thisPtr = SynchronousCallbackPointer(thisPtr)',2],
 ['nonisolated(unsafe) let argumentsPtr = argumentsPtr','let argumentsPtr = SynchronousCallbackPointer(argumentsPtr)',2],
 ['writeJSIValue(to: resultPtr)','writeJSIValue(to: resultPtr.value)',3],
 ['UnsafeMutablePointer(mutating: thisPtr).move()','UnsafeMutablePointer(mutating: thisPtr.value).move()',1],
 ['JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)','JavaScriptValuesBuffer(runtime, start: argumentsPtr.value, count: argumentsCount)',2],
 ['JavaScriptUnownedValue(runtime.pointee, thisPtr)','JavaScriptUnownedValue(runtime.pointee, thisPtr.value)',1],
],'private struct SynchronousCallbackPointer');
console.log('Applied ExpoModulesJSI compatibility fixes for Xcode 26.0–26.3.');
