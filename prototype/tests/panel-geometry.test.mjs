import test from 'node:test';import assert from'node:assert/strict';import{panelPolygon,reboxPanel,polygonPath,movePanel}from'../src/integration/panel-geometry.mjs';
const spot={id:'door',box:{x:.2,y:.3,width:.4,height:.2},polygon:[[.2,.3],[.6,.3],[.55,.5],[.25,.5]]};
test('photo-relative contours remain aligned when moving and resizing without losing the panel ID',()=>{
 const moved=movePanel(spot,.1,.1);assert.equal(moved.id,'door');assert.ok(Math.abs(moved.polygon[0][0]-.3)<1e-9);assert.ok(Math.abs(moved.polygon[0][1]-.4)<1e-9);
 const resized=reboxPanel(spot,{x:.1,y:.2,width:.2,height:.4});assert.ok(Math.abs(resized.polygon[2][0]-.275)<1e-9);assert.ok(Math.abs(resized.polygon[2][1]-.6)<1e-9);
 assert.ok(Math.abs(Number(polygonPath(spot,1536,1024).slice(1).split(' ')[0])-307.2)<1e-8);assert.equal(panelPolygon({box:spot.box}).length,4);
 const bounded=movePanel(spot,10,-10);assert.equal(bounded.box.x,.6);assert.equal(bounded.box.y,0);
});

test('rectangle, angled and oval shapes stay inside their original spot bounds',async()=>{
 const {shapePanel,panelShape}=await import('../src/integration/panel-geometry.mjs');
 for(const shape of ['rectangle','angled','oval']){const p=shapePanel(spot,shape);assert.equal(p.id,spot.id);assert.equal(p.polygon.length,shape==='oval'?12:4);assert.ok(p.polygon.every(([x,y])=>x>=.2&&x<=.600001&&y>=.3&&y<=.500001));}
 assert.equal(panelShape(shapePanel(spot,'rectangle')),'rectangle');assert.equal(panelShape(shapePanel(spot,'oval')),'oval');
});
test('all resize handles keep the opposite side fixed and reject inverted or outside bounds',async()=>{
 const {resizePanel,editPanelVertex}=await import('../src/integration/panel-geometry.mjs');
 const left=resizePanel(spot,'w',.1,0);assert.ok(Math.abs(left.box.x-.3)<1e-9);assert.ok(Math.abs(left.box.width-.3)<1e-9);
 for(const handle of ['nw','n','ne','e','se','s','sw','w'])for(const delta of [-10,10]){const p=resizePanel(spot,handle,delta,delta);assert.ok(p.box.x>=0&&p.box.y>=0&&p.box.width>=.02499&&p.box.height>=.02499&&p.box.x+p.box.width<=1.000001&&p.box.y+p.box.height<=1.000001);}
 assert.deepEqual(editPanelVertex(spot,0,[.6,.5]),spot);
});

test('concave fairing outlines can be edited while self-crossing outlines are rejected',async()=>{
 const {editPanelVertex}=await import('../src/integration/panel-geometry.mjs');
 const fairing={id:'fairing',box:{x:.2,y:.2,width:.6,height:.6},polygon:[[.2,.2],[.8,.2],[.45,.45],[.2,.8]]};
 const edited=editPanelVertex(fairing,0,[.21,.21]);assert.notDeepEqual(edited.polygon,fairing.polygon);assert.equal(edited.id,fairing.id);
 const crossing=editPanelVertex({id:'square',box:{x:.2,y:.2,width:.6,height:.6}},0,[.9,.6]);assert.equal(crossing.polygon,undefined);
});
