import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingAmount,campaignSchedule} from '../src/integration/checkout-state.mjs';
test('funding keeps the route minimum and exact shortfall without floating point rounding',()=>{
 assert.equal(fundingAmount('10000','0'),'150000');assert.equal(fundingAmount('2000000','1500000'),'500000');assert.equal(fundingAmount('9007199254740993','1'),'9007199254740992');
});
test('ordinary campaign dates derive safe artwork, installation and review deadlines, preserving explicit custom dates',()=>{
 const input={biddingClose:'2026-11-20T10:00:00Z',artworkDue:'2026-11-20T11:00:00Z',installationDue:'2026-11-22T09:00:00Z',serviceStart:'2026-11-22T10:00:00Z',serviceEnd:'2026-11-29T10:00:00Z',reviewEnd:'2026-12-01T10:00:00Z'};
 const normal=campaignSchedule(input);assert.equal(normal.artworkDue,'2026-11-21T10:00:00.000Z');assert.equal(normal.installationDue,normal.serviceStart);assert.equal(normal.reviewEnd,'2026-11-30T10:00:00.000Z');
 assert.equal(campaignSchedule(input,{custom:true}).reviewEnd,'2026-12-01T10:00:00.000Z');assert.throws(()=>campaignSchedule({...input,serviceStart:input.biddingClose}),/Bookings must close/);
});
