export function reservationGroup(title,surface,price){
 if(!/^\d+$/.test(String(price??''))||BigInt(price)<=0n)throw new Error('Refresh this spot to get its current reservation price.');
 return {name:[title,surface].filter(v=>typeof v==='string'&&v.trim()).join(' · ').slice(0,100)||'Ad reservation',budgetMicroUsdc:BigInt(price).toString()};
}
// A route has a minimum useful size; keep its surplus available to this wallet.
export function fundingAmount(price,balance,{minimum='150000'}={}){
 const missing=BigInt(price)-BigInt(balance);return (missing>BigInt(minimum)?missing:BigInt(minimum)).toString();
}
export function campaignSchedule(input,{custom=false}={}){
 const dates=Object.fromEntries(Object.entries(input).map(([key,value])=>[key,new Date(value).toISOString()]));
 const close=Date.parse(dates.biddingClose),start=Date.parse(dates.serviceStart),end=Date.parse(dates.serviceEnd);
 if(!(close<start&&start<end))throw new Error('Bookings must close before advertising starts, and advertising must end after it starts.');
 if(!custom){dates.artworkDue=new Date(close+Math.floor((start-close)/2)).toISOString();dates.installationDue=dates.serviceStart;dates.reviewEnd=new Date(end+86400000).toISOString();}
 return dates;
}
