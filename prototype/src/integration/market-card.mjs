import {esc,icon} from '../ui.mjs';
import {referenceImage} from './reference-images.mjs';

export function marketCard({asset,href,price,status,count,demo=false,action='View spots'}){
 const image=referenceImage(asset),type={car:'Car',van:'Van',bike:'Cargo bike',motorcycle:'Motorcycle',truck:'Truck'}[asset.assetType]??'Space';
 return `<article class="asset-card market-card"><a class="market-card-link" href="${esc(href)}"><div class="market-card-photo">${image?`<img src="${esc(image)}" alt="${esc(asset.title)}" width="1536" height="1024" loading="lazy" decoding="async">`:`<div class="market-card-placeholder">${icon(asset.assetType==='motorcycle'?'moto':asset.assetType==='bike'?'bike':'car')}<span>${esc(type)}</span></div>`}${demo?'<span class="demo-tag" title="Demo preview">Demo</span>':''}<span class="market-card-type">${esc(type)}</span></div><div class="market-card-info"><h3>${esc(asset.title)}</h3><p class="market-card-location">${esc(asset.city)}<span aria-hidden="true">·</span>${count} ${count===1?'spot':'spots'}</p><div class="market-card-bottom"><div class="market-card-price">${price?`<span>From</span><strong>${esc(price)}</strong>`:`<strong class="market-card-state">${esc(status)}</strong>`}</div><span class="market-card-action">${esc(action)} ${icon('arrow')}</span></div></div></a></article>`;
}
