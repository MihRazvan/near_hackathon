// Presentation metadata is useful only when it matches the actual on-chain
// commitment. A saved upload alone never establishes artwork or approval.
export function committedArtifactMedia(store,snapshot){
 const references={artwork:snapshot.rights?.proposal,delivery:snapshot.campaign?.delivery_proof},artifacts={};
 if(!Object.values(references).some(r=>r?.artifact_uri))return artifacts;
 const media=store.list('media');
 for(const [kind,record] of Object.entries(references)){
  if(!record?.artifact_uri||typeof record.artifact_sha256!=='string')continue;
  const sha256=Buffer.from(record.artifact_sha256,'base64').toString('hex');
  if(!/^[0-9a-f]{64}$/.test(sha256))continue;
  const m=media.find(m=>m.public===true&&m.status==='verified'&&m.uri===record.artifact_uri&&m.sha256===sha256);
  if(m)artifacts[kind]={uri:m.uri,sha256:m.sha256,mime:m.mime,bytes:m.bytes};
 }
 return artifacts;
}
