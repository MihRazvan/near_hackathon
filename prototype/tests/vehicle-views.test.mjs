import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleViews,viewSpots,activePhotoView,viewPhoto,editorViews} from '../src/integration/vehicle-views.mjs';
import {vehicleEditor} from '../src/integration/vehicle-editor.mjs';
import {placementPhoto} from '../src/integration/placement-photo.mjs';
const box={x:.2,y:.2,width:.2,height:.2},asset={title:'Van',photoUrl:'/left.jpg',spots:[{id:'a',side:'left',box,name:'Side panel'},{id:'b',side:'rear',photoViewId:'rear',box,name:'Rear door'}],primaryPhotoSide:'left',photoViews:[{id:'rear',side:'rear',photoUrl:'/rear.jpg',imageProvenance:'owner-photo'}]};
test('a view switch uses a different supplied photo and only its own spots; a legacy single photograph stays intact',()=>{
 assert.equal(vehicleViews(asset).length,2);assert.equal(viewPhoto(activePhotoView(asset,'b')),'/rear.jpg');assert.deepEqual(viewSpots(asset,'main').map(({p})=>p.id),['a']);assert.deepEqual(viewSpots(asset,'rear').map(({p})=>p.id),['b']);
 const html=vehicleEditor(asset,'b');assert.match(html,/src="\/rear.jpg"/);assert.match(html,/data-panel="b"/);assert.doesNotMatch(html,/data-panel="a"/);assert.match(editorViews(asset,'rear'),/data-editor-view="rear" aria-pressed="true"/);
 const legacy={...asset,photoViews:undefined,spots:asset.spots.map(({photoViewId,...p})=>p)};assert.equal(viewSpots(legacy,'main').length,2);assert.match(vehicleEditor(legacy,'b'),/src="\/left.jpg"/);
});
test('marketplace photos preserve global spot numbers and select the actual view for a reservation',()=>{
 const entries=asset.spots.map((geometry,i)=>({geometry,key:geometry.id,spot:{id:geometry.id}})),html=placementPhoto(asset,entries,'b',e=>'/spot/'+e.key);
 assert.match(html,/src="\/rear.jpg"/);assert.match(html,/aria-label="Select Rear door"/);assert.match(html,/<span>2<\/span>/);assert.doesNotMatch(html,/aria-label="Select Side panel"/);assert.match(html,/Vehicle photo views/);assert.match(html,/href="\/spot\/a"/);
});
