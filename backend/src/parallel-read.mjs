// Limit read fan-out so large campaigns cannot fill the RPC deadline queue.
export async function parallelRead(values,limit,read){
 const result=new Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,values.length)},async()=>{
  while(next<values.length){const index=next++;result[index]=await read(values[index],index);}
 }));
 return result;
}
