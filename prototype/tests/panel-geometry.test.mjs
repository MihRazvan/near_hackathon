import test from 'node:test';import assert from'node:assert/strict';import{panelPolygon,reboxPanel,polygonPath,movePanel}from'../src/integration/panel-geometry.mjs';
const spot={id:'door',box:{x:.2,y:.3,width:.4,height:.2},polygon:[[.2,.3],[.6,.3],[.55,.5],[.25,.5]]};
test('photo-relative contours remain aligned when moving and resizing without losing the panel ID',()=>{
 const moved=movePanel(spot,.1,.1);assert.equal(moved.id,'door');assert.ok(Math.abs(moved.polygon[0][0]-.3)<1e-9);assert.ok(Math.abs(moved.polygon[0][1]-.4)<1e-9);
 const resized=reboxPanel(spot,{x:.1,y:.2,width:.2,height:.4});assert.ok(Math.abs(resized.polygon[2][0]-.275)<1e-9);assert.ok(Math.abs(resized.polygon[2][1]-.6)<1e-9);
 assert.ok(Math.abs(Number(polygonPath(spot,1536,1024).slice(1).split(' ')[0])-307.2)<1e-8);assert.equal(panelPolygon({box:spot.box}).length,4);
 const bounded=movePanel(spot,10,-10);assert.equal(bounded.box.x,.6);assert.equal(bounded.box.y,0);
});
