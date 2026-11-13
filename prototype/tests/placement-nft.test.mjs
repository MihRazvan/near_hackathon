import test from 'node:test';
import assert from 'node:assert/strict';
import {placementNft,placementNftPhase} from '../src/integration/placement-nft.mjs';

test('NFT artwork authority distinguishes minting, active editing, approval, expiry and unknown state',()=>{
 assert.equal(placementNftPhase({minted:false,active:true}), 'pending');
 assert.equal(placementNftPhase({minted:true,active:true,locked:false,outcome:'open'}), 'editable');
 assert.equal(placementNftPhase({minted:true,active:false,locked:true,outcome:'open'}), 'locked');
 assert.equal(placementNftPhase({minted:true,active:true,locked:true,outcome:'success'}), 'archived');
 assert.equal(placementNftPhase({minted:true,active:false,outcome:'open'}), 'archived');
 assert.equal(placementNftPhase({minted:true}), 'unknown');
 const expired=placementNft({phase:'archived',controller:'new-owner.near',originalPayer:'original.near',tokenId:'offer'});assert.match(expired,/new-owner.near/);assert.match(expired,/original.near/);assert.match(expired,/cannot reopen artwork editing/);assert.doesNotMatch(expired,/Artwork control open/);
});
test('the placement artifact labels illustrative rights and unissued tokens and escapes participant content',()=>{
 const preview=placementNft({example:true,controller:'Creative studio',phase:'editable'});assert.match(preview,/Example placement NFT/);assert.match(preview,/Illustration/);assert.doesNotMatch(preview,/NEAR mainnet/);
 const pending=placementNft({phase:'pending',tokenId:'reserved'});assert.match(pending,/Not issued yet/);assert.doesNotMatch(pending,/reserved|NFT identifier/);
 const actual=placementNft({phase:'locked',network:'sandbox',surface:'<b>Side</b>',controller:'<script>',originalPayer:'original.near',tokenId:'offer'});assert.match(actual,/NEAR Sandbox/);assert.match(actual,/&lt;script&gt;/);assert.match(actual,/&lt;b&gt;Side&lt;\/b&gt;/);assert.match(actual,/original wallets/);
});

test('legacy receipts keep a separate artwork controller distinct from token ownership',()=>{
 const html=placementNft({owner:'receipt.near',controller:'creative.near',phase:'editable'});assert.match(html,/data-nft-controller>receipt.near/);assert.match(html,/Creative controller<\/dt><dd>creative.near/);assert.match(html,/The creative controller can submit/);
});
