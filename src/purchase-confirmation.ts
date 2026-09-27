export async function withPurchaseTimeout<T>(operation:Promise<T>,message:string,timeoutMs=30000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),timeoutMs);})]);}
 finally{clearTimeout(timer!);}
}

export async function confirmPurchaseSteps(verify:()=>Promise<void>,finish:()=>Promise<void>,refresh:()=>Promise<void>,timeoutMs=30000){
 await withPurchaseTimeout(verify(),'Purchase verification timed out. Tap Retry confirmation to check your existing purchase.',timeoutMs);
 // Refresh verified access even when StoreKit cannot finish its transaction.
 try{await withPurchaseTimeout(finish(),'The App Store transaction is still processing.',timeoutMs);}
 finally{await withPurchaseTimeout(refresh(),'Your purchase was verified, but account refresh timed out. Tap Retry confirmation.',timeoutMs);}
}
