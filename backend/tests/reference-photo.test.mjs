import test from'node:test';import assert from'node:assert/strict';import{Store}from'../src/store.mjs';import{serveReferencePhoto}from'../src/reference-photo.mjs';
test('private reference photos revalidate for their owner; a different wallet cannot get a cached 304',()=>{
 const store=new Store(),bytes=Buffer.from([137,80,78,71,13,10,26,10]),headers={};let status,body;
 const response={setHeader:(name,value)=>headers[name]=value,writeHead:(value,fields)=>{status=value;Object.assign(headers,fields);},end:value=>body=value};
 try{store.insert('asset','photo','owner.near',{photoDataUrl:'data:image/png;base64,'+bytes.toString('base64')});
  serveReferencePhoto({store,wallet:'owner.near',assetId:'photo',request:{method:'GET',headers:{}},response});assert.equal(status,200);assert.deepEqual(body,bytes);assert.equal(headers['Content-Type'],'image/png');assert.match(headers['Cache-Control'],/private.*must-revalidate/);
  const request={method:'GET',headers:{'if-none-match':headers.ETag}};serveReferencePhoto({store,wallet:'owner.near',assetId:'photo',request,response});assert.equal(status,304);
  assert.throws(()=>serveReferencePhoto({store,wallet:'other.near',assetId:'photo',request,response}),{code:'NOT_FOUND'});
 }finally{store.close();}
});
