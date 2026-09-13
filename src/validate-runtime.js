import ABI from '../schemas/runtime-abi.json';
// This first implementation accepts only the compiler's sampled DIRECT/STAMP subset.
// Reject broader ABI programs before allocating registers or entering any loop.
export function validateRuntime(L) {
 const fail=m=>{throw Error('Runtimeデータが不正です: '+m)};
 for(const name of Object.keys(ABI.columnTypes))if(!Array.isArray(L[name])||L[name].length>200000)fail(name);
 for(const cols of Object.values(ABI.tables))for(const c of cols)if(L[c].length!==L[cols[0]].length)fail(c+'の行数');
 if(L.IG_HEADER?.length!==24||L.IG_HEADER[0]!=='IGRT/1.1')fail('Header');
 if(!(L.IG_HEADER[1]>0&&L.IG_HEADER[1]<=120&&L.IG_HEADER[21]>0&&L.IG_HEADER[21]<=240))fail('時間');
 const int=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;
 const range=(f,n,total)=>int(n,0,total)&&int(f,1,total+1)&&f+n-1<=total;
 for(const [k,values] of Object.entries(L))for(const v of values)if(typeof v==='number'&&!Number.isFinite(v))fail(k+'非有限値');
 for(let i=0;i<L.T_COUNT.length;i++){if(!range(L.T_FIRST[i],L.T_COUNT[i],L.K_TIME.length))fail('Track範囲');for(let j=L.T_FIRST[i]-1;j<L.T_FIRST[i]-1+L.T_COUNT[i];j++){if(j>L.T_FIRST[i]-1&&L.K_TIME[j]<=L.K_TIME[j-1])fail('Key順序');if(L.E_KIND[L.K_EASE[j]-1]!==0)fail('未対応補間')}}
 for(let i=0;i<L.P_FIRST.length;i++){
  if(L.P_KIND[i]!==0||!int(L.P_REGS[i],32,64)||L.P_OUTPUT[i]!==1||L.P_OUTCOUNT[i]!==32||!range(L.P_FIRST[i],L.P_COUNT[i],L.O_CODE.length))fail('Program');
  const assigned=new Set();for(let pc=L.P_FIRST[i]-1;pc<L.P_FIRST[i]-1+L.P_COUNT[i];pc++){
   const code=L.O_CODE[pc],dst=L.O_DST[pc],imm=L.O_IMM[pc];if(![0,1,23].includes(code)||!int(dst,1,L.P_REGS[i]))fail('Opcode/Register');
   if(code===1&&imm!==0)fail('INPUT');
   if(code===23&&(!int(imm,1,L.T_COUNT.length)||L.O_COUNT[pc]!==1||!range(L.O_FIRST[pc],1,L.OA_SLOT.length)||!assigned.has(L.OA_SLOT[L.O_FIRST[pc]-1])))fail('TRACK');
   assigned.add(dst);
  }for(let r=1;r<=32;r++)if(!assigned.has(r))fail('未定義出力');
 }
 for(let i=0;i<L.C_KIND.length;i++)if(L.C_KIND[i]!==0||!range(L.C_FIRST[i],L.C_COUNT[i],L.D_PRIM.length)||L.C_START[i]>L.C_END[i])fail('Command');
 for(let i=0;i<L.D_PRIM.length;i++)if(L.D_PRIM[i]!==1||!int(L.D_PROGRAM[i],1,L.P_FIRST.length)||!int(L.D_ASSET[i],1,L.A_NAME.length))fail('Template');
 return true;
}
