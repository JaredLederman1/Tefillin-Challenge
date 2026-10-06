type AppleName = {givenName?:string|null;middleName?:string|null;familyName?:string|null;nickname?:string|null};
type NameStorage = {getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>};
type IdentityUser = {app_metadata?:{provider?:string;providers?:string[]};user_metadata?:Record<string,unknown>;identities?:Array<{provider?:string;identity_data?:Record<string,unknown>}>};

export function appleFullName(name:AppleName|null|undefined):string {
  return [name?.givenName,name?.middleName,name?.familyName].filter(part=>part?.trim()).map(part=>part!.trim()).join(' ').slice(0,80);
}

export function isAppleIdentity(user:IdentityUser|null|undefined):boolean {
  return user?.app_metadata?.provider==='apple'||Boolean(user?.app_metadata?.providers?.includes('apple'))||Boolean(user?.identities?.some(identity=>identity.provider==='apple'));
}

export function savedIdentityName(user:IdentityUser|null|undefined):string {
  for(const candidate of [user?.user_metadata?.full_name,user?.user_metadata?.name]) {
    if(typeof candidate==='string'&&candidate.trim())return candidate.trim().slice(0,80);
  }
  return '';
}

// Apple normally supplies the name only once. Save it by Apple's stable subject
// before starting Supabase authentication, so a failed request cannot lose it.
export async function captureAppleName(storage:NameStorage,credential:{user:string;fullName:AppleName|null}):Promise<string> {
  const key=`ratzon:apple-name:${credential.user}`;
  const supplied=appleFullName(credential.fullName);
  if(supplied){await storage.setItem(key,supplied);return supplied;}
  return (await storage.getItem(key))||'';
}

export async function recoveredIdentityName(storage:NameStorage,user:IdentityUser):Promise<string> {
  const saved=savedIdentityName(user);
  if(saved)return saved;
  const subject=user.identities?.find(identity=>identity.provider==='apple')?.identity_data?.sub;
  return typeof subject==='string'?(await storage.getItem(`ratzon:apple-name:${subject}`))||'':'';
}
