// Homepage scroll story: one van panel from a phone photo to the owner's payout.
// The markup is meaningful without JavaScript (captions render as a list). When motion is
// allowed, GSAP + ScrollTrigger + Lenis load on demand and pin the illustrated scene.
// Juniper Coffee and Northside Bikes are fictional advertisers. Offer-card prices are example values.
import { wordmarkSvg } from './brand.mjs';

export function storyMarkup() {
  return `<section class="st-story" aria-label="How everywhere works, told through one van panel">
  <div class="st-stage" id="st-stage">
    <svg id="st-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="st-gPost" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FFB21A"/><stop offset=".5" stop-color="#FF3B7F"/><stop offset="1" stop-color="#7B4DFF"/></linearGradient>
        <clipPath id="st-panelClip"><rect x="0" y="0" width="214" height="80" rx="6"/></clipPath>
        <clipPath id="st-vanClip"><path d="M30,150 V58 Q30,36 52,36 H262 Q282,36 294,50 L340,100 Q362,104 366,124 V150 Z"/></clipPath>
        <g id="st-artA">
          <rect width="214" height="80" fill="#1F5C46"/>
          <circle cx="182" cy="18" r="34" fill="#F2B64B"/>
          <text x="14" y="42" font-size="30" fill="#F6EBD2" style="font-family:'Everywhere Text';font-weight:820;font-variation-settings:'wdth' 125">Juniper</text>
          <text x="15" y="63" font-size="11.5" fill="#F6EBD2" style="font-family:'Everywhere Text';font-weight:600">Coffee from 7am, Kreuzberg</text>
        </g>
        <g id="st-artB">
          <rect width="214" height="80" fill="#FF5FA2"/>
          <text x="13" y="37" font-size="27" fill="#0D1030" style="font-family:'Everywhere Text';font-weight:860;font-variation-settings:'wdth' 118">Northside</text>
          <text x="13" y="66" font-size="27" fill="#0D1030" style="font-family:'Everywhere Text';font-weight:860;font-variation-settings:'wdth' 118">Bikes</text>
          <circle cx="188" cy="30" r="16" fill="none" stroke="#0D1030" stroke-width="5"/>
          <circle cx="188" cy="30" r="4" fill="#0D1030"/>
          <text x="112" y="66" font-size="10" fill="#0D1030" style="font-family:'Everywhere Text';font-weight:650">Fixed in a day</text>
        </g>
        <g id="st-artC">
          <rect width="214" height="80" fill="#0D1030"/>
          <rect x="0" y="0" width="70" height="80" fill="#FF5FA2"/>
          <circle cx="35" cy="40" r="22" fill="none" stroke="#0D1030" stroke-width="7"/>
          <circle cx="35" cy="40" r="5" fill="#0D1030"/>
          <text x="82" y="42" font-size="23" fill="#FF5FA2" style="font-family:'Everywhere Text';font-weight:860;font-variation-settings:'wdth' 108,'slnt' -10">Ride north.</text>
          <text x="83" y="62" font-size="10.5" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:650">Northside Bikes</text>
        </g>
        <symbol id="st-vanSym" viewBox="0 20 400 168">
          <path d="M30,150 V58 Q30,36 52,36 H262 Q282,36 294,50 L340,100 Q362,104 366,124 V150 Z" fill="#F4F4EF"/>
          <path d="M284,54 L324,100 H284 Z" fill="#C9D3FF"/>
          <g transform="translate(48 54)" clip-path="url(#st-panelClip)"><use href="#st-artC"/></g>
          <circle cx="102" cy="150" r="27" fill="#0D1030"/><circle cx="300" cy="150" r="27" fill="#0D1030"/>
          <text x="102" y="160" text-anchor="middle" font-size="40" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:820;font-variation-settings:'wdth' 151">e</text>
          <text x="300" y="160" text-anchor="middle" font-size="40" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:820;font-variation-settings:'wdth' 151">e</text>
        </symbol>
      </defs>

      <rect id="st-sky" width="1600" height="900" fill="#C9D3FF"/>
      <g id="st-stars" opacity="0"></g>
      <circle id="st-sun" cx="1260" cy="170" r="58" fill="#FFB21A"/>
      <circle id="st-moon" cx="1300" cy="150" r="34" fill="#F4F4EF" opacity="0"/>
      <g id="st-far"></g>
      <g id="st-mid"></g>
      <g id="st-street"></g>
      <rect id="st-trail" x="-40" y="622.6" width="706" height="3.6" rx="1.8" fill="#F4F4EF"/>

      <g id="st-van" transform="translate(560 452) scale(1.2)">
        <path d="M30,150 V58 Q30,36 52,36 H262 Q282,36 294,50 L340,100 Q362,104 366,124 V150 Z" fill="#F4F4EF"/>
        <path d="M284,54 L324,100 H284 Z" fill="#C9D3FF"/>
        <rect x="356" y="110" width="10" height="9" rx="2" fill="#FFB21A"/>
        <rect x="30" y="108" width="7" height="16" rx="2" fill="#FF3B1F"/>
        <path d="M270,62 V138" stroke="#DADAD2" stroke-width="2"/>
        <g transform="translate(48 54)" clip-path="url(#st-panelClip)">
          <rect width="214" height="80" fill="#E6E6E0"/>
          <g id="st-panelArt"><use href="#st-artC"/></g>
          <rect id="st-sheen" x="-60" y="-10" width="40" height="100" fill="#FFFFFF" opacity="0" transform="skewX(-18)"/>
        </g>
        <g id="st-outlines" class="st-overlay" opacity="0">
          <rect x="46" y="52" width="218" height="84" rx="7" fill="rgba(30,77,255,.12)" stroke="#1E4DFF" stroke-width="2.4" stroke-dasharray="7 5"/>
          <rect x="276" y="104" width="58" height="34" rx="5" fill="rgba(30,77,255,.12)" stroke="#1E4DFF" stroke-width="2.4" stroke-dasharray="7 5"/>
          <g transform="translate(46 30)"><rect width="86" height="18" rx="9" fill="#1E4DFF"/><text id="st-lbl1a" x="10" y="13" font-size="11" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:700">Panel 1</text><text id="st-lbl1b" x="10" y="13" font-size="11" fill="#F4F4EF" opacity="0" style="font-family:'Everywhere Text';font-weight:700">Cargo panel</text></g>
          <g transform="translate(276 82)"><rect width="66" height="18" rx="9" fill="#1E4DFF"/><text x="10" y="13" font-size="11" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:700">Cab door</text></g>
        </g>
        <g clip-path="url(#st-vanClip)"><rect id="st-scan" class="st-overlay" x="20" y="30" width="6" height="130" fill="#1E4DFF" opacity="0"/></g>
        <g transform="translate(102 150)"><circle r="27" fill="#0D1030"/><g class="st-spin"><text y="9.7" text-anchor="middle" font-size="40.5" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:820;font-variation-settings:'wdth' 151">e</text></g></g>
        <g transform="translate(300 150)"><circle r="27" fill="#0D1030"/><g class="st-spin"><text y="9.7" text-anchor="middle" font-size="40.5" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:820;font-variation-settings:'wdth' 151">e</text></g></g>
      </g>

      <g id="st-social"></g>
      <g id="st-vault" class="st-overlay" opacity="0">
        <rect x="0" y="0" width="190" height="160" rx="20" fill="#0D1030"/>
        <rect x="60" y="-6" width="70" height="12" rx="6" fill="#1E4DFF"/>
        <circle cx="95" cy="74" r="40" fill="none" stroke="#C9D3FF" stroke-width="6"/>
        <path d="M95,44 V104 M65,74 H125" stroke="#C9D3FF" stroke-width="5" stroke-linecap="round"/>
        <g transform="translate(14 14)"><rect width="34" height="34" rx="9" fill="#FFFFFF"/><path d="M10,25 V9 L24,25 V9" fill="none" stroke="#0D1030" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g><text x="95" y="143" text-anchor="middle" font-size="14" fill="#F4F4EF" style="font-family:'Everywhere Text';font-weight:700;font-variation-settings:'wdth' 120">Escrow on NEAR</text>
      </g>
      <g id="st-coinA" class="st-overlay" opacity="0"><circle r="46" fill="#2775CA"/><path d="M-21,-31 A37,37 0 0 0 -21,31" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M21,-31 A37,37 0 0 1 21,31" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><text y="15" text-anchor="middle" font-size="44" fill="#FFFFFF" style="font-family:'Everywhere Text';font-weight:800">$</text><rect x="-30" y="34" width="60" height="22" rx="11" fill="#0D1030"/><text y="50" text-anchor="middle" font-size="13" fill="#FFFFFF" style="font-family:'Everywhere Text';font-weight:800;letter-spacing:.04em">USDC</text></g>
      <g id="st-coinB" class="st-overlay" opacity="0"><circle r="46" fill="#2775CA"/><path d="M-21,-31 A37,37 0 0 0 -21,31" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><path d="M21,-31 A37,37 0 0 1 21,31" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><text y="15" text-anchor="middle" font-size="44" fill="#FFFFFF" style="font-family:'Everywhere Text';font-weight:800">$</text><rect x="-30" y="34" width="60" height="22" rx="11" fill="#0D1030"/><text y="50" text-anchor="middle" font-size="13" fill="#FFFFFF" style="font-family:'Everywhere Text';font-weight:800;letter-spacing:.04em">USDC</text></g>
      <g id="st-poster" class="st-overlay" opacity="0">
        <rect id="st-posterBg" x="-6" y="-6" width="226" height="92" rx="9" fill="#FFFFFF"/>
        <g clip-path="url(#st-panelClip)">
          <g id="st-pA"><use href="#st-artA"/></g>
          <g id="st-pB" transform="translate(214 0)"><use href="#st-artB"/></g>
          <g id="st-pC" transform="translate(0 80)"><use href="#st-artC"/></g>
        </g>
      </g>
      <rect id="st-flash" width="1600" height="900" fill="#FFFFFF" opacity="0"/>
    </svg>

    <ol class="st-caps" id="st-caps">
      <li class="st-cap st-hero">
        
        <h2>Advertise on everything.</h2>
        <p>Vans, cargo bikes, motorbikes and cars already cross your city. Scroll to follow one van panel from a phone photo to the owner's payout.</p>
      </li>
      <li class="st-cap"><span class="st-step">Step 1 of 8</span><h2>Photograph a vehicle.</h2><p>NEAR AI proposes editable panel outlines. Move them by hand, or just say what to change. Drafts stay private until you publish.</p></li>
      <li class="st-cap"><span class="st-step">Step 2 of 8</span><h2>Set dates, prices and takeover rules.</h2><p>Prices are all-in, printing and fitting included. Each panel is its own offer, and takeovers are switched on panel by panel.</p></li>
      <li class="st-cap"><span class="st-step">Step 3 of 8</span><h2>An advertiser books in USDC.</h2><p>From an EVM wallet through NEAR Intents, or from a NEAR wallet. The payment waits in the shared hub's escrow.</p></li>
      <li class="st-cap"><span class="st-step">Step 4 of 8</span><h2>A takeover, before production.</h2><p>On panels that allow it, a new advertiser can replace the current one until booking closes. The original payer can claim a refund, plus a reward if the campaign succeeds.</p></li>
      <li class="st-cap"><span class="st-step">Step 5 of 8</span><h2>The final payer gets a placement NFT.</h2><p>It is the right to manage this panel's artwork. Hand it to a studio and the studio takes over the creative. Refunds and earnings stay with their original wallets.</p></li>
      <li class="st-cap"><span class="st-step">Step 6 of 8</span><h2>Exact artwork approved, then fitted.</h2><p>The owner approves one specific revision, which locks editing before printing. After installing it, the owner uploads photos as evidence.</p></li>
      <li class="st-cap"><span class="st-step">Step 7 of 8</span><h2>Out on the streets, under review.</h2><p>Anyone in the campaign can open an issue before review ends. A separate arbiter decides disputed cases.</p>
        <div class="st-review st-overlay" aria-hidden="true"><div class="st-bar"><span class="st-track"></span><span class="st-fill" id="st-revFill"></span></div><div class="st-lbl"><span class="st-l1">Review window open</span><span class="st-l2">No issue opened</span></div></div>
      </li>
      <li class="st-cap st-dark"><span class="st-step">Step 8 of 8</span><h2>Settled, then withdrawn.</h2><p>A background keeper finalizes success once service and review are over. The owner and the displaced advertiser each claim their own USDC.</p></li>
    </ol>

    <div class="st-chatb st-overlay" id="st-chat" aria-hidden="true"><small>You, to the panel editor</small>Rename the first panel to Cargo panel</div>

    <div class="st-scard st-overlay" id="st-offer" aria-hidden="true">
      <h3>Berlin workshop van</h3>
      <div class="st-sub">Campaign: 1 to 30 March <span class="st-stag">Example values</span></div>
      <div class="st-rowx"><span><b>Cargo panel</b><br>240 USDC, all-in</span><span style="display:flex;align-items:center;gap:8px;font-size:12px">Takeovers<span class="st-toggle" id="st-tg1"><i></i></span></span></div>
      <div class="st-rowx"><span><b>Cab door</b><br>60 USDC, all-in</span><span style="display:flex;align-items:center;gap:8px;font-size:12px">Takeovers<span class="st-toggle"><i></i></span></span></div>
      <div class="st-approve"><span class="st-a1">Publish with wallet</span><span class="st-a2" id="st-published">Published, 2 offers</span></div>
    </div>

    <div class="st-stamp st-overlay" id="st-stamp" aria-hidden="true">Bookings closed</div>

    <div class="st-scard st-snft st-overlay" id="st-nft" aria-hidden="true">
      <div style="display:flex;justify-content:space-between;align-items:center"><h3>Placement NFT</h3><span class="st-stag">NEP-171</span></div>
      <div class="st-sub">Cargo panel, Berlin workshop van</div>
      <svg class="st-art" viewBox="0 0 214 80"><use id="st-nftArtB" href="#st-artB"/></svg>
      <div class="st-rowx"><span>Artwork control</span><b class="st-swap"><span id="st-ctl1">Northside Bikes</span><span id="st-ctl2">Studio</span></b></div>
      <div class="st-rowx"><span>Refund and reward</span><b>Juniper Coffee</b></div>
      <div class="st-rowx"><span>Owner earnings</span><b>Van owner</b></div>
    </div>

    <div class="st-scard st-phone st-overlay" id="st-phone" aria-hidden="true">
      <div class="st-screen">
        <div class="st-meta">Artwork review, revision 2 from the studio</div>
        <svg class="st-art" viewBox="0 0 214 80"><use href="#st-artC"/></svg>
        <div class="st-q">Approve this exact revision?</div>
        <div class="st-meta">Editing locks once you approve.</div>
        <div class="st-approve"><span class="st-a1">Approve revision 2</span><span class="st-a2" id="st-approved"><svg width="18" height="18" viewBox="0 0 18 18"><path d="M3,9.5 L7.5,14 L15,5" fill="none" stroke="#F4F4EF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Approved and locked</span></div>
      </div>
    </div>

    <div class="st-schip st-overlay" id="st-chip" aria-hidden="true"><span class="st-coin">$</span>Juniper Coffee: refund claimable, reward if the campaign succeeds</div>

    <div class="st-scard st-polaroid st-overlay" id="st-polaroid" aria-hidden="true">
      <div class="st-shot"><svg viewBox="0 20 400 168" width="88%"><use href="#st-vanSym"/></svg></div>
      <p><b>Installation evidence uploaded.</b> Supplied by the owner. The NFT does not prove the install; the evidence and review do.</p>
    </div>

    <div class="st-scard st-overlay" id="st-payout" aria-hidden="true">
      <h3>Claims</h3>
      <div class="st-sub">Finalized by the keeper after review</div>
      <div class="st-rowx"><span><b>Van owner</b><br>Campaign earnings</span><b class="st-swap"><span class="st-w1">Claimable</span><span class="st-w2">Withdrawn</span></b></div>
      <div class="st-rowx"><span><b>Juniper Coffee</b><br>Refund and reward</span><b class="st-swap"><span class="st-w1">Claimable</span><span class="st-w2">Withdrawn</span></b></div>
      <div class="st-rowx"><span><b>Northside Bikes</b><br>Holds the NFT record</span><b>Campaign done</b></div>
    </div>

    <div class="st-scard st-overlay" id="st-record" aria-hidden="true">
      <h3>The public record</h3>
      <div class="st-sub">Mainnet qualification campaign. Real USDC, synthetic artwork and evidence; nothing was installed.</div>
      <div class="st-figs"><div><b>11</b><span>receipts</span></div><div><b>3¢</b><span>received</span></div><div><b>0</b><span>pending</span></div></div>
      <div class="st-rowx"><span>3¢ withdrawn to the original wallets</span></div>
      <div class="st-rowx"><a href="/records/e22dd301-786f-476c-af74-0df7cd2e6168" style="font-weight:700;color:var(--b);text-decoration:none">Open the record</a></div>
    </div>

    <div class="st-final st-overlay" id="st-final">
      <div class="st-hero-logo">${wordmarkSvg}</div>
      <p>Try the whole flow in about two minutes, with your own wallet and example money.</p>
      <div class="st-row"><a class="button primary" href="/experience">Try a takeover</a><a class="button signal" href="/explore">Explore spaces</a></div>
    </div>

    <div class="st-progress st-overlay" id="st-progress" aria-hidden="true">
      <div class="st-rail"><span class="st-track"></span><span class="st-fill" id="st-pFill"></span><div class="st-head" id="st-pHead"><span>e</span></div></div>
      <div class="st-receipt" id="st-receipt"><i class="st-nr">N</i><span id="st-receipt-t">Recorded on NEAR</span></div><div class="st-ticks"><span style="left:8%">Listed</span><span style="left:20%"><i class="st-nr" aria-hidden="true">N</i>Published</span><span style="left:29%"><i class="st-nr" aria-hidden="true">N</i>Booked</span><span style="left:38%"><i class="st-nr" aria-hidden="true">N</i>Takeover</span><span style="left:48%"><i class="st-nr" aria-hidden="true">N</i>NFT</span><span style="left:58%"><i class="st-nr" aria-hidden="true">N</i>Installed</span><span style="left:74%">Review</span><span style="left:88%"><i class="st-nr" aria-hidden="true">N</i>Paid</span></div>
    </div>
  </div>
</section>`;
}

