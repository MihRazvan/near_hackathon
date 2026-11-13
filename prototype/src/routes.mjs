const group=(scope,items)=>items.map(([id,path,title])=>({id,path,title,scope}));
export const routes = [
  ...group("public", [
    ["P01","/","Home"],
    ["P02","/explore","Explore spaces"],
    ["P03","/spaces/:slug","Vehicle & spot selection"],
    ["P04","/owners/:slug","Owner profile"],
    ["P07","/help","Help center"],
    ["P08","/help/:article","Help article"],
    ["P09","/policies/:policy","Policies"],
    ["P10","/records/:id","Campaign record"],
  ]),
  ...group("account", [
    ["A01","/sign-in","Wallet sign-in"],
    ["A02","/welcome","Create your profile"],
    ["A03","/account/recovery","Payment help"],
  ]),
  ...group("buyer", [
    ["B01","/profile","Your profile"],
    ["B04","/profile/campaigns/:id","Campaign bookings"],
    ["B06","/checkout/:intentId","Checkout"],
    ["B07","/payments/:id","Payment progress"],
    ["B08","/profile/placements/:id","Placement details"],
    ["B09","/profile/placements/:id/artwork","Creative editor"],
    ["B10","/profile/campaigns/:id/report","Campaign report"],
    ["B11","/profile/balance","Balance & refunds"],
    ["B12","/profile/withdrawals/:id","Credit withdrawal"],
    ["B13","/receipts/:id","Receipt"],
  ]),
  ...group("owner", [
    ["O01","/host","Dashboard"],
    ["O03","/host/assets/new","Add your vehicle"],
    ["O04","/host/capture/:session","Desktop capture handoff"],
    ["O05","/capture/:session","Phone capture"],
    ["O06","/host/assets/:id/review","Review your panels"],
    ["O07","/host/assets/:id","Edit vehicle"],
    ["O08","/host/assets/:id/spots","Edit panels"],
    ["O10","/host/sales/new","Campaign details"],
    ["O11","/host/sales/:id/edit","Edit campaign"],
    ["O12","/host/sales/:id","Manage campaign"],
    ["O14","/host/bookings/:id","Advertiser booking"],
    ["O15","/host/bookings/:id/artwork","Artwork review"],
    ["O16","/host/sales/:id/fulfillment","Production & installation"],
  ]),
  ...group("shared", [
    ["S02","/inbox/:threadId","Conversation"],
    ["S06","/settings/wallets","Wallets"],
    ["S09","/support/new","Contact support"],
    ["S10","/support/cases/:id","Support case"],
  ]),
  ...group("ops", [
    ["M01","/ops","Operations overview"],
    ["M02","/ops/listings/:id","Listing review"],
    ["M03","/ops/cases/:id","Dispute review"],
    ["M04","/ops/payments/:id","Payment reconciliation"],
    ["M05","/ops/audit","Audit history"],
  ]),
  ...group("global", [
    ["G01","/_not-found","Not found"],
    ["G02","/_access","Access denied"],
    ["G03","/_maintenance","Temporarily unavailable"],
  ]),
];
const mergedPages = new Map([
 ['/profile/campaigns', ['/profile', 'orders']],
 ['/profile/campaigns/new', ['/explore', '']],
 ['/profile/saved', ['/profile', 'saved']],
 ['/profile/money', ['/profile/balance', '']],
 ['/host/assets', ['/host', 'vehicles']],
 ['/host/sales', ['/host', 'campaigns']],
 ['/host/bookings', ['/host', 'campaigns']],
 ['/host/calendar', ['/host', 'campaigns']],
 ['/host/analytics', ['/host', 'earnings']],
 ['/host/earnings', ['/host', 'earnings']],
 ['/settings/profile', ['/profile', 'details']],
 ['/settings/workspace', ['/profile', 'brand']],
 ['/settings/notifications', ['/profile', 'details']],
 ['/settings/billing', ['/profile', 'orders']],
 ['/notifications', ['/profile', '']],
 ['/inbox', ['/profile', 'orders']],
]);
export function canonicalDestination(path) {
 const url=new URL(path,'https://everywhere.invalid');
 let pathname=url.pathname.replace(/\/$/,'')||'/';
 if(pathname==='/buy'||pathname.startsWith('/buy/'))pathname='/profile'+pathname.slice(4);
 const merged=mergedPages.get(pathname)??(/^\/host\/payouts\/[^/]+$/.test(pathname)?['/host','earnings']:null);
 if(merged){pathname=merged[0];if(!url.hash&&merged[1])url.hash=merged[1];}
 return pathname+url.search+url.hash;
}
const notFound=()=>({...routes.find(r=>r.id==='G01'),params:{}});
export function matchRoute(path) {
  path=new URL(canonicalDestination(path),'https://everywhere.invalid').pathname;
  for (const r of routes) {
    const names=[];
    const pattern=r.path.split('/').map(part=>part.startsWith(':')?(names.push(part.slice(1)),'([^/]+)'):part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('/');
    const match=path.match(new RegExp('^'+pattern+'/?$'));
    if(match){
      try{return {...r,params:Object.fromEntries(names.map((name,i)=>[name,decodeURIComponent(match[i+1])]))};}
      catch{return notFound();}
    }
  }
  return notFound();
}
