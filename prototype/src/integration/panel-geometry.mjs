export function panelPolygon(spot){const b=spot.box;return spot.polygon??[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]];}
export function reboxPanel(spot,box){return {...spot,box,...(spot.polygon?{polygon:spot.polygon.map(([x,y])=>[box.x+(x-spot.box.x)/spot.box.width*box.width,box.y+(y-spot.box.y)/spot.box.height*box.height])}:{})};}
export function polygonPath(spot,width=1000,height=1000){return panelPolygon(spot).map(([x,y],i)=>(i?'L':'M')+(x*width)+' '+(y*height)).join(' ')+'Z';}
export function movePanel(spot,dx,dy,{resize=false}={}){const b={...spot.box};if(resize){b.width=Math.max(.025,Math.min(1-b.x,b.width+dx));b.height=Math.max(.025,Math.min(1-b.y,b.height+dy));}else{b.x=Math.max(0,Math.min(1-b.width,b.x+dx));b.y=Math.max(0,Math.min(1-b.height,b.y+dy));}return reboxPanel(spot,b);}

export const PANEL_LIMIT=8;
export const MIN_PANEL=.025;
export function shapePanel(spot,shape){
 const {x,y,width:w,height:h}=spot.box;
 const unit=shape==='oval'?Array.from({length:12},(_,i)=>{const t=i*Math.PI/6;return [(.5+.5*Math.cos(t)),(.5+.5*Math.sin(t))];}):shape==='angled'?[[.12,0],[1,0],[.88,1],[0,1]]:[[0,0],[1,0],[1,1],[0,1]];
 return {...spot,polygon:unit.map(([u,v])=>[x+u*w,y+v*h])};
}
export function panelShape(spot){
 const points=panelPolygon(spot),b=spot.box,near=(x,y)=>Math.abs(x-y)<.000001;
 const oval=shapePanel(spot,'oval').polygon,angled=shapePanel(spot,'angled').polygon;
 if(points.length===12&&points.every(([x,y],i)=>near(x,oval[i][0])&&near(y,oval[i][1])))return 'oval';
 if(points.length===4&&points.every(([x,y],i)=>near(x,angled[i][0])&&near(y,angled[i][1])))return 'angled';
 if(points.length===4&&points.every(([x,y],i)=>near(x,b.x+(i===1||i===2?b.width:0))&&near(y,b.y+(i>=2?b.height:0))))return 'rectangle';
 return 'custom';
}
export function resizePanel(spot,handle,dx,dy){
 const b=spot.box;let x=b.x,y=b.y,right=x+b.width,bottom=y+b.height;
 if(handle.includes('w'))x=Math.max(0,Math.min(right-MIN_PANEL,x+dx));
 if(handle.includes('e'))right=Math.min(1,Math.max(x+MIN_PANEL,right+dx));
 if(handle.includes('n'))y=Math.max(0,Math.min(bottom-MIN_PANEL,y+dy));
 if(handle.includes('s'))bottom=Math.min(1,Math.max(y+MIN_PANEL,bottom+dy));
 return reboxPanel(spot,{x,y,width:right-x,height:bottom-y});
}
export function editPanelVertex(spot,index,point){
 const polygon=panelPolygon(spot).map(v=>[...v]);if(!polygon[index])return spot;
 polygon[index]=point.map(n=>Math.max(0,Math.min(1,n)));
 const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
 const area=Math.abs(polygon.reduce((sum,p,i)=>{const n=polygon[(i+1)%polygon.length];return sum+p[0]*n[1]-n[0]*p[1];},0))/2;
 // Concave body panels are valid. Crossing or overlapping edges are not.
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-10&&p[0]>=Math.min(a[0],b[0])-1e-10&&p[0]<=Math.max(a[0],b[0])+1e-10&&p[1]>=Math.min(a[1],b[1])-1e-10&&p[1]<=Math.max(a[1],b[1])+1e-10;
 const intersects=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
 let crossing=false;
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){if(j===i+1||i===0&&j===polygon.length-1)continue;if(intersects(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))crossing=true;}
 if(area<=.00001||Math.max(...xs)-Math.min(...xs)<MIN_PANEL||Math.max(...ys)-Math.min(...ys)<MIN_PANEL||crossing)return spot;
 return {...spot,polygon,box:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}};
}
export function newPanel(spots,{box={x:.33,y:.35,width:.3,height:.22},shape='rectangle',copy}={}){
 if(spots.length>=PANEL_LIMIT)throw new Error('You can add up to eight spots per vehicle.');
 const names=new Set(spots.map(p=>p.name));let number=1;while(names.has('Spot '+number))number++;
 const base=copy?{...structuredClone(copy),name:copy.name.slice(0,73)+' copy'}:{name:'Spot '+number,side:'left',box,suggestedPriceCents:'100',confidence:'low',requiresMeasurement:true,dimensionsCm:null};
 return copy?movePanel({...base,id:'spot-'+crypto.randomUUID().slice(0,8)},.03,.03):shapePanel({...base,id:'spot-'+crypto.randomUUID().slice(0,8)},shape);
}
