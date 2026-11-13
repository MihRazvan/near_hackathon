// Presentation-only destinations. Wallet authentication and return handling stay unchanged.
export function entryHref(destination,session){
 return session?destination:'/sign-in?next='+encodeURIComponent(destination);
}
export function walletPurpose(destination=''){
 if(destination.startsWith('/host/assets/new'))return {title:'Save your vehicle. Make it ad space.',description:'Connect your wallet to create a private vehicle draft. No payment is requested.',steps:['Add a photo or description','Edit your advertising spots','Choose dates and prices'],kind:'listing'};
 if(destination.startsWith('/checkout/'))return {title:'Your spot is one step closer.',description:'Connect your wallet to review this placement and its exact price. Signing in does not move money.',steps:['Keep your chosen vehicle and spot','Review dates and the exact amount','Approve payment in your wallet'],kind:'booking'};
 if(destination.startsWith('/host'))return {title:'Your listings, in one place.',description:'Connect the wallet you use to list space. Your drafts, listings and earnings stay with this account.',steps:['Continue a saved vehicle','Manage your listings','Review artwork and earnings'],kind:'listing'};
 return {title:'Welcome to Everywhere.',description:'Connect your wallet to manage placements, artwork and available funds. Each payment needs your approval.',steps:['Your advertising placements','Your placement NFTs','Your balance and refunds'],kind:'account'};
}