let active = null;
function init(gsap, ScrollTrigger, Lenis) {
  var NS='http://www.w3.org/2000/svg';
  function el(tag,attrs,parent){var e=document.createElementNS(NS,tag);for(var k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
  var seed=7;function rnd(){seed=(seed*16807)%2147483647;return(seed-1)/2147483646;}
  function pick(a){return a[Math.floor(rnd()*a.length)];}
  var D=4200, setters=null;

  function row(g,x0,x1,base,hs,ws,col,winDark,litOdds){
    var lit=el('g',{'class':'st-lit',opacity:'0'});
    var x=x0;
    while(x<x1){
      var w=pick(ws),h=pick(hs);
      el('rect',{x:x,y:base-h,width:w-8,height:h+4,fill:pick(col)},g);
      for(var wy=base-h+18;wy<base-26;wy+=26){for(var wx=x+14;wx<x+w-28;wx+=24){
        el('rect',{x:wx,y:wy,width:10,height:13,fill:winDark},g);
        if(rnd()<litOdds)el('rect',{x:wx,y:wy,width:10,height:13,fill:'#FFB21A'},lit);
      }}
      x+=w;
    }
    g.appendChild(lit);
  }
  var far=document.getElementById('st-far'),mid=document.getElementById('st-mid'),street=document.getElementById('st-street'),socialG=document.getElementById('st-social');
  row(far,-200,1600+D*.25+400,620,[300,360,420,470],[110,140,170,200],['#AEBBF0','#A3B2EE','#B6C2F2'],'rgba(13,16,48,.10)',.25);
  row(mid,-200,1600+D*.55+400,630,[170,220,260,320],[120,150,180],['#1E4DFF','#2A55F5','#3A63FF','#1A40D8'],'rgba(13,16,48,.28)',.4);
  el('rect',{x:-200,y:600,width:1600+D+600,height:64,fill:'#E4E7F5'},street);
  el('rect',{x:-200,y:662,width:1600+D+600,height:260,fill:'#2A2F5E'},street);
  for(var dx=-200;dx<1600+D+400;dx+=90)el('rect',{x:dx,y:770,width:44,height:6,rx:3,fill:'#F4F4EF',opacity:'.4'},street);
  var lamps=el('g',{},street),glow=el('g',{'class':'st-lit',opacity:'0'},street);
  for(var lx=200;lx<1600+D+400;lx+=420){
    el('rect',{x:lx,y:430,width:7,height:176,rx:3,fill:'#0D1030'},lamps);
    el('rect',{x:lx-26,y:426,width:38,height:8,rx:4,fill:'#0D1030'},lamps);
    el('circle',{cx:lx-20,cy:440,r:7,fill:'#FFB21A'},lamps);
    el('path',{d:'M'+(lx-28)+',446 L'+(lx-70)+',600 H'+(lx+30)+' L'+(lx-12)+',446 Z',fill:'#FFB21A',opacity:'.22'},glow);
  }
  var peds=[],pedCols=['#0D1030','#FF3B1F','#FFB21A','#7B61FF','#F4F4EF','#1F5C46'];
  // Bystanders down the road: phone up as the van approaches, a flash, then a post.
  var KINDS=[
    {text:'Posted to Instagram',icon:'ig',tile:'url(#st-gPost)'},
    {text:'#ridenorth',icon:'hash',tile:'#FFB21A',ink:'#0D1030'},
    {text:'Shared on LinkedIn',icon:'li',tile:'#0A66C2'},
    {text:'#spottedinberlin',icon:'hash',tile:'#1E4DFF'},
    {text:'Posted on X',icon:'x',tile:'#0D1030'},
    {text:'Added to story',icon:'story',tile:'url(#st-gPost)'},
    {text:'#berlinstreets',icon:'hash',tile:'#FF3B1F'}
  ];
  function bubbleIcon(g,k){
    el('rect',{x:-12,y:-12,width:24,height:24,rx:7,fill:k.tile},g);
    var ink=k.ink||'#FFFFFF',st={fill:'none',stroke:ink,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round'};
    if(k.icon==='ig'){el('rect',Object.assign({x:-6.5,y:-6.5,width:13,height:13,rx:4},st),g);el('circle',Object.assign({r:3},st),g);el('circle',{cx:3.6,cy:-3.6,r:1,fill:ink},g);}
    else if(k.icon==='li'){el('rect',Object.assign({x:-6.5,y:-3.5,width:13,height:9,rx:2},st),g);el('path',Object.assign({d:'M-2.5,-3.5 V-6 H2.5 V-3.5'},st),g);}
    else if(k.icon==='x'){el('path',Object.assign({d:'M-6,-5 H6 V3 H-1 L-4,6 V3 H-6 Z'},st),g);}
    else if(k.icon==='story'){el('circle',Object.assign({r:6.5},st),g);el('circle',{r:3,fill:ink},g);}
    else {el('path',Object.assign({d:'M-2.5,-6.5 L-4,6.5 M3.5,-6.5 L2,6.5 M-6.5,-2.5 H6.5 M-7,2.5 H6'},st),g);}
  }
  function makeBubble(holder,k){
    var b=el('g',{opacity:0},holder),inner=el('g',{transform:'translate(0 -166) scale(1.18)'},b);
    var shadow=el('rect',{x:-80,y:-17,width:160,height:42,rx:14,fill:'#0D1030',opacity:'.16'},inner);
    var tail=el('path',{d:'M-9,19 L0,31 L9,19 Z',fill:'#FFFFFF'},inner);
    var box=el('rect',{x:-80,y:-21,width:160,height:42,rx:14,fill:'#FFFFFF'},inner);
    var ic=el('g',{},inner);bubbleIcon(ic,k);
    var tx=el('text',{y:5,'font-size':14.5,fill:'#0D1030',style:"font-family:'Everywhere Text',system-ui,sans-serif;font-weight:720;font-variation-settings:'wdth' 108"},inner);tx.textContent=k.text;
    return {g:b,fit:function(){
      var tw=0;try{tw=tx.getComputedTextLength();}catch(e){}if(!tw)tw=k.text.length*7.6;
      var w=Math.round(tw+66),x0=-w/2;
      box.setAttribute('x',x0);box.setAttribute('width',w);shadow.setAttribute('x',x0);shadow.setAttribute('width',w);shadow.setAttribute('y',-17);
      ic.setAttribute('transform','translate('+(x0+25)+' 0)');tx.setAttribute('x',x0+46);
    }};
  }
  var socialN=0;
  function makePed(px,social){
    var g=el('g',{transform:'translate('+px.toFixed(0)+' 612)'},street);
    var phone=null,bub=null,flash=null,screen=null;
    el('rect',{x:-11,y:-50,width:22,height:52,rx:11,fill:pick(pedCols)},g);
    var head=el('g',{},g);
    el('circle',{cx:0,cy:-64,r:10,fill:'#0D1030'},head);
    el('circle',{cx:4,cy:-66,r:2.2,fill:'#F4F4EF'},head);
    if(social){
      var holder=el('g',{transform:'translate('+px.toFixed(0)+' 612)'},socialG);
      phone=el('g',{opacity:0},holder);
      el('path',{d:'M5,-38 L17,-70',stroke:'#0D1030','stroke-width':6,'stroke-linecap':'round'},phone);
      el('rect',{x:10,y:-94,width:15,height:24,rx:3.5,fill:'#0D1030'},phone);
      screen=el('rect',{x:12.5,y:-91,width:10,height:15,rx:1.5,fill:'#C9D3FF'},phone);
      flash=el('g',{opacity:0,transform:'translate(17.5 -86)'},holder);
      el('circle',{r:9,fill:'#FFFFFF'},flash);
      for(var a=0;a<8;a++){var an=a*Math.PI/4;el('path',{d:'M'+(Math.cos(an)*13).toFixed(1)+','+(Math.sin(an)*13).toFixed(1)+' L'+(Math.cos(an)*23).toFixed(1)+','+(Math.sin(an)*23).toFixed(1),stroke:'#FFFFFF','stroke-width':3,'stroke-linecap':'round'},flash);}
      bub=makeBubble(holder,KINDS[socialN++%KINDS.length]);
    }
    peds.push({x:px,head:head,phone:phone,bub:bub,flash:flash,screen:screen,st:0,fitted:false});
  }
  // Posters are placed so that, partway down the road, each drive stop frames one fresh post
  // and the next bystander already raising a phone. The street moves on power1.inOut.
  var ease=function(q){return q<.5?2*q*q:1-2*(1-q)*(1-q);},sxAt=function(t){return D*ease(Math.min(1,Math.max(0,(t-64.6)/19)));};
  var SOC=[];
  var VIS=Math.min(1600,innerWidth*900/Math.max(1,innerHeight)),R=Math.min(1500,800+VIS/2-20);
  var K=Math.min(1,VIS/1440);
  [[71.4,-410],[71.4,-30],[75.6,-390],[75.6,-40],[79.6,-420],[79.6,-20],[83,-400]].forEach(function(v){var o=v[1]<-100?-Math.max(190,-v[1]*K):v[1]*K;SOC.push(R+o+sxAt(v[0]));});
  for(var px=120;px<1600+D+300;px+=110+rnd()*160){
    if(SOC.some(function(q){return Math.abs(q-px)<95;}))continue;
    makePed(px,false);
  }
  SOC.forEach(function(q){makePed(q,true);});
  var stars=document.getElementById('st-stars');
  for(var i=0;i<60;i++)el('circle',{cx:(rnd()*1600).toFixed(0),cy:(rnd()*330).toFixed(0),r:(rnd()*1.6+.6).toFixed(1),fill:'#F4F4EF'},stars);

  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return function(){};

  document.documentElement.classList.add('st-anim');
  gsap.registerPlugin(ScrollTrigger);
  // Each frame where a popup is fully composed (content-timeline time). The scroll is split into equal
  // segments between them, eased in and out, so every popup gets the same scroll distance and dwell.
  var FRAMES=[0,3,15.2,23.2,30.8,39.3,45.6,50.2,55.6,62.3,67.2,71.4,75.6,79.6,83,89.4,94,100];
  var STOPS=FRAMES.map(function(f,i){return i/(FRAMES.length-1)*100;}).slice(1),master=null;
  var storyRange=function(){var st=master&&master.scrollTrigger;return st?[st.start,st.end]:null;};
  var nearStop=function(p){var best=STOPS[0];for(var i=1;i<STOPS.length;i++)if(Math.abs(STOPS[i]-p)<Math.abs(best-p))best=STOPS[i];return best;};
  // Inside the story the wheel eases off as a popup comes into frame, like a soft detent,
  // and very large flicks are capped, so nothing flashes past. The user stays in control.
  var lenis=new Lenis({lerp:.09,smoothWheel:true,wheelMultiplier:1,touchMultiplier:1.1,virtualScroll:function(d){
    var r=storyRange();if(!r||!d.event||d.event.type.indexOf('wheel')<0)return true;
    var y=lenis?lenis.targetScroll:scrollY;if(y<r[0]-40||y>r[1]+40)return true;
    var p=(y-r[0])/(r[1]-r[0])*100,dist=Math.abs(nearStop(p)-p),f=dist<1.8?.55+.45*(dist/1.8):1,cap=110*f;
    d.deltaY=Math.max(-cap,Math.min(cap,d.deltaY*.85*f));
    return true;}});
  lenis.on('scroll',ScrollTrigger.update);
  var tick=function(t){lenis.raf(t*1000);};gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  var $=function(s){return document.querySelector(s);};
  var van=$('#st-van'),poster=$('#st-poster'),vault=$('#st-vault'),coinA=$('#st-coinA'),coinB=$('#st-coinB');
  var caps=gsap.utils.toArray('.st-story .st-cap'),spins=gsap.utils.toArray('.st-spin'),stage=$('#st-stage'),nav=document.querySelector('.site-header');
  var narrow=innerWidth<760;
  // Compact layout whenever the visible slice of the 1600-wide scene is narrow (phones, portrait tablets).
  var VW=Math.min(1600,innerWidth*900/Math.max(1,innerHeight)),LX=800-VW/2,RX=800+VW/2,compact=VW<1150;
  var PS=compact?Math.min(1.6,VW*.56/214):2;
  var P0=compact?{x:LX+14,y:362,s:PS}:{x:700,y:120,s:2};
  var VS=compact?Math.min(.8,VW/760):1,VX=compact?RX-190*VS-14:1240,VY=compact?378:330,CX=VX+95*VS;

  gsap.set(van,{x:560,y:452,scale:1.2,svgOrigin:'0 0'});
  gsap.set(poster,{x:P0.x,y:P0.y,scale:P0.s,svgOrigin:'0 0',autoAlpha:0});
  gsap.set('#st-pB',{x:214});gsap.set('#st-pC',{y:80});
  gsap.set('#st-panelArt',{autoAlpha:0});
  gsap.set(vault,{x:VX,y:VY,scale:VS,svgOrigin:'0 0',autoAlpha:0});
  gsap.set([coinA,coinB],{x:CX,y:-60,autoAlpha:1,scale:VS});
  gsap.set('#st-trail',{scaleX:0,svgOrigin:'666 624'});
  gsap.set(spins,{svgOrigin:'0 0'});
  gsap.set(caps[0],{autoAlpha:1});
  gsap.set('#st-progress',{autoAlpha:1});
  gsap.set('#st-pHead',{xPercent:-100});

  var tl=gsap.timeline({paused:true,defaults:{ease:'none'}});
  tl.set({},{},100);
  function cap(i,a,b){
    tl.fromTo(caps[i],{autoAlpha:0,y:36},{autoAlpha:1,y:0,duration:1.6,ease:'power3.out'},a);
    if(b!=null)tl.to(caps[i],{autoAlpha:0,y:-30,duration:1.6,ease:'power2.in'},b-1.6);
  }
  function inCard(sel,a,b,extra){
    tl.fromTo(sel,Object.assign({autoAlpha:0,y:40},extra&&extra.from||{}),Object.assign({autoAlpha:1,y:0,duration:1.8,ease:'power3.out'},extra&&extra.to||{}),a);
    if(b!=null)tl.to(sel,{autoAlpha:0,y:-30,duration:1.4,ease:'power2.in'},b-1.4);
  }
  tl.to(caps[0],{autoAlpha:0,y:-30,duration:1.6,ease:'power2.in'},5.4);

  // 1 list: scan + outlines + rename
  cap(1,7,17);
  tl.set('#st-scan',{autoAlpha:1,x:0},7.6);
  tl.to('#st-scan',{x:340,duration:3,ease:'power1.inOut'},7.8);
  tl.to('#st-scan',{autoAlpha:0,duration:.4},10.8);
  tl.to('#st-outlines',{autoAlpha:1,duration:1.2},9.8);
  inCard('#st-chat',12,16.6,{from:{x:30,y:0},to:{x:0}});
  tl.to('#st-lbl1a',{opacity:0,duration:.6},14.2);
  tl.to('#st-lbl1b',{opacity:1,duration:.6},14.4);

  // 2 publish
  cap(2,17,25);
  inCard('#st-offer',17.4,24.6);
  tl.to('#st-tg1',{backgroundColor:'#1E4DFF',duration:.6},20);
  tl.to('#st-tg1 i',{x:16,duration:.6,ease:'power2.out'},20);
  tl.to('#st-published',{opacity:1,duration:.6},22.4);
  tl.to('#st-outlines',{autoAlpha:0,duration:1.4},23.6);

  // 3 book
  cap(3,25,33);
  tl.fromTo(poster,{autoAlpha:0,scale:P0.s*.85,y:P0.y+30},{autoAlpha:1,scale:P0.s,y:P0.y,duration:2.4,ease:'power3.out'},25.6);
  tl.fromTo(vault,{autoAlpha:0,y:VY+30},{autoAlpha:1,y:VY,duration:1.8,ease:'power3.out'},26.4);
  tl.to(coinA,{y:VY-30*VS,duration:2.4,ease:'bounce.out'},28.2);
  tl.to(coinA,{y:VY+15*VS,scale:.1,autoAlpha:0,duration:1.2,ease:'power2.in'},31);

  // 4 takeover
  cap(4,33,41);
  tl.to('#st-pA',{x:-214,duration:2.4,ease:'power3.inOut'},34);
  tl.to('#st-pB',{x:0,duration:2.4,ease:'power3.inOut'},34);
  tl.to(coinB,{y:VY-30*VS,duration:2.2,ease:'bounce.out'},34.6);
  tl.to(coinB,{y:VY+15*VS,scale:.1,autoAlpha:0,duration:1,ease:'power2.in'},36.8);
  tl.set(coinA,{scale:VS,y:VY},37);
  tl.to(coinA,{autoAlpha:1,y:VY-80,duration:.8,ease:'power2.out'},37.1);
  tl.to(coinA,{x:compact?LX+60:140,y:compact?620:520,duration:2,ease:'power2.inOut'},37.9);
  tl.fromTo('#st-chip',{autoAlpha:0,y:16},{autoAlpha:1,y:0,duration:.9,ease:'power3.out'},38.1);
  tl.to(coinA,{autoAlpha:0,duration:.5},39.6);
  tl.to('#st-chip',{autoAlpha:0,duration:.8},40.6);

  // 5 NFT + studio handoff
  cap(5,41,52);
  tl.to(vault,{autoAlpha:0,y:VY+30,duration:1.4,ease:'power2.in'},41);
  tl.fromTo('#st-stamp',{autoAlpha:0,scale:1.6},{autoAlpha:1,scale:1,duration:.9,ease:'back.out(2)'},41.6);
  tl.to('#st-stamp',{autoAlpha:0,duration:.8},43.6);
  tl.to(poster,compact?{x:P0.x,y:P0.y,scale:PS,duration:2.4,ease:'power3.inOut'}:{x:660,y:150,scale:1.6,duration:2.4,ease:'power3.inOut'},42);
  inCard('#st-nft',43.4,51.6,{from:{rotate:-6},to:{rotate:0}});
  tl.to('#st-ctl1',{opacity:0,y:-10,duration:.6},46.4);
  tl.to('#st-ctl2',{opacity:1,duration:.6},46.6);
  tl.to('#st-pB',{y:-80,duration:2,ease:'power3.inOut'},48);
  tl.to('#st-pC',{y:0,duration:2,ease:'power3.inOut'},48);
  tl.set('#st-nftArtB',{attr:{href:'#st-artC'}},49);

  // 6 approve + install + evidence
  cap(6,52,64);
  inCard('#st-phone',52.2,57.4,{from:{x:60,y:0},to:{x:0}});
  tl.to('#st-approved',{opacity:1,duration:.6},54.6);
  tl.to('#st-phone .st-a1',{opacity:0,duration:.4},54.8);
  tl.to(poster,{x:617.6,y:516.8,scale:1.2,duration:3,ease:'power3.inOut'},56.6);
  tl.to('#st-posterBg',{autoAlpha:0,duration:.8},58.6);
  tl.set('#st-panelArt',{autoAlpha:1},59.5);
  tl.set(poster,{autoAlpha:0},59.6);
  tl.fromTo('#st-sheen',{x:-60,opacity:.8},{x:300,opacity:.8,duration:1.4,ease:'power2.inOut'},59.7);
  tl.to('#st-flash',{opacity:.85,duration:.3,ease:'power2.out'},60.6);
  tl.to('#st-flash',{opacity:0,duration:1},60.9);
  inCard('#st-polaroid',60.4,64,{from:{rotate:8},to:{rotate:3}});

  // 7 drive + review
  cap(7,64,85);
  tl.to('#st-trail',{scaleX:1,duration:2,ease:'power2.out'},64);
  tl.to([street,'#st-social'],{x:-D,duration:19,ease:'power1.inOut'},64.6);
  tl.to(mid,{x:-D*.55,duration:19,ease:'power1.inOut'},64.6);
  tl.to(far,{x:-D*.25,duration:19,ease:'power1.inOut'},64.6);
  tl.to(spins,{rotation:D/(2*Math.PI*27*1.2)*360,duration:19,ease:'power1.inOut'},64.6);
  tl.to(van,{y:449,duration:.45,repeat:41,yoyo:true,ease:'sine.inOut'},64.6);
  tl.to('#st-revFill',{scaleX:1,duration:17},65.4);
  tl.to('.st-story .st-review .st-l1',{opacity:0,duration:.5},82.2);
  tl.to('.st-story .st-review .st-l2',{opacity:1,duration:.5},82.4);
  tl.to('#st-sky',{attr:{fill:'#FFB21A'},duration:6},68);
  tl.to(stage,{backgroundColor:'#FFB21A',duration:6},68);
  tl.to('#st-sun',{attr:{cy:560},duration:9},68);
  tl.to('#st-sky',{attr:{fill:'#0D1030'},duration:6},75);
  tl.to(stage,{backgroundColor:'#0D1030',duration:6},75);
  tl.to('.st-lit',{opacity:1,duration:5},75);
  tl.to('#st-stars',{opacity:1,duration:5},77);
  tl.to('#st-moon',{opacity:1,duration:4},78);
  tl.to(caps[7],{backgroundColor:'#0D1030',color:'#F4F4EF',duration:1.2},73.6);

  // 8 settle, then the record
  cap(8,85,93);
  inCard('#st-payout',85.6,90.9,{from:{y:40},to:{ease:'back.out(1.5)'}});
  tl.to('#st-payout .st-w1',{opacity:0,duration:.6,stagger:.6},88);
  tl.to('#st-payout .st-w2',{opacity:1,duration:.6,stagger:.6},88.2);
  inCard('#st-record',91.1,96.2);
  tl.to('#st-progress',{autoAlpha:0,duration:1.2},95);
  tl.to('#st-moon',{opacity:0,duration:1.6},95.6);
  tl.fromTo('#st-final',{autoAlpha:0,y:30},{autoAlpha:1,y:0,duration:3,ease:'power3.out'},96.2);

  // NEAR receipts: each on-chain step lights its tick and flashes a receipt note.
  var nrs=gsap.utils.toArray('.st-story .st-ticks .st-nr');
  [[22.4,'Offers published on NEAR'],[29.6,'Booking paid into escrow on NEAR'],[36.2,'Takeover recorded on NEAR'],[43.6,'Placement NFT minted on NEAR'],[60.6,'Install evidence committed on NEAR'],[88,'Payouts released on NEAR']].forEach(function(r,i){
    if(nrs[i])tl.to(nrs[i],{backgroundColor:'#FFB21A',color:'#0D1030',scale:1.15,duration:.5,ease:'back.out(3)'},r[0]);
    tl.set('#st-receipt-t',{textContent:r[1]},r[0]-.01);
    tl.fromTo('#st-receipt',{autoAlpha:0,y:10},{autoAlpha:1,y:0,duration:.5,ease:'power2.out'},r[0]);
    tl.to('#st-receipt',{autoAlpha:0,y:-6,duration:.5},r[0]+2.6);
  });
  tl.to('#st-pFill',{scaleX:.97,duration:95},0);
  tl.to('#st-pHead',{xPercent:-3,duration:95},0);

  ScrollTrigger.create({trigger:'.st-story',start:'top top',end:'+=2600%',onUpdate:function(){var n=document.querySelector('.site-header'),t=tl.time();if(n)n.classList.toggle('night',t>76&&t<99.6);},onLeave:function(){var n=document.querySelector('.site-header');if(n)n.classList.remove('night');}});


  // When scrolling comes to rest between popups, glide to the nearest one.
  var idleT=null,settling=false,lastDir=1;
  function settle(){
    var r=storyRange();if(!r||settling)return;var y=lenis.scroll;if(y<r[0]+2||y>r[1]-2)return;
    var p=(y-r[0])/(r[1]-r[0])*100,fwd=null,back=null,i;
    for(i=0;i<STOPS.length;i++){if(STOPS[i]>=p){fwd=STOPS[i];break;}}
    for(i=STOPS.length-1;i>=0;i--){if(STOPS[i]<=p){back=STOPS[i];break;}}
    var target=fwd===null?back:back===null?fwd:(Math.abs(fwd-p)<=Math.abs(back-p)*(lastDir>0?1.6:.6)?fwd:back);
    if(target===null||Math.abs(target-p)<.25||Math.abs(target-p)>3.6)return;
    settling=true;
    lenis.scrollTo(r[0]+(r[1]-r[0])*target/100,{duration:Math.min(1.1,.55+Math.abs(target-p)*.12),easing:function(t){return 1-Math.pow(1-t,3);},onComplete:function(){settling=false;}});
    setTimeout(function(){settling=false;},1300);
  }
  function onScroll(e){if(e&&e.direction)lastDir=e.direction;clearTimeout(idleT);if(!settling)idleT=setTimeout(settle,170);}
  lenis.on('scroll',onScroll);
  var nativeIdle=function(){clearTimeout(idleT);if(!settling)idleT=setTimeout(settle,220);};
  window.addEventListener('touchend',nativeIdle,{passive:true});
  setters=peds.map(function(p){return gsap.quickSetter(p.head,'x');});
  function look(){
    if(!setters)return;
    var sx=gsap.getProperty(street,'x')||0;
    var t=tl.time(),driving=t>64.8&&t<83.6;
    for(var i=0;i<peds.length;i++){
      var p=peds[i],x=p.x+sx,d=780-x;setters[i](Math.max(-5,Math.min(5,d/40)));
      if(!p.bub)continue;
      // 0 idle, 1 phone up as the van approaches, 2 photo taken (flash), 3 posted
      var ns=!driving||x>R+80||x<R-700*Math.max(K,.5)?0:x>R-80*K?1:x>R-240*K?2:3;
      if(ns===p.st)continue;
      if(ns===0){gsap.to([p.phone,p.bub.g],{opacity:0,duration:.3,overwrite:true});}
      else{
        gsap.to(p.phone,ns===3?{opacity:0,duration:.35,delay:.6,overwrite:true}:{opacity:1,duration:.25,overwrite:true});
        if(ns>=2&&p.st<2){gsap.fromTo(p.flash,{opacity:1,scale:.35,svgOrigin:'17.5 -86'},{opacity:0,scale:1.5,duration:.55,ease:'power2.out',overwrite:true});gsap.fromTo(p.screen,{attr:{fill:'#FFFFFF'}},{attr:{fill:'#C9D3FF'},duration:.6,overwrite:true});}
        if(ns===3&&p.st<3){if(!p.fitted){p.bub.fit();p.fitted=true;}gsap.fromTo(p.bub.g,{opacity:0,y:16,scale:.55,svgOrigin:'0 -130'},{opacity:1,y:0,scale:1,duration:.5,delay:.12,ease:'back.out(2.2)',overwrite:true});}
        if(ns<3&&p.st===3){gsap.to(p.bub.g,{opacity:0,duration:.2,overwrite:true});}
      }
      p.st=ns;
    }
  }
  master=gsap.timeline({scrollTrigger:{trigger:'.st-story',start:'top top',end:'+=2600%',scrub:1,pin:stage,anticipatePin:1}});
  for(var fi=0;fi<FRAMES.length-1;fi++)master.add(tl.tweenFromTo(FRAMES[fi],FRAMES[fi+1],{duration:1,ease:'sine.inOut',immediateRender:false}));
  tl.eventCallback('onUpdate',look);
  look();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){ScrollTrigger.refresh();});
  return function(){clearTimeout(idleT);window.removeEventListener('touchend',nativeIdle);master&&master.scrollTrigger&&master.scrollTrigger.kill();master&&master.kill();tl.kill();ScrollTrigger.getAll().forEach(function(t){t.kill();});gsap.ticker.remove(tick);lenis.destroy();document.documentElement.classList.remove('st-anim');var n2=document.querySelector('.site-header');if(n2)n2.classList.remove('night');};
}

export async function mountStory(route) {
  if (route?.id !== 'P01') { if (active) { active.stop(); active = null; } return; }
  const current = document.querySelector('.st-story');
  if (!current) return;
  if (active) {
    // A background refresh re-rendered the homepage; keep the running scene in place.
    if (active.el !== current) { current.replaceWith(active.el); active.ScrollTrigger.refresh(); }
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('lenis')]);
  const el = document.querySelector('.st-story');
  if (!el || active || location.pathname !== '/') return;
  gsap.registerPlugin(ScrollTrigger);
  active = { el, ScrollTrigger, stop: init(gsap, ScrollTrigger, Lenis) };
}
