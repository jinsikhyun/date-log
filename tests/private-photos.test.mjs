import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, imports = {}) {
 const output=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText;
 const exports={};
 vm.runInNewContext(output,{exports,require:name=>{
  if(!(name in imports)) throw new Error('Unexpected dependency '+name);
  return imports[name];
 },process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co'}},URL,URLSearchParams,Response});
 return exports;
}
const urls=load('src/lib/photoUrls.ts');
test('legacy URL and stable reference use session endpoint, external/local previews retained',()=>{
 assert.equal(urls.photoDisplayUrl('https://example.supabase.co/storage/v1/object/public/place-photos/old.jpg'),'/api/place-photo?path=old.jpg');
 assert.equal(urls.photoDisplayUrl('storage://place-photos/a/b/c.jpg'),'/api/place-photo?path=a%2Fb%2Fc.jpg');
 assert.equal(urls.photoDisplayUrl('storage://place-photos/a/b/c.jpg',320),'/api/place-photo?path=a%2Fb%2Fc.jpg&w=320');
 assert.equal(urls.photoDisplayUrl('storage://place-photos/a/b/c.jpg',333),'/api/place-photo?path=a%2Fb%2Fc.jpg');
 for(const url of ['blob:preview','data:image/png;base64,abc','/brand-wordmark.png','https://external.invalid/photo.jpg']) assert.equal(urls.photoDisplayUrl(url),url);
 assert.equal(urls.photoPath('https://example.supabase.co.evil.invalid/storage/v1/object/public/place-photos/old.jpg'),null);
});
test('invalid storage paths, traversal, URL inputs and empty reference rejected',()=>{
 for(const path of ['', '../a.jpg','a/../b.jpg','/a','a//b','a%2fb','a\\b','a?b','a\u0000b']) assert.equal(urls.validPhotoPath(path),false,path);
 assert.equal(urls.photoDisplayUrl('storage://place-photos/../a.jpg'),undefined);
 assert.equal(urls.photoPath('https://example.supabase.co/storage/v1/object/public/place-photos/a%2f..%2fb.jpg'),null);
});
function handler({user=true,allowed=true,accessError=null,downloadError=null,type='image/jpeg'}={}){
 const calls=[];const transforms=[];
 const client={auth:{getUser:async()=>({data:{user:user?{id:'test'}:null},error:null})},
 rpc:async(name,args)=>{calls.push(['rpc',name,args.p_name]);return {data:allowed,error:accessError};},
 storage:{from:bucket=>({download:async(path,options)=>{calls.push(['download',bucket,path]);transforms.push(options?.transform);return {data:downloadError?null:new Blob(['fake-image'],{type}),error:downloadError};}})}};
 const route=load('src/app/api/place-photo/route.ts',{'@/lib/supabase/server':{createClient:async()=>client},'@/lib/photoUrls':urls});
 return {get:(path,width)=>route.GET(new Request('https://app.invalid/api/place-photo?path='+encodeURIComponent(path)+(width?'&w='+width:''))),calls,transforms};
}
test('unauthenticated request cannot query access or download',async()=>{
 const h=handler({user:false});const r=await h.get('old.jpg');assert.equal(r.status,401);assert.equal(h.calls.length,0);
 assert.match(r.headers.get('cache-control'),/private/);
});
test('missing migration and foreign couple fail closed without download',async()=>{
 for(const options of [{allowed:false},{accessError:{message:'function missing'}}]) {
 const h=handler(options);const r=await h.get('old.jpg');assert.equal(r.status,options.accessError?503:404);
 assert.equal(h.calls.filter(c=>c[0]==='download').length,0);
 }
});
test('authorized download is browser-private cached, same-origin and no signed URL',async()=>{
 const h=handler();const r=await h.get('old.jpg');assert.equal(r.status,200);
 assert.equal(r.headers.get('content-type'),'image/jpeg');assert.match(r.headers.get('cache-control'),/private, max-age=3600/);
 assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(r.headers.get('vary'),'Cookie');
 assert.equal(r.headers.get('location'),null);assert.equal(await r.text(),'fake-image');
 assert.deepEqual(h.calls,[['rpc','can_access_place_photo','old.jpg'],['download','place-photos','old.jpg']]);
});
test('thumbnail width is allowlisted and requested from private storage transform',async()=>{
 const h=handler();assert.equal((await h.get('old.jpg',320)).status,200);
 assert.equal(JSON.stringify(h.transforms[0]),JSON.stringify({width:320,quality:76,resize:'contain'}));
 const invalid=handler();assert.equal((await invalid.get('old.jpg',333)).status,200);assert.equal(invalid.transforms[0],undefined);
});
test('storage denial, invalid path, and active content fail closed',async()=>{
 assert.equal((await handler({downloadError:{message:'RLS denied'}}).get('old.jpg')).status,404);
 assert.equal((await handler().get('../old.jpg')).status,400);
 assert.equal((await handler({type:'text/html'}).get('old.jpg')).status,415);
});
