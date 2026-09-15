const state=()=>window.__IG?.state;

// Numeric timing controls can receive a second synthetic/native change while the inspector
// is being rebuilt. Ignore only true no-ops so one user edit remains one Undo transaction.
document.addEventListener('change',event=>{
 const input=event.target.closest?.('.timing-node-anchor input[type="number"]');
 if(!input)return;
 const s=state(),node=s?.p?.nodes.find(n=>n.id===s.id);if(!node)return;
 const label=input.getAttribute('aria-label'),key=label==='開始'?'start':label==='終了'?'end':null;
 if(!key)return;
 const next=Number(input.value);if(!Number.isFinite(next))return;
 if(Math.abs(node.time[key]-next)<=1e-9){event.preventDefault();event.stopImmediatePropagation()}
},true);
