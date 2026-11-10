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
  ]),
  ...group("account", [
    ["A01","/sign-in","Wallet sign-in"],
    ["A02","/welcome","Create your profile"],
    ["A03","/account/recovery","Account recovery"],
  ]),
  ...group("buyer", [
    ["B01","/buy","Buyer overview"],
    ["B02","/buy/campaigns","Campaigns"],
    ["B03","/buy/campaigns/new","New campaign"],
    ["B04","/buy/campaigns/:id","Campaign workspace"],
    ["B05","/buy/saved","Saved spaces"],
    ["B06","/checkout/:intentId","Checkout"],
    ["B07","/payments/:id","Payment progress"],
    ["B08","/buy/placements/:id","Placement workspace"],
    ["B09","/buy/placements/:id/artwork","Creative editor"],
    ["B10","/buy/campaigns/:id/report","Campaign report"],
    ["B11","/buy/money","Money & credits"],
    ["B12","/buy/withdrawals/:id","Credit withdrawal"],
    ["B13","/receipts/:id","Receipt"],
  ]),
  ...group("owner", [
    ["O01","/host","Owner overview"],
    ["O02","/host/assets","My assets"],
    ["O03","/host/assets/new","Create asset"],
    ["O04","/host/capture/:session","Desktop capture handoff"],
    ["O05","/capture/:session","Phone capture"],
    ["O06","/host/assets/:id/review","Review generated asset"],
    ["O07","/host/assets/:id","Asset workspace"],
    ["O08","/host/assets/:id/spots","Surface editor"],
    ["O09","/host/sales","Sales"],
    ["O10","/host/sales/new","Create sale"],
    ["O11","/host/sales/:id/edit","Edit sale"],
    ["O12","/host/sales/:id","Sale workspace"],
    ["O13","/host/bookings","Owner bookings"],
    ["O14","/host/bookings/:id","Owner booking"],
    ["O15","/host/bookings/:id/artwork","Artwork review"],
    ["O16","/host/sales/:id/fulfillment","Production & installation"],
    ["O17","/host/calendar","Availability calendar"],
    ["O18","/host/analytics","Owner analytics"],
    ["O19","/host/earnings","Earnings"],
    ["O20","/host/payouts/:id","Payout"],
  ]),
  ...group("shared", [
    ["S01","/inbox","Inbox"],
    ["S02","/inbox/:threadId","Conversation"],
    ["S03","/notifications","Notifications"],
    ["S04","/settings/profile","Profile"],
    ["S05","/settings/workspace","Workspace & brand"],
    ["S06","/settings/wallets","Wallets"],
    ["S07","/settings/notifications","Notification settings"],
    ["S08","/settings/billing","Billing & documents"],
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
const notFound=()=>({...routes.find(r=>r.id==='G01'),params:{}});
export function matchRoute(path) {
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
