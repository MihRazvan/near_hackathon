import test from 'node:test';
import assert from 'node:assert/strict';
import {fundingAmount,campaignSchedule,reservationGroup} from '../src/integration/checkout-state.mjs';
test('an ordinary reservation group is capped at the exact quote without floating point rounding or an unrelated default budget',()=>{
 assert.deepEqual(reservationGroup('City van','Cargo panel','10000'),{name:'City van · Cargo panel',budgetMicroUsdc:'10000'});
 assert.equal(reservationGroup('Vehicle','Panel','9007199254740993').budgetMicroUsdc,'9007199254740993');
 assert.equal(reservationGroup('A'.repeat(100),'Panel','10000').name.length,100);
 for(const value of [null,'0','-1','1.5','unknown'])assert.throws(()=>reservationGroup('Van','Panel',value),/current reservation price/);
});
test('funding keeps the route minimum and exact shortfall without floating point rounding',()=>{
 assert.equal(fundingAmount('10000','0'),'150000');assert.equal(fundingAmount('2000000','1500000'),'500000');assert.equal(fundingAmount('9007199254740993','1'),'9007199254740992');
});
test('ordinary campaign dates derive safe artwork, installation and review deadlines, preserving explicit custom dates',()=>{
 const input={biddingClose:'2026-11-20T10:00:00Z',artworkDue:'2026-11-20T11:00:00Z',installationDue:'2026-11-22T09:00:00Z',serviceStart:'2026-11-22T10:00:00Z',serviceEnd:'2026-11-29T10:00:00Z',reviewEnd:'2026-12-01T10:00:00Z'};
 const normal=campaignSchedule(input);assert.equal(normal.artworkDue,'2026-11-21T10:00:00.000Z');assert.equal(normal.installationDue,normal.serviceStart);assert.equal(normal.reviewEnd,'2026-11-30T10:00:00.000Z');
 assert.equal(campaignSchedule(input,{custom:true}).reviewEnd,'2026-12-01T10:00:00.000Z');assert.throws(()=>campaignSchedule({...input,serviceStart:input.biddingClose}),/Bookings must close/);
});
