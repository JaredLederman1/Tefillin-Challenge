type StoreSubscription={platform:string;displayPrice?:string|null;subscriptionPeriodNumberIOS?:string|null;subscriptionPeriodUnitIOS?:string|null};
/** Show only the store's localized price and complete recurring billing period. */
export function subscriptionPriceLabel(product?:StoreSubscription|null):string|null {
 if(product?.platform!=='ios'||!product.displayPrice?.trim())return null;
 const unit=product.subscriptionPeriodUnitIOS;
 const count=Number(product.subscriptionPeriodNumberIOS);
 if(!unit||!['day','week','month','year'].includes(unit)||!Number.isSafeInteger(count)||count<=0)return null;
 return `${product.displayPrice} / ${count===1?'':`${count} `}${unit}${count===1?'':'s'}`;
}
