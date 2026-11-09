import { mkdir, open, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { KeyPair, KeyPairSigner } from 'near-api-js';
import { readPrivateFile } from './config.mjs';
import { assert } from './core.mjs';

// Dedicated test identities only. Keys are never returned by public application services.
export class KeyVault {
  constructor(directory){this.directory=directory;}
  path(label){assert(/^[a-z][a-z0-9-]{0,63}$/.test(label),'INVALID_KEY_LABEL','Invalid local identity label');return join(this.directory,label+'.json');}
  async identity(label){
    const file=this.path(label);
    try{
      const value=JSON.parse(await readPrivateFile(file)),key=KeyPair.fromString(value.privateKey),publicKey=key.getPublicKey();
      assert(publicKey.toString()===value.publicKey&&Buffer.from(publicKey.data).toString('hex')===value.accountId,'IDENTITY_CHANGED','Dedicated implicit identity does not match its recovery key');
      return {accountId:value.accountId,publicKey:value.publicKey,signer:new KeyPairSigner(key),recoveryFile:file};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(this.directory,{recursive:true,mode:0o700});const stat=await lstat(this.directory);
    assert(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_DIRECTORY_REQUIRED','Key directory must be owner-only');
    const key=KeyPair.fromRandom('ed25519'),publicKey=key.getPublicKey(),accountId=Buffer.from(publicKey.data).toString('hex');
    let handle;try{handle=await open(file,'wx',0o600);}catch(error){if(error.code==='EEXIST')return this.identity(label);throw error;}
    try{await handle.writeFile(JSON.stringify({accountId,publicKey:publicKey.toString(),privateKey:key.toString()})+'\n');await handle.sync();}finally{await handle.close();}
    return {accountId,publicKey:publicKey.toString(),signer:new KeyPairSigner(key),recoveryFile:file};
  }
}
