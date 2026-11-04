const __recordElisions=new Set([]);
const __nativeF32=true;
// Representation conversion only. Callers supply values matching metadata.
const __view = new DataView(new ArrayBuffer(4));
const __float = bits => { __view.setUint32(0, bits, true); return __view.getFloat32(0, true); };
const __bits = number => { if(Number.isNaN(number))return 0x7fc00000; __view.setFloat32(0, number, true); return __view.getUint32(0, true); };
// Binary64 uses native Numbers for finite arithmetic and immutable private
// tags only where a NaN's exact payload must survive non-arithmetic operations.
const __doubleView=new DataView(new ArrayBuffer(8));
const __double=bits=>{__doubleView.setBigUint64(0,bits,true);return __doubleView.getFloat64(0,true);};
const __doubleBits=number=>{if(Number.isNaN(number))return 0x7ff8000000000000n;__doubleView.setFloat64(0,number,true);return __doubleView.getBigUint64(0,true);};
const __dfNumber=value=>typeof value==='number'?value:__double(BigInt(value.F64Bits));
const __dfBits=value=>typeof value==='number'?__doubleBits(value):BigInt(value.F64Bits);
const __dfFromBits=bits=>(bits&0x7fffffffffffffffn)>0x7ff0000000000000n?Object.freeze({F64Bits:bits.toString()}):__double(bits);
const __dfInput=value=>typeof value==='number'?value:__dfFromBits(BigInt(value.F64Bits));
const __dfNeg=value=>typeof value==='number'&&!Number.isNaN(value)?-value:__dfFromBits(__dfBits(value)^0x8000000000000000n);
const __dfOutput=value=>{const n=__dfNumber(value);return Number.isFinite(n)?n:{F64Bits:__dfBits(value).toString()};};
const __dfCapture=value=>{
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||Object.keys(value).length!==1||!Object.hasOwn(value,'F64Bits'))throw Error('invalid f64');const text=value.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))throw Error('invalid f64');
 const bits=BigInt(text);if(bits>18446744073709551615n)throw Error('invalid F64Bits');return __dfFromBits(bits);
};
// Native binary32 lane for pure modules. Explicit NaN payloads remain tagged;
// arithmetic canonicalizes NaNs just as __bits does in the exact-bit lane.
// Host tags are captured once at a typed read. Only private immutable tags
// may pass through normalization without consulting a host property again.
const __nfTagged = new WeakSet();
const __nfValue = value => typeof value === 'number' ? Math.fround(value) : __nfTagged.has(value) ? value : __nfFromBits(value.F32Bits);
// Number operands have already been normalised at their typed read or producer.
const __nfNumber = value => typeof value === 'number' ? value : __float(value.F32Bits);
const __nfBits = value => typeof value === 'number' ? __bits(value) : value.F32Bits;
const __nfFromBits = bits => {
  if((bits & 0x7fffffff)<=0x7f800000)return __float(bits);
  const value=Object.freeze({F32Bits:bits});__nfTagged.add(value);return value;
};
const __nfNeg = value => typeof value === 'number' && !Number.isNaN(value) ? -value : __nfFromBits((__nfBits(value) ^ 0x80000000) >>> 0);
const __nfOutput = value => {const n=typeof value==='number'?Math.fround(value):__float(value.F32Bits);return Number.isFinite(n)?n:{F32Bits:__nfBits(value)};};
const __identity = value => value;
// Intern declared conversion schemas once. An invocation owns one WeakMap per
// schema instead of allocating a Map for every converted record/list node.
const __conversionKeys = new Map();
function __representation(type, output, capture=false) {
  const convert=__representationRaw(type,output,capture);
  if(convert===__identity)return convert;
  // Conversion identity is invocation-local: callers may reuse a mutable host
  // object in a later call. Distinct declared schemas have distinct memo keys.
  const schema=(output?'out:':capture?'capture:':'in:')+JSON.stringify(type);
  let key=__conversionKeys.get(schema);
  if(!key){key={};__conversionKeys.set(schema,key);}
  return (value,context)=>{
    if(!context||!value||typeof value!=='object')return convert(value,context);
    let entries=context.get(key);
    if(!entries){entries=new WeakMap();context.set(key,entries);}
    if(entries.has(value))return entries.get(value);
    const result=convert(value,context);
    entries.set(value,result);return result;
  };
}
function __representationRaw(type, output, capture) {
  switch (type.kind) {
    case 'ref': {
      let resolved;
      return (value,context)=>(resolved??=__representation(__namedTypes[type.name],output,capture))(value,context);
    }
    case 'id': return value=>value.toLowerCase();
    case 'int': return output ? value=>({Int:value.toString()}) : value=>BigInt(value && typeof value==='object' ? value.Int : value);
    case 'option': {
      const item=__representation(type.element,output,capture);
      return item===__identity?__identity:(value,context)=>Object.hasOwn(value,'Some')?{Some:item(value.Some,context)}:{None:null};
    }
    case 'result': {
      const ok=__representation(type.ok,output,capture),err=__representation(type.error,output,capture);
      const key=typeof __sumSpecs==='undefined'?null:__sumKey(type),flat=key!==null&&__sumSpecs.has(key);
      if(flat)return output?(value,context)=>{const v=__sumView(key,value);return Object.hasOwn(v,'Ok')?{Ok:ok(v.Ok,context)}:{Err:err(v.Err,context)};}:(v,context)=>Object.hasOwn(v,'Ok')?__sumMake(key,true,ok(v.Ok,context)):__sumMake(key,false,err(v.Err,context));
      return ok===__identity&&err===__identity?__identity:(value,context)=>Object.hasOwn(value,'Ok')?{Ok:ok(value.Ok,context)}:{Err:err(value.Err,context)};
    }
    case 'f64':return output?__dfOutput:__dfInput;
    case 'f32': if(typeof __nativeF32!=='undefined'&&__nativeF32)return output?__nfOutput:capture?__nfValue:__identity;
      return output ? value => {
      const number = __float(value);
      return Number.isFinite(number) ? number : {F32Bits:value};
    } : value => typeof value === 'number' ? __bits(value) : value.F32Bits;
    case 'list': case 'vector': {
      const element = __representation(type.element, output,capture);
      return element === __identity ? __identity : (value,context) => Array.from(value, item=>element(item,context));
    }
    case 'record': {
      if((typeof __recordElisions!=='undefined'&&__recordElisions.has(type.name))){
        if(!type.fields.length)return ()=>undefined; // lexically unconsumed projected input
        const field=type.fields[0],child=__representation(field.type,output,capture);
        return output?(value,context)=>({[field.name]:child(value,context)}):(value,context)=>child(value[field.name],context);
      }
      const fields = type.fields.map(field => [field.name, __representation(field.type, output,capture)]);
      return fields.every(([,convert]) => convert === __identity) ? __identity :
        (value,context) => {
          const result={};
          for(const [name,convert] of fields){
            const field=convert(value[name],context);
            // Assignment treats __proto__ specially; records require an own
            // ordinary writable data property, as Object.fromEntries supplied.
            if(name==='__proto__')Object.defineProperty(result,name,{value:field,writable:true,enumerable:true,configurable:true});
            else result[name]=field;
          }
          return result;
        };
    }
    default: return __identity;
  }
}
function __stateWord(value){
 if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('u64 requires an exact integer');
 if(!['bigint','number','string'].includes(typeof value)||typeof value==='string'&&!/^(0|[1-9][0-9]*)$/.test(value))throw Error('invalid u64');
 const n=BigInt(value);if(n<0n||n>18446744073709551615n)throw Error('invalid u64');return n;
}
// Compile the capture traversal once. Each invocation still validates and owns
// every public container; no host value is retained between calls.
const __stateCaptures=new WeakMap();
function __stateCapture(type){
 const prior=__stateCaptures.get(type);if(prior)return prior;
 const capture=__compileStateCapture(type);__stateCaptures.set(type,capture);return capture;
}
function __compileStateCapture(type){
 const limited=copy=>(value,budget={cells:1000000},depth=0)=>{
  if(depth>64||--budget.cells<0)throw Error('state input resource limit');
  return copy(value,budget,depth);
 };
 const tagged=(value,tag)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,tag);
 switch(type.kind){
  case 'ref':{
   // Resolve lazily so recursive schemas compile to recursive validators rather
   // than reverting to descriptor interpretation at every referenced node.
   let resolved;
   return limited((value,budget,depth)=>(resolved??=__stateCapture(__namedTypes[type.name]))(value,budget,depth+1));
  }
  case 'u32':case 'i32':{
   const min=type.kind==='u32'?0:-2147483648,max=type.kind==='u32'?4294967295:2147483647;
   return limited(value=>{if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw Error('invalid '+type.kind);return value===0?0:value;});
  }
  case 'u64':return limited(__stateWord);
  case 'f64':return limited(__dfCapture);
  case 'bool':return limited(value=>{if(typeof value!=='boolean')throw Error('invalid Bool');return value;});
  case 'unit':return limited(value=>{if(value!==null)throw Error('invalid Unit');return null;});
  case 'string':return limited(value=>{if(typeof value!=='string'||!value.isWellFormed())throw Error('invalid String');return value;});
  case 'enum':return limited(value=>{if(!type.variants.includes(value))throw Error('invalid enum');return value;});
  case 'id':return limited(value=>{if(typeof value!=='string'||! /^[0-9a-fA-F]{32}$/.test(value))throw Error('invalid ID');return value.toLowerCase();});
  case 'list':case 'vector':{
   const item=__stateCapture(type.element),size=type.kind==='vector'?type.size:null;
   return limited((value,budget,depth)=>{
    if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');
    if(size!==null&&value.length!==size)throw Error('invalid vector length');
    const out=new Array(value.length);for(let i=0;i<out.length;i++)out[i]=item(value[i],budget,depth+1);return out;
   });
  }
  case 'record':{
   const fields=type.fields.map(f=>[f.name,__stateCapture(f.type)]);
   if((typeof __recordElisions!=='undefined'&&__recordElisions.has(type.name)))return limited((value,budget,depth)=>{const [name,copy]=fields[0];if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,name))throw Error('invalid record');return copy(value[name],budget,depth+1);});
   return limited((value,budget,depth)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||!fields.every(([name])=>Object.hasOwn(value,name)))throw Error('invalid record');
    const out={};for(const [name,copy]of fields){const field=copy(value[name],budget,depth+1);if(name==='__proto__')Object.defineProperty(out,name,{value:field,writable:true,enumerable:true,configurable:true});else out[name]=field;}return out;
   });
  }
  case 'option':{
   const item=__stateCapture(type.element);
   return limited((value,budget,depth)=>{if(tagged(value,'Some'))return {Some:item(value.Some,budget,depth+1)};if(tagged(value,'None')&&value.None===null)return {None:null};throw Error('invalid Option');});
  }
  case 'result':{
   const ok=__stateCapture(type.ok),err=__stateCapture(type.error);
   return limited((value,budget,depth)=>{if(tagged(value,'Ok'))return {Ok:ok(value.Ok,budget,depth+1)};if(tagged(value,'Err'))return {Err:err(value.Err,budget,depth+1)};throw Error('invalid Result');});
  }
  default:return (value,budget,depth)=>__stateInput(value,type,budget,depth);
 }
}
function __stateInput(value,type,budget={cells:1000000},depth=0,maxDepth=64){
  if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');
  const input=(v,t)=>__stateInput(v,t,budget,depth+1,maxDepth);
  const integer=(min,max)=>{if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw Error('invalid '+type.kind);return value===0?0:value;};
  const tagged=tag=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,tag);
  switch(type.kind){
    case 'ref':return input(value,__namedTypes[type.name]);
    case 'u32':return integer(0,4294967295);
    case 'i32':return integer(-2147483648,2147483647);
    case 'u64':return __stateWord(value);
    case 'int':{
      if(typeof value==='bigint')return value;
      if(!tagged('Int')||typeof value.Int!=='string'||!/^(-?[0-9]+)$/.test(value.Int))throw Error('invalid Int');return BigInt(value.Int);
    }
    case 'f64':return __dfCapture(value);
    case 'f32':{
      if(typeof value==='number'&&Number.isFinite(value)){const bits=__bits(value);if((bits&0x7fffffff)===0x7f800000)throw Error('f32 overflow requires F32Bits');return bits;}
      if(!tagged('F32Bits')||!Number.isInteger(value.F32Bits)||value.F32Bits<0||value.F32Bits>4294967295)throw Error('invalid f32');return value.F32Bits;
    }
    case 'bool':if(typeof value!=='boolean')throw Error('invalid Bool');return value;
    case 'unit':if(value!==null)throw Error('invalid Unit');return null;
    case 'string':if(typeof value!=='string'||!value.isWellFormed())throw Error('invalid String');return value;
    case 'id':if(typeof value!=='string'||! /^[0-9a-fA-F]{32}$/.test(value))throw Error('invalid ID');return value.toLowerCase();
    case 'enum':if(!type.variants.includes(value))throw Error('invalid enum');return value;
    case 'list':case 'vector':{
      if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');
      if(type.kind==='vector'&&value.length!==type.size)throw Error('invalid vector length');
      return Array.from(value,v=>input(v,type.element));
    }
    case 'record':if(!value||typeof value!=='object'||Array.isArray(value)||!type.fields.every(f=>Object.hasOwn(value,f.name)))throw Error('invalid record');if((typeof __recordElisions!=='undefined'&&__recordElisions.has(type.name))){const f=type.fields[0];return input(value[f.name],f.type);}return Object.fromEntries(type.fields.map(f=>[f.name,input(value[f.name],f.type)]));
    case 'option':if(tagged('Some'))return {Some:input(value.Some,type.element)};if(tagged('None')&&value.None===null)return {None:null};throw Error('invalid Option');
    case 'result':{const key=typeof __sumSpecs==='undefined'?null:__sumKey(type),flat=key!==null&&__sumSpecs.has(key);if(tagged('Ok')){const child=input(value.Ok,type.ok);return flat?__sumMake(key,true,child):{Ok:child};}if(tagged('Err')){const child=input(value.Err,type.error);return flat?__sumMake(key,false,child):{Err:child};}throw Error('invalid Result');}
    default:throw Error('unsupported public value type');
  }
}
// Mutable host replies must not retain references into compiled state or its outbox.
// State results must own mutable containers. Compile the declared schema once:
// scalars need no structured clone, while nested records/lists remain detached.
function __ownershipSchema(type){
 // Nominal references and expanded declarations name the same checked sort.
 // Distinct source records retain distinct keys even if a layout erases them.
 if(type.kind==='ref'||type.kind==='record'&&type.name)return ['named',type.name];
 switch(type.kind){
  case 'list':case 'vector':return [type.kind,type.size??null,__ownershipSchema(type.element)];
  case 'option':return ['option',__ownershipSchema(type.element)];
  case 'result':return ['result',__ownershipSchema(type.ok),__ownershipSchema(type.error)];
  case 'record':return ['record',type.fields.map(f=>[f.name,__ownershipSchema(f.type)])];
  default:return type;
 }
}
function __ownedResult(copy,nested,type){
 const key='owned-state:'+JSON.stringify(__ownershipSchema(type));
 let schema=__conversionKeys.get(key);
 if(!schema){schema={};__conversionKeys.set(key,schema);}
 const owned=(value,context)=>{
  if(!context&&!nested)return copy(value,null);
  const memo=context||new WeakMap();
  if(value===null||typeof value!=='object')return copy(value,memo);
  let entries=memo.get(schema);if(!entries){entries=new WeakMap();memo.set(schema,entries);}
  if(entries.has(value))return entries.get(value);
  const result=copy(value,memo);entries.set(value,result);return result;
 };
 owned.container=true;return owned;
}
function __stateResult(type){
 switch(type.kind){
  // State storage is always exact bits, independently of pure helper carriers.
  case 'f32':return value=>{const number=__float(value);return Number.isFinite(number)?number:{F32Bits:value};};
  case 'ref':{let resolved;const copy=(value,context)=>(resolved??=__stateResult(__namedTypes[type.name]))(value,context);copy.container=true;return copy;}
  case 'record':{if((typeof __recordElisions!=='undefined'&&__recordElisions.has(type.name))){const f=type.fields[0],copy=__stateResult(f.type);return __ownedResult((value,context)=>({[f.name]:copy(value,context)}),copy.container,type);}const fields=type.fields.map(f=>[f.name,__stateResult(f.type)]);return __ownedResult((value,context)=>Object.fromEntries(fields.map(([name,copy])=>[name,copy(value[name],context)])),fields.some(([,copy])=>copy.container),type);}
  case 'list':case 'vector':{const copy=__stateResult(type.element);return __ownedResult((value,context)=>Array.from(value,item=>copy(item,context)),copy.container,type);}
  case 'option':{const copy=__stateResult(type.element);return __ownedResult((value,context)=>Object.hasOwn(value,'Some')?{Some:copy(value.Some,context)}:{None:null},copy.container,type);}
  case 'result':{const ok=__stateResult(type.ok),err=__stateResult(type.error),key=typeof __sumSpecs==='undefined'?null:__sumKey(type),flat=key!==null&&__sumSpecs.has(key);return __ownedResult((value,context)=>{const v=flat?__sumView(key,value):value;return Object.hasOwn(v,'Ok')?{Ok:ok(v.Ok,context)}:{Err:err(v.Err,context)};},ok.container||err.container,type);}
  default:return __representation(type,true);
 }
}
function __stateOutput(value,type){return __stateResult(type)(value);}
const __u64 = n => BigInt.asUintN(64, n);
function __div(a, b, fallback, signed, remainder) {
  if (b === 0 || b === 0n || (signed && a === -2147483648 && b === -1)) return fallback();
  return typeof a === 'bigint' ? (remainder ? a % b : a / b) :
    ((remainder ? a % b : Math.trunc(a / b)) + 0); // integer zero has no sign
}
function __at(xs, index, fallback) { return index < xs.length ? xs[index] : fallback(); }
// Ordinary arrays retain the declared result element type when input is typed.
function __map(xs, fn) {
  const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = fn(xs[i], i);
  return out;
}
function __filter(xs, fn) {
  const out = [];
  for (let i = 0; i < xs.length; i++) if (fn(xs[i])) out.push(xs[i]);
  return out;
}
function __concat(xs, ys) {
  const left = xs.length, right = ys.length, out = new Array(left + right);
  for (let i = 0; i < left; i++) out[i] = xs[i];
  for (let i = 0; i < right; i++) out[left + i] = ys[i];
  return out;
}
function __zip(xs, ys, fn) {
  const n = Math.min(xs.length, ys.length), out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(xs[i], ys[i]);
  return out;
}
function __repeat(n, initial, fn) { let value = initial; for (let i = 0; i < n; i++) value = fn(i, value); return value; }
function __foldr(xs, initial, fn) { let value = initial; for (let i = xs.length - 1; i >= 0; i--) value = fn(xs[i], value); return value; }
function __scan(xs, zero, add) {
  let value = zero; const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = value = add(value, xs[i]);
  return out;
}
const __sort = xs => Array.from(xs).sort((a,b) => a < b ? -1 : a > b ? 1 : 0);

function __wordSort(xs,Storage){
 const sorted=Storage.from(xs).sort(),out=new Array(sorted.length);
 for(let i=0;i<sorted.length;i++)out[i]=sorted[i];
 return out;
}
// Fixed primitives; no cross-invocation host caches.
function __ink_round_even(x){if(!Number.isFinite(x)||Math.abs(x)>=8388608)return x;const a=Math.abs(x),i=Math.floor(a),r=a-i;const y=i+Number(r>0.5||(r===0.5&&i%2===1));return x<0||Object.is(x,-0)?-y:y;}
function __ink_round_even_f64(x){if(!Number.isFinite(x)||Math.abs(x)>=4503599627370496)return x;const a=Math.abs(x),i=Math.floor(a),r=a-i;const y=i+Number(r>0.5||(r===0.5&&i%2===1));return x<0||Object.is(x,-0)?-y:y;}
// Direct BigInt -> binary32 avoids double rounding through binary64.
function __ink_big_float(x){if(x===0n)return 0;const neg=x<0n;if(neg)x=-x;let e=x.toString(2).length-1;if(e<=23)return Number(neg?-x:x);const shift=BigInt(e-23),mask=(1n<<shift)-1n;let q=x>>shift;const rem=x&mask,half=1n<<(shift-1n);if(rem>half||(rem===half&&(q&1n)!==0n))q++;if(q===16777216n){q>>=1n;e++;}if(e>127)return neg?-Infinity:Infinity;return (neg?-1:1)*Number(q)*2**(e-23);}
function __ink_from_float(x,t){x=Math.trunc(x);if(!Number.isFinite(x))return {None:null};const valid=t==='i32'?x>=-2147483648&&x<2147483648:x>=0&&x<(t==='u32'?4294967296:18446744073709551616);return valid?{Some:t==='u64'?BigInt(x):x===0?0:x}:{None:null};}
function __ink_count(x,n,width){if(width===64){x=BigInt.asUintN(64,x);if(n==='popcount'){let count=0;while(x){x&=x-1n;count++;}return count;}if(x===0n)return 64;if(n==='leading_zeros')return 64-x.toString(2).length;let count=0;while((x&1n)===0n){x>>=1n;count++;}return count;}x>>>=0;if(n==='leading_zeros')return Math.clz32(x);if(n==='trailing_zeros')return x===0?32:31-Math.clz32((x&-x)>>>0);x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return Math.imul((x+(x>>>4))&0x0f0f0f0f,0x01010101)>>>24;}
const __ink_encoder=new TextEncoder(),__ink_decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const __ink_bytes=s=>__ink_encoder.encode(s);
// Count UTF-8 bytes directly; valid Ink strings contain Unicode scalar values.
// Preserve TextEncoder's replacement width for a lone surrogate at trusted hosts.
function __ink_byte_len(s,start=0,end=s.length){let n=0;for(let i=start;i<end;i++){const c=s.charCodeAt(i);if(c<128)n++;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<end&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){n+=4;i++;}else n+=3;}return n;}
const __ink_boundary=(b,i)=>i<=b.length&&(i===b.length||(b[i]&0xc0)!==0x80);
function __ink_byte_at(s,i){const b=__ink_bytes(s);return i<b.length?{Some:b[i]}:{None:null};}
function __ink_slice(s,a,z){const b=__ink_bytes(s);return a<=z&&__ink_boundary(b,a)&&__ink_boundary(b,z)?{Some:__ink_decoder.decode(b.subarray(a,z))}:{None:null};}
function __ink_concat(a,b){const s=a+b;if(__ink_byte_len(s)>4294967295)throw Error('String exceeds U32 byte length');return s;}
function __ink_find(s,needle,from){let unit=0,bytes=0;while(bytes<from&&unit<s.length){const c=s.charCodeAt(unit++);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&unit<s.length&&s.charCodeAt(unit)>=0xdc00&&s.charCodeAt(unit)<=0xdfff){bytes+=4;unit++;}else bytes+=3;}if(bytes!==from)return {None:null};const at=s.indexOf(needle,unit);return at<0?{None:null}:{Some:bytes+__ink_byte_len(s,unit,at)};}

function __ink_int_from_float(x){return Number.isFinite(x)?{Some:BigInt(Math.trunc(x))}:{None:null};}
// Fixed word semantics, including arithmetic signed right shift. Shift and
// rotation counts wrap modulo width; no source-pattern optimisation lives here.
function __word(op,a,b,bits) {
  const width=BigInt(Math.abs(bits)), k=BigInt(b??0)%width;
  const x=BigInt(a), y=BigInt(b??0), unsigned=BigInt.asUintN(Number(width),x);
  let r;
  switch(op) {
    case 'word_widen_u32_to_u64':case 'word_narrow_u64_to_u32':r=x;break;
    case 'word_not':r=~x;break;
    case 'word_and':r=x&y;break;
    case 'word_or':r=x|y;break;
    case 'word_xor':r=x^y;break;
    case 'wrapping_shl':r=x<<k;break;
    case 'wrapping_shr':r=x>>k;break;
    case 'rotate_left':r=(unsigned<<k)|(unsigned>>(width-k));break;
    case 'rotate_right':r=(unsigned>>k)|(unsigned<<(width-k));break;
    default:throw new Error('unknown word operation');
  }
  r=bits<0?BigInt.asIntN(Number(width),r):BigInt.asUintN(Number(width),r);
  return bits===64?r:Number(r);
}
// Rotations evaluate each operand once. Counts wrap modulo the width.
function __rotl32(a,k){k&=31;return (a<<k)|(a>>>((32-k)&31));}
function __rotr32(a,k){k&=31;return (a>>>k)|(a<<((32-k)&31));}
function __rotl64(a,k){const n=BigInt(k&63);return BigInt.asUintN(64,(a<<n)|(a>>((64n-n)&63n)));}
function __rotr64(a,k){const n=BigInt(k&63);return BigInt.asUintN(64,(a>>n)|(a<<((64n-n)&63n)));}
function __fn0(v0,v1,v2){
const v3=__ink_byte_at(v0,v1);
let v4;if(Object.hasOwn(v3,"Some")){
const v5=v3["Some"];
const v6=34;
let v7;if((v5===v6)){
v7="Class.Quote";}else{
let v8;if((v5===v2)){
v8="Class.Delimiter";}else{
const v9=10;
let v10;if((v5===v9)){
v10="Class.Newline";}else{
const v11=13;
let v12;if((v5===v11)){
v12="Class.Return";}else{
v12="Class.Other";}
v10=v12;}
v8=v10;}
v7=v8;}
v4=v7;}else{
const v13=null;
v4="Class.End";}
return v4;}
function __fn1(v14,v15){
const v16="State.FieldStart";
let v17;if((v14===v16)){
const v18="Class.Quote";
let v19;if((v15===v18)){
v19=({Some:"Move.Open"});}else{
const v20="Class.Delimiter";
let v21;if((v15===v20)){
v21=({Some:"Move.Field"});}else{
const v22="Class.Newline";
const v23=(v15===v22);
let v24=v23;if(!v24){
const v25="Class.End";
v24=(v15===v25);}
let v26;if(v24){
v26=({Some:"Move.Row"});}else{
const v27="Class.Return";
let v28;if((v15===v27)){
v28=({Some:"Move.Skip"});}else{
v28=({Some:"Move.Text"});}
v26=v28;}
v21=v26;}
v19=v21;}
v17=v19;}else{
const v29="State.Unquoted";
let v30;if((v14===v29)){
const v31="Class.Delimiter";
let v32;if((v15===v31)){
v32=({Some:"Move.Field"});}else{
const v33="Class.Newline";
const v34=(v15===v33);
let v35=v34;if(!v35){
const v36="Class.End";
v35=(v15===v36);}
let v37;if(v35){
v37=({Some:"Move.Row"});}else{
const v38="Class.Return";
let v39;if((v15===v38)){
v39=({Some:"Move.Skip"});}else{
const v40="Class.Other";
let v41;if((v15===v40)){
v41=({Some:"Move.Text"});}else{
v41=({None:null});}
v39=v41;}
v37=v39;}
v32=v37;}
v30=v32;}else{
const v42="State.Quoted";
let v43;if((v14===v42)){
const v44="Class.Quote";
let v45;if((v15===v44)){
v45=({Some:"Move.Close"});}else{
const v46="Class.End";
let v47;if((v15===v46)){
v47=({None:null});}else{
v47=({Some:"Move.Quoted"});}
v45=v47;}
v43=v45;}else{
const v48="Class.Quote";
let v49;if((v15===v48)){
v49=({Some:"Move.Quoted"});}else{
const v50="Class.Delimiter";
let v51;if((v15===v50)){
v51=({Some:"Move.Field"});}else{
const v52="Class.Newline";
const v53=(v15===v52);
let v54=v53;if(!v54){
const v55="Class.End";
v54=(v15===v55);}
let v56;if(v54){
v56=({Some:"Move.Row"});}else{
const v57="Class.Return";
let v58;if((v15===v57)){
v58=({Some:"Move.Skip"});}else{
v58=({None:null});}
v56=v58;}
v51=v56;}
v49=v51;}
v43=v49;}
v30=v43;}
v17=v30;}
return v17;}
function __fn2(v59,v60,v61){
const v62=__fn1(v59,v60);
let v63;if(Object.hasOwn(v62,"Some")){
const v64=v62["Some"];
v63=v64;}else{
const v65=null;
v63=__fn11(v59,v60,v61);}
return v63;}
function __fn3(v66,v67,v68){
let v69;if(v66["open"]){
const v70=__ink_slice(v67,v66["start"],v68);
let v71;if(Object.hasOwn(v70,"Some")){
const v72=v70["Some"];
v71=v72;}else{
const v73=null;
v71="";}
v69=__ink_concat(v66["field"],v71);}else{
v69=v66["field"];}
return v69;}
function __fn4(v74,v75,v76,v77,v78){
const v79=__fn0(v75,v77,v76);
const v80=v74["state"];
const v81=__fn2(v80,v79,v78);
const v82=v74["state"];
const v83=__fn1(v82,v79);
let v84;if(Object.hasOwn(v83,"Some")){
const v85=v83["Some"];
v84=false;}else{
const v86=null;
v84=true;}
const v87=v84;
let v88;if(v87){
const v89=v74["recovered"];
const v90=v74["count"];
const v91=[v90];
const v92=v89.length;
const v93=v91.length;
const v94=new Array(v92+v93);
for(let v95=0;v95<v92;v95++){v94[v95]=v89[v95];}
for(let v96=0;v96<v93;v96++){v94[v92+v96]=v91[v96];}
v88=v94;}else{
v88=v74["recovered"];}
const v97=v88;
const v98="Move.Text";
const v99=(v81===v98);
let v100=v99;if(!v100){
const v101="Move.Quoted";
v100=(v81===v101);}
let v102;if(v100){
const v103="Move.Text";
let v104;if((v81===v103)){
v104="State.Unquoted";}else{
v104="State.Quoted";}
const v105=v104;
const v106=true;
let v107;if(v74["open"]){
v107=v74["start"];}else{
v107=v77;}
const v108=v107;
const v109=v74["field"];
const v110=v74["row"];
const v111=v74["rows"];
const v112=v74["count"];
v102=({["state"]:v105,["field"]:v109,["open"]:v106,["start"]:v108,["row"]:v110,["rows"]:v111,["count"]:v112,["recovered"]:v97});}else{
const v113=__fn3(v74,v75,v77);
const v114="Move.Requote";
let v115;if((v81===v114)){
const v116="State.Quoted";
const v117=__ink_concat(v113,"\"");
const v118=true;
const v119=v74["row"];
const v120=v74["rows"];
const v121=v74["count"];
v115=({["state"]:v116,["field"]:v117,["open"]:v118,["start"]:v77,["row"]:v119,["rows"]:v120,["count"]:v121,["recovered"]:v97});}else{
const v122="Move.Open";
let v123;if((v81===v122)){
const v124="State.Quoted";
const v125=false;
const v126=v74["start"];
const v127=v74["row"];
const v128=v74["rows"];
const v129=v74["count"];
v123=({["state"]:v124,["field"]:v113,["open"]:v125,["start"]:v126,["row"]:v127,["rows"]:v128,["count"]:v129,["recovered"]:v97});}else{
const v130="Move.Close";
let v131;if((v81===v130)){
const v132="State.AfterQuote";
const v133=false;
const v134=v74["start"];
const v135=v74["row"];
const v136=v74["rows"];
const v137=v74["count"];
v131=({["state"]:v132,["field"]:v113,["open"]:v133,["start"]:v134,["row"]:v135,["rows"]:v136,["count"]:v137,["recovered"]:v97});}else{
const v138="Move.Skip";
let v139;if((v81===v138)){
const v140=false;
const v141=v74["state"];
const v142=v74["start"];
const v143=v74["row"];
const v144=v74["rows"];
const v145=v74["count"];
v139=({["state"]:v141,["field"]:v113,["open"]:v140,["start"]:v142,["row"]:v143,["rows"]:v144,["count"]:v145,["recovered"]:v97});}else{
const v146="Move.Field";
let v147;if((v81===v146)){
const v148="State.FieldStart";
const v149="";
const v150=false;
const v151=v74["row"];
const v152=[v113];
const v153=v151.length;
const v154=v152.length;
const v155=new Array(v153+v154);
for(let v156=0;v156<v153;v156++){v155[v156]=v151[v156];}
for(let v157=0;v157<v154;v157++){v155[v153+v157]=v152[v157];}
const v158=v74["start"];
const v159=v74["rows"];
const v160=v74["count"];
v147=({["state"]:v148,["field"]:v149,["open"]:v150,["start"]:v158,["row"]:v155,["rows"]:v159,["count"]:v160,["recovered"]:v97});}else{
const v161="Class.End";
const v162=(v79===v161);
let v163=v162;if(v163){
const v164=(v74["row"]).length;
const v165=0;
v163=(v164===v165);}
const v166=v163;
let v167=v166;if(v167){
const v168="";
v167=(v113===v168);}
const v169=v167;
const v170=[];
const v171="State.FieldStart";
const v172="";
const v173=false;
let v174;if(v169){
v174=v74["rows"];}else{
const v175=v74["rows"];
const v176=v74["row"];
const v177=[v113];
const v178=v176.length;
const v179=v177.length;
const v180=new Array(v178+v179);
for(let v181=0;v181<v178;v181++){v180[v181]=v176[v181];}
for(let v182=0;v182<v179;v182++){v180[v178+v182]=v177[v182];}
const v183=[v180];
const v184=v175.length;
const v185=v183.length;
const v186=new Array(v184+v185);
for(let v187=0;v187<v184;v187++){v186[v187]=v175[v187];}
for(let v188=0;v188<v185;v188++){v186[v184+v188]=v183[v188];}
v174=v186;}
const v189=v174;
let v190;if(v169){
v190=v74["count"];}else{
const v191=v74["count"];
const v192=1;
v190=(((v191) + (v192)) >>> 0);}
const v193=v190;
const v194=v74["start"];
v147=({["state"]:v171,["field"]:v172,["open"]:v173,["start"]:v194,["row"]:v170,["rows"]:v189,["count"]:v193,["recovered"]:v97});}
v139=v147;}
v131=v139;}
v123=v131;}
v115=v123;}
v102=v115;}
return v102;}
function __fn5(v195,v196,v197){
const v198=[];
const v199=[];
const v200=[];
const v201="State.FieldStart";
const v202="";
const v203=false;
const v204=0;
const v205=0;
const v207=__ink_byte_len(v195);
const v208=1;
const v209=(((v207) + (v208)) >>> 0);
let v210=v201;
let v211=v202;
let v212=v203;
let v213=v204;
let v214=v199;
let v215=v198;
let v216=v205;
let v217=v200;
for(let v219=0;v219<v209;v219++){
if(false){break;}
const v220=(v219>>>0);
const v221=v210;
const v222=v211;
const v223=v212;
const v224=v213;
const v225=v214;
const v226=v215;
const v227=v216;
const v228=v217;
const v231=__record0(v221,v222,v223,v224,v225,v226,v227,v228,v195,v196,v220,v197);
v210=v231["state"];
v211=v231["field"];
v212=v231["open"];
v213=v231["start"];
v214=v231["row"];
v215=v231["rows"];
v216=v231["count"];
v217=v231["recovered"];
}
const v233=v215;
const v234=v217;
return ({["rows"]:v233,["recovered"]:v234});}
function __fn6(v235,v236){
const v237=[];
const v238=0;
const v239=0.0;
let v240=v238;
let v241=v239;
for(let v243=0;v243<v236.length;v243++){
const v244=v236[v243];
const v245=v240;
const v246=1;
const v247=(((v245) + (v246)) >>> 0);
const v248=v241;
const v249=v240;
let v250;if(v249<v235.length){v250=v235[v249];}else{
v250=v237;}
const v251=v250;
let v252;if(__valueEqual0(v251,v244)){
v252=0.0;}else{
v252=1.0;}
const v253=v252;
const v254=Math.fround(__nfNumber(v248) + __nfNumber(v253));
v240=v247;
v241=v254;
}
const v256=v241;
const v257=(v235).length;
const v258=(v236).length;
let v259;if((v257===v258)){
v259=0.0;}else{
v259=1.0;}
const v260=v259;
return Math.fround(__nfNumber(v256) + __nfNumber(v260));}
function __fn7(v261,v262){
let v263=0.0;
for(let v264=0;v264<v261.length;v264++){
const v265=v261[v264];
const v266=v263;
const v267=v265["text"];
const v268=v265["delimiter"];
const v269=__fn5(v267,v268,v262);
const v270=v269["rows"];
const v271=v265["cells"];
const v272=__fn6(v270,v271);
v263=Math.fround(__nfNumber(v266) + __nfNumber(v272));
}
return v263;}
function __fn8(v273){
const v274="State.FieldStart";
let v275;if((v273===v274)){
v275=0;}else{
const v276="State.Unquoted";
let v277;if((v273===v276)){
v277=1;}else{
const v278="State.Quoted";
let v279;if((v273===v278)){
v279=2;}else{
v279=3;}
v277=v279;}
v275=v277;}
return v275;}
function __fn9(v280){
const v281="Class.Quote";
let v282;if((v280===v281)){
v282=0;}else{
const v283="Class.Delimiter";
let v284;if((v280===v283)){
v284=1;}else{
const v285="Class.Newline";
let v286;if((v280===v285)){
v286=2;}else{
const v287="Class.Return";
let v288;if((v280===v287)){
v288=3;}else{
const v289="Class.Other";
let v290;if((v280===v289)){
v290=4;}else{
v290=5;}
v288=v290;}
v286=v288;}
v284=v286;}
v282=v284;}
return v282;}
function __fn10(v291){
const v292=0;
let v293;if((v291===v292)){
v293="Move.Text";}else{
const v294=1;
let v295;if((v291===v294)){
v295="Move.Quoted";}else{
const v296=2;
let v297;if((v291===v296)){
v297="Move.Open";}else{
const v298=3;
let v299;if((v291===v298)){
v299="Move.Close";}else{
const v300=4;
let v301;if((v291===v300)){
v301="Move.Field";}else{
const v302=5;
let v303;if((v291===v302)){
v303="Move.Row";}else{
const v304=6;
let v305;if((v291===v304)){
v305="Move.Skip";}else{
v305="Move.Requote";}
v303=v305;}
v301=v303;}
v299=v301;}
v297=v299;}
v295=v297;}
v293=v295;}
return v293;}
function __fn11(v306,v307,v308){
const v309=v308["recover"];
const v310=1;
const v311=__fn8(v306);
const v312=(Math.imul(v310,v311) >>> 0);
const v313=4;
const v314=__fn9(v307);
const v315=(Math.imul(v313,v314) >>> 0);
const v316=(((v312) + (v315)) >>> 0);
let v317;if(v316<v309.length){v317=v309[v316];}else{
v317=0;}
const v318=v317;
return __fn10(v318);}
function __fn12(v319){
const v320=(v319["recover"]).length;
const v321=24;
const v322=(v320===v321);
let v323=v322;if(v323){
const v324=v319["recover"];
let v325=true;
for(let v326=0;v326<v324.length;v326++){
const v327=(v324[v326]>>>0);
const v328=v325;
let v329=v328;if(v329){
const v330=8;
v329=((v327) < (v330));}
v325=v329;
}
v323=v325;}
return v323;}
function __record0(v792,v793,v794,v795,v796,v797,v798,v799,v800,v801,v802,v803){
const v805=__fn0(v800,v802,v801);
const v806=__fn2(v792,v805,v803);
const v807=__fn1(v792,v805);
let v808;if(Object.hasOwn(v807,"Some")){
const v809=v807["Some"];
v808=false;}else{
const v810=null;
v808=true;}
const v811=v808;
let v812;if(v811){
const v813=[v798];
const v814=v799.length;
const v815=v813.length;
const v816=new Array(v814+v815);
for(let v817=0;v817<v814;v817++){v816[v817]=v799[v817];}
for(let v818=0;v818<v815;v818++){v816[v814+v818]=v813[v818];}
v812=v816;}else{
v812=v799;}
const v819=v812;
const v820="Move.Text";
const v821=(v806===v820);
let v822=v821;if(!v822){
const v823="Move.Quoted";
v822=(v806===v823);}
let v824;if(v822){
const v825="Move.Text";
let v826;if((v806===v825)){
v826="State.Unquoted";}else{
v826="State.Quoted";}
const v827=v826;
const v828=true;
let v829;if(v794){
v829=v795;}else{
v829=v802;}
const v830=v829;
v824=({["state"]:v827,["field"]:v793,["open"]:v828,["start"]:v830,["row"]:v796,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
let v832;if(v794){
const v833=__ink_slice(v800,v795,v802);
let v834;if(Object.hasOwn(v833,"Some")){
const v835=v833["Some"];
v834=v835;}else{
const v836=null;
v834="";}
v832=__ink_concat(v793,v834);}else{
v832=v793;}
const v837=v832;
const v838="Move.Requote";
let v839;if((v806===v838)){
const v840="State.Quoted";
const v841=__ink_concat(v837,"\"");
const v842=true;
v839=({["state"]:v840,["field"]:v841,["open"]:v842,["start"]:v802,["row"]:v796,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
const v843="Move.Open";
let v844;if((v806===v843)){
const v845="State.Quoted";
const v846=false;
v844=({["state"]:v845,["field"]:v837,["open"]:v846,["start"]:v795,["row"]:v796,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
const v847="Move.Close";
let v848;if((v806===v847)){
const v849="State.AfterQuote";
const v850=false;
v848=({["state"]:v849,["field"]:v837,["open"]:v850,["start"]:v795,["row"]:v796,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
const v851="Move.Skip";
let v852;if((v806===v851)){
const v853=false;
v852=({["state"]:v792,["field"]:v837,["open"]:v853,["start"]:v795,["row"]:v796,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
const v854="Move.Field";
let v855;if((v806===v854)){
const v856="State.FieldStart";
const v857="";
const v858=false;
const v859=[v837];
const v860=v796.length;
const v861=v859.length;
const v862=new Array(v860+v861);
for(let v863=0;v863<v860;v863++){v862[v863]=v796[v863];}
for(let v864=0;v864<v861;v864++){v862[v860+v864]=v859[v864];}
v855=({["state"]:v856,["field"]:v857,["open"]:v858,["start"]:v795,["row"]:v862,["rows"]:v797,["count"]:v798,["recovered"]:v819});}else{
const v865="Class.End";
const v866=(v805===v865);
let v867=v866;if(v867){
const v868=(v796).length;
const v869=0;
v867=(v868===v869);}
const v870=v867;
let v871=v870;if(v871){
const v872="";
v871=(v837===v872);}
const v873=v871;
const v874=[];
const v875="State.FieldStart";
const v876="";
const v877=false;
let v878;if(v873){
v878=v797;}else{
const v879=[v837];
const v880=v796.length;
const v881=v879.length;
const v882=new Array(v880+v881);
for(let v883=0;v883<v880;v883++){v882[v883]=v796[v883];}
for(let v884=0;v884<v881;v884++){v882[v880+v884]=v879[v884];}
const v885=[v882];
const v886=v797.length;
const v887=v885.length;
const v888=new Array(v886+v887);
for(let v889=0;v889<v886;v889++){v888[v889]=v797[v889];}
for(let v890=0;v890<v887;v890++){v888[v886+v890]=v885[v890];}
v878=v888;}
const v891=v878;
let v892;if(v873){
v892=v798;}else{
const v893=1;
v892=(((v798) + (v893)) >>> 0);}
const v894=v892;
v855=({["state"]:v875,["field"]:v876,["open"]:v877,["start"]:v795,["row"]:v874,["rows"]:v891,["count"]:v894,["recovered"]:v819});}
v852=v855;}
v848=v852;}
v844=v848;}
v839=v844;}
v824=v839;}
return v824;}
function __valueEqual0(a,b){if(a===b)return true;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!((a[i]===b[i])))return false;return true;}
const __namedTypes={"Labelled":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"Parsed":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"},"Parser":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"},"Tally":{"fields":[{"name":"at","type":{"kind":"u32"}},{"name":"errors","type":{"kind":"f32"}}],"kind":"record","name":"Tally"},"__Learned":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}};
function __stateFn6(a0,a1){return __nfBits(__fn6(a0,a1));}
function __stateFn7(a0,a1){return __nfBits(__fn7(a0,a1));}
// Portable snapshot ABI shared with native/Wasm. Hashing uses Web Crypto.
function __snapshotLimits(limits={}){
 const result={bytes:64*1024*1024,values:1000000,depth:128,...limits};
 for(const k of ['bytes','values','depth'])if(!Number.isSafeInteger(result[k])||result[k]<0||result[k]>(k==='depth'?128:k==='values'?1000000:64*1024*1024))throw Error('invalid snapshot limits');
 return result;
}
const __hash=async bytes=>new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes));
function __snapshotWriter(limits){
 const out=[];let left=limits.values,maxDepth=0;
 function bytes(xs){if(xs.length>limits.bytes-out.length)throw Error('snapshot byte limit exceeded');for(const x of xs)out.push(x);}
 function integer(n,size){n=BigInt(n);for(let i=0;i<size;i++){bytes([Number(n&255n)]);n>>=8n;}}
 function raw(xs){integer(xs.length,8);bytes(xs);}
 function value(v,t,depth=0,bindings=[]){maxDepth=Math.max(maxDepth,depth);if(--left<0||depth>limits.depth)throw Error('snapshot value/depth limit exceeded');switch(t.kind){
  case 'bind':bindings.push([t.name,t.body]);try{value(v,t.body,depth+1,bindings);}finally{bindings.pop();}break;
  case 'ref':{const bound=bindings.findLast(([name])=>name===t.name);if(!bound)throw Error('unbound recursive snapshot schema');value(v,bound[1],depth+1,bindings);break;}
  case 'unit':break;case 'bool':bytes([v?1:0]);break;
  case 'u32':case 'i32':case 'f32':integer(v,4);break;case 'u64':integer(v,8);break;
  case 'f64':integer(__dfBits(v),8);break;
  case 'vector':if(v.length!==t.size)throw Error('vector dimension mismatch');for(const x of v)value(x,t.element,depth+1,bindings);break;
  case 'int':{let n=v<0n?-v:v;const xs=[];while(n){if(xs.length>=4096)throw Error('snapshot Int exceeds size limit');xs.push(Number(n&255n));n>>=8n;}bytes([v===0n?0:v>0n?1:2]);raw(xs);break;}
  case 'string':raw(__encoder.encode(v));break;
  case 'id':integer(BigInt('0x'+v),16);break;
  case 'enum':integer(t.variants.indexOf(v),4);break;
  case 'record':for(const f of t.fields)value(t.elided?v:v[f.name],f.type,depth+1,bindings);break;
  case 'list':if(v.length>left)throw Error('snapshot value limit exceeded');integer(v.length,8);for(const x of v)value(x,t.element,depth+1,bindings);break;
  case 'option':if(Object.hasOwn(v,'Some')){bytes([1]);value(v.Some,t.element,depth+1,bindings);}else bytes([0]);break;
  case 'result':{const branch=t.sum_key?__sumView(t.sum_key,v):v;if(Object.hasOwn(branch,'Ok')){bytes([0]);value(branch.Ok,t.ok,depth+1,bindings);}else{bytes([1]);value(branch.Err,t.error,depth+1,bindings);}break;}
  default:throw Error('unsupported snapshot type');
 }}
 return {bytes,integer,raw,value,charge(cells,depth){left-=cells;if(left<0||depth>limits.depth)throw Error('snapshot value/depth limit exceeded');},get maxDepth(){return maxDepth;},get left(){return left;},finish:()=>new Uint8Array(out)};
}
async function __snapshotEncode(meta,state,options){
 const limits=__snapshotLimits(options),w=__snapshotWriter(limits);
 w.integer(state.version,8);
 const roots=meta.roots.map((r,i)=>({...r,index:i})).sort((a,b)=>a.name<b.name?-1:1);
 for(const r of roots){const rows=[...state.tables[r.index].entries()].sort((a,b)=>__keyCompare(a[0],b[0],r.key));if(rows.length>Math.floor(w.left/2))throw Error('snapshot row limit exceeded');w.integer(rows.length,8);for(const [k,v]of rows){
  if(!meta.snapshotRows){w.value(k,r.snapshotKey??r.key);w.value(v,r.snapshotValue??r.value);continue;}
  const cache=state.snapshotRows[r.index];let packed=cache.get(k);
  if(!packed){const row=__snapshotWriter(limits);row.value(k,r.snapshotKey??r.key);row.value(v,r.snapshotValue??r.value);packed={bytes:row.finish(),cells:limits.values-row.left,depth:row.maxDepth};cache.set(k,packed);}
  w.charge(packed.cells,packed.depth);w.bytes(packed.bytes);
 }}
 w.integer(state.outbox.length,8);
 for(const e of state.outbox){const channel=meta.events.findIndex(t=>t.name===e.channel);w.integer(e.commit,8);w.integer(e.position,8);w.integer(channel,4);w.value(e.value,meta.events[channel].snapshotType??meta.events[channel].type);}
 const payload=w.finish(),header=__snapshotWriter(limits);header.bytes([86,76,83,84,65,84,69,0,1,0,1,0]);header.bytes(meta.snapshot.program);header.bytes(meta.snapshot.schema);header.integer(payload.length,8);header.bytes(payload);
 const bytes=header.finish();if(bytes.length+32>limits.bytes)throw Error('snapshot byte limit exceeded');const digest=await __hash(bytes);const result=new Uint8Array(bytes.length+32);result.set(bytes);result.set(digest,bytes.length);return result;
}
async function __snapshotDecode(meta,input,options){
 const limits=__snapshotLimits(options);
 if(!(input instanceof Uint8Array)&&!Array.isArray(input))throw Error('expected snapshot bytes');
 if(input.length>limits.bytes||input.length<116)throw Error('snapshot byte length invalid');
 if(Array.isArray(input)&&input.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('invalid snapshot bytes');
 const bytes=new Uint8Array(input); // capture before asynchronous integrity work
 function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
 if(!same(bytes.subarray(0,12),[86,76,83,84,65,84,69,0,1,0,1,0]))throw Error('snapshot format or semantics version mismatch');
 if(!same(bytes.subarray(12,44),meta.snapshot.program)||!same(bytes.subarray(44,76),meta.snapshot.schema))throw Error('snapshot program or schema identity mismatch');
 const end=bytes.length-32,digest=await __hash(bytes.subarray(0,end));if(!same(digest,bytes.subarray(end)))throw Error('snapshot integrity check failed');
 let at=76,left=limits.values;
 function take(n){if(!Number.isSafeInteger(n)||n<0||n>end-at)throw Error('truncated snapshot');const x=bytes.subarray(at,at+n);at+=n;return x;}
 function integer(size){const xs=take(size);let n=0n;for(let i=size-1;i>=0;i--)n=(n<<8n)+BigInt(xs[i]);return n;}
 function length(){const n=integer(8);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('snapshot length not addressable');return Number(n);}
 function sequence(){const n=length();if(n>left)throw Error('snapshot value limit exceeded');return n;}
 function raw(){return take(length());}
 const n=length();if(n!==end-84)throw Error('snapshot payload length mismatch');
 function value(t,depth=0,bindings=[]){if(--left<0||depth>limits.depth)throw Error('snapshot value/depth limit exceeded');switch(t.kind){
  case 'bind':bindings.push([t.name,t.body]);try{return value(t.body,depth+1,bindings);}finally{bindings.pop();}
  case 'ref':{const bound=bindings.findLast(([name])=>name===t.name);if(!bound)throw Error('unbound recursive snapshot schema');return value(bound[1],depth+1,bindings);}
  case 'unit':return null;case 'bool':{const b=take(1)[0];if(b>1)throw Error('invalid Bool tag');return b===1;}
  case 'u32':case 'f32':return Number(integer(4));case 'i32':return Number(BigInt.asIntN(32,integer(4)));case 'u64':return integer(8);
  case 'f64':return __dfFromBits(integer(8));
  case 'vector':{const xs=[];for(let i=0;i<t.size;i++)xs.push(value(t.element,depth+1,bindings));return xs;}
  case 'int':{const sign=take(1)[0],xs=raw();if(xs.length>4096)throw Error('snapshot Int exceeds size limit');if(!((sign===0&&xs.length===0)||((sign===1||sign===2)&&xs.length>0&&xs[xs.length-1]!==0)))throw Error('noncanonical signed integer');let n=0n;for(let i=xs.length-1;i>=0;i--)n=(n<<8n)+BigInt(xs[i]);return sign===2?-n:n;}
  case 'string':return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw());
  case 'id':return integer(16).toString(16).padStart(32,'0');
  case 'enum':{const i=Number(integer(4));if(i>=t.variants.length)throw Error('invalid enum tag');return t.variants[i];}
  case 'record':if(t.elided)return value(t.fields[0].type,depth+1,bindings);return Object.fromEntries(t.fields.map(f=>[f.name,value(f.type,depth+1,bindings)]));
  case 'list':{const n=sequence(),xs=[];for(let i=0;i<n;i++)xs.push(value(t.element,depth+1,bindings));return xs;}
  case 'option':{const tag=take(1)[0];if(tag===0)return {None:null};if(tag===1)return {Some:value(t.element,depth+1,bindings)};throw Error('invalid Option tag');}
  case 'result':{const tag=take(1)[0];if(tag===0){const child=value(t.ok,depth+1,bindings);return t.sum_key?__sumMake(t.sum_key,true,child):{Ok:child};}if(tag===1){const child=value(t.error,depth+1,bindings);return t.sum_key?__sumMake(t.sum_key,false,child):{Err:child};}throw Error('invalid Result tag');}
  default:throw Error('unsupported snapshot type');
 }}
 const version=integer(8),tables=meta.roots.map(()=>new Map());
 const roots=meta.roots.map((r,i)=>({...r,index:i})).sort((a,b)=>a.name<b.name?-1:1);
 for(const r of roots){const n=sequence();if(n>Math.floor(left/2))throw Error('snapshot row limit exceeded');let prior;for(let i=0;i<n;i++){const k=value(r.snapshotKey??r.key),v=value(r.snapshotValue??r.value);if(i&&__keyCompare(prior,k,r.key)>=0)throw Error('duplicate or unordered snapshot key');tables[r.index].set(k,v);prior=k;}}
 const count=sequence(),outbox=[];let prior;
 for(let i=0;i<count;i++){const commit=integer(8),position=integer(8),channel=Number(integer(4));if(!meta.events[channel])throw Error('unknown snapshot event channel');const v=value(meta.events[channel].snapshotType??meta.events[channel].type);if(commit===0n||commit>version||(prior&&(commit<prior.commit||(commit===prior.commit&&position<=prior.position))))throw Error('invalid snapshot event sequence');const e={commit,position,channel:meta.events[channel].name,value:v};outbox.push(e);prior=e;}
 if(at!==end)throw Error('trailing snapshot payload');return {version,tables,outbox};
}
// Fixed subscription lifecycle. Root/output edges derive from checked source;
// values and ownership codecs are compiled from each query's declared type.
function __createObservers(prepare){
 const subscriptions=new Map(),byRoot=new Map(),errors=[],directRoots=[],rootSchedules=[];
 let pending=[],spare=[];
 let next=0,held=0,flushing=false;
 function report(s,error,phase){errors.push({query:s?.query??null,error,phase});if(s?.onError)try{s.onError(error);}catch(e){errors.push({query:s.query,error:e,phase:'error-handler'});}}
 function flush(initialPasses=0){
  if(held||flushing||!pending.length)return;
  flushing=true;let passes=initialPasses;
  try{
   while(pending.length&&!held){
    if(++passes>1024){report(null,Error('subscription publication budget exhausted'),'publication');break;}
    const affected=pending;pending=spare;spare=affected;
    for(const s of affected)s.queued=false;
    // Snapshot every affected value before consumers run. Deliveries reside in
    // the stable subscription slots; no per-delivery tuple is allocated.
    for(const s of affected){if(!s.active)continue;s.deliver=false;
     try{if(s.pair){const a=s.pairState?s.pairState.keeps[s.keep0]:s.read0(),b=s.pairState?s.pairState.keeps[s.keep1]:s.read1();if(s.value0!==a||s.value1!==b){s.value0=a;s.value1=b;s.delivery0=a;s.delivery1=b;s.deliver=true;}}else{const value=s.capture(s.read());if(!s.equal(s.value,value)){s.value=value;s.delivery=value;s.deliver=true;}}}
     catch(e){report(s,e,'query');}
    }
    for(const s of affected){if(!s.active||!s.deliver)continue;const value=s.delivery;s.deliver=false;s.delivery=undefined;
     try{if(s.pair)s.callback(s.delivery0,s.delivery1);else s.callback(s.output(value));}catch(e){report(s,e,'listener');}
    }
    affected.length=0;
   }
  }finally{flushing=false;}
 }
 function install(query,q,callback,{immediate=true,onError}={}){
  if(typeof callback!=='function'||onError!==undefined&&typeof onError!=='function')throw TypeError('subscription callback');
  const s={...q,id:next++,query,callback,onError,active:true,queued:false,deliver:false,delivery:undefined};
  if(s.pair){s.value0=s.pairState?s.pairState.keeps[s.keep0]:s.read0();s.value1=s.pairState?s.pairState.keeps[s.keep1]:s.read1();}else{s.value=s.capture(s.read());}subscriptions.set(s.id,s);
  for(const root of s.roots){let ids=byRoot.get(root);if(!ids)byRoot.set(root,ids=[]);ids.push(s);schedule(root,ids);}
  const dispose=()=>{if(!subscriptions.delete(s.id))return;s.active=false;for(const root of s.roots){const ids=byRoot.get(root);ids.splice(ids.indexOf(s),1);schedule(root,ids);if(!ids.length)byRoot.delete(root);}};
  if(immediate)try{if(s.pair)callback(s.value0,s.value1);else callback(s.output(s.value));}catch(e){dispose();throw e;}
  return dispose;
 }
 // Bind the publication implementation when consumers change, instead of
 // rediscovering the one-consumer schedule on each source mutation.
 function schedule(root,ids){
  const s=directRoots[root]=ids.length===1&&ids[0].pairState?ids[0]:null;
  rootSchedules[root]=!ids.length?null:s?()=>publishPair(s):(outputs,epoch)=>{enqueueRoot(root,outputs,epoch);flush();};
 }
 function publishPair(s){
  const a=s.pairState.keeps[s.keep0],b=s.pairState.keeps[s.keep1];
  if(s.value0===a&&s.value1===b)return;
  if(!held&&!flushing&&!pending.length){
   s.value0=a;s.value1=b;flushing=true;
   try{s.callback(a,b);}catch(e){report(s,e,'listener');}finally{flushing=false;}
   flush(1);return;
  }
  if(!s.queued){s.queued=true;pending.push(s);}flush();
 }
 function enqueueRoot(root,outputs,epoch){
  const slots=byRoot.get(root);if(!slots)return;
  for(let i=0;i<slots.length;i++){
   const s=slots[i];if(s.queued)continue;
   if(outputs!==null&&s.outputs?.length){
    let changed=false;for(let j=0;j<s.outputs.length;j++)if(epoch?outputs[s.outputs[j]]===epoch:outputs.has(s.outputs[j])){changed=true;break;}
    if(!changed)continue;
   }
   s.queued=true;pending.push(s);
  }
 }
 return {
  directRoots,rootSchedules,
  get active(){return subscriptions.size!==0;},
  subscribe(query,args,callback,options){return install(query,prepare(query,args),callback,options);},
  subscribeGroup(queries,callback,options){
   if(!Array.isArray(queries)||!queries.length)throw TypeError('subscription group requires queries');
   const qs=queries.map(q=>typeof q==='string'?prepare(q,[]):prepare(q.query,q.args??[]));
   const roots=[...new Set(qs.flatMap(q=>q.roots))];
   // An unknown dependency forces ordinary root invalidation for the group.
   const outputs=qs.every(q=>q.outputs?.length)?[...new Set(qs.flatMap(q=>q.outputs))]:[];
   const scalar=qs.every(q=>q.scalar),direct=qs.every(q=>q.direct);
   return install(queries,{roots,outputs,read:direct?()=>qs.map(q=>q.direct()):()=>qs.map(q=>q.read()),capture:scalar?values=>values:values=>values.map((v,i)=>qs[i].capture(v)),output:scalar?values=>values.slice():values=>values.map((v,i)=>qs[i].output(v)),equal:scalar?(a,b)=>a.every((v,i)=>v===b[i]):(a,b)=>a.every((v,i)=>qs[i].equal(v,b[i]))},callback,options);
  },
  subscribeValues(queries,callback,options){
   if(!Array.isArray(queries)||!queries.length)throw TypeError('subscription group requires queries');
   if(typeof callback!=='function')throw TypeError('subscription callback');
   const qs=queries.map(q=>typeof q==='string'?prepare(q,[]):prepare(q.query,q.args??[]));
   if(qs.length===2&&qs.every(q=>q.scalar)){
    const roots=[...new Set(qs.flatMap(q=>q.roots))],outputs=qs.every(q=>q.outputs?.length)?[...new Set(qs.flatMap(q=>q.outputs))]:[];
    const pairState=qs[0].committed&&qs[1].committed&&qs[0].committed.state===qs[1].committed.state?qs[0].committed.state:null;
    return install(queries,{roots,outputs,pair:true,pairState,keep0:qs[0].committed?.keep,keep1:qs[1].committed?.keep,read0:qs[0].direct||qs[0].read,read1:qs[1].direct||qs[1].read},callback,options);
   }
   return this.subscribeGroup(queries,values=>callback(...values),options);
  },
  commit(roots,outputs=null){
   if(!subscriptions.size)return;
   for(const root of roots)enqueueRoot(root,outputs,false);
   flush();
  },
  // A checked single-root action supplies a reusable array of changed outputs.
  // No root carrier, Set, affected-ID array or Map lookup per delivery is needed.
  commitRoot(root,outputs=null,epoch=0){
   rootSchedules[root]?.(outputs,epoch);
  },
  hold(){held++;return pending.slice();},
  release(){if(!held)throw Error('subscription boundary mismatch');held--;flush();},
  rollback(mark){for(const s of pending)s.queued=false;pending.length=0;for(const s of mark)if(s.active&&!s.queued){s.queued=true;pending.push(s);}if(!held)throw Error('subscription boundary mismatch');held--;flush();},
  batch(callback){
   if(typeof callback!=='function'||Object.prototype.toString.call(callback)==='[object AsyncFunction]')throw TypeError('batch callback must be synchronous');held++;
   try{const value=callback();if(value&&typeof value.then==='function')throw TypeError('state batch callback must be synchronous');return value;}
   finally{held--;flush();}
  },
  flush,takeErrors(){return errors.splice(0);}
 };
}
function __versionWord(v){return typeof v==='number'?BigInt(v):v;}
function __storedCommit(meta,v){return meta.compactCommits&&v<=9007199254740991n?Number(v):v;}
function __nextCommit(v){return typeof v==='number'&&v<9007199254740991?v+1:BigInt(v)+1n;}
// Private column event log. Public records and portable event ordering are unchanged.
// Private event storage. Public events and portable snapshots keep their ordinary
// ordered records. A selected contiguous run omits repeated commit metadata;
// gaps and duplicate commits materialise an exact literal column.
class __EventColumns {
 constructor(channels,compact=false,runs=false){this.channels=channels;this.compact=compact;this.runs=runs;this.commits=runs?null:[];this.base=undefined;this.values=[];this.positions=null;this.channelValues=channels.length===1?null:[];}
 get length(){return this.values.length;}
 set length(n){if(!Number.isSafeInteger(n)||n<0||n>this.length)throw Error('event log truncate');if(this.commits)this.commits.length=n;this.values.length=n;if(this.positions)this.positions.length=n;if(this.channelValues)this.channelValues.length=n;if(n===0){this.base=undefined;if(this.runs)this.commits=null;}}
 append(commit,position,channel,value){
  const i=this.values.length;
  if(this.commits)this.commits.push(commit);
  else if(!i)this.base=commit;
  else{
   const small=typeof this.base==='number'&&typeof commit==='number';
   const expected=small?this.base+i:__versionWord(this.base)+BigInt(i);
   if(expected!==commit){
    this.commits=[];
    for(let j=0;j<i;j++){const word=__versionWord(this.base)+BigInt(j);this.commits.push(this.compact&&word<=9007199254740991n?Number(word):word);}
    this.commits.push(commit);
   }
  }
  this.values.push(value);if(this.channelValues)this.channelValues.push(channel);if(position!==0n&&!this.positions)this.positions=new Array(i).fill(0n);if(this.positions)this.positions.push(position);
 }
 push(e){this.append(this.compact&&e.commit<=9007199254740991n?Number(e.commit):e.commit,e.position,e.channel,e.value);return this.length;}
 at(i){if(i<0)i+=this.length;if(i<0||i>=this.length)return undefined;return {commit:this.commits?__versionWord(this.commits[i]):__versionWord(this.base)+BigInt(i),position:this.positions?this.positions[i]:0n,channel:this.channelValues?this.channelValues[i]:this.channels[0],value:this.values[i]};}
 *[Symbol.iterator](){for(let i=0;i<this.length;i++)yield this.at(i);}
 map(f){const out=new Array(this.length);for(let i=0;i<this.length;i++)out[i]=f(this.at(i),i);return out;}
 filter(f){const out=new __EventColumns(this.channels,this.compact,this.runs);for(let i=0;i<this.length;i++){const e=this.at(i);if(f(e,i))out.push(e);}return out;}
}
function __eventLog(meta,events=[]){
 if(!meta.eventColumns)return meta.compactCommits?events.map(e=>({...e,commit:__storedCommit(meta,e.commit)})):events;
 const log=new __EventColumns(meta.events.map(e=>e.name),meta.compactCommits,meta.eventRuns);for(const e of events)log.append(__storedCommit(meta,e.commit),e.position,e.channel,e.value);return log;
}
// CALLER CONTRACT: arguments must match declared types; malformed data may throw or corrupt state.
// Fixed state primitives used by emitted action bodies, without an AST evaluator.
class __Abort {constructor(value){this.value=value;}}
function __preflightError(message){throw Error(message);}
function __try(value){if(Object.hasOwn(value,'Err'))throw new __Abort(value.Err);return value.Ok;}
function __nested(value,change){if(change && Object.hasOwn(value,'Err'))throw new __Abort(value.Err);return value;}
function __equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&__equal(a[k],b[k]));}
function __checked(op,a,b,bits){const x=BigInt(a),y=BigInt(b),n=op==='checked_add'?x+y:op==='checked_sub'?x-y:x*y;const min=bits===-32?-2147483648n:0n,max=bits===-32?2147483648n:1n<<BigInt(bits);return n<min||n>=max?{Err:'ArithmeticError.Overflow'}:{Ok:Math.abs(bits)===32?Number(n):n};}
function __okOr(value,error){return Object.hasOwn(value,'Some')?{Ok:value.Some}:{Err:error};}
function __mapValue(value,kind,method,fn){
 if(kind==='list')return value[method](fn);
 if(kind==='option')return Object.hasOwn(value,'Some')?{Some:fn(value.Some)}:{None:null};
 const tag=method==='map_err'?'Err':'Ok';return Object.hasOwn(value,tag)?{[tag]:fn(value[tag])}:value;
}
const __encoder=new TextEncoder();
function __tick(ctx){if(--ctx.fuel<0)throw Error('Ink state execution budget exhausted');}
function __keyCompare(a,b,type){
 if(type.kind==='string'){let i=0,j=0;while(i<a.length&&j<b.length){const x=a.codePointAt(i),y=b.codePointAt(j);if(x!==y)return x-y;i+=x>65535?2:1;j+=y>65535?2:1;}return (i<a.length?1:0)-(j<b.length?1:0);}
 return a<b?-1:a>b?1:0;
}
// A table's ordered key view is reused until membership changes. Values are
// fetched at traversal time, so replacement never leaves stale row payloads.
const __tableOrder=new WeakMap();
function __keyPosition(keys,key,type){let low=0,high=keys.length;while(low<high){const middle=(low+high)>>>1;if(__keyCompare(keys[middle],key,type)<0)low=middle+1;else high=middle;}return low;}
function __tableMembership(rt,index,key,present){
 const view=__tableOrder.get(rt.tables[index]);if(!view)return;
 const at=__keyPosition(view.keys,key,rt.meta.roots[index].key);
 if((at<view.keys.length&&view.keys[at]===key)===present)view.pending.delete(key);
 else view.pending.set(key,present);
}
function __orderedKeys(rt,index){
 const table=rt.tables[index],type=rt.meta.roots[index].key;let view=__tableOrder.get(table);
 if(!view){view={keys:[...table.keys()].sort((a,b)=>__keyCompare(a,b,type)),pending:new Map()};__tableOrder.set(table,view);}
 if(view.pending.size){
  const changes=[...view.pending.keys()].sort((a,b)=>__keyCompare(a,b,type)),merged=[];let i=0,j=0;
  while(i<view.keys.length||j<changes.length){
   if(j===changes.length||(i<view.keys.length&&__keyCompare(view.keys[i],changes[j],type)<0))merged.push(view.keys[i++]);
   else{const key=changes[j++];if(i<view.keys.length&&view.keys[i]===key)i++;if(view.pending.get(key))merged.push(key);}
  }
  view.keys=merged;view.pending.clear();
 }
 const keys=view.keys;
 const cell=rt.cell;
 if(cell&&cell.index===index&&table.has(cell.key)!==(cell.next!==undefined)){
  if(cell.next===undefined)return keys.filter(k=>k!==cell.key);
  const at=__keyPosition(keys,cell.key,type);return [...keys.slice(0,at),cell.key,...keys.slice(at)];
 }
 return keys;
}
function __cellGet(rt,index,key){const cell=rt.cell;return cell&&cell.index===index&&cell.key===key?cell.next:rt.tables[index].get(key);}
function __readTable(rt,index){const cell=rt.cell;if(!cell||cell.index!==index)return rt.tables[index];const table=new Map(rt.tables[index]);if(cell.next===undefined)table.delete(cell.key);else table.set(cell.key,cell.next);return table;}
// The first before-image of each cell suffices for whole-transaction rollback.
function __remember(rt,index,key,present,value){if(rt.cellMode)return;if(!rt.seen[index].has(key)){rt.seen[index].add(key);rt.undo.push([index,key,present,value]);}}
// Immutable keeps retain private values. Public results remain owned copies.
// Reverse edges come from checked source effects.
// Before-images preserve cached values across failed actions; host rollback and
// restore discard caches rather than serializing them into logical snapshots.
function __invalidateKeeps(rt,index){
 if(rt.observers?.active)rt.changedRoots.add(index);
 if(!rt.keeps||rt.cellMode)return;
 for(const keep of rt.meta.keepInvalidations[index]){
  if(!rt.keepDirty[keep]){rt.keepDirty[keep]=1;rt.keepUndoIndices[rt.keepUndoCount++]=keep;rt.keepBefore[keep]=rt.keeps[keep];}
  rt.keeps[keep]=undefined;
 }
}
function __restoreKeeps(rt){for(let i=rt.keepUndoCount-1;i>=0;i--){const keep=rt.keepUndoIndices[i];rt.keeps[keep]=rt.keepBefore[keep];}__refreshActiveViews(rt);}
function __clearKeepJournal(rt){for(let i=0;i<rt.keepUndoCount;i++){const keep=rt.keepUndoIndices[i];rt.keepDirty[keep]=0;rt.keepBefore[keep]=undefined;}rt.keepUndoCount=0;}
function __rebuildViews(rt){
 rt.activeViewRoots=new Uint8Array(rt.meta.roots.length);
 for(const view of rt.views){rt.keeps[view.keep]=undefined;if(!rt.meta.lazyMaintenance)__viewBase(rt,view);}
}
function __refreshActiveViews(rt){rt.activeViewRoots.fill(0);for(const view of rt.views)if(rt.keeps[view.keep]!==undefined)rt.activeViewRoots[view.root]=1;}
function __viewBase(rt,view){
 if(rt.keeps[view.keep]===undefined){let value=view.zero;for(const [key,row]of rt.tables[view.root])value=view.combine(value,view.contribution(key,row));rt.keeps[view.keep]=value;rt.activeViewRoots[view.root]=1;}
 return rt.keeps[view.keep];
}
function __viewValue(view,value,key,oldValue,newValue){
 if(oldValue===undefined)return view.insert?view.insert(value,key,newValue):view.combine(value,view.contribution(key,newValue));
 if(newValue===undefined)return view.remove?view.remove(value,key,oldValue):view.combine(value,view.inverse(view.contribution(key,oldValue)));
 return view.replace?view.replace(value,key,oldValue,newValue):view.combine(view.combine(value,view.inverse(view.contribution(key,oldValue))),view.contribution(key,newValue));
}
function __updateViews(rt,index,key,oldValue,newValue){
 if(!rt.activeViewRoots[index])return null;
 const updates=rt.viewNext;
 for(const view of rt.viewsByRoot[index])updates[view.keep]=rt.keeps[view.keep]===undefined?undefined:__viewValue(view,rt.keeps[view.keep],key,oldValue,newValue);
 return updates;
}
function __installViews(rt,updates,index){if(updates)for(const view of rt.viewsByRoot[index])rt.keeps[view.keep]=updates[view.keep];}
function __pendingView(rt,view){
 const keep=view.keep;
 if(rt.pendingValues[keep]===undefined){
  const cell=rt.cell;
  rt.pendingValues[keep]=__viewValue(view,__viewBase(rt,view),cell.key,cell.prior,cell.next);
  rt.pendingIndices.push(keep);
 }
 return rt.pendingValues[keep];
}
function __prepareCell(rt){if(rt.cell&&rt.activeViewRoots[rt.cell.index]){const prepare=rt.views.prepareRoots?.[rt.cell.index];if(prepare)prepare(rt,rt.cell);else for(const view of rt.viewsByRoot[rt.cell.index])if(rt.keeps[view.keep]!==undefined)__pendingView(rt,view);}}
function __invalidateSnapshotRow(rt,index,key){rt.snapshotRows?.[index].delete(key);}
function __writeCell(rt,index,key,next,prior){
 if(rt.cellMode){if(rt.cell)throw Error('checked single-cell bound exceeded');rt.cell={index,key,next,prior};}
 else{const table=rt.tables[index];__invalidateSnapshotRow(rt,index,key);if(rt.changeTracking)__recordChange(rt,index,key,prior,next);if((prior!==undefined)!==(next!==undefined))__tableMembership(rt,index,key,next!==undefined);if(next===undefined)table.delete(key);else table.set(key,next);}
}
function __commitCell(rt){
 const cell=rt.cell;if(!cell)return;
 const table=rt.tables[cell.index];__invalidateSnapshotRow(rt,cell.index,cell.key);
 if(rt.changeTracking)__recordChange(rt,cell.index,cell.key,cell.prior,cell.next);
 if((cell.prior!==undefined)!==(cell.next!==undefined))__tableMembership(rt,cell.index,cell.key,cell.next!==undefined);
 if(cell.next===undefined)table.delete(cell.key);else table.set(cell.key,cell.next);
 for(const keep of rt.meta.keepInvalidations[cell.index])rt.keeps[keep]=rt.pendingValues[keep];
 rt.cell=null;
}
// Preflight scratch has no logical state or rollback obligations. Definitions
// are the same admitted group operations used by ordinary cell maintenance.
function __prepareDirect(rt,index,key,prior,next){
 const prepare=rt.views.directRoots?.[index];
 if(prepare)prepare(rt,key,prior,next);
 else for(const view of rt.viewsByRoot[index])rt.viewNext[view.keep]=__viewValue(view,rt.keeps[view.keep],key,prior,next);
}
function __storeDirect(rt,index,key,prior,next,slot){
 const table=rt.tables[index];__invalidateSnapshotRow(rt,index,key);
 if((prior!==undefined)!==(next!==undefined))__tableMembership(rt,index,key,next!==undefined);
 if(rt.changeTracking)__recordChange(rt,index,key,prior,next);
 if(slot===undefined){if(next===undefined)table.delete(key);else table.set(key,next);}
 else{
  // The checked preflight lookup retains the dense slot until this commit.
  // No callback or source write can intervene; sparse keys retain exact identity.
  if(slot<0){if(next===undefined)table.sparse.delete(key);else table.sparse.set(key,next);}else table.dense[slot]=next;
  if(prior===undefined&&next!==undefined)table.members.add(key);else if(prior!==undefined&&next===undefined)table.members.delete(key);
 }
}
function __commitDirect(rt,index,key,prior,next,slot){
 __storeDirect(rt,index,key,prior,next,slot);
 const publishOutputs=rt.meta.outputPublication&&!rt.observers.directRoots[index]&&rt.observers.active;
 if(publishOutputs&&++rt.changedOutputEpoch===4294967296){rt.changedOutputs.fill(0);rt.changedOutputEpoch=1;}

 for(const keep of rt.meta.keepInvalidations[index]){
  const value=rt.viewByKeep[keep]?rt.viewNext[keep]:undefined;
  if(publishOutputs)rt.changedOutputs[keep]=rt.keeps[keep]!==value?rt.changedOutputEpoch:0;
  rt.keeps[keep]=value;
 }
}
function __emit(rt,channel,value){
 if(rt.eventCount++===0){rt.eventChannel=channel;rt.eventValue=value;}
 else rt.staged.push([channel,value]);
}
// Checked prefix capacities are at most 2^20. Number conversion is exact
// inside that prefix; rounding a wide word cannot move it into the prefix.
// Wide keys retain their original full-width value in the sparse fallback.
class __DenseTable{
 constructor(capacity){this.limit=capacity;this.dense=[];for(let i=0;i<capacity;i++)this.dense.push(undefined);this.sparse=new Map();this.members=new Set();}
 clear(){this.dense.fill(undefined);this.sparse.clear();this.members.clear();__tableOrder.delete(this);return this;}
 slot(key){const i=Number(key);return Number.isInteger(i)&&i>=0&&i<this.limit?i:-1;}
 get size(){return this.members.size;}
 get(key){const i=this.slot(key);return i<0?this.sparse.get(key):this.dense[i];}
 has(key){return this.get(key)!==undefined;}
 set(key,value){const i=this.slot(key),present=i<0?this.sparse.has(key):this.dense[i]!==undefined;if(i<0)this.sparse.set(key,value);else this.dense[i]=value;if(!present)this.members.add(key);return this;}
 delete(key){const i=this.slot(key);if(i<0)this.sparse.delete(key);else this.dense[i]=undefined;return this.members.delete(key);}
 keys(){return this.members.keys();}
 *values(){for(const key of this.members)yield this.get(key);}
 *entries(){for(const key of this.members)yield [key,this.get(key)];}
 [Symbol.iterator](){return this.entries();}
}
class __ColumnTable {
 constructor(root){
  this.limit=root.columnPrefix.capacity;this.keyBig=root.key.kind==='u64';
  this.fields=root.value.fields;this.exactNumbers=root.columnPrefix.exactNumbers;
  this.present=new Uint8Array(this.limit);this.count=0;this.sparse=new Map();
  this.lanes=this.fields.map(f=>f.type.kind==='u64'?(this.exactNumbers?new Float64Array(this.limit):new BigUint64Array(this.limit)):f.type.kind==='i32'?new Int32Array(this.limit):f.type.kind==='bool'?new Uint8Array(this.limit):new Uint32Array(this.limit));
  this.wide=this.fields.map(f=>f.type.kind==='u64'&&this.exactNumbers?new Map():null);
 }
 slot(key){const i=Number(key);return Number.isInteger(i)&&i>=0&&i<this.limit?i:-1;}
 get size(){return this.count+this.sparse.size;}
 has(key){const i=this.slot(key);return i<0?this.sparse.has(key):this.present[i]!==0;}
 get(key){const i=this.slot(key);if(i<0)return this.sparse.get(key);if(!this.present[i])return undefined;const row=Object.create(null);for(let j=0;j<this.fields.length;j++){const f=this.fields[j],v=this.lanes[j][i];row[f.name]=f.type.kind==='bool'?v!==0:f.type.kind==='u64'&&this.exactNumbers?(this.wide[j].get(i)??BigInt(v)):v;}return row;}
 set(key,row){const i=this.slot(key);if(i<0){this.sparse.set(key,row);return this;}for(let j=0;j<this.fields.length;j++){const f=this.fields[j],v=row[f.name];if(f.type.kind==='u64'&&this.exactNumbers){if(v<=9007199254740991n){this.lanes[j][i]=Number(v);this.wide[j].delete(i);}else{this.lanes[j][i]=0;this.wide[j].set(i,v);}}else this.lanes[j][i]=f.type.kind==='bool'?Number(v):v;}if(!this.present[i]){this.present[i]=1;this.count++;}return this;}
 delete(key){const i=this.slot(key);if(i<0)return this.sparse.delete(key);if(!this.present[i])return false;this.present[i]=0;this.count--;for(const wide of this.wide)wide?.delete(i);return true;}
 *keys(){for(let i=0;i<this.limit;i++)if(this.present[i])yield this.keyBig?BigInt(i):i;yield* this.sparse.keys();}
 *values(){for(const key of this.keys())yield this.get(key);}
 *entries(){for(const key of this.keys())yield [key,this.get(key)];}
 [Symbol.iterator](){return this.entries();}
}
function __newTables(meta,prefixes,old,spares){return meta.roots.map((root,i)=>{const prior=spares?.[i];const t=root.columnPrefix?new __ColumnTable(root):prefixes[i]?(prior instanceof __DenseTable&&prior.limit===prefixes[i]?prior.clear():new __DenseTable(prefixes[i])):new Map();if(old)for(const [k,v]of old[i])t.set(k,v);return t;});}
// Only inactive containers are reused. Consume the spare before preparation so
// a failed invariant/rebuild cannot expose its partially reconstructed contents.
// Rows remain immutable; the current logical state changes only at installation.
function __restoreTables(rt,prefixes,old){const spares=rt.restoreSpares;rt.restoreSpares=null;return __newTables(rt.meta,prefixes,old,spares);}
function __cachedKeep(ctx,rt,index,compute){
 if(rt.cell&&rt.meta.keepInvalidations[rt.cell.index].includes(index)){
  const view=rt.viewByKeep[index];
  if(view)return __pendingView(rt,view);
  if(rt.pendingValues[index]===undefined){rt.pendingValues[index]=compute(ctx,rt);rt.pendingIndices.push(index);}
  return rt.pendingValues[index];
 }
 const prior=rt.keeps[index];if(prior!==undefined)return prior;
 const view=rt.viewByKeep[index];if(view)return __viewBase(rt,view);
 const value=compute(ctx,rt);rt.keeps[index]=value;return value;
}
function __tableContains(rt,index,key){return __cellGet(rt,index,key)!==undefined;}
function __tableGet(rt,index,key){const value=__cellGet(rt,index,key);return value===undefined?{None:null}:{Some:value};}
function __tablePut(rt,index,key,next,mode=0){
 const prior=rt.tables[index].get(key),present=prior!==undefined;
 if(mode===1&&present)throw Error('insert key already present');
 if(mode===2&&!present)throw Error('replace key absent');
 if(present&&__stateRootEquals[index](prior,next))return null;
 const updates=rt.cellMode?null:__updateViews(rt,index,key,prior,next);
 __invalidateKeeps(rt,index);__remember(rt,index,key,present,prior);
 __writeCell(rt,index,key,next,prior);__installViews(rt,updates,index);return null;
}
function __tableRemove(rt,index,key){
 const value=rt.tables[index].get(key);
 if(value===undefined)return {None:null};
 const updates=rt.cellMode?null:__updateViews(rt,index,key,value,undefined);
 __invalidateKeeps(rt,index);__remember(rt,index,key,true,value);
 __writeCell(rt,index,key,undefined,value);__installViews(rt,updates,index);return {Some:value};
}
function __table(rt,index,method,args){
 const key=args[0];
 if(method==='get')return __tableGet(rt,index,key);
 if(method==='contains')return __tableContains(rt,index,key);
 const table=rt.tables[index];
 if(method==='values'||method==='keys'){const keys=__orderedKeys(rt,index);return method==='keys'?keys.slice():keys.map(k=>__cellGet(rt,index,k));}
 if(method==='intersect_table'){const current=__readTable(rt,index),other=__readTable(rt,args[0]),small=current.size<=other.size?current:other,large=small===current?other:current;const result=[];for(const k of small.keys())if(large.has(k))result.push(k);return result.sort((a,b)=>__keyCompare(a,b,rt.meta.roots[index].key));}
 if(method==='intersect_keys'){const requested=args[0],size=rt.tables[index].size;
  // Fewer requested keys than rows: look each one up instead of scanning.
  if(requested.length<size){const type=rt.meta.roots[index].key;return [...new Set(requested)].filter(k=>__cellGet(rt,index,k)!==undefined).sort((a,b)=>__keyCompare(a,b,type));}
  const selected=new Set(requested);return __orderedKeys(rt,index).filter(k=>selected.has(k));}
 if(method==='put_many'){const keys=args[0],values=args[1];if(keys.length!==values.length)return {Err:'table bulk length mismatch'};for(let i=0;i<keys.length;i++)__table(rt,index,'put',[keys[i],values[i]]);return {Ok:null};}
 if(method==='remove_many'){for(const k of args[0])__table(rt,index,'remove',[k]);return null;}
 if(method==='remove')return __tableRemove(rt,index,key);
 return __tablePut(rt,index,key,args[1],method==='insert'?1:method==='replace'?2:0);
}

function __rollback(rt,mark){for(let i=rt.undo.length-1;i>=mark;i--){const [index,key,present,value]=rt.undo[i];const table=rt.tables[index];__invalidateSnapshotRow(rt,index,key);if(table.has(key)!==present)__tableMembership(rt,index,key,present);if(present)table.set(key,value);else table.delete(key);}rt.undo.length=mark;}
function __recordChange(rt,index,key,prior,next){rt.changeLog.push([index,key,prior,next]);}
function __fixedTableBytes(root,table){
 const writer=__snapshotWriter(__snapshotLimits());
 const rows=[...table.entries()].sort((a,b)=>__keyCompare(a[0],b[0],root.key));
 writer.integer(rows.length,8);
 for(const [key,value]of rows){writer.value(key,root.snapshotKey??root.key);writer.value(value,root.snapshotValue??root.value);}
 return writer.finish();
}
function __createState(meta,implementations,captures=null,views=[],prefixes=[]){
 const rt={meta,tables:__newTables(meta,prefixes),version:meta.compactCommits?0:0n,outbox:__eventLog(meta),staged:[],busy:false,undo:[],seen:meta.roots.map(()=>new Set()),host:null,keeps:new Array(meta.keeps.length),keepDirty:meta.keeps.length?new Uint8Array(meta.keeps.length):null,keepUndoIndices:meta.keeps.length?new Uint32Array(meta.keeps.length):null,keepUndoCount:0};
 const fixed=typeof __stateFrozenFactories==='undefined'?[]:__stateFrozenFactories;
 const fixedBytes=[];
 for(let i=0;i<fixed.length;i++)if(fixed[i]){for(const [key,value]of fixed[i]())rt.tables[i].set(key,value);fixedBytes[i]=__fixedTableBytes(meta.roots[i],rt.tables[i]);}
 function checkFixed(tables){for(let i=0;i<fixedBytes.length;i++)if(fixedBytes[i]){const bytes=__fixedTableBytes(meta.roots[i],tables[i]);if(bytes.length!==fixedBytes[i].length||!bytes.every((v,n)=>v===fixedBytes[i][n]))throw Error('snapshot changes frozen state: '+meta.roots[i].name);}}
 rt.views=views;rt.viewsByRoot=meta.roots.map((_,root)=>views.filter(v=>v.root===root));__rebuildViews(rt);
 rt.viewByKeep=new Array(meta.keeps.length);for(const view of views)rt.viewByKeep[view.keep]=view;
 rt.pendingIndices=[];rt.pendingValues=new Array(meta.keeps.length);
 rt.eventCount=0;rt.eventChannel=null;rt.eventValue=null;
 rt.viewNext=new Array(meta.keeps.length);rt.cell=null;rt.cellMode=false;rt.ctx={fuel:100000000};
 rt.keepBefore=meta.keeps.length?new Array(meta.keeps.length):null;
 rt.changedRoots=new Set();rt.changedOutputs=new Array(meta.keeps.length).fill(0);rt.changedOutputEpoch=0;
 rt.snapshotRows=meta.snapshotRows?meta.roots.map(()=>new Map()):null;
 rt.restoreSpares=null;rt.changeTracking=false;rt.changeLog=[];rt.changeEpoch=0;rt.changeTokens=new Map();
 const actionMap=new Map(meta.actions.map(a=>[a.name,{...a,inputs:captures?captures[a.index]:a.params.map(p=>__stateCapture(p.type)),output:__stateResult(a.result)}]));
 const eventOutput=new Map(meta.events.map(e=>[e.name,__stateResult(e.type)]));
 rt.eventOutput=eventOutput;
 const prepared=new WeakMap();
 const observers=rt.observers=__createObservers((name,args)=>{
  const a=actionMap.get(name);if(!a||a.change)throw Error('subscription requires a readonly query');
  const captured=a.inputs.map((convert,i)=>convert(args[i]));
  const publicArgs=captured.map((v,i)=>__stateResult(a.params[i].type)(v));
  const scalar=['u64','u32','i32','bool','string','unit','enum','id'].includes(a.result.kind);
  return {scalar,committed:scalar&&a.directKeep!==null&&a.directKeep!==undefined?{state:rt,keep:a.directKeep}:null,direct:scalar&&a.directKeep!==null&&a.directKeep!==undefined?()=>rt.keeps[a.directKeep]:null,roots:a.roots,outputs:rt.meta.outputPublication&&a.directKeep!==null&&a.directKeep!==undefined?[a.directKeep]:[],read:!a.precondition&&a.params.length===0?readZero(a,true):()=>run(a,publicArgs,null,null,true),capture:scalar?v=>v:__stateCapture(a.result),output:scalar?v=>v:a.output,equal:__stateQueryEquals[a.index]};
 });
 function invoke(name,args){const a=actionMap.get(name);if(!a)throw Error(`unknown action ${name}`);return run(a,args);}
 function readZero(a,resultOnly){
  const implementation=implementations[a.index],output=a.output,fresh=a.freshResult;
  if(resultOnly&&fresh&&__stateDirectReadFactories[a.index])return __stateDirectReadFactories[a.index](rt);
  if(a.directKeep!==null&&a.directKeep!==undefined)return ()=>{
   if(rt.busy)throw Error('state operation already in progress');
   const value=rt.keeps[a.directKeep],result=fresh?value:output(value);
   return resultOnly?result:{result,committed:false,version:__versionWord(rt.version),events:[]};
  };
  return ()=>{
   if(rt.busy)throw Error('state operation already in progress');rt.busy=true;rt.ctx.fuel=100000000;
   try{const value=implementation(rt.ctx,rt),result=fresh?value:output(value);return resultOnly?result:{result,committed:false,version:__versionWord(rt.version),events:[]};}
   finally{rt.busy=false;}
  };
 }
 function read(a,args,inputs,output,resultOnly,owned=false){
  if(rt.busy)throw Error('state operation already in progress');
  const captured=owned?args:(inputs||a.inputs).map((convert,i)=>convert(args[i]));
  const ctx=rt.ctx;ctx.fuel=100000000;
  if(a.precondition && implementations[actionMap.get(a.precondition).index](ctx,rt,...captured)!==true)throw Error('contract precondition failed');
  rt.busy=true;
  try{const value=implementations[a.index](ctx,rt,...captured),result=a.freshResult?value:(output||a.output)(value);return resultOnly?result:{result,committed:false,version:__versionWord(rt.version),events:[]};}
  finally{rt.busy=false;}
 }
 function begin(a){
  if(rt.busy)throw Error('state operation already in progress');
  rt.ctx.fuel=100000000;
  rt.actionMark=rt.undo.length;rt.actionVersion=rt.version;rt.actionOutbox=rt.outbox;rt.actionOutboxLength=rt.outbox.length;rt.actionChangeMark=rt.changeLog.length;
  rt.busy=true;rt.cellMode=a.singleCell&&!rt.host;rt.staged.length=0;rt.eventCount=0;rt.changedRoots.clear();rt.actionSuccessful=false;
 }
 function complete(a,value,output,resultOnly){
  const result=a.freshResult?value:(output||a.output)(value);
  const version=rt.actionVersion;
  if(a.fallible && (a.flatFailure?value.tag!==0:Object.hasOwn(value,'Err'))){rt.changeLog.length=rt.actionChangeMark;__rollback(rt,rt.actionMark);__restoreKeeps(rt);if(rt.host?.strict)rt.host.failure=Object.assign(Error('transaction action failed'),{action:a.name,result});return resultOnly?result:{result,committed:false,version:__versionWord(version),events:[]};}
  if(version===18446744073709551615n)throw Error('commit sequence exhausted');
  const next=rt.meta.compactCommits?__nextCommit(version):version+1n;
  const publicNext=resultOnly?null:__versionWord(next);
  __prepareCell(rt);
  const events=resultOnly?null:new Array(rt.eventCount);
  if(rt.eventCount){
   const channel=rt.eventChannel,value=rt.eventValue;
   rt.outbox.push({commit:next,position:0n,channel,value});
   if(events)events[0]={commit:publicNext,position:0n,channel,value:eventOutput.get(channel)(value)};
   for(let i=0;i<rt.staged.length;i++){
    const [channel,value]=rt.staged[i],position=BigInt(i+1);
    rt.outbox.push({commit:next,position,channel,value});
    if(events)events[i+1]={commit:publicNext,position,channel,value:eventOutput.get(channel)(value)};
   }
  }
  __commitCell(rt);rt.version=next;rt.actionSuccessful=true;
  return resultOnly?result:{result,committed:true,version:publicNext,events};
 }
 function abort(e){
  rt.changeLog.length=rt.actionChangeMark;__rollback(rt,rt.actionMark);__restoreKeeps(rt);rt.version=rt.actionVersion;rt.outbox=rt.actionOutbox;rt.outbox.length=rt.actionOutboxLength;if(rt.host?.strict)rt.host.failure=e;throw e;
 }
 function end(){
  const successful=rt.actionSuccessful,single=rt.cellMode;
  rt.cell=null;rt.cellMode=false;rt.staged.length=0;rt.eventCount=0;rt.eventChannel=null;rt.eventValue=null;
  for(const keep of rt.pendingIndices)rt.pendingValues[keep]=undefined;rt.pendingIndices.length=0;
  if(!single){__clearKeepJournal(rt);for(const seen of rt.seen)seen.clear();if(!rt.host)rt.undo.length=0;}
  rt.actionOutbox=null;rt.busy=false;
  if(successful)observers.commit(rt.changedRoots);
 }
 function run(a,args,inputs=null,output=null,resultOnly=false,owned=false){
  if(a.kernels&&!rt.host){
   if(rt.busy)throw Error('state operation already in progress');
   const captured=owned?args:(inputs||a.inputs).map((convert,i)=>convert(args[i]));
   return a.kernels[resultOnly?1:0](...captured);
  }
  if(!a.change)return read(a,args,inputs,output,resultOnly,owned);
  if(rt.busy)throw Error('state operation already in progress');
  const captured=owned?args:(inputs||a.inputs).map((convert,i)=>convert(args[i]));
  const ctx=rt.ctx;ctx.fuel=100000000;
  if(a.precondition && implementations[actionMap.get(a.precondition).index](ctx,rt,...captured)!==true)throw Error('contract precondition failed');
  begin(a);
  try{return complete(a,implementations[a.index](ctx,rt,...captured),output,resultOnly);}
  catch(e){return abort(e);}
  finally{end();}
 }

 for(const a of actionMap.values())if(__statePreflightFactories[a.index]){
  // run() supplies module-owned captured values; bound native entries still capture composites.
  a.kernels=[false,true].map(only=>__statePreflightFactories[a.index](run,a,a.inputs,a.output,only,rt,begin,complete,abort,end,true));
 }
 return Object.freeze({
  subscribeValues(queries,callback,options){if(rt.busy||rt.host)throw Error('subscription requires transaction boundary');return observers.subscribeValues(queries,callback,options);},
  subscribeGroup(queries,callback,options){if(rt.busy||rt.host)throw Error('subscription requires transaction boundary');return observers.subscribeGroup(queries,callback,options);},
  subscribe(...args){if(rt.busy||rt.host)throw Error('subscription requires transaction boundary');return observers.subscribe(...args);},
  batch:observers.batch,flushSubscriptions:observers.flush,takeSubscriptionErrors:observers.takeErrors,
  transaction(callback){
   if(typeof callback!=='function'||Object.prototype.toString.call(callback)==='[object AsyncFunction]')throw TypeError('transaction callback must be synchronous');this.beginTransaction();rt.host.strict=true;
   try{const value=callback(this);if(value&&typeof value.then==='function')throw TypeError('state transaction callback must be synchronous');this.commitTransaction();return value;}catch(e){this.rollbackTransaction();throw e;}
  },
  invoke,invoke_json:invoke,
  prepare(name,args){const a=actionMap.get(name);if(!a)throw Error(`unknown action ${name}`);const captured=a.inputs.map((convert,i)=>convert(args[i])),token=Object.freeze({});prepared.set(token,{action:a,args:captured});return token;},
  invokePrepared(token){const packet=prepared.get(token);if(!packet)throw Error('invalid prepared state call');return run(packet.action,packet.args,null,null,false,true);},
  // A prebound typed entrypoint: scalar arguments obey the native caller contract.
  // Composite arguments still capture owned input; events remain in the outbox.
  bind(name,{resultOnly=false}={}){
   const a=actionMap.get(name);if(!a)throw Error(`unknown action ${name}`);
   const inputs=a.params.map((p,i)=>p.type.kind==='f32'?(value=>typeof value==='number'?__bits(value):value.F32Bits):['u32','i32','u64','bool','unit','string','f64','id','enum','int'].includes(p.type.kind)?__representation(p.type,false):a.inputs[i]);
   if(!a.change&&!a.precondition&&inputs.length===0)return readZero(a,resultOnly);
   return (__statePreflightFactories[a.index]||__stateBoundFactories[a.index])(run,a,inputs,a.output,resultOnly,rt,begin,complete,abort,end);
  },
  beginTransaction(){if(rt.busy||rt.host||rt.undo.length)throw Error('transaction already in progress');rt.host={version:rt.version,outbox:rt.outbox,length:rt.outbox.length,keeps:rt.keeps.slice(),changeMark:rt.changeLog.length,notificationMark:observers.hold()};return true;},
  commitTransaction(){if(rt.busy||!rt.host)throw Error('no state transaction');if(rt.host.failure)throw rt.host.failure;rt.host=null;rt.undo.length=0;observers.release();},
  rollbackTransaction(){if(rt.busy||!rt.host)throw Error('no state transaction');__rollback(rt,0);rt.version=rt.host.version;rt.outbox=rt.host.outbox;rt.outbox.length=rt.host.length;rt.keeps=rt.host.keeps;__refreshActiveViews(rt);rt.changeLog.length=rt.host.changeMark;rt.changeEpoch++;const mark=rt.host.notificationMark;rt.host=null;observers.rollback(mark);},
  changeToken(){
   if(rt.busy||rt.host)throw Error('change token requires transaction boundary');
   const token=Object.freeze({});rt.changeTracking=true;rt.changeTokens.set(token,{epoch:rt.changeEpoch,index:rt.changeLog.length,version:__versionWord(rt.version)});return token;
  },
  releaseChangeToken(token){rt.changeTokens.delete(token);if(!rt.changeTokens.size){rt.changeTracking=false;rt.changeLog.length=0;}},
  changesSince(token){
   if(rt.busy||rt.host)throw Error('changes require transaction boundary');
   const mark=rt.changeTokens.get(token);if(!mark||mark.epoch!==rt.changeEpoch)throw Error('invalid change token lineage');
   const roots=new Map();
   for(let i=mark.index;i<rt.changeLog.length;i++){
    const [root,key,before,after]=rt.changeLog[i];let cells=roots.get(root);if(!cells)roots.set(root,cells=new Map());
    const prior=cells.get(key);if(prior)prior.after=after;else cells.set(key,{before,after});
   }
   const changes=[];
   const codecs=rt.changeOutputs??=meta.roots.map(schema=>({key:__stateResult(schema.key),row:__stateResult(schema.value)}));
   for(const [root,cells]of roots){const schema=meta.roots[root],keyOut=codecs[root].key,rowOut=codecs[root].row;
    for(const [key,{before,after}]of cells){if(before===undefined&&after===undefined||before!==undefined&&after!==undefined&&__stateRootEquals[root](before,after))continue;
     changes.push({table:schema.name,key:keyOut(key),before:before===undefined?{None:null}:{Some:rowOut(before)},after:after===undefined?{None:null}:{Some:rowOut(after)}});
    }
   }
   return {from:mark.version,to:__versionWord(rt.version),changes};
  },
  get version(){return __versionWord(rt.version);},
  get outbox(){return rt.outbox.map(e=>({...e,commit:__versionWord(e.commit),value:eventOutput.get(e.channel)(e.value)}));},
  acknowledgeThrough(commit,position){if(rt.busy)throw Error('state operation already in progress');commit=__stateWord(commit);position=__stateWord(position);const last=rt.outbox.at(-1);if(!last)return;const lastCommit=__versionWord(last.commit);if(lastCommit<commit||(lastCommit===commit&&last.position<=position)){if(rt.host)rt.outbox=__eventLog(meta);else rt.outbox.length=0;return;}rt.outbox=rt.outbox.filter(e=>{const c=__versionWord(e.commit);return c>commit||(c===commit&&e.position>position);});},
  async invokeAsync(name,args){
   if(typeof __parallelInvokeAsync!=='function')return invoke(name,args);
   if(rt.busy||rt.host)throw Error('parallel state call requires transaction boundary');const captured=structuredClone(args);rt.busy=true;observers.hold();let completed=false;
   try{const snapshot=await __snapshotEncode(meta,rt);const reply=await __parallelInvokeAsync(name,captured,snapshot);const s=await __snapshotDecode(meta,reply.snapshot);checkFixed(s.tables);const candidate={...rt,tables:__restoreTables(rt,prefixes,s.tables),keeps:rt.keeps.map(()=>undefined)};__rebuildViews(candidate);const previousTables=rt.tables;rt.tables=candidate.tables;rt.restoreSpares=previousTables.map(table=>table instanceof __DenseTable?table:null);rt.version=__storedCommit(meta,s.version);rt.outbox=__eventLog(meta,s.outbox);rt.keeps=candidate.keeps;rt.activeViewRoots=candidate.activeViewRoots;if(rt.snapshotRows)rt.snapshotRows=meta.roots.map(()=>new Map());rt.changeEpoch++;rt.changeLog.length=0;completed=true;return reply.value;}finally{rt.busy=false;if(completed)observers.commit(meta.roots.map((_,i)=>i));observers.release();}
  },
  checkpoint(limits){if(rt.busy)throw Error('checkpoint requires transaction boundary');return __snapshotEncode(meta,rt,limits);},
  async restore(bytes,limits){if(rt.host)throw Error('restore during transaction');if(rt.busy)throw Error('restore requires transaction boundary');rt.busy=true;rt.ctx.fuel=100000000;observers.hold();let restored=false;try{const s=await __snapshotDecode(meta,bytes,limits);checkFixed(s.tables);const candidate={...rt,tables:__restoreTables(rt,prefixes,s.tables),version:__storedCommit(meta,s.version),outbox:s.outbox,keeps:rt.keeps.map(()=>undefined)};__rebuildViews(candidate);for(const name of meta.invariantChecks||[]){const a=actionMap.get(name);if(implementations[a.index](rt.ctx,candidate)!==true)throw Error('snapshot violates state invariant');}const previousTables=rt.tables;rt.tables=candidate.tables;rt.restoreSpares=previousTables.map(table=>table instanceof __DenseTable?table:null);rt.version=__storedCommit(meta,s.version);rt.outbox=__eventLog(meta,s.outbox);rt.keeps=candidate.keeps;rt.activeViewRoots=candidate.activeViewRoots;if(rt.snapshotRows)rt.snapshotRows=meta.roots.map(()=>new Map());rt.changeEpoch++;rt.changeLog.length=0;restored=true;}finally{rt.busy=false;if(restored)observers.commit(meta.roots.map((_,i)=>i));observers.release();}},
 });
}
function __action0(ctx,rt,s0,s1){__tick(ctx);__tick(ctx);const s2=((v,fallback)=>Object.hasOwn(v,'Some')?v.Some:fallback)(__tableGet(rt,0,0),({["recover"]:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}));__tick(ctx);return __fn5(s0,s1,s2);}
function __action1(ctx,rt,s3){__tick(ctx);__tick(ctx);const s4=((v,fallback)=>Object.hasOwn(v,'Some')?v.Some:fallback)(__tableGet(rt,0,0),({["recover"]:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}));__tick(ctx);return __stateFn7(s3,s4);}
function __action2(ctx,rt){__tick(ctx);__tick(ctx);return ((v,fallback)=>Object.hasOwn(v,'Some')?v.Some:fallback)(__tableGet(rt,0,0),({["recover"]:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}));}
function __stateCommitRoot0(rt,key,prior,next,slot){__storeDirect(rt,0,key,prior,next,slot);const publish=rt.meta.outputPublication&&!rt.observers.directRoots[0]&&rt.observers.active;if(publish&&++rt.changedOutputEpoch===4294967296){rt.changedOutputs.fill(0);rt.changedOutputEpoch=1;}}
const __stateDirectReadFactories=[null,null,null];
function __stateValueEqual4(a,b){if(a===b)return true;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!((a[i]===b[i])))return false;return true;}
function __stateValueEqual1(a,b){if(a===b)return true;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!((a[i]===b[i])))return false;return true;}
function __stateValueEqual3(a,b){if(a===b)return true;if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!(__stateValueEqual4(a[i],b[i])))return false;return true;}
function __stateValueEqual2(a,b){if(a===b)return true;return __stateValueEqual3(a["rows"],b["rows"])&&__stateValueEqual1(a["recovered"],b["recovered"]);}
function __stateValueEqual0(a,b){if(a===b)return true;return __stateValueEqual1(a["recover"],b["recover"]);}
function __ownedInput4(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');const out=new Array(value.length);for(let i=0;i<out.length;i++)out[i]=__ownedInput5(value[i],budget,depth+1,maxDepth);return out;}
function __ownedInput2(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');const out=new Array(value.length);for(let i=0;i<out.length;i++)out[i]=__ownedInput3(value[i],budget,depth+1,maxDepth);return out;}
function __ownedInput5(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');const out=new Array(value.length);for(let i=0;i<out.length;i++)out[i]=__ownedInput0(value[i],budget,depth+1,maxDepth);return out;}
function __ownedInput7(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView)))throw Error('invalid list');const out=new Array(value.length);for(let i=0;i<out.length;i++)out[i]=__ownedInput1(value[i],budget,depth+1,maxDepth);return out;}
function __ownedInput6(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,"recover"))throw Error('invalid record');const field0=__ownedInput7(value["recover"],budget,depth+1,maxDepth);return {["recover"]:field0};}
function __ownedInput3(value,budget={cells:1000000},depth=0,maxDepth=64){if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,"text")||!Object.hasOwn(value,"delimiter")||!Object.hasOwn(value,"cells"))throw Error('invalid record');let field0=value["text"];if(depth+1>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(typeof field0!=='string'||!field0.isWellFormed())throw Error('invalid String');let field1=value["delimiter"];if(depth+1>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(typeof field1!=='number'||!Number.isInteger(field1)||field1<0||field1>4294967295)throw Error('invalid u32');if(field1===0)field1=0;const field2=__ownedInput4(value["cells"],budget,depth+1,maxDepth);return {["text"]:field0,["delimiter"]:field1,["cells"]:field2};}
function __ownedInput0(value,budget={cells:1000000},depth=0,maxDepth=64){let scalar=value;if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(typeof scalar!=='string'||!scalar.isWellFormed())throw Error('invalid String');return scalar;}
function __ownedInput1(value,budget={cells:1000000},depth=0,maxDepth=64){let scalar=value;if(depth>maxDepth||--budget.cells<0)throw Error('state input resource limit');if(typeof scalar!=='number'||!Number.isInteger(scalar)||scalar<0||scalar>4294967295)throw Error('invalid u32');if(scalar===0)scalar=0;return scalar;}
const __stateFrozenFactories=[()=>new Map(JSON.parse("[[0,{\"recover\":[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7,0,0,5,0]}]]").map(([k,v])=>[__ownedInput1(k,{cells:1000000},0,128),__ownedInput6(v,{cells:1000000},0,128)]))];
const __stateQueryEquals=[(a,b)=>__stateValueEqual2(a,b),(a,b)=>(a===b),(a,b)=>__stateValueEqual0(a,b)];
const __stateRootEquals=[(a,b)=>__stateValueEqual0(a,b)];
const __stateBoundFactories=[(run,a,inputs,output,only)=>(p0,p1)=>run(a,[inputs[0](p0),inputs[1](p1)],null,output,only,true),(run,a,inputs,output,only)=>(p0)=>run(a,[inputs[0](p0)],null,output,only,true),(run,a,inputs,output,only)=>()=>run(a,[],null,output,only,true)];const __statePreflightFactories=[null,null,null];
const __stateMetadata={"actions":[{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":0,"name":"parse","params":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}}],"precondition":null,"result":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"},"roots":[0],"singleCell":true},{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":1,"name":"__objective_recovery","params":[{"name":"cases","type":{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"}}],"precondition":null,"result":{"kind":"f32"},"roots":[0],"singleCell":true},{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":2,"name":"__learn_get","params":[],"precondition":null,"result":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"},"roots":[0],"singleCell":true}],"compactCommits":false,"eventColumns":false,"eventRuns":false,"events":[],"invariantChecks":[],"keepInvalidations":[[]],"keeps":[],"lazyMaintenance":true,"outputPublication":false,"roots":[{"key":{"kind":"u32"},"name":"__learned","snapshotKey":{"kind":"u32"},"snapshotValue":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record"},"value":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"snapshot":{"program":[8,241,33,89,13,154,181,120,143,155,202,232,145,35,68,16,147,72,9,87,18,186,170,128,153,8,60,229,103,133,64,93],"schema":[42,177,216,186,118,148,57,25,255,157,101,61,86,14,249,254,17,204,153,167,254,148,131,115,232,149,213,95,165,121,1,115]},"snapshotRows":false};const __actions=[__action0,__action1,__action2];const __stateInputCaptures=[[__ownedInput0,__ownedInput1],[__ownedInput2],[]];
export function createState(){return __createState(__stateMetadata,__actions,__stateInputCaptures);}
export const metadata = {"abi":"ink-javascript-trusted-values-v2","backend":"javascript","core_semantics":"ink-executable-core-v14","core_sha256":"d2bd6cca5e555f1a0eb04896ca15823f282354a62c4dfedfe773bcf223defd0e","destination_abi":{"aliasing":"destination-disjoint-from-all-reachable-inputs","capacity":"trusted","count_unit":"elements","name":"ink-javascript-into-v1","ownership":"caller-owned","tail":"unwritten"},"f32_computation":"native-number-with-exact-nonfinite-tags","f32_storage":"exact-u32-bits","functions":[{"destination":null,"index":0,"internal":false,"name":"classify","parallel":false,"params":[{"name":"text","type":{"kind":"string"}},{"name":"i","type":{"kind":"u32"}},{"name":"delimiter","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},{"destination":null,"index":1,"internal":false,"name":"authored","parallel":false,"params":[{"name":"s","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"c","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}}],"precondition":null,"result":{"element":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]},"kind":"option"}},{"destination":null,"index":2,"internal":false,"name":"decide","parallel":false,"params":[{"name":"s","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"c","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}},{"destination":null,"index":3,"internal":false,"name":"flush","parallel":false,"params":[{"name":"p","type":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},{"name":"text","type":{"kind":"string"}},{"name":"i","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"string"}},{"destination":null,"index":4,"internal":false,"name":"advance","parallel":false,"params":[{"name":"p","type":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"i","type":{"kind":"u32"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},{"destination":null,"index":5,"internal":false,"name":"parse_text","parallel":false,"params":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"}},{"destination":null,"index":6,"internal":false,"name":"row_errors","parallel":false,"params":[{"name":"got","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"want","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":null,"index":7,"internal":false,"name":"recovery","parallel":false,"params":[{"name":"cases","type":{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"kind":"f32"}},{"destination":null,"index":8,"internal":false,"name":"__learn_ord_recover_0","parallel":false,"params":[{"name":"x","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}}],"precondition":null,"result":{"kind":"u32"}},{"destination":null,"index":9,"internal":false,"name":"__learn_ord_recover_1","parallel":false,"params":[{"name":"x","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}}],"precondition":null,"result":{"kind":"u32"}},{"destination":null,"index":10,"internal":false,"name":"__learn_value_recover","parallel":false,"params":[{"name":"i","type":{"kind":"u32"}}],"precondition":null,"result":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}},{"destination":null,"index":11,"internal":false,"name":"__hole_recover","parallel":false,"params":[{"name":"a0","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"a1","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}},{"destination":null,"index":12,"internal":false,"name":"__learn_valid","parallel":false,"params":[{"name":"next","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"precondition":null,"result":{"kind":"bool"}}],"named_types":{"Labelled":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"Parsed":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"},"Parser":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"},"Tally":{"fields":[{"name":"at","type":{"kind":"u32"}},{"name":"errors","type":{"kind":"f32"}}],"kind":"record","name":"Tally"},"__Learned":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}},"prepared_compiled":{"destination":{"call":"callPreparedCompiledInto","capacity":"trusted","failure":"destination may be partially written","float_values":"trusted public representation","inputs":"sealed compiled values","ownership":"caller-owned","structured_elements":"detached","tail":"unwritten"},"evaluation":"lazy source-order; successful bindings only","functions":[{"factory":false,"function":"classify","reason":"no reusable captured work"},{"factory":false,"function":"authored","reason":"no reusable captured work"},{"factory":false,"function":"decide","reason":"no reusable captured work"},{"factory":false,"function":"flush","reason":"no reusable captured work"},{"delegated_calls":0,"factory":true,"function":"advance","retained_bindings":6},{"delegated_calls":0,"factory":true,"function":"parse_text","retained_bindings":2},{"delegated_calls":0,"factory":true,"function":"row_errors","retained_bindings":1},{"delegated_calls":1,"factory":true,"function":"recovery","retained_bindings":0},{"factory":false,"function":"__learn_ord_recover_0","reason":"no reusable captured work"},{"factory":false,"function":"__learn_ord_recover_1","reason":"no reusable captured work"},{"factory":false,"function":"__learn_value_recover","reason":"no reusable captured work"},{"factory":false,"function":"__hole_recover","reason":"no reusable captured work"},{"factory":false,"function":"__learn_valid","reason":"no reusable captured work"}],"lifetime":"prepared token","semantics":"sealed-value-residual-v1"},"private_record_elisions":[],"private_sum_spines":[],"schema":1,"state":{"actions":[{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":0,"name":"parse","params":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}}],"precondition":null,"result":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"},"roots":[0],"singleCell":true},{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":1,"name":"__objective_recovery","params":[{"name":"cases","type":{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"}}],"precondition":null,"result":{"kind":"f32"},"roots":[0],"singleCell":true},{"change":false,"directKeep":null,"fallible":false,"flatFailure":false,"freshResult":false,"index":2,"name":"__learn_get","params":[],"precondition":null,"result":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"},"roots":[0],"singleCell":true}],"compactCommits":false,"eventColumns":false,"eventRuns":false,"events":[],"invariantChecks":[],"keepInvalidations":[[]],"keeps":[],"lazyMaintenance":true,"outputPublication":false,"roots":[{"key":{"kind":"u32"},"name":"__learned","snapshotKey":{"kind":"u32"},"snapshotValue":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record"},"value":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"snapshot":{"program":[8,241,33,89,13,154,181,120,143,155,202,232,145,35,68,16,147,72,9,87,18,186,170,128,153,8,60,229,103,133,64,93],"schema":[42,177,216,186,118,148,57,25,255,157,101,61,86,14,249,254,17,204,153,167,254,148,131,115,232,149,213,95,165,121,1,115]},"snapshotRows":false},"wire":{"format":"ink-value-wire-v1","functions":{"__hole_recover":{"arguments":{"format":"ink-value-wire-v1","identity":"232cdf921665e67acccfbd06745b1694c739bacd58a5d152437385eb4e961dcd","named":{},"root":{"fields":[{"name":"a0","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"a1","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"ad825aca758761cf353e741f5dd65dbe3f819ec11df25725e4dfeee5f4956f39","named":{},"root":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}}},"__learn_ord_recover_0":{"arguments":{"format":"ink-value-wire-v1","identity":"146525648affa622d0f343fc4718d9853295205092fe0a17fe59f9e20d202052","named":{},"root":{"fields":[{"name":"x","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"51f75af7953a9d922f9ada927ffd8d0c8c476597ed69294f0a0425f75b052cff","named":{},"root":{"kind":"u32"}}},"__learn_ord_recover_1":{"arguments":{"format":"ink-value-wire-v1","identity":"30767403db351f63c5e1868bc98bf3959dec51044770ebfaa437b181fbd903e2","named":{},"root":{"fields":[{"name":"x","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"51f75af7953a9d922f9ada927ffd8d0c8c476597ed69294f0a0425f75b052cff","named":{},"root":{"kind":"u32"}}},"__learn_valid":{"arguments":{"format":"ink-value-wire-v1","identity":"e416479fab64ef84fce531d9b51ea541af0a22349f8acc01b994a0fd9c4eeb25","named":{},"root":{"fields":[{"name":"next","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"32f3d3b2f14a1a5d5ed940c0f1126e8a0b1b1f76ff20ac48fac23528d7033176","named":{},"root":{"kind":"bool"}}},"__learn_value_recover":{"arguments":{"format":"ink-value-wire-v1","identity":"42d011307f906aba6408ad4f211afc62ed8973df763c5c67977cffc6319bb813","named":{},"root":{"fields":[{"name":"i","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"ad825aca758761cf353e741f5dd65dbe3f819ec11df25725e4dfeee5f4956f39","named":{},"root":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}}},"advance":{"arguments":{"format":"ink-value-wire-v1","identity":"a6532bb5913a4970faefb6aece548e878e57ea91bb5b88c58fa1a47509e314b9","named":{},"root":{"fields":[{"name":"p","type":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"i","type":{"kind":"u32"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"a77584221072fb3001a8b41de54ee33eeddb261219d816f4d4128481ab54b741","named":{},"root":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}}},"authored":{"arguments":{"format":"ink-value-wire-v1","identity":"6030c3cdf504cb83b1fef3e35c13d4914ae8c41fad1582a51198678309a7b588","named":{},"root":{"fields":[{"name":"s","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"c","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"51b76d00b797b6ef6a334b11c1d7f2b5aa2026e2b00b34c99b4bb3c099103ccb","named":{},"root":{"element":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]},"kind":"option"}}},"classify":{"arguments":{"format":"ink-value-wire-v1","identity":"3f114b5e8ac0011a303b1ab810fb485596866ebae1895e6dbc4d3ab9c5d2dc03","named":{},"root":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"i","type":{"kind":"u32"}},{"name":"delimiter","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"489354a14c6fe1cb557d9f350cb769497fcec7a051e4547683101a9f67bc5d7c","named":{},"root":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}}},"decide":{"arguments":{"format":"ink-value-wire-v1","identity":"148776307847b3fdab05e9f22df193dc277f294cd755d17e4351989cd5ce33bb","named":{},"root":{"fields":[{"name":"s","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"c","type":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"ad825aca758761cf353e741f5dd65dbe3f819ec11df25725e4dfeee5f4956f39","named":{},"root":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}}},"flush":{"arguments":{"format":"ink-value-wire-v1","identity":"0379606d32b6116ec891b7b20a50da9ebad5fe85a9c0cf9867e8b42abcfbb144","named":{},"root":{"fields":[{"name":"p","type":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},{"name":"text","type":{"kind":"string"}},{"name":"i","type":{"kind":"u32"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"1cdb97f14e69255770652db593f88ce0009f937c28d02381f37b2c643dc1470e","named":{},"root":{"kind":"string"}}},"parse_text":{"arguments":{"format":"ink-value-wire-v1","identity":"8833c714a2e06db14ee0ad9fc11cfa38aa32e1ee50f7b1929ffe5e122494f97e","named":{},"root":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"b963f54b95ad488fe0112237eb39f7f8fcdd4d4c545cf08d5280dfa700a108c6","named":{},"root":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"}}},"recovery":{"arguments":{"format":"ink-value-wire-v1","identity":"dab31f727ffbf042046eed868907578a2687e2268c9422541c90ffa5a213746e","named":{},"root":{"fields":[{"name":"cases","type":{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"}},{"name":"__holes","type":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}},"row_errors":{"arguments":{"format":"ink-value-wire-v1","identity":"79e6865ce358e8ad9554f6a93d87759bd75584926856fd7e3a87285095e8ea93","named":{},"root":{"fields":[{"name":"got","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"want","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"arguments"}},"result":{"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":{},"root":{"kind":"f32"}}}}}};
const __implementations=[__fn0,__fn1,__fn2,__fn3,__fn4,__fn5,__fn6,__fn7,__fn8,__fn9,__fn10,__fn11,__fn12];

function __freeze(v) { if(v && typeof v==='object') {Object.values(v).forEach(__freeze);Object.freeze(v);} return v; }
__freeze(metadata);
const __inputTypes=[{"capture":[true,true,true],"types":[{"kind":"string"},{"kind":"u32"},{"kind":"u32"}]},{"capture":[true,true],"types":[{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]},{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}]},{"capture":[true,true,true],"types":[{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]},{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]},{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]},{"capture":[true,true,true],"types":[{"fields":[{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}}],"kind":"record","name":"Parser"},{"kind":"string"},{"kind":"u32"}]},{"capture":[true,true,true,true,true],"types":[{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"},{"kind":"string"},{"kind":"u32"},{"kind":"u32"},{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]},{"capture":[true,true,true],"types":[{"kind":"string"},{"kind":"u32"},{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]},{"capture":[true,true],"types":[{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"},{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}]},{"capture":[true,true],"types":[{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"},{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]},{"capture":[true],"types":[{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}]},{"capture":[true],"types":[{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}]},{"capture":[true],"types":[{"kind":"u32"}]},{"capture":[true,true,true],"types":[{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]},{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]},{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]},{"capture":[true],"types":[{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}]}];
export const functions=Object.freeze({...Object.freeze(Object.fromEntries(metadata.functions.filter(f=>!f.internal).map(f=> {
  const input=__inputTypes[f.index].types.map((t,i)=>__representation(t,false,__inputTypes[f.index].capture[i]));
  const output=__representation(f.result,true);
  const body=__implementations[f.index];
  const implementation=f.precondition==null?body:(...args)=>{if(__implementations[f.precondition](...args)!==true)throw Error('contract precondition failed');return body(...args);};
  const needsInput=input.some(c=>c!==__identity);
  const entry=!needsInput && output===__identity ? implementation :
    (...args)=>{const context=new WeakMap();return output(implementation(...(needsInput ? args.map((v,i)=>input[i](v,context)) : args)),context);};
  return [f.name,entry];
}))),...Object.freeze(Object.fromEntries([["classify",(()=>{const c0=__representation(__inputTypes[0].types[0],false,__inputTypes[0].capture[0]);const c1=__representation(__inputTypes[0].types[1],false,__inputTypes[0].capture[1]);const c2=__representation(__inputTypes[0].types[2],false,__inputTypes[0].capture[2]);const output=__representation(metadata.functions[0].result,true);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&c1===__identity&&c2===__identity&&output===__identity)return __fn0;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn0(...values),context);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return output(__fn0(v0,v1,v2),context);};})()],
["decide",(()=>{const c0=__representation(__inputTypes[2].types[0],false,__inputTypes[2].capture[0]);const c1=__representation(__inputTypes[2].types[1],false,__inputTypes[2].capture[1]);const c2=__representation(__inputTypes[2].types[2],false,__inputTypes[2].capture[2]);const output=__representation(metadata.functions[2].result,true);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&output===__identity)return __fn2;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn2(...values),context);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return output(__fn2(v0,v1,v2),context);};})()],
["flush",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const c2=__representation(__inputTypes[3].types[2],false,__inputTypes[3].capture[2]);const output=__representation(metadata.functions[3].result,true);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&output===__identity)return __fn3;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn3(...values),context);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return output(__fn3(v0,v1,v2),context);};})()],
["row_errors",(()=>{const c0=__representation(__inputTypes[6].types[0],false,__inputTypes[6].capture[0]);const c1=__representation(__inputTypes[6].types[1],false,__inputTypes[6].capture[1]);const output=__representation(metadata.functions[6].result,true);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity&&output===__identity)return __fn6;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn6(...values),context);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return output(__fn6(v0,v1),context);};})()],
["recovery",(()=>{const c0=__representation(__inputTypes[7].types[0],false,__inputTypes[7].capture[0]);const c1=__representation(__inputTypes[7].types[1],false,__inputTypes[7].capture[1]);const output=__representation(metadata.functions[7].result,true);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity&&output===__identity)return __fn7;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn7(...values),context);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return output(__fn7(v0,v1),context);};})()],
["__learn_ord_recover_0",(()=>{const c0=__representation(__inputTypes[8].types[0],false,__inputTypes[8].capture[0]);const output=__representation(metadata.functions[8].result,true);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&output===__identity)return __fn8;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn8(...values),context);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return output(__fn8(v0),context);};})()],
["__learn_ord_recover_1",(()=>{const c0=__representation(__inputTypes[9].types[0],false,__inputTypes[9].capture[0]);const output=__representation(metadata.functions[9].result,true);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&output===__identity)return __fn9;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn9(...values),context);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return output(__fn9(v0),context);};})()],
["__learn_value_recover",(()=>{const c0=__representation(__inputTypes[10].types[0],false,__inputTypes[10].capture[0]);const output=__representation(metadata.functions[10].result,true);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&output===__identity)return __fn10;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn10(...values),context);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return output(__fn10(v0),context);};})()],
["__hole_recover",(()=>{const c0=__representation(__inputTypes[11].types[0],false,__inputTypes[11].capture[0]);const c1=__representation(__inputTypes[11].types[1],false,__inputTypes[11].capture[1]);const c2=__representation(__inputTypes[11].types[2],false,__inputTypes[11].capture[2]);const output=__representation(metadata.functions[11].result,true);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&output===__identity)return __fn11;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn11(...values),context);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return output(__fn11(v0,v1,v2),context);};})()],
["__learn_valid",(()=>{const c0=__representation(__inputTypes[12].types[0],false,__inputTypes[12].capture[0]);const output=__representation(metadata.functions[12].result,true);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&output===__identity)return __fn12;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return output(__fn12(...values),context);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return output(__fn12(v0),context);};})()]]))});
export function call(name,args) { return functions[name](...args); }
// Shared bounded binary codec; generated code supplies exact descriptors.
export const valueWireFormat='ink-value-wire-v1';
// A connection agrees on the complete value schema before using this format.
// Version byte + schema-directed fields; schema identity is out of band.
export const compactValueWireFormat='ink-value-session-v1';
const wireMagic=Uint8Array.of(73,78,75,86,65,76,0,1);
const wireEncoder=new TextEncoder(),wireDecoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
const wireDefaults=Object.freeze({bytes:16777216,nodes:1000000,depth:128}),wireDefaultOptions=Object.freeze({});
const wireDecimal=s=>typeof s==='string'&&/^(0|[1-9][0-9]*|-[1-9][0-9]*)$/.test(s);
function wireLimits(options){if(options===wireDefaultOptions||options===wireDefaults)return wireDefaults;const l={...wireDefaults,...options};for(const k of ['bytes','nodes','depth'])if(!Number.isSafeInteger(l[k])||l[k]<0||l[k]>wireDefaults[k])throw Error('wire hard resource limit');return l;}
const wireFloat=new DataView(new ArrayBuffer(4));
function wireDecodeText(bytes,start,end){
 if(end-start<=16){let text='';for(let i=start;i<end;i++){const byte=bytes[i];if(byte>=128)return wireDecoder.decode(bytes.subarray(start,end));text+=String.fromCharCode(byte);}return text;}
 return wireDecoder.decode(bytes.subarray(start,end));
}
function wireUtf8Length(text){let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff){bytes+=4;i++;}else bytes+=3;}return bytes;}
const wireOwn=(v,k)=>v!==null&&typeof v==='object'&&Object.hasOwn(v,k);
const wireTagged=(v,k)=>wireOwn(v,k)&&Object.keys(v).length===1;
const wireDouble=new DataView(new ArrayBuffer(8));
function wireF64Bits(v){
 if(typeof v==='number'&&Number.isFinite(v)){wireDouble.setFloat64(0,v,true);return wireDouble.getBigUint64(0,true);}
 if(!wireTagged(v,'F64Bits'))wireInvalidValue();const text=v.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))wireInvalidValue();
 const bits=BigInt(text);if(bits>18446744073709551615n)wireInvalidValue();return bits;
}
const wireCanonical=v=>Array.isArray(v)?'['+v.map(wireCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort((a,b)=>{const x=Array.from(a,c=>c.codePointAt(0)),y=Array.from(b,c=>c.codePointAt(0));for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;}).map(k=>JSON.stringify(k)+':'+wireCanonical(v[k])).join(',')+'}':JSON.stringify(v);
export async function createValueCodec(root,named={}){
 const used=new Set(),budget={nodes:100000};
 function check(t,d=0){
  if(d>64||--budget.nodes<0)throw Error('wire descriptor limit');
  const keys={u32:['kind'],u64:['kind'],i32:['kind'],f32:['kind'],f64:['kind'],bool:['kind'],unit:['kind'],string:['kind'],int:['kind'],id:['kind','name'],ref:['kind','name'],enum:['kind','name','variants'],record:['kind','name','fields'],list:['kind','element'],option:['kind','element'],vector:['kind','element','size'],result:['kind','ok','error']}[t?.kind];
  if(!keys||Object.keys(t).length!==keys.length||keys.some(k=>!Object.hasOwn(t,k)))throw Error('invalid wire descriptor');
  if(keys.includes('name')&&(typeof t.name!=='string'||!t.name.isWellFormed()))throw Error('invalid descriptor name');
  if(t.kind==='ref'){if(!used.has(t.name)){used.add(t.name);if(named[t.name]?.kind!=='record'||named[t.name].name!==t.name)throw Error('unresolved wire reference');check(named[t.name],d+1);}}
  if(t.kind==='record'){if(!Array.isArray(t.fields))throw Error('wire fields');const names=new Set();for(const f of t.fields){if(Object.keys(f).length!==2||typeof f.name!=='string'||!f.name.isWellFormed()||names.has(f.name))throw Error('duplicate wire field');names.add(f.name);check(f.type,d+1);}}
  if(t.kind==='enum'&&(!Array.isArray(t.variants)||!t.variants.length||t.variants.length>64||t.variants.some(v=>typeof v!=='string'||!v.isWellFormed())||new Set(t.variants).size!==t.variants.length))throw Error('wire enum');
  if(['list','vector','option'].includes(t.kind)){if(t.kind==='vector'&&(!Number.isInteger(t.size)||t.size<1||t.size>64))throw Error('wire vector');check(t.element,d+1);}
  if(t.kind==='result'){check(t.ok,d+1);check(t.error,d+1);}
 }
 check(root);const names=Object.fromEntries([...used].sort().map(k=>[k,named[k]]));
 const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',wireEncoder.encode(wireCanonical({format:valueWireFormat,root,named:names}))));
 return new ValueCodec({format:valueWireFormat,root,named:names,identity:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')});
}
// Resolve immutable descriptor edges once. Logical validation traverses the
// literal schema; single-child nodes use a loop rather than recursive closures.
function wireValuePlan(codec){
 const seen=new WeakMap();let remaining=100000;
 const build=type=>{
  const t=codec.resolve(type);if(seen.has(t))return seen.get(t);
  if(--remaining<0)throw Error('wire descriptor limit');const p={kind:t.kind,type:t,decode:null,decodeCompact:null};seen.set(t,p);
  if(t.kind==='record')p.fields=t.fields.map(f=>({name:f.name,plan:build(f.type)}));
  if(t.kind==='list'||t.kind==='vector'||t.kind==='option')p.element=build(t.element);
  if(t.kind==='result'){p.ok=build(t.ok);p.error=build(t.error);}
  return p;
 };return build(codec.descriptor.root);
}
function wireBindDecodePlan(root,compact=false){
 const seen=new Set(),pending=[root];let flags=0;
 while(pending.length){
  const p=pending.pop();if(seen.has(p))continue;seen.add(p);if(compact)p.decodeCompact=compactDecodeOperation(p);else p.decode=wireDecodeOperation(p);
  if(p.fields?.length>4)flags|=1;
  if(p.kind==='u32'||p.kind==='i32'||p.kind==='u64'||p.kind==='f32'||p.kind==='f64')flags|=2;
  if(p.fields)for(const f of p.fields)pending.push(f.plan);
  if(p.element)pending.push(p.element);
  if(p.ok){pending.push(p.ok);pending.push(p.error);}
 }
 return flags|4;
}
// Select literal descriptor operations once, without runtime source generation
// or eval. Recursive edges call the completed plan. The generic scanner remains
// the visitor/validation path and an independent materialisation implementation.
function wireReadOperation(p){
 const t=p.type;
 let read;
 switch(p.kind){
  case 'unit':read=(r,end)=>{r.size(end,0);return null;};break;
  case 'bool':read=(r,end)=>{r.size(end,1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':read=(r,end)=>{r.size(end,4);const n=r.view.getUint32(r.cursor,true);r.cursor=end;return n;};break;
  case 'i32':read=(r,end)=>{r.size(end,4);const n=r.view.getInt32(r.cursor,true);r.cursor=end;return n;};break;
  case 'f32':read=(r,end)=>{r.size(end,4);const value={F32Bits:r.view.getUint32(r.cursor,true)};r.cursor=end;return value;};break;
  case 'f64':read=(r,end)=>{r.size(end,8);const value={F64Bits:r.view.getBigUint64(r.cursor,true).toString()};r.cursor=end;return value;};break;
  case 'u64':read=(r,end)=>{r.size(end,8);const value=r.view.getBigUint64(r.cursor,true);r.cursor=end;return value;};break;
  case 'string':read=(r,end)=>r.text(end);break;
  case 'int':read=(r,end)=>{const text=r.text(end);if(!wireDecimal(text))throw Error('malformed wire text');return {Int:text};};break;
  case 'id':read=(r,end)=>{const text=r.text(end);if(!/^[0-9a-f]{32}$/.test(text))throw Error('malformed wire text');return text;};break;
  case 'enum':read=(r,end)=>{const text=r.text(end);if(!t.variants.includes(text))throw Error('malformed wire text');return text;};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   read=(r,end,d)=>{
    if(r.cursor+4>end)throw Error('wire list count');const n=r.view.getUint32(r.cursor,true);r.cursor+=4;
    if(n>r.remaining||n>Math.floor((end-r.cursor)/4)||size!==null&&n!==size)throw Error('wire sequence size');
    const values=new Array(n);for(let i=0;i<n;i++)values[i]=element.decode(r,end,d+1);return values;
   };break;
  }
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>({});break;
    case 1:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1)});break;
    case 2:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1)});break;
    case 3:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1),[fs[2].name]:fs[2].plan.decode(r,end,d+1)});break;
    case 4:read=(r,end,d)=>({[fs[0].name]:fs[0].plan.decode(r,end,d+1),[fs[1].name]:fs[1].plan.decode(r,end,d+1),[fs[2].name]:fs[2].plan.decode(r,end,d+1),[fs[3].name]:fs[3].plan.decode(r,end,d+1)});break;
    default:read=(r,end,d)=>{const value={};for(const f of fs){r.property.value=f.plan.decode(r,end,d+1);Object.defineProperty(value,f.name,r.property);}return value;};
   }break;
  }
  case 'option':read=(r,end,d)=>{const tag=r.tag(end);return tag?{Some:p.element.decode(r,end,d+1)}:{None:null};};break;
  case 'result':read=(r,end,d)=>r.tag(end)?{Err:p.error.decode(r,end,d+1)}:{Ok:p.ok.decode(r,end,d+1)};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return read;
}
function wireDecodeOperation(p){
 if(p.kind==='record'&&p.fields.length===1){
  const field=p.fields[0],read=wireReadOperation(field.plan),name=field.name;
  return (r,parentEnd,d)=>{const end=r.enter(parentEnd,d),childEnd=r.enter(end,d+1),item=read(r,childEnd,d+1);if(r.cursor!==childEnd)throw Error('trailing wire frame bytes');const value={[name]:item};if(r.cursor!==end)throw Error('trailing wire frame bytes');return value;};
 }
 const read=wireReadOperation(p);
 return (r,parentEnd,d)=>{const end=r.enter(parentEnd,d),value=read(r,end,d);if(r.cursor!==end)throw Error('trailing wire frame bytes');return value;};
}
class WireDecodeCursor{
 constructor(bytes,view,limits){this.bytes=bytes;this.view=view;this.cursor=40;this.remaining=limits.nodes;this.depth=limits.depth;this.property=null;}
 enter(parentEnd,d){
  if(d>this.depth||--this.remaining<0||this.cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const start=this.cursor+4,end=start+this.view.getUint32(this.cursor,true);if(end>parentEnd)throw Error('truncated wire frame');this.cursor=start;return end;
 }
 size(end,n){if(end-this.cursor!==n)throw Error('malformed wire scalar');}
 tag(end){if(this.cursor===end||this.bytes[this.cursor]>1)throw Error('wire sum tag');return this.bytes[this.cursor++];}
 text(end){const text=wireDecodeText(this.bytes,this.cursor,end);this.cursor=end;return text;}
}
// Bind literal validation and postorder visitation once for every descriptor.
// No logical carriers are allocated; projection still validates every child.
function wireScanPlan(root){
 const seen=new WeakMap();
 const build=source=>{
  if(seen.has(source))return seen.get(source);
  const p={kind:source.kind,type:source.type,scan:null};seen.set(source,p);
  if(source.fields)p.fields=source.fields.map(f=>({plan:build(f.plan)}));
  if(source.element)p.element=build(source.element);
  if(source.ok){p.ok=build(source.ok);p.error=build(source.error);}
  p.scan=wireScanOperation(p);return p;
 };
 return build(root);
}
function wireScanOperation(p){
 const t=p.type;let read;
 switch(p.kind){
  case 'unit':read=(r,end)=>{r.size(end,0);return null;};break;
  case 'bool':read=(r,end)=>{r.size(end,1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':read=(r,end)=>{r.size(end,4);const n=r.view.getUint32(r.cursor,true);r.cursor=end;return n;};break;
  case 'i32':read=(r,end)=>{r.size(end,4);const n=r.view.getInt32(r.cursor,true);r.cursor=end;return n;};break;
  case 'f32':case 'f64':case 'u64':{const size=p.kind==='f32'?4:8;read=(r,end)=>{r.size(end,size);r.cursor=end;};break;}
  case 'string':read=(r,end)=>{let i=r.cursor;while(i<end&&r.bytes[i]<128)i++;if(i<end)wireDecoder.decode(r.bytes.subarray(r.cursor,end));r.cursor=end;};break;
  case 'int':case 'id':case 'enum':read=(r,end)=>{const text=r.text(end);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   read=(r,end,d)=>{if(r.cursor+4>end)throw Error('wire list count');const n=r.view.getUint32(r.cursor,true);r.cursor+=4;if(n>r.remaining||n>Math.floor((end-r.cursor)/4)||size!==null&&n!==size)throw Error('wire sequence size');for(let i=0;i<n;i++)element.scan(r,end,d+1);};break;
  }
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>{};break;
    case 1:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);};break;
    case 2:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);};break;
    case 3:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);fs[2].plan.scan(r,end,d+1);};break;
    case 4:read=(r,end,d)=>{fs[0].plan.scan(r,end,d+1);fs[1].plan.scan(r,end,d+1);fs[2].plan.scan(r,end,d+1);fs[3].plan.scan(r,end,d+1);};break;
    default:read=(r,end,d)=>{for(const f of fs)f.plan.scan(r,end,d+1);};
   }break;
  }
  case 'option':read=(r,end,d)=>{if(r.tag(end))p.element.scan(r,end,d+1);};break;
  case 'result':read=(r,end,d)=>{(r.tag(end)?p.error:p.ok).scan(r,end,d+1);};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return (r,parentEnd,d)=>{
  const end=r.enter(parentEnd,d),start=r.cursor,value=read(r,end,d);if(r.cursor!==end)throw Error('trailing wire frame bytes');
  const visitor=r.visitor;if(visitor&&(!r.selected||r.selected.has(t.name))){if(r.spans)visitor(t,r.bytes,start,end,d);else visitor(t,r.bytes.subarray(start,end),d);}
  return value;
 };
}
// Separate methods keep decoding's cursor callsites monomorphic. Both cursors
// are checked against the independent generic scanner and malformed fixtures.
class WireScanCursor{
 constructor(bytes,view,limits,visitor,selected,spans){this.bytes=bytes;this.view=view;this.cursor=40;this.remaining=limits.nodes;this.depth=limits.depth;this.visitor=visitor;this.selected=selected;this.spans=spans;}
 enter(parentEnd,d){
  if(d>this.depth||--this.remaining<0||this.cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const start=this.cursor+4,end=start+this.view.getUint32(this.cursor,true);if(end>parentEnd)throw Error('truncated wire frame');this.cursor=start;return end;
 }
 size(end,n){if(end-this.cursor!==n)throw Error('malformed wire scalar');}
 tag(end){if(this.cursor===end||this.bytes[this.cursor]>1)throw Error('wire sum tag');return this.bytes[this.cursor++];}
 text(end){const text=wireDecodeText(this.bytes,this.cursor,end);this.cursor=end;return text;}
}
function compactReadOperation(p){
 const t=p.type;let read;
 switch(p.kind){
  case 'unit':read=()=>null;break;
  case 'bool':read=r=>{r.require(1);const b=r.bytes[r.cursor++];if(b>1)throw Error('invalid wire Bool');return !!b;};break;
  case 'u32':case 'i32':read=r=>{r.require(4);const n=p.kind==='u32'?r.view.getUint32(r.cursor,true):r.view.getInt32(r.cursor,true);r.cursor+=4;return n;};break;
  case 'f32':read=r=>{r.require(4);const n=r.view.getUint32(r.cursor,true);r.cursor+=4;return {F32Bits:n};};break;
  case 'f64':read=r=>{r.require(8);const n=r.view.getBigUint64(r.cursor,true);r.cursor+=8;return {F64Bits:n.toString()};};break;
  case 'u64':read=r=>{r.require(8);const n=r.view.getBigUint64(r.cursor,true);r.cursor+=8;return n;};break;
  case 'string':read=r=>r.text();break;
  case 'int':read=r=>{const text=r.text();if(!wireDecimal(text))throw Error('malformed wire text');return {Int:text};};break;
  case 'id':read=r=>{const text=r.text();if(!/^[0-9a-f]{32}$/.test(text))throw Error('malformed wire text');return text;};break;
  case 'enum':read=r=>{const text=r.text();if(!t.variants.includes(text))throw Error('malformed wire text');return text;};break;
  case 'list':case 'vector':read=(r,d)=>{const n=r.count();if(n>r.remaining||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');const values=new Array(n);for(let i=0;i<n;i++)values[i]=p.element.decodeCompact(r,d+1);return values;};break;
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:read=()=>({});break;
    case 1:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1)});break;
    case 2:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1)});break;
    case 3:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1),[fs[2].name]:fs[2].plan.decodeCompact(r,d+1)});break;
    case 4:read=(r,d)=>({[fs[0].name]:fs[0].plan.decodeCompact(r,d+1),[fs[1].name]:fs[1].plan.decodeCompact(r,d+1),[fs[2].name]:fs[2].plan.decodeCompact(r,d+1),[fs[3].name]:fs[3].plan.decodeCompact(r,d+1)});break;
    default:read=(r,d)=>{const value={};for(const f of fs){r.property.value=f.plan.decodeCompact(r,d+1);Object.defineProperty(value,f.name,r.property);}return value;};
   }break;
  }
  case 'option':read=(r,d)=>r.tag()?{Some:p.element.decodeCompact(r,d+1)}:{None:null};break;
  case 'result':read=(r,d)=>r.tag()?{Err:p.error.decodeCompact(r,d+1)}:{Ok:p.ok.decodeCompact(r,d+1)};break;
  default:read=()=>{throw Error('unsupported wire kind');};
 }
 return read;
}
function compactDecodeOperation(p){
 if(p.kind==='record'&&p.fields.length===1){
  const field=p.fields[0],read=compactReadOperation(field.plan),name=field.name;
  return (r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');if(d+1>r.depth||--r.remaining<0)throw Error('wire node or depth limit');return {[name]:read(r,d+1)};};
 }
 const read=compactReadOperation(p);
 return (r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');return read(r,d);};
}
class CompactDecodeCursor{
 constructor(bytes,limits,flags){this.bytes=bytes;this.view=flags&2?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;this.cursor=1;this.remaining=limits.nodes;this.depth=limits.depth;this.property=null;}
 require(n){if(n>this.bytes.length-this.cursor)throw Error('truncated compact value');}
 count(){
  if(this.cursor>=this.bytes.length)throw Error('truncated compact value');
  const first=this.bytes[this.cursor++];if(first<128)return first;
  let value=first&127,scale=128;
  for(let i=1;i<5;i++){if(this.cursor>=this.bytes.length)throw Error('truncated compact value');const byte=this.bytes[this.cursor++];if(i===4&&byte>15)throw Error('compact count overflow');value+=(byte&127)*scale;if(byte<128){if(byte===0)throw Error('noncanonical compact count');return value;}scale*=128;}throw Error('compact count overflow');
 }
 tag(){if(this.cursor>=this.bytes.length)throw Error('truncated compact value');const tag=this.bytes[this.cursor++];if(tag>1)throw Error('wire sum tag');return tag;}
 text(){const n=this.count();this.require(n);const start=this.cursor;this.cursor+=n;return wireDecodeText(this.bytes,start,this.cursor);}
}
function wireInvalidValue(){throw Error('invalid value for wire schema');}
// Capture has the canonical logical meaning of decode(encode(value)), without
// allocating wire bytes. A separate plan leaves validation/decoder hot shapes
// unchanged and never retains host input containers between calls.
function wireCapturePlan(root,checked=true){
 const seen=new WeakMap();
 const build=source=>{
  if(seen.has(source))return seen.get(source);
  const p={kind:source.kind,type:source.type,capture:null};seen.set(source,p);
  if(source.fields)p.fields=source.fields.map(f=>({name:f.name,plan:build(f.plan)}));
  if(source.element)p.element=build(source.element);
  if(source.ok){p.ok=build(source.ok);p.error=build(source.error);}
  p.capture=checked?wireCaptureOperation(p):wireCopyOperation(p);return p;
 };return build(root);
}
function wireCaptureOperation(p){
 const t=p.type;let copy;
 switch(p.kind){
  case 'unit':copy=v=>{if(v!==null)wireInvalidValue();return null;};break;
  case 'bool':copy=(v,r)=>{if(typeof v!=='boolean')wireInvalidValue();r.add(1);return v;};break;
  case 'u32':case 'i32':{
   const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
   copy=(v,r)=>{if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();r.add(4);return v===0?0:v;};break;
  }
  case 'u64':copy=(v,r)=>{const kind=typeof v;if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();r.add(8);return n;};break;
  case 'f32':copy=(v,r)=>{let bits;if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();bits=wireFloat.getUint32(0,true);}else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}r.add(4);return {F32Bits:bits===0?0:bits};};break;
  case 'f64':copy=(v,r)=>{const bits=wireF64Bits(v);r.add(8);return {F64Bits:bits.toString()};};break;
  case 'string':case 'int':case 'id':case 'enum':copy=(v,r)=>{const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;if(typeof text!=='string'||!text.isWellFormed()||text.length>r.limit)wireInvalidValue();if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();r.add(wireUtf8Length(text));return p.kind==='int'?{Int:text}:text;};break;
  case 'list':case 'vector':{
   const element=p.element,size=p.kind==='vector'?t.size:null;
   copy=(v,r,d)=>{if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();const n=v.length;if(n>r.remaining||size!==null&&n!==size)wireInvalidValue();r.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=element.capture(v[i],r,d+1);return out;};break;
  }
  case 'record':{
   const fs=p.fields;let fields;
   switch(fs.length){
    case 0:fields=()=>({});break;
    case 1:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1)});break;
    case 2:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1)});break;
    case 3:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1)});break;
    case 4:fields=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1),[fs[3].name]:fs[3].plan.capture(v[fs[3].name],r,d+1)});break;
    default:fields=(v,r,d)=>{const out={};for(const f of fs){const value=f.plan.capture(v[f.name],r,d+1);Object.defineProperty(out,f.name,{value,enumerable:true,writable:true,configurable:true});}return out;};
   }
   copy=(v,r,d)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();for(const f of fs)if(!wireOwn(v,f.name))wireInvalidValue();return fields(v,r,d);};break;
  }
  case 'option':copy=(v,r,d)=>{r.add(1);if(wireTagged(v,'None')&&v.None===null)return {None:null};if(wireTagged(v,'Some'))return {Some:p.element.capture(v.Some,r,d+1)};wireInvalidValue();};break;
  case 'result':copy=(v,r,d)=>{r.add(1);if(wireTagged(v,'Ok'))return {Ok:p.ok.capture(v.Ok,r,d+1)};if(wireTagged(v,'Err'))return {Err:p.error.capture(v.Err,r,d+1)};wireInvalidValue();};break;
  default:copy=()=>{throw Error('unsupported wire kind');};
 }
 return (v,r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');r.add(4);return copy(v,r,d);};
}
class WireCaptureCursor{
 constructor(limits){this.remaining=limits.nodes;this.depth=limits.depth;this.limit=limits.bytes;this.bytes=40;this.add(0);}
 add(n){this.bytes+=n;if(this.bytes>this.limit)throw Error('wire byte limit');}
 enter(depth,bytes){if(depth>this.depth||--this.remaining<0)throw Error('wire node or depth limit');this.add(bytes);}
 text(value){if(value.length>this.limit)throw Error('wire byte limit');this.add(wireUtf8Length(value));}
}
// Literal lowerers share this fixed resource policy with logical capture.
export function createValueCaptureBudget(options=wireDefaultOptions){return new WireCaptureCursor(wireLimits(options));}
// The trusted-value API has the same canonical copy and ownership semantics.
// Its caller supplies a stable value accepted by validateValue. Shape/range
// checks remain at external capture boundaries; resource limits still apply.
function wireCopyOperation(p){
 let copy;
 switch(p.kind){
  case 'unit':copy=()=>null;break;
  case 'bool':copy=(v,r)=>{r.add(1);return v;};break;
  case 'u32':copy=(v,r)=>{r.add(4);return v>>>0;};break;
  case 'i32':copy=(v,r)=>{r.add(4);return v|0;};break;
  case 'u64':copy=(v,r)=>{r.add(8);return BigInt(v);};break;
  case 'f32':copy=(v,r)=>{let bits;if(typeof v==='number'){wireFloat.setFloat32(0,v,true);bits=wireFloat.getUint32(0,true);}else bits=v.F32Bits;r.add(4);return {F32Bits:bits===0?0:bits};};break;
  case 'f64':copy=(v,r)=>{const bits=wireF64Bits(v);r.add(8);return {F64Bits:bits.toString()};};break;
  case 'string':case 'id':case 'enum':copy=(v,r)=>{r.add(wireUtf8Length(v));return v;};break;
  case 'int':copy=(v,r)=>{const text=typeof v==='bigint'?v.toString():v.Int;r.add(wireUtf8Length(text));return {Int:text};};break;
  case 'list':case 'vector':copy=(v,r,d)=>{const n=v.length;if(n>r.remaining)throw Error('wire sequence size');r.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=p.element.capture(v[i],r,d+1);return out;};break;
  case 'record':{
   const fs=p.fields;
   switch(fs.length){
    case 0:copy=()=>({});break;
    case 1:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1)});break;
    case 2:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1)});break;
    case 3:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1)});break;
    case 4:copy=(v,r,d)=>({[fs[0].name]:fs[0].plan.capture(v[fs[0].name],r,d+1),[fs[1].name]:fs[1].plan.capture(v[fs[1].name],r,d+1),[fs[2].name]:fs[2].plan.capture(v[fs[2].name],r,d+1),[fs[3].name]:fs[3].plan.capture(v[fs[3].name],r,d+1)});break;
    default:copy=(v,r,d)=>{const out={};for(const f of fs){const value=f.plan.capture(v[f.name],r,d+1);Object.defineProperty(out,f.name,{value,enumerable:true,writable:true,configurable:true});}return out;};
   }break;
  }
  case 'option':copy=(v,r,d)=>{r.add(1);return Object.hasOwn(v,'None')&&v.None===null?{None:null}:{Some:p.element.capture(v.Some,r,d+1)};};break;
  case 'result':copy=(v,r,d)=>{r.add(1);return Object.hasOwn(v,'Ok')?{Ok:p.ok.capture(v.Ok,r,d+1)}:{Err:p.error.capture(v.Err,r,d+1)};};break;
  default:copy=()=>{throw Error('unsupported wire kind');};
 }
 return (v,r,d)=>{if(d>r.depth||--r.remaining<0)throw Error('wire node or depth limit');r.add(4);return copy(v,r,d);};
}
// Emit the cached literal schema with one forward writer. Each value is checked
// where it is consumed; byte bounds belong to the writer, not a second size walk.
function wireEncodeValue(root,value,l,w){
 let remaining=l.nodes;const depthLimit=l.depth;
 const node=(p,v,d)=>{
  if(d>depthLimit||--remaining<0)throw Error('wire node or depth limit');
  const t=p.type,start=w.beginNode();
  switch(p.kind){
   case 'unit':if(v!==null)wireInvalidValue();break;
   case 'bool':if(typeof v!=='boolean')wireInvalidValue();w.byte(+v);break;
   case 'u32':case 'i32':{
    const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
    if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();w.word(v>>>0);break;
   }
   case 'u64':{
    const kind=typeof v;
    if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();
    const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();w.wide(n);break;
   }
   case 'f64':w.wide(wireF64Bits(v));break;
   case 'f32':{
    let bits;
    if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();bits=wireFloat.getUint32(0,true);}
    else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}
    w.word(bits);break;
   }
   case 'string':case 'int':case 'id':case 'enum':{
    const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;
    if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&(typeof text!=='string'||!/^[0-9a-f]{32}$/.test(text))||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();
    w.text(text);break;
   }
   case 'list':case 'vector':{
    if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();
    if(v.length>remaining||p.kind==='vector'&&v.length!==t.size)wireInvalidValue();
    w.count(v.length);for(let i=0;i<v.length;i++)node(p.element,v[i],d+1);break;
   }
   case 'record':{
    const fs=p.fields;
    if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();
    for(let i=0;i<fs.length;i++)if(!wireOwn(v,fs[i].name))wireInvalidValue();
    for(let i=0;i<fs.length;i++){const f=fs[i];node(f.plan,v[f.name],d+1);}break;
   }
   case 'option':{
    if(wireTagged(v,'None')&&v.None===null)w.byte(0);
    else if(wireTagged(v,'Some')){w.byte(1);node(p.element,v.Some,d+1);}else wireInvalidValue();break;
   }
   case 'result':{
    if(wireTagged(v,'Ok')){w.byte(0);node(p.ok,v.Ok,d+1);}
    else if(wireTagged(v,'Err')){w.byte(1);node(p.error,v.Err,d+1);}else wireInvalidValue();break;
   }
   default:throw Error('unsupported wire kind');
  }
  w.endNode(start);
 };
 node(root,value,0);
}
function wireCheckValue(root,value,l){
 let remaining=l.nodes,total=40;
 const add=n=>{total+=n;if(total>l.bytes)throw Error('wire byte limit');};
 const node=(p,v,d)=>{
  while(true){
   if(d>l.depth||--remaining<0)throw Error('wire node or depth limit');
   const t=p.type;
   switch(p.kind){
    case 'unit':if(v!==null)wireInvalidValue();add(4);return;
    case 'bool':if(typeof v!=='boolean')wireInvalidValue();add(5);return;
    case 'u32':case 'i32':{
     const min=p.kind==='u32'?0:-2147483648,max=p.kind==='u32'?4294967295:2147483647;
     if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)wireInvalidValue();add(8);return;
    }
    case 'u64':{
     const kind=typeof v;
     if(kind==='number'&&!Number.isSafeInteger(v)||kind!=='bigint'&&kind!=='number'&&kind!=='string'||kind==='string'&&(!wireDecimal(v)||v.startsWith('-')))wireInvalidValue();
     const n=BigInt(v);if(n<0n||n>18446744073709551615n)wireInvalidValue();add(12);return;
    }
    case 'f64':wireF64Bits(v);add(12);return;
    case 'f32':{
     if(typeof v==='number'&&Number.isFinite(v)){wireFloat.setFloat32(0,v,true);if(!Number.isFinite(wireFloat.getFloat32(0,true)))wireInvalidValue();}
     else{if(!wireTagged(v,'F32Bits'))wireInvalidValue();const bits=v.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295)wireInvalidValue();}
     add(8);return;
    }
    case 'string':case 'int':case 'id':case 'enum':{
     const text=p.kind==='int'?(typeof v==='bigint'?v.toString():wireTagged(v,'Int')?v.Int:null):v;
     if(typeof text!=='string'||!text.isWellFormed()||text.length>l.bytes)wireInvalidValue();
     if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))wireInvalidValue();
     add(4+wireUtf8Length(text));return;
    }
    case 'list':case 'vector':{
     if(!Array.isArray(v)&&!(ArrayBuffer.isView(v)&&!(v instanceof DataView)))wireInvalidValue();
     if(v.length>remaining||p.kind==='vector'&&v.length!==t.size)wireInvalidValue();
     add(8);for(let i=0;i<v.length;i++)node(p.element,v[i],d+1);return;
    }
    case 'record':{
     const fs=p.fields;
     if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==fs.length)wireInvalidValue();
     for(let i=0;i<fs.length;i++)if(!wireOwn(v,fs[i].name))wireInvalidValue();
     add(4);if(!fs.length)return;
     for(let i=0;i<fs.length-1;i++)node(fs[i].plan,v[fs[i].name],d+1);
     const f=fs[fs.length-1];p=f.plan;v=v[f.name];d++;continue;
    }
    case 'option':{
     if(wireTagged(v,'None')&&v.None===null){add(5);return;}
     if(!wireTagged(v,'Some'))wireInvalidValue();add(5);p=p.element;v=v.Some;d++;continue;
    }
    case 'result':{
     if(wireTagged(v,'Ok')){add(5);p=p.ok;v=v.Ok;}
     else if(wireTagged(v,'Err')){add(5);p=p.error;v=v.Err;}else wireInvalidValue();
     d++;continue;
    }
    default:throw Error('unsupported wire kind');
   }
  }
 };
 node(root,value,0);if(total>l.bytes)throw Error('wire byte limit');
}
// A single cursor replaces per-node child closures and {end,value} temporaries.
// Projection filters limit callback materialisation, never schema validation.
function wireScanValue(root,bytes,view,l,materialize,visitor,selected,spans){
 let cursor=40,remaining=l.nodes;
 const property={value:null,enumerable:true,writable:true,configurable:true};
 const node=(p,parentEnd,d)=>{
  if(d>l.depth||--remaining<0||cursor+4>parentEnd)throw Error('wire node, depth or length limit');
  const t=p.type,start=cursor+4,end=start+view.getUint32(cursor,true);if(end>parentEnd)throw Error('truncated wire frame');cursor=start;let value;
  switch(p.kind){
   case 'unit':if(end-start!==0)throw Error('malformed wire scalar');value=null;break;
   case 'bool':if(end-start!==1)throw Error('malformed wire scalar');if(bytes[start]>1)throw Error('invalid wire Bool');value=!!bytes[start];cursor=end;break;
   case 'u32':case 'i32':if(end-start!==4)throw Error('malformed wire scalar');value=p.kind==='u32'?view.getUint32(start,true):view.getInt32(start,true);cursor=end;break;
   case 'f32':if(end-start!==4)throw Error('malformed wire scalar');if(materialize)value={F32Bits:view.getUint32(start,true)};cursor=end;break;
   case 'f64':if(end-start!==8)throw Error('malformed wire scalar');if(materialize)value={F64Bits:view.getBigUint64(start,true).toString()};cursor=end;break;
   case 'u64':if(end-start!==8)throw Error('malformed wire scalar');if(materialize)value=view.getBigUint64(start,true);cursor=end;break;
   case 'string':case 'int':case 'id':case 'enum':{
    if(p.kind==='string'&&!materialize){let i=start;while(i<end&&bytes[i]<128)i++;if(i<end)wireDecoder.decode(bytes.subarray(start,end));}
    else{const text=wireDecodeText(bytes,start,end);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');if(materialize)value=p.kind==='int'?{Int:text}:text;}
    cursor=end;break;
   }
   case 'list':case 'vector':{
    if(start+4>end)throw Error('wire list count');const n=view.getUint32(start,true);cursor+=4;
    if(n>remaining||n>Math.floor((end-cursor)/4)||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');
    if(materialize)value=[];for(let i=0;i<n;i++){const child=node(p.element,end,d+1);if(materialize)value.push(child);}break;
   }
   case 'record':{
    const fs=p.fields;
    // Computed literal keys create own data properties even for __proto__ or
    // prototype setters. Common small records need no descriptor allocations.
    if(materialize&&fs.length<=4){
     switch(fs.length){case 0:value={};break;case 1:value={[fs[0].name]:node(fs[0].plan,end,d+1)};break;case 2:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1)};break;case 3:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1),[fs[2].name]:node(fs[2].plan,end,d+1)};break;case 4:value={[fs[0].name]:node(fs[0].plan,end,d+1),[fs[1].name]:node(fs[1].plan,end,d+1),[fs[2].name]:node(fs[2].plan,end,d+1),[fs[3].name]:node(fs[3].plan,end,d+1)};break;}
    }else{if(materialize)value={};for(const f of fs){const child=node(f.plan,end,d+1);if(materialize){property.value=child;Object.defineProperty(value,f.name,property);}}}break;
   }
   case 'option':case 'result':{
    if(start===end||bytes[cursor]>1)throw Error('wire sum tag');const tag=bytes[cursor++];
    if(p.kind==='option'&&tag===0){if(materialize)value={None:null};}
    else{const label=p.kind==='option'?'Some':tag===0?'Ok':'Err',child=node(p.kind==='option'?p.element:tag===0?p.ok:p.error,end,d+1);if(materialize)value={[label]:child};}break;
   }
   default:throw Error('unsupported wire kind');
  }
  if(cursor!==end)throw Error('trailing wire frame bytes');
  if(visitor&&(!selected||selected.has(t.name))){if(spans)visitor(t,bytes,start,end,d);else visitor(t,bytes.subarray(start,end),d);}
  return value;
 };
 const result=node(root,bytes.length,0);if(cursor!==bytes.length)throw Error('trailing wire bytes');return result;
}
export class ValueCodec{
 #hash;
 #header;
 #headerWords;
 #descriptor;
 #valuePlan;
 #compactCodec;
 #encoder;
 #decodeBound=0;
 #scanPlan=null;
 #capturePlan=null;
 #copyPlan=null;
 get descriptor(){return this.#descriptor;}
 constructor(descriptor){
  // This synchronous path is for compiler-generated immutable metadata. For
  // untrusted descriptors use createValueCodec and compare the computed identity.
  if(descriptor?.format!==valueWireFormat||!/^[0-9a-f]{64}$/.test(descriptor.identity))throw Error('invalid wire schema');
  this.#descriptor=structuredClone(descriptor);this.#hash=Uint8Array.from(descriptor.identity.match(/../g),s=>parseInt(s,16));
  this.#header=new Uint8Array(40);this.#header.set(wireMagic);this.#header.set(this.#hash,8);
  const headerView=new DataView(this.#header.buffer);this.#headerWords=Array.from({length:10},(_,i)=>headerView.getUint32(i*4,true));
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(this.descriptor);this.#valuePlan=wireValuePlan(this);
 }
 resolve(t){for(let i=0;i<64;i++){if(t.kind!=='ref')return t;t=this.descriptor.named[t.name];if(!t)throw Error('wire reference');}throw Error('wire reference cycle');}
 validateValue(value,options=wireDefaultOptions){wireCheckValue(this.#valuePlan,value,wireLimits(options));return true;}
 capture(value,options=wireDefaultOptions){const limits=wireLimits(options);this.#capturePlan??=wireCapturePlan(this.#valuePlan);return this.#capturePlan.capture(value,new WireCaptureCursor(limits),0);}
 copy(value,options=wireDefaultOptions){const limits=wireLimits(options);this.#copyPlan??=wireCapturePlan(this.#valuePlan,false);return this.#copyPlan.capture(value,new WireCaptureCursor(limits),0);}
 compact(){return this.#compactCodec??=new CompactValueCodec(this);}
 encode(value,options=wireDefaultOptions){
  const l=wireLimits(options),w=this.#encoder&&!this.#encoder.active?this.#encoder:new WireEncoder(l);
  this.#encoder??=w;w.reset(l);
  try{w.bytes(this.#header);wireEncodeValue(this.#valuePlan,value,l,w);return w.finish();}
  finally{w.active=false;if(w.capacity>4096&&this.#encoder===w)this.#encoder=undefined;}
 }
 encodeWith(emit,options=wireDefaultOptions){
  const w=new WireEncoder(options);w.bytes(wireMagic);w.bytes(this.#hash);emit(w);const bytes=w.finish();this.validate(bytes,options);return bytes;
 }
 scan(bytes,options=wireDefaultOptions,materialize=false,visitor=null,names=null,spans=false){
  const l=wireLimits(options);if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<44||bytes.length>l.bytes)throw Error('wire byte limit or header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<10;i++)if(view.getUint32(i*4,true)!==this.#headerWords[i])throw Error('wire format or schema mismatch');
  if(names!==null&&(!Array.isArray(names)||names.length>100000||names.some(n=>typeof n!=='string')))throw Error('wire visitor names');
  if(materialize&&!visitor){this.#decodeBound||=wireBindDecodePlan(this.#valuePlan);const cursor=new WireDecodeCursor(bytes,view,l);if(this.#decodeBound&1)cursor.property={value:null,enumerable:true,writable:true,configurable:true};const value=this.#valuePlan.decode(cursor,bytes.length,0);if(cursor.cursor!==bytes.length)throw Error('trailing wire bytes');return value;}
  if(!materialize){this.#scanPlan??=wireScanPlan(this.#valuePlan);const cursor=new WireScanCursor(bytes,view,l,visitor,names===null?null:new Set(names),spans),value=this.#scanPlan.scan(cursor,bytes.length,0);if(cursor.cursor!==bytes.length)throw Error('trailing wire bytes');return value;}
  return wireScanValue(this.#valuePlan,bytes,view,l,materialize,visitor,names===null?null:new Set(names),spans);
 }
 visit(bytes,visitor,options=wireDefaultOptions,names=null){if(typeof visitor!=='function')throw Error('wire visitor required');this.scan(bytes,options,false,visitor,names);}
 visitSpans(bytes,visitor,options=wireDefaultOptions,names=null){if(typeof visitor!=='function')throw Error('wire visitor required');this.scan(bytes,options,false,visitor,names,true);}
 validate(bytes,options=wireDefaultOptions){this.scan(bytes,options,false);return true;}
 decode(bytes,options=wireDefaultOptions){return this.scan(bytes,options,true);}
}

// Bounded forward emission avoids building and repeatedly joining child buffers.
class WireEncoder{
 #data=new Uint8Array(256);#view=new DataView(this.#data.buffer);#at=0;#remaining;#depth=0;#byteLimit;#depthLimit;
 active=false;
 constructor(options){this.reset(options);}
 reset(options){const limits=wireLimits(options);this.#byteLimit=limits.bytes;this.#depthLimit=limits.depth;this.#remaining=limits.nodes;this.#depth=0;this.#at=0;this.active=true;}
 get capacity(){return this.#data.length;}
 get position(){return this.#at;}
 beginNode(){const at=this.#at;this.word(0);return at;}
 endNode(at){this.patchWord(at,this.#at-at-4);}
 count(n){this.word(n);}
 beginCount(){const at=this.position;this.count(0);return at;}
 endCount(at,n){this.patchWord(at,n);}
 #reserve(size){
  const end=this.#at+size;if(end>this.#byteLimit)throw Error('wire byte limit');
  if(end>this.#data.length){const next=new Uint8Array(Math.min(this.#byteLimit,Math.max(end,this.#data.length*2)));next.set(this.#data.subarray(0,this.#at));this.#data=next;this.#view=new DataView(next.buffer);}
  return end;
 }
 bytes(bytes){const end=this.#reserve(bytes.length);this.#data.set(bytes,this.#at);this.#at=end;}
 byte(n){if(!Number.isInteger(n)||n<0||n>255)throw Error('wire byte range');this.#reserve(1);this.#data[this.#at++]=n;}
 word(n){if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('wire word range');const end=this.#reserve(4);this.#view.setUint32(this.#at,n,true);this.#at=end;}
 wide(n){if(typeof n!=='bigint'||n<0n||n>18446744073709551615n)throw Error('wire wide range');const end=this.#reserve(8);this.#view.setBigUint64(this.#at,n,true);this.#at=end;}
 text(text,count=false){
  if(typeof text!=='string')throw Error('wire Unicode');
  if(text.length<=16){
   let ascii=true;for(let i=0;i<text.length;i++)if(text.charCodeAt(i)>=128){ascii=false;break;}
   if(ascii){if(count)this.count(text.length);const end=this.#reserve(text.length);for(let i=0;i<text.length;i++)this.#data[this.#at+i]=text.charCodeAt(i);this.#at=end;return;}
  }
  if(!text.isWellFormed())throw Error('wire Unicode');const size=wireUtf8Length(text);if(count)this.count(size);
  const end=this.#reserve(size),r=wireEncoder.encodeInto(text,this.#data.subarray(this.#at,end));if(r.read!==text.length||r.written!==size)throw Error('wire UTF-8 size');this.#at=end;
 }
 patchWord(at,n){if(!Number.isInteger(at)||at<0||at+4>this.#at||!Number.isInteger(n)||n<0||n>4294967295)throw Error('wire patch offset');this.#view.setUint32(at,n,true);}
 patchByte(at,n){if(!Number.isInteger(at)||at<0||at>=this.#at||!Number.isInteger(n)||n<0||n>255)throw Error('wire patch offset');this.#data[at]=n;}
 replace(at,removed,bytes){
  if(!Number.isInteger(at)||!Number.isInteger(removed)||at<0||removed<0||at+removed>this.#at||!(bytes instanceof Uint8Array))throw Error('wire replacement range');
  const extra=bytes.length-removed,end=extra>0?this.#reserve(extra):this.#at+extra;
  this.#data.copyWithin(at+bytes.length,at+removed,this.#at);this.#data.set(bytes,at);this.#at=end;
 }
 // Literal generated writers use balanced frames without per-node callbacks.
 // An exception abandons this invocation; encodeWith never reuses its writer.
 openFrame(){if(this.#depth>this.#depthLimit||--this.#remaining<0)throw Error('wire node or depth limit');const at=this.beginNode();this.#depth++;return at;}
 closeFrame(at){if(this.#depth===0)throw Error('wire frame boundary');this.#depth--;this.endNode(at);}
 frame(emit){if(this.#depth>this.#depthLimit||--this.#remaining<0)throw Error('wire node or depth limit');const at=this.beginNode();this.#depth++;try{emit(this);}finally{this.#depth--;}this.endNode(at);}
 reorder(start,spans){
  const sorted=spans.slice().sort((a,b)=>a[0]-b[0]);let at=start;
  for(const [a,b] of sorted){if(!Number.isInteger(a)||!Number.isInteger(b)||a!==at||b<a)throw Error('wire span permutation');at=b;}
  if(start<0||start>this.#at||at!==this.#at)throw Error('wire span permutation');
  if(spans.every((s,i)=>s===sorted[i]))return;
  const copy=this.#data.slice(start,this.#at);at=start;for(const [a,b] of spans){this.#data.set(copy.subarray(a-start,b-start),at);at+=b-a;}
 }
 finish(){if(this.#depth!==0)throw Error('wire frame boundary');return this.#data.slice(0,this.#at);}
}

class CompactWireEncoder extends WireEncoder{
 beginNode(){return 0;}
 endNode(){}
 endCount(at,n){
  if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('compact count range');
  if(n<128){this.patchByte(at,n);return;}
  const bytes=[];while(n>=128){bytes.push(n%128+128);n=Math.floor(n/128);}bytes.push(n);this.replace(at,1,Uint8Array.from(bytes));
 }
 count(n){
  if(!Number.isInteger(n)||n<0||n>4294967295)throw Error('compact count range');
  while(n>=128){this.byte(n%128+128);n=Math.floor(n/128);}this.byte(n);
 }
 text(text){super.text(text,true);}
}

function compactScanValue(root,bytes,l,materialize){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let cursor=1,remaining=l.nodes;
 const require=n=>{if(n>bytes.length-cursor)throw Error('truncated compact value');};
 const count=()=>{
  let value=0,scale=1;
  for(let i=0;i<5;i++){
   require(1);const byte=bytes[cursor++];
   if(i===4&&byte>15)throw Error('compact count overflow');
   value+=(byte&127)*scale;
   if(byte<128){if(i>0&&byte===0)throw Error('noncanonical compact count');return value;}
   scale*=128;
  }throw Error('compact count overflow');
 };
 const property={value:null,enumerable:true,writable:true,configurable:true};
 const node=(p,d)=>{
  if(d>l.depth||--remaining<0)throw Error('wire node or depth limit');
  const t=p.type;let value;
  switch(p.kind){
   case 'unit':return null;
   case 'bool':require(1);if(bytes[cursor]>1)throw Error('invalid wire Bool');return !!bytes[cursor++];
   case 'u32':case 'i32':require(4);value=p.kind==='u32'?view.getUint32(cursor,true):view.getInt32(cursor,true);cursor+=4;return value;
   case 'f32':require(4);if(materialize)value={F32Bits:view.getUint32(cursor,true)};cursor+=4;return value;
   case 'f64':require(8);if(materialize)value={F64Bits:view.getBigUint64(cursor,true).toString()};cursor+=8;return value;
   case 'u64':require(8);if(materialize)value=view.getBigUint64(cursor,true);cursor+=8;return value;
   case 'string':case 'int':case 'id':case 'enum':{
    const n=count();require(n);const start=cursor;cursor+=n;
    if(p.kind==='string'&&!materialize){let i=start;while(i<cursor&&bytes[i]<128)i++;if(i<cursor)wireDecoder.decode(bytes.subarray(start,cursor));}
    else{const text=wireDecodeText(bytes,start,cursor);if(p.kind==='int'&&!wireDecimal(text)||p.kind==='id'&&!/^[0-9a-f]{32}$/.test(text)||p.kind==='enum'&&!t.variants.includes(text))throw Error('malformed wire text');if(materialize)value=p.kind==='int'?{Int:text}:text;}
    return value;
   }
   case 'list':case 'vector':{
    const n=count();if(n>remaining||p.kind==='vector'&&n!==t.size)throw Error('wire sequence size');
    if(materialize)value=[];for(let i=0;i<n;i++){const child=node(p.element,d+1);if(materialize)value.push(child);}return value;
   }
   case 'record':{
    const fs=p.fields;
    if(materialize&&fs.length<=4){
     switch(fs.length){case 0:return {};case 1:return {[fs[0].name]:node(fs[0].plan,d+1)};case 2:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1)};case 3:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1),[fs[2].name]:node(fs[2].plan,d+1)};case 4:return {[fs[0].name]:node(fs[0].plan,d+1),[fs[1].name]:node(fs[1].plan,d+1),[fs[2].name]:node(fs[2].plan,d+1),[fs[3].name]:node(fs[3].plan,d+1)};}
    }
    if(materialize)value={};for(const f of fs){const child=node(f.plan,d+1);if(materialize){property.value=child;Object.defineProperty(value,f.name,property);}}return value;
   }
   case 'option':case 'result':{
    require(1);const tag=bytes[cursor++];if(tag>1)throw Error('wire sum tag');
    if(p.kind==='option'&&tag===0)return materialize?{None:null}:undefined;
    const label=p.kind==='option'?'Some':tag===0?'Ok':'Err',child=node(p.kind==='option'?p.element:tag===0?p.ok:p.error,d+1);
    return materialize?{[label]:child}:undefined;
   }
   default:throw Error('unsupported wire kind');
  }
 };
 const value=node(root,0);if(cursor!==bytes.length)throw Error('trailing compact bytes');return value;
}

// General transport codec, independent of source rewrites and checkpoints.
// The sender/receiver must negotiate this exact identity and format. There is
// deliberately no claim that the bytes themselves identify their schema.
export class CompactValueCodec{
 #source;#plan;#encoder;#decodeBound=0;
 get format(){return compactValueWireFormat;}
 get identity(){return this.#source.descriptor.identity;}
 constructor(valueCodec){if(!(valueCodec instanceof ValueCodec))throw Error('compact codec requires a checked value codec');this.#source=valueCodec;this.#plan=wireValuePlan(valueCodec);}
 encode(value,options=wireDefaultOptions){
  const l=wireLimits(options),w=this.#encoder&&!this.#encoder.active?this.#encoder:new CompactWireEncoder(l);
  this.#encoder??=w;w.reset(l);
  try{w.byte(1);wireEncodeValue(this.#plan,value,l,w);return w.finish();}
  finally{w.active=false;if(w.capacity>4096&&this.#encoder===w)this.#encoder=undefined;}
 }
 encodeWith(emit,options=wireDefaultOptions){
  const w=new CompactWireEncoder(options);w.byte(1);emit(w);const bytes=w.finish();this.validate(bytes,options);return bytes;
 }
 #scan(bytes,options,materialize){
  const l=wireLimits(options);
  if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<1||bytes.length>l.bytes)throw Error('wire byte limit or header');
  if(bytes[0]!==1)throw Error('compact format mismatch');
  if(materialize){this.#decodeBound||=wireBindDecodePlan(this.#plan,true);const cursor=new CompactDecodeCursor(bytes,l,this.#decodeBound);if(this.#decodeBound&1)cursor.property={value:null,enumerable:true,writable:true,configurable:true};const value=this.#plan.decodeCompact(cursor,0);if(cursor.cursor!==bytes.length)throw Error('trailing compact bytes');return value;}
  return compactScanValue(this.#plan,bytes,l,materialize);
 }
 decode(bytes,options=wireDefaultOptions){return this.#scan(bytes,options,true);}
 validate(bytes,options=wireDefaultOptions){this.#scan(bytes,options,false);return true;}
}

// Compiler materialisers consume already validated bytes synchronously. This
// factory is for trusted emitted code, not untrusted descriptor/callback data.
// The complete generic validator runs before any compiler reader is invoked.
class ValidatedValueReader{
 constructor(bytes,compact){this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.cursor=compact?1:40;this.compact=compact;}
 frame(){if(this.compact)return 0;const end=this.cursor+4+this.view.getUint32(this.cursor,true);this.cursor+=4;return end;}
 finish(end){if(!this.compact&&this.cursor!==end)throw Error('compiled reader frame mismatch');}
 byte(){return this.bytes[this.cursor++];}
 word(){const n=this.view.getUint32(this.cursor,true);this.cursor+=4;return n;}
 signed(){const n=this.view.getInt32(this.cursor,true);this.cursor+=4;return n;}
 wide(){const n=this.view.getBigUint64(this.cursor,true);this.cursor+=8;return n;}
 count(){if(!this.compact)return this.word();let n=0,scale=1,byte;do{byte=this.byte();n+=(byte&127)*scale;scale*=128;}while(byte>=128);return n;}
 text(end){const n=this.compact?this.count():end-this.cursor,start=this.cursor;this.cursor+=n;return wireDecodeText(this.bytes,start,this.cursor);}
}
class CompiledCompactValueCodec extends CompactValueCodec{
 #read;
 constructor(source,read){super(source);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){super.validate(bytes,options);const reader=new ValidatedValueReader(bytes,true),value=this.#read(reader);if(reader.cursor!==bytes.length)throw Error('compiled reader trailing bytes');return value;}
}
class CompiledValueCodec extends ValueCodec{
 #read;#compiledCompact=null;
 constructor(descriptor,read){super(descriptor);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){super.validate(bytes,options);const reader=new ValidatedValueReader(bytes,false),value=this.#read(reader);if(reader.cursor!==bytes.length)throw Error('compiled reader trailing bytes');return value;}
 compact(){return this.#compiledCompact??=new CompiledCompactValueCodec(this,this.#read);}
}
export function createCompiledValueCodec(descriptor,read){if(typeof read!=='function')throw Error('compiled value reader required');return new CompiledValueCodec(descriptor,read);}

// Trusted literal materialisers may use this checked reader to validate and
// construct in one traversal. The emitter must use frame/finish at every source
// node, typed text reads and counted sequence reads; arbitrary callbacks do not
// establish a schema correspondence proof. The independent scanner remains the
// validation oracle and the original factory retains its pre-validation path.
function literalValueHeader(identity){
 const bytes=new Uint8Array(40);bytes.set(wireMagic);
 for(let i=0;i<32;i++)bytes[i+8]=parseInt(identity.slice(i*2,i*2+2),16);
 const view=new DataView(bytes.buffer),words=new Uint32Array(10);
 for(let i=0;i<10;i++)words[i]=view.getUint32(i*4,true);
 return words;
}
class CheckedLiteralValueReader {
 constructor(bytes,header,compact,limits){
  if(!(bytes instanceof Uint8Array)||typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer||bytes.length<(compact?1:44)||bytes.length>limits.bytes)throw Error('wire byte limit or header');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(compact){if(bytes[0]!==1)throw Error('compact format mismatch');}
  else for(let i=0;i<10;i++)if(view.getUint32(i*4,true)!==header[i])throw Error('wire format or schema mismatch');
  this.bytes=bytes;this.view=view;
  this.cursor=compact?1:40;this.compact=compact;this.remaining=limits.nodes;this.depth=limits.depth;this.ends=[];
 }
 require(n){if(this.cursor+n>(this.ends.at(-1)??this.bytes.length))throw Error('truncated wire frame');}
 frame(){
  if(this.ends.length>this.depth||--this.remaining<0)throw Error('wire node or depth limit');
  let end=this.bytes.length;
  if(!this.compact){this.require(4);end=this.cursor+4+this.view.getUint32(this.cursor,true);this.require(end-this.cursor);this.cursor+=4;}
  this.ends.push(end);return this.compact?0:end;
 }
 finish(end){
  if(!this.ends.length||!this.compact&&(this.ends.at(-1)!==end||this.cursor!==end))throw Error('compiled reader frame mismatch');
  this.ends.pop();
 }
 byte(){this.require(1);const value=this.bytes[this.cursor++];if(value>1)throw Error('wire sum tag or Bool');return value;}
 word(){this.require(4);const value=this.view.getUint32(this.cursor,true);this.cursor+=4;return value;}
 signed(){this.require(4);const value=this.view.getInt32(this.cursor,true);this.cursor+=4;return value;}
 wide(){this.require(8);const value=this.view.getBigUint64(this.cursor,true);this.cursor+=8;return value;}
 rawCount(){
  if(!this.compact)return this.word();
  let value=0,scale=1;
  for(let i=0;i<5;i++){
   this.require(1);const byte=this.bytes[this.cursor++];
   if(i===4&&byte>15)throw Error('compact count overflow');
   value+=(byte&127)*scale;
   if(byte<128){if(i>0&&byte===0)throw Error('noncanonical compact count');return value;}
   scale*=128;
  }
  throw Error('compact count overflow');
 }
 count(size){
  const value=this.rawCount();
  if(value>this.remaining||size!==undefined&&value!==size)throw Error('wire sequence size');
  return value;
 }
 text(end,kind='string',variants){
  const size=this.compact?this.rawCount():end-this.cursor;
  this.require(size);const start=this.cursor;this.cursor+=size;
  const value=wireDecodeText(this.bytes,start,this.cursor);
  if(kind==='int'&&!wireDecimal(value)||kind==='id'&&!/^[0-9a-f]{32}$/.test(value)||kind==='enum'&&!variants.includes(value))throw Error('malformed wire text');
  return value;
 }
 complete(){if(this.ends.length||this.cursor!==this.bytes.length)throw Error('compiled reader trailing bytes');}
}
// Compact source nodes have no individual frame ends: retain the same checked
// depth/node order using a counter, with bounds against the complete buffer.
class CheckedCompactLiteralValueReader extends CheckedLiteralValueReader {
 constructor(bytes,limits){super(bytes,null,true,limits);this.level=0;}
 require(n){if(this.cursor+n>this.bytes.length)throw Error('truncated wire frame');}
 frame(){if(this.level>this.depth||--this.remaining<0)throw Error('wire node or depth limit');this.level++;return 0;}
 finish(_end){if(!this.level)throw Error('compiled reader frame mismatch');this.level--;}
 complete(){if(this.level||this.cursor!==this.bytes.length)throw Error('compiled reader trailing bytes');}
}
class FusedCompactValueCodec extends CompactValueCodec {
 #read;
 constructor(source,read){super(source);this.#read=read;}
 decode(bytes,options=wireDefaultOptions){
  const limits=wireLimits(options);
  try{const reader=new CheckedCompactLiteralValueReader(bytes,limits),value=this.#read(reader);reader.complete();return value;}
  catch(error){super.validate(bytes,limits);throw error;}
 }
}
class FusedValueCodec extends ValueCodec {
 #read;#header;#fusedCompact=null;
 constructor(descriptor,read){super(descriptor);this.#read=read;this.#header=literalValueHeader(this.descriptor.identity);}
 decode(bytes,options=wireDefaultOptions){
  const limits=wireLimits(options);
  try{const reader=new CheckedLiteralValueReader(bytes,this.#header,false,limits),value=this.#read(reader);reader.complete();return value;}
  catch(error){super.validate(bytes,limits);throw error;}
 }
 compact(){return this.#fusedCompact??=new FusedCompactValueCodec(this,this.#read);}
}
export function createFusedValueCodec(descriptor,read){if(typeof read!=='function')throw Error('compiled value reader required');return new FusedValueCodec(descriptor,read);}
// JSON text is a boundary adapter to an ordinary recursive Ink datatype.
// No JavaScript Number conversion occurs for JSON numeric tokens.
export function jsonNumberToken(s){return typeof s==='string'&&/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(s);}
// JSON numeric tokens have an ASCII grammar. Check validated UTF-8 spans
// directly, preserving exact lexemes without allocating a decoded String.
function jsonNumberSpan(bytes,lo,hi){
 let at=lo;if(bytes[at]===45)at++;
 if(at>=hi)return false;
 if(bytes[at]===48)at++;
 else{if(bytes[at]<49||bytes[at]>57)return false;do{at++;}while(at<hi&&bytes[at]>=48&&bytes[at]<=57);}
 if(at<hi&&bytes[at]===46){const start=++at;while(at<hi&&bytes[at]>=48&&bytes[at]<=57)at++;if(at===start)return false;}
 if(at<hi&&(bytes[at]===69||bytes[at]===101)){at++;if(at<hi&&(bytes[at]===43||bytes[at]===45))at++;const start=at;while(at<hi&&bytes[at]>=48&&bytes[at]<=57)at++;if(at===start)return false;}
 return at===hi;
}
const jsonWireEncoder=new TextEncoder();
// Scalar conversion completes before writer callbacks; no per-value byte array.
const jsonFloatScratch=new DataView(new ArrayBuffer(4));
function jsonUtf8Length(text){if(text.length>16&&!/[^\x00-\x7f]/.test(text))return text.length;let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff){bytes+=4;i++;}else bytes+=3;}return bytes;}
const jsonLimits={bytes:16777216,nodes:1000000,depth:128};
const jsonQuoters=new WeakSet();
/** Explicit, bounded reuse of immutable JSON string quotes. Cache payload bytes
 * are UTF-16 storage estimates; entry caps bound separate Map/object overhead.
 * Logical output budgets are charged again on every use, including cache hits.
 */
export function createJsonQuoter({maxEntries=1024,maxBytes=131072}={}){
 if(!Number.isSafeInteger(maxEntries)||maxEntries<0||maxEntries>65536||!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>16777216)throw Error('JSON quote cache budget');
 const entries=new Map();let bytes=0,hits=0,misses=0;
 const token=value=>{
  const prior=entries.get(value);if(prior!==undefined){hits++;return prior;}
  if(typeof value!=='string'||!value.isWellFormed())throw Error('invalid JSON String');
  misses++;const text=JSON.stringify(value),size=2*(value.length+text.length),quoted=Object.freeze({text,utf8Bytes:jsonUtf8Length(text)});
  if(maxEntries&&size<=maxBytes){
   while(entries.size&&(entries.size>=maxEntries||bytes+size>maxBytes)){const key=entries.keys().next().value;bytes-=2*(key.length+entries.get(key).text.length);entries.delete(key);}
   entries.set(value,quoted);bytes+=size;
  }
  return quoted;
 };
 const quoter=Object.freeze({
  token,
  quote(value){return token(value).text;},
  clear(){entries.clear();bytes=0;},
  stats(){return {entries:entries.size,payload_bytes:bytes,hits,misses};},
 });jsonQuoters.add(quoter);return quoter;
}
function checkedJsonLimits(options){const l={...jsonLimits,...options};for(const k of ['bytes','nodes','depth'])if(!Number.isSafeInteger(l[k])||l[k]<0||l[k]>jsonLimits[k])throw Error('JSON hard resource limit');return l;}
function jsonVariant(index,item){let payload=index===0?{}:{item0:item};if(index<5)payload={Ok:payload};for(let i=0;i<index;i++)payload={Err:payload};return {payload};}
export function parseJson(text,options={}){return parseJsonValue(text,options,null);}
function parseJsonValue(text,options,boundary){
 const p=new JsonWireReader(text,options);
 const value=(d,wireDepth=0)=>{
  p.node(d);const c=p.peek();
  if(c==='n'&&text.startsWith('null',p.at)){boundary?.node(0,wireDepth);p.at+=4;return jsonVariant(0,null);}if(c==='t'&&text.startsWith('true',p.at)){boundary?.node(1,wireDepth);p.at+=4;return jsonVariant(1,true);}if(c==='f'&&text.startsWith('false',p.at)){boundary?.node(1,wireDepth);p.at+=5;return jsonVariant(1,false);}
  if(c==='"'){boundary?.node(3,wireDepth);const item=p.string();boundary?.text(item);return jsonVariant(3,item);}
  if(c==='['){boundary?.node(4,wireDepth);p.at++;const xs=[];if(!p.eat(']'))while(true){xs.push(value(d+1,wireDepth+8));if(p.eat(']'))break;if(!p.eat(','))throw Error('JSON array separator');}return jsonVariant(4,xs);}
  if(c==='{'){boundary?.node(5,wireDepth);p.at++;const xs=[],seen=new Set();if(!p.eat('}'))while(true){const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);boundary?.member(key,wireDepth);if(!p.eat(':'))throw Error('JSON object colon');xs.push({key,value:value(d+1,wireDepth+9)});if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON object separator');}return jsonVariant(5,xs);}
  if(c==='-'||c>='0'&&c<='9'){const token=p.number();boundary?.node(2,wireDepth);boundary?.text(token);return jsonVariant(2,token);}
  throw Error('invalid JSON value');
 };
 const out=value(0);p.finish();return out;
}
export function stringifyJson(value,options={}){return stringifyJsonValue(value,options,null);}
function stringifyJsonValue(value,options,boundary){
 const l=checkedJsonLimits(options);let remaining=l.nodes,bytes=0,output='';
 const emit=s=>{bytes+=jsonUtf8Length(s);if(bytes>l.bytes)throw Error('JSON byte limit');output+=s;};
 const write=(v,d,wireDepth=0)=>{
  if(d>l.depth||--remaining<0)throw Error('JSON node or depth limit');if(!v||Object.keys(v).length!==1||!Object.hasOwn(v,'payload'))throw Error('invalid JSON record');let p=v.payload,index=0;
  while(index<5&&p&&Object.hasOwn(p,'Err')){if(Object.keys(p).length!==1||boundary&&Object.hasOwn(p,'Ok'))throw Error('invalid JSON sum');p=p.Err;index++;}
  if(index<5){if(!p||Object.keys(p).length!==1||!Object.hasOwn(p,'Ok'))throw Error('invalid JSON sum');p=p.Ok;}
  if(!p||Object.keys(p).length!==(index===0?0:1)||index>0&&!Object.hasOwn(p,'item0'))throw Error('invalid JSON payload');const item=p.item0;boundary?.node(index,wireDepth);
  switch(index){
   case 0:emit('null');break;
   case 1:if(typeof item!=='boolean')throw Error('invalid JSON Boolean');emit(item?'true':'false');break;
   case 2:if(!jsonNumberToken(item))throw Error('invalid JSON number');boundary?.text(item);emit(item);break;
   case 3:if(typeof item!=='string'||!item.isWellFormed())throw Error('invalid JSON String');boundary?.text(item);emit(JSON.stringify(item));break;
   case 4:{if(!Array.isArray(item)||item.length>remaining)throw Error('invalid JSON Array');const count=item.length;let visited=0;emit('[');item.forEach((x,i)=>{visited++;if(i)emit(',');write(x,d+1,wireDepth+8);});if(visited!==count)throw Error('invalid JSON Array');emit(']');break;}
   case 5:{if(!Array.isArray(item)||item.length>remaining)throw Error('invalid JSON Object');const count=item.length,seen=new Set();let visited=0;emit('{');item.forEach((m,i)=>{visited++;if(!m||Object.keys(m).length!==2||typeof m.key!=='string'||!m.key.isWellFormed()||!Object.hasOwn(m,'value')||boundary&&!Object.hasOwn(m,'key'))throw Error('invalid JSON member');if(seen.has(m.key))throw Error('duplicate JSON object key');seen.add(m.key);boundary?.member(m.key,wireDepth);if(i)emit(',');emit(JSON.stringify(m.key));emit(':');write(m.value,d+1,wireDepth+9);});if(visited!==count)throw Error('invalid JSON Object');emit('}');break;}
  }
 };write(value,0);return output;
}
// The adapter's schema is the fixed recursive JSON library shape checked by
// JsonCodec. Charge its ordinary record/sum/list wire nodes while parsing or
// rendering, rather than interpreting and walking the completed tree again.
function jsonBoundaryBudget(options){
 const l=checkedJsonLimits(options);let remaining=l.nodes,total=40;
 const charge=(nodes,bytes,depth)=>{remaining-=nodes;total+=bytes;if(remaining<0||depth>l.depth)throw Error('wire node or depth limit');if(total>l.bytes)throw Error('wire byte limit');};
 return {
  node(index,depth){charge(index===0?3:index<4?index+4:8,index===0?13:index===1?23:index===2?27:index===3?32:41,depth+(index===0?2:index<4?index+3:7));},
  text(text){charge(0,jsonUtf8Length(text),0);},
  member(key,depth){charge(2,8+jsonUtf8Length(key),depth+9);},
 };
}
function jsonSameSchema(a,b){
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&jsonSameSchema(a[k],b[k]));
}
// Host-object conversion is opt-in and JavaScript-only. Inspect data properties
// rather than invoking getters/toJSON; reflection is not a sandbox for proxies.
function jsonJSKeys(value){
 if(!value||typeof value!=='object')throw Error('expected a plain JavaScript object');
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==Object.prototype&&prototype!==null)throw Error('expected a plain JavaScript object');
 const keys=Reflect.ownKeys(value);
 if(keys.some(k=>typeof k!=='string'))throw Error('JavaScript symbol keys are unsupported');
 return keys;
}
function jsonJSData(value,key){
 const property=Object.getOwnPropertyDescriptor(value,key);
 if(!property||!property.enumerable||!Object.hasOwn(property,'value'))throw Error('expected an enumerable own data property');
 return property.value;
}
function jsonJSRecord(value,names){
 const keys=jsonJSKeys(value);
 if(keys.length!==names.length||keys.some(k=>!names.includes(k)))throw Error('invalid JSON record or variant');
}
function jsonJSArray(value,remaining){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('expected a plain JavaScript array');
 const length=value.length;
 if(length>remaining)throw Error('JSON node limit');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==length+1||keys.some(k=>typeof k!=='string'||k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(k)||Number(k)>=length)))throw Error('sparse or decorated JavaScript arrays are unsupported');
 return length;
}
function jsonFromJS(value,options){
 const limits=checkedJsonLimits(options),boundary=jsonBoundaryBudget(limits),active=new WeakSet();let remaining=limits.nodes;
 const text=value=>{if(!value.isWellFormed())throw Error('invalid JSON Unicode');boundary.text(value);return value;};
 const visit=(value,depth,wireDepth)=>{
  if(depth>limits.depth||--remaining<0)throw Error('JSON node or depth limit');
  if(value===null){boundary.node(0,wireDepth);return jsonVariant(0);}
  switch(typeof value){
   case 'boolean':boundary.node(1,wireDepth);return jsonVariant(1,value);
   case 'string':boundary.node(3,wireDepth);return jsonVariant(3,text(value));
   case 'number':
    if(!Number.isFinite(value))throw Error('non-finite JavaScript numbers are unsupported');
    boundary.node(2,wireDepth);return jsonVariant(2,text(Object.is(value,-0)?'-0':String(value)));
   case 'bigint':boundary.node(2,wireDepth);return jsonVariant(2,text(String(value)));
   case 'object':break;
   default:throw Error('unsupported JavaScript value');
  }
  if(active.has(value))throw Error('cyclic JavaScript value');
  active.add(value);
  try{
   if(Array.isArray(value)){
    boundary.node(4,wireDepth);const count=jsonJSArray(value,remaining),items=[];
    for(let i=0;i<count;i++)items.push(visit(jsonJSData(value,String(i)),depth+1,wireDepth+8));
    return jsonVariant(4,items);
   }
   boundary.node(5,wireDepth);const keys=jsonJSKeys(value),members=[];
   if(keys.length>remaining)throw Error('JSON node limit');
   for(const key of keys){
    if(!key.isWellFormed())throw Error('invalid JSON Unicode');
    boundary.member(key,wireDepth);
    members.push({key,value:visit(jsonJSData(value,key),depth+1,wireDepth+9)});
   }
   return jsonVariant(5,members);
  }finally{active.delete(value);}
 };
 return visit(value,0,0);
}
function jsonDecimalKey(token){
 const [,sign,whole,fraction='',exponent='0']=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
 const digits=(whole+fraction).replace(/^0+/,'');
 if(!digits)return '0';
 const trimmed=digits.replace(/0+$/,'');
 return sign+trimmed+'e'+(Number(exponent)-fraction.length+digits.length-trimmed.length);
}
function jsonToJS(value,options){
 const limits=checkedJsonLimits(options),boundary=jsonBoundaryBudget(limits),mode=options?.numbers??'number',active=new WeakSet();let remaining=limits.nodes;
 if(!['number','bigint','string'].includes(mode))throw Error('unknown JavaScript number policy');
 const number=token=>{
  if(!jsonNumberToken(token))throw Error('invalid JSON number');
  boundary.text(token);
  if(mode==='string')return token;
  if(mode==='bigint')return BigInt(jsonInteger(token,4096));
  const result=Number(token);
  if(!Number.isFinite(result)||jsonDecimalKey(token)!==jsonDecimalKey(String(result)))throw Error('JSON number loses precision as JavaScript Number; choose numbers: bigint or string');
  return result;
 };
 const visit=(value,depth,wireDepth)=>{
  if(depth>limits.depth||--remaining<0)throw Error('JSON node or depth limit');
  jsonJSRecord(value,['payload']);
  if(active.has(value))throw Error('cyclic JSON value');
  active.add(value);
  try{
   let payload=jsonJSData(value,'payload'),index=0;
   while(index<5&&Object.hasOwn(payload,'Err')){jsonJSRecord(payload,['Err']);payload=jsonJSData(payload,'Err');index++;}
   if(index<5){jsonJSRecord(payload,['Ok']);payload=jsonJSData(payload,'Ok');}
   jsonJSRecord(payload,index===0?[]:['item0']);boundary.node(index,wireDepth);
   const item=index===0?null:jsonJSData(payload,'item0');
   if(index===0)return null;
   if(index===1){if(typeof item!=='boolean')throw Error('invalid JSON Boolean');return item;}
   if(index===2)return number(item);
   if(index===3){if(typeof item!=='string'||!item.isWellFormed())throw Error('invalid JSON String');boundary.text(item);return item;}
   const count=jsonJSArray(item,remaining);
   if(index===4){const out=[];for(let i=0;i<count;i++)out.push(visit(jsonJSData(item,String(i)),depth+1,wireDepth+8));return out;}
   const out={},seen=new Set();
   for(let i=0;i<count;i++){
    const member=jsonJSData(item,String(i));jsonJSRecord(member,['key','value']);const key=jsonJSData(member,'key');
    if(typeof key!=='string'||!key.isWellFormed())throw Error('invalid JSON member key');
    if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);boundary.member(key,wireDepth);
    Object.defineProperty(out,key,{value:visit(jsonJSData(member,'value'),depth+1,wireDepth+9),enumerable:true,writable:true,configurable:true});
   }
   return out;
  }finally{active.delete(value);}
 };
 return visit(value,0,0);
}
const jsonConstructionPaths=Object.freeze(Array.from({length:6},(_,index)=>Object.freeze([0,...Array(index).fill(1),...(index<5?[0]:[]),0])));
function parseJsonConstructed(text,options,builder){
 const p=new JsonWireReader(text,options);
 const paths=jsonConstructionPaths;
 const fused=typeof builder.openPath==='function';
 const begin=index=>{if(fused){builder.openPath(paths[index]);return;}for(const choice of paths[index])builder.open(choice);};
 const end=index=>{for(let i=0;i<(fused?1:index<5?index+3:7);i++)builder.close();};
 const leaf=(index,item)=>{if(typeof builder.scalarPath==='function'){builder.scalarPath(paths[index],item);return;}begin(index);builder.scalar(item);end(index);};
 const value=d=>{
  p.node(d);const c=p.peek();
  if(c==='n'&&text.startsWith('null',p.at)){p.at+=4;if(typeof builder.emptyPath==='function')builder.emptyPath(paths[0]);else{begin(0);end(0);}return;}
  if(c==='t'&&text.startsWith('true',p.at)){p.at+=4;leaf(1,true);return;}
  if(c==='f'&&text.startsWith('false',p.at)){p.at+=5;leaf(1,false);return;}
  if(c==='"'){leaf(3,p.string());return;}
  if(c==='['){begin(4);builder.open(0);p.at++;if(!p.eat(']'))while(true){value(d+1);if(p.eat(']'))break;if(!p.eat(','))throw Error('JSON array separator');}builder.close();end(4);return;}
  if(c==='{'){begin(5);builder.open(0);p.at++;const seen=new Set();if(!p.eat('}'))while(true){const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);if(!p.eat(':'))throw Error('JSON object colon');builder.open(0);builder.scalar(key);value(d+1);builder.close();if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON object separator');}builder.close();end(5);return;}
  if(c==='-'||c>='0'&&c<='9'){const token=p.number();leaf(2,token);return;}
  throw Error('invalid JSON value');
 };
 value(0);p.finish();return builder.finish();
}
const jsonCompiledRenderers=new WeakMap();
function compiledJsonRenderer(json,codec,unwrap){
 if(typeof codec?.reducer!=='function')throw Error('compiled JSON reduction unavailable');
 const source=codec.resolve(codec.descriptor.root),root=json.values.descriptor.root;
 const selected=unwrap&&source.kind==='result'?codec.resolve(source.ok):source;
 if(!jsonSameSchema(root,selected)||unwrap&&source.kind!=='result')throw Error('compiled JSON schema mismatch');
 let variants=root.fields[0].type;const roles=new Map([[root.name,'root']]);
 let member;
 for(let index=0;index<6;index++){
  const branch=index<5?variants.ok:variants;roles.set(branch.name,index);
  if(index===5){member=branch.fields[0].type.element.name;roles.set(member,'member');}
  if(index<5)variants=variants.error;
 }
 const nodeRoles=new Map();
 return codec.reducer((node,index)=>{
  const role=roles.get(node.name);nodeRoles.set(index,role);
  if(node.kind==='record'){
   if(role==='root')return value=>value;
   if(role==='member')return (key,value,context)=>{
    const text=(context.quoter?context.quote(key,true):context.add(JSON.stringify(key)+':'))+value,seen=context.members;
    if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);return text;
   };
   if(role===0)return context=>context.add('null');
   if(role===1)return (value,context)=>context.add(value?'true':'false');
   if(role===2)return (token,context)=>{if(!jsonNumberToken(token))throw Error('invalid JSON number');return context.add(token);};
   if(role===3)return (value,context)=>context.quoter?context.quote(value,false):context.add(JSON.stringify(value));
   if(role===4)return (value,context)=>{context.add('[]');return '['+value+']';};
   if(role===5)return (value,context)=>{context.add('{}');return '{'+value+'}';};
   return ()=>null;
  }
  if(node.kind==='list'||node.kind==='vector'){
   const members=nodeRoles.get(node.children[0])==='member';
   return {
    start:(_length,context)=>{
     const out={text:'',parent:members?context.members:null};
     if(members)context.members=new Set();return out;
    },
    step:(out,value,index,context)=>{out.text+=(index?context.add(','):'')+value;return out;},
    finish:(out,context)=>{if(members)context.members=out.parent;return out.text;},
   };
  }
  if(node.kind==='result'){
   // A Result<Json,E> boundary is explicitly requested by the caller. Ordinary
   // JSON's own sums only propagate an already rendered branch.
   if(unwrap&&nodeRoles.get(node.children[0])==='root')return (tag,value)=>{if(tag)throw Error('JSON result is Err');return value;};
   return (_tag,value)=>value;
  }
  if(node.kind==='string')return value=>{if(!value.isWellFormed())throw Error('invalid JSON String');return value;};
  return value=>value;
 });
}
export class JsonCodec{
 constructor(valueCodec){
  const root=valueCodec.descriptor.root,fields=root.fields;if(root.kind!=='record'||!Array.isArray(fields)||fields.length!==1||fields[0].name!=='payload')throw Error('JSON schema payload');let sum=fields[0].type;
  for(let i=0;i<6;i++){
   if(i<5&&sum.kind!=='result')throw Error('JSON schema sum');const branch=i<5?sum.ok:sum,fs=branch.fields;
   if(branch.kind!=='record'||!Array.isArray(fs)||fs.length!==(i?1:0)||i&&fs[0].name!=='item0')throw Error('JSON schema branch');
   if(i){const t=fs[0].type;if(i===1&&t.kind!=='bool'||(i===2||i===3)&&t.kind!=='string'||i===4&&(t.kind!=='list'||t.element.kind!=='ref'||t.element.name!==root.name))throw Error('JSON schema variant');if(i===5){const mf=t.element?.fields;if(t.kind!=='list'||t.element?.kind!=='record'||!Array.isArray(mf)||mf.length!==2||mf[0].name!=='key'||mf[0].type.kind!=='string'||mf[1].name!=='value'||mf[1].type.kind!=='ref'||mf[1].type.name!==root.name)throw Error('JSON schema member');}}
   if(i===2)this.numberBranch=branch.name;if(i===5)this.objectBranch=branch.name;
   if(i<5)sum=sum.error;
  }if(!jsonSameSchema(root,valueCodec.resolve({kind:'ref',name:root.name})))throw Error('JSON recursive schema mismatch');this.values=valueCodec;
 }
 parse(text,options={}){return parseJsonValue(text,options,jsonBoundaryBudget(options));}
 parseCompiled(codec,text,options={}){
  if(codec?.identity!==this.values.descriptor.identity||typeof codec.builder!=='function')throw Error('compiled JSON schema mismatch');
  const builder=codec.builder(options);try{return parseJsonConstructed(text,options,builder);}catch(error){builder.abort();throw error;}
 }
 stringify(value,options={}){return stringifyJsonValue(value,options,jsonBoundaryBudget(options));}
 stringifyCompiled(codec,handle,options={}){
  const limits=checkedJsonLimits(options),unwrap=options.unwrapResult===true;
  const quoter=options.quoter;if(quoter!==undefined&&!jsonQuoters.has(quoter))throw Error('JSON quote cache owner mismatch');
  let codecs=jsonCompiledRenderers.get(this);if(!codecs)jsonCompiledRenderers.set(this,codecs=new WeakMap());
  let renderers=codecs.get(codec);if(!renderers)codecs.set(codec,renderers=new Map());
  let render=renderers.get(unwrap);if(!render)renderers.set(unwrap,render=compiledJsonRenderer(this,codec,unwrap));
  let bytes=0;const context={
   quoter,
   add(text){bytes+=jsonUtf8Length(text);if(bytes>limits.bytes)throw Error('JSON byte limit');return text;},
   quote(value,colon){
    if(!quoter)return this.add(JSON.stringify(value)+(colon?':':''));
    const token=quoter.token(value);bytes+=token.utf8Bytes+(colon?1:0);if(bytes>limits.bytes)throw Error('JSON byte limit');return token.text+(colon?':':'');
   },
  };
  const text=render(handle,context,limits);
  return text;
 }
 fromJS(value,options={}){return jsonFromJS(value,options);}
 toJS(value,options={}){return jsonToJS(value,options);}
 parseBinary(text,options={}){return streamJsonBinary(this.values,text,options,false);}
 parseCompact(text,options={}){return streamJsonBinary(this.values,text,options,false,true);}
 stringifyBinary(bytes,options={}){return streamWireJsonText(this.values,bytes,options,true);}
 validateBinary(bytes,options={}){
  const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});let view;
  this.values.visitSpans(bytes,(type,data,start,end)=>{
   view??=new DataView(data.buffer,data.byteOffset,data.byteLength);
   if(type.name===this.numberBranch){const length=view.getUint32(start,true);if(!jsonNumberSpan(data,start+4,start+4+length))throw Error('invalid JSON number token');}
   if(type.name===this.objectBranch){const listEnd=start+4+view.getUint32(start,true),count=view.getUint32(start+4,true),seen=new Set();let at=start+8;for(let i=0;i<count;i++){const memberEnd=at+4+view.getUint32(at,true),keyStart=at+8,keyEnd=keyStart+view.getUint32(at+4,true),key=decoder.decode(data.subarray(keyStart,keyEnd));if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);at=memberEnd;}if(at!==listEnd)throw Error('invalid JSON object frame');}
  },options,[this.numberBranch,this.objectBranch]);return true;

 }
}
function jsonUnpack(value){let p=value.payload,i=0;while(i<5&&Object.hasOwn(p,'Err')){p=p.Err;i++;}return [i,(i<5?p.Ok:p).item0];}
function jsonInteger(token,limit){
 if(!jsonNumberToken(token))throw Error('invalid JSON number');const negative=token[0]==='-',raw=negative?token.slice(1):token,[mantissa,exp='0']=raw.split(/[eE]/);let digits=mantissa.replace('.','');if(/^0+$/.test(digits))return '0';const exponent=Number(exp),fraction=mantissa.includes('.')?mantissa.length-mantissa.indexOf('.')-1:0,shift=exponent-fraction;
 if(!Number.isSafeInteger(exponent)||!Number.isSafeInteger(shift))throw Error('JSON integer exponent limit');
 if(shift<0){const cut=-shift;if(cut>=digits.length||!/^[0]+$/.test(digits.slice(-cut)))throw Error('JSON number is not an integer');digits=digits.slice(0,-cut);}else{if(digits.length+shift>limit)throw Error('JSON integer magnitude limit');digits+='0'.repeat(shift);}
 digits=digits.replace(/^0+/,'');if(digits.length>limit)throw Error('JSON integer magnitude limit');return (negative?'-':'')+digits;
}
function jsonBinary64Value(v){
 if(typeof v==='number')return v;
 const text=v.F64Bits;
 if(typeof text!=='string'||text.length>20||!/^(0|[1-9][0-9]*)$/.test(text))throw Error('invalid F64Bits');
 const bits=BigInt(text);if(bits>18446744073709551615n)throw Error('invalid F64Bits');
 const b=new DataView(new ArrayBuffer(8));b.setBigUint64(0,bits,true);return b.getFloat64(0,true);
}
export class TypedJsonCodec{
 constructor(valueCodec){this.values=valueCodec;}
 decode(document,options={}){
  // Validate JSON-specific invariants before interpreting any tagged/record
  // shape, including duplicated names and malformed numeric tokens.
  stringifyJson(document,options);const l=checkedJsonLimits(options);let remaining=l.nodes;
  const read=(type,value,d)=>{
   if(d>l.depth||--remaining<0)throw Error('typed JSON resource limit');const t=this.values.resolve(type),[kind,item]=jsonUnpack(value);const fail=()=>{throw Error('JSON does not match '+t.kind);};
   switch(t.kind){
    case 'unit':if(kind!==0)fail();return null;
    case 'bool':if(kind!==1)fail();return item;
    case 'u32':case 'u64':case 'i32':case 'int':{if(kind!==2)fail();const text=jsonInteger(item,t.kind==='int'?4096:t.kind==='u64'?20:10);return t.kind==='int'?{Int:text}:t.kind==='u64'?BigInt(text):Number(text);}
    case 'f64':{if(kind!==2)fail();const n=Number(item),b=new DataView(new ArrayBuffer(8));if(!Number.isFinite(n))throw Error('JSON f64 overflow');b.setFloat64(0,n,true);return {F64Bits:b.getBigUint64(0,true).toString()};}
    case 'f32':{if(kind!==2)fail();const n=Number(item),b=new DataView(new ArrayBuffer(4));b.setFloat32(0,n,true);if(!Number.isFinite(b.getFloat32(0,true)))throw Error('JSON f32 overflow');return {F32Bits:b.getUint32(0,true)};}
    case 'string':case 'enum':case 'id':if(kind!==3)fail();return item;
    case 'list':case 'vector':if(kind!==4)fail();return item.map(x=>read(t.element,x,d+1));
    case 'record':{if(kind!==5||item.length!==t.fields.length)throw Error('unknown or missing JSON record field');const fields=new Map(item.map(m=>[m.key,m.value])),out={};for(const f of t.fields){if(!fields.has(f.name))throw Error('missing JSON record field');Object.defineProperty(out,f.name,{value:read(f.type,fields.get(f.name),d+1),writable:true,enumerable:true,configurable:true});}return out;}
    case 'option':case 'result':{if(kind!==5||item.length!==1)fail();const m=item[0];if(t.kind==='option'&&m.key==='None'&&jsonUnpack(m.value)[0]===0)return {None:null};const child=t.kind==='option'&&m.key==='Some'?t.element:t.kind==='result'&&m.key==='Ok'?t.ok:t.kind==='result'&&m.key==='Err'?t.error:null;if(!child)fail();return {[m.key]:read(child,m.value,d+1)};}
    default:fail();
   }
  };
  const out=read(this.values.descriptor.root,document,0);this.values.validateValue(out,options);return out;
 }
 encode(value,options={}){
  this.values.validateValue(value,options);const l=checkedJsonLimits(options);let remaining=l.nodes;
  const write=(type,v,d)=>{
   if(d>l.depth||--remaining<0)throw Error('typed JSON resource limit');const t=this.values.resolve(type);
   switch(t.kind){
    case 'unit':return jsonVariant(0);
    case 'bool':return jsonVariant(1,v);
    case 'u32':case 'u64':case 'i32':return jsonVariant(2,String(v));
    case 'int':return jsonVariant(2,typeof v==='bigint'?String(v):v.Int);
    case 'f64':{const n=jsonBinary64Value(v);if(!Number.isFinite(n))throw Error('non-finite f64 cannot encode as JSON');return jsonVariant(2,Object.is(n,-0)?'-0':String(n));}
    case 'f32':{let n;if(typeof v==='number')n=Math.fround(v);else{const b=new DataView(new ArrayBuffer(4));b.setUint32(0,v.F32Bits,true);n=b.getFloat32(0,true);}if(!Number.isFinite(n))throw Error('non-finite f32 cannot encode as JSON');return jsonVariant(2,Object.is(n,-0)?'-0':String(n));}
    case 'string':case 'id':case 'enum':return jsonVariant(3,v);
    case 'list':case 'vector':return jsonVariant(4,Array.from(v,x=>write(t.element,x,d+1)));
    case 'record':return jsonVariant(5,t.fields.map(f=>({key:f.name,value:write(f.type,v[f.name],d+1)})));
    case 'option':return jsonVariant(5,[Object.hasOwn(v,'Some')?{key:'Some',value:write(t.element,v.Some,d+1)}:{key:'None',value:jsonVariant(0)}]);
    case 'result':return jsonVariant(5,[Object.hasOwn(v,'Ok')?{key:'Ok',value:write(t.ok,v.Ok,d+1)}:{key:'Err',value:write(t.error,v.Err,d+1)}]);
    default:throw Error('unsupported typed JSON descriptor');
   }
  };return write(this.values.descriptor.root,value,0);
 }
 parse(text,options={}){return this.decode(parseJson(text,options),options);}
 stringify(value,options={}){return stringifyJson(this.encode(value,options),options);}
 parseBinary(text,options={}){return streamJsonBinary(this.values,text,options,true);}
 parseCompact(text,options={}){return streamJsonBinary(this.values,text,options,true,true);}
 stringifyBinary(bytes,options={}){return streamWireJsonText(this.values,bytes,options,false);}
}

// Token reader shared by schema-directed and arbitrary-JSON wire emission.
class JsonWireReader{
 constructor(text,options){this.l=checkedJsonLimits(options);if(typeof text!=='string'||!text.isWellFormed()||text.length>this.l.bytes||jsonUtf8Length(text)>this.l.bytes)throw Error('JSON byte or Unicode limit');this.text=text;this.at=0;this.remaining=this.l.nodes;}
 ws(){while(this.at<this.text.length){const c=this.text.charCodeAt(this.at);if(c!==32&&c!==9&&c!==10&&c!==13)break;this.at++;}}
 peek(){this.ws();return this.text[this.at];}
 eat(c){this.ws();if(this.text[this.at]===c){this.at++;return true;}return false;}
 node(d){if(d>this.l.depth||--this.remaining<0)throw Error('JSON node or depth limit');}
 string(){
  this.ws();const start=this.at;if(this.text[start]!=='"')throw Error('expected JSON string');
  const end=this.text.indexOf('"',start+1);if(end<0)throw Error('unterminated JSON string');
  const raw=this.text.slice(start+1,end);
  if(!raw.includes('\\')&&!/[\x00-\x1f]/.test(raw)){this.at=end+1;return raw;}
  this.at=start+1;while(this.at<this.text.length){if(this.text[this.at]==='"'){this.at++;const v=JSON.parse(this.text.slice(start,this.at));if(!v.isWellFormed())throw Error('invalid JSON Unicode');return v;}if(this.text[this.at]==='\\')this.at+=2;else this.at++;}throw Error('unterminated JSON string');
 }
 number(){const start=this.at;while(this.at<this.text.length){const c=this.text.charCodeAt(this.at);if(!(c>=48&&c<=57||c===45||c===43||c===46||c===101||c===69))break;this.at++;}const token=this.text.slice(start,this.at);if(!jsonNumberToken(token))throw Error('invalid JSON number');return token;}
 leaf(d){this.node(d);const c=this.peek();if(c==='n'&&this.text.startsWith('null',this.at)){this.at+=4;return null;}if(c==='t'&&this.text.startsWith('true',this.at)){this.at+=4;return true;}if(c==='f'&&this.text.startsWith('false',this.at)){this.at+=5;return false;}if(c==='"')return this.string();if(c==='-'||c>='0'&&c<='9')return this.number();throw Error('invalid JSON scalar');}
 finish(){this.ws();if(this.at!==this.text.length)throw Error('trailing JSON text');}
}
function streamJsonBinary(values,text,options,typed,compact=false){
 const p=new JsonWireReader(text,options),utf8=jsonWireEncoder;
 const list=(w,open,close,item)=>{if(!p.eat(open))throw Error('JSON container shape');const at=w.beginCount();let count=0;if(!p.eat(close))while(true){item(w);count++;if(p.eat(close))break;if(!p.eat(','))throw Error('JSON container separator');}w.endCount(at,count);};
 const variant=(w,index,level,emit)=>{if(level<index)w.frame(w=>{w.byte(1);variant(w,index,level+1,emit);});else if(index<5)w.frame(w=>{w.byte(0);w.frame(emit);});else w.frame(emit);};
 const json=(w,d)=>{
  const ch=p.peek(),index=ch==='n'?0:ch==='t'||ch==='f'?1:ch==='-'||ch>='0'&&ch<='9'?2:ch==='"'?3:ch==='['?4:ch==='{'?5:-1;if(index<0)throw Error('invalid JSON value');
  const leaf=index<4?p.leaf(d):null;if(index>=4)p.node(d);
  w.frame(w=>variant(w,index,0,w=>{
   if(index===0)return;if(index===1){w.frame(w=>w.byte(+leaf));return;}
   if(index===2||index===3){w.frame(w=>w.text(leaf));return;}
   w.frame(w=>{if(index===4)list(w,'[',']',w=>json(w,d+1));else{const seen=new Set();list(w,'{','}',w=>{const key=p.string();if(seen.has(key))throw Error('duplicate JSON object key');seen.add(key);if(!p.eat(':'))throw Error('JSON object colon');w.frame(w=>{w.frame(w=>w.text(key));json(w,d+1);});});}});
  }));
 };
 const read=(type,w,d)=>{
  const t=values.resolve(type);w.frame(w=>{
   if(t.kind==='list'||t.kind==='vector'){p.node(d);list(w,'[',']',w=>read(t.element,w,d+1));return;}
   if(t.kind==='record'){
    p.node(d);if(!p.eat('{'))throw Error('expected JSON record');const start=w.position,spans=new Array(t.fields.length).fill(null);
    if(!p.eat('}'))while(true){const key=p.string(),i=t.fields.findIndex(f=>f.name===key);if(i<0)throw Error('unknown JSON record field');if(spans[i])throw Error('duplicate JSON record field');if(!p.eat(':'))throw Error('JSON record colon');const at=w.position;read(t.fields[i].type,w,d+1);spans[i]=[at,w.position];if(p.eat('}'))break;if(!p.eat(','))throw Error('JSON record separator');}
    if(spans.some(s=>s===null))throw Error('missing JSON record field');w.reorder(start,spans);return;
   }
   if(t.kind==='option'||t.kind==='result'){
    p.node(d);if(!p.eat('{'))throw Error('expected JSON tagged value');const key=p.string();if(!p.eat(':'))throw Error('JSON tag colon');
    if(t.kind==='option'&&key==='None'){if(p.leaf(d+1)!==null)throw Error('JSON None payload');w.byte(0);}
    else{const child=t.kind==='option'&&key==='Some'?t.element:t.kind==='result'&&key==='Ok'?t.ok:t.kind==='result'&&key==='Err'?t.error:null;if(!child)throw Error('invalid JSON tag');w.byte(key==='Ok'?0:1);read(child,w,d+1);}
    if(!p.eat('}'))throw Error('expected exactly one JSON tag');return;
   }
   const ch=p.peek(),v=p.leaf(d),bad=()=>{throw Error('JSON does not match '+t.kind);};
   if(t.kind==='unit'){if(v!==null)bad();return;}
   if(t.kind==='bool'){if(typeof v!=='boolean')bad();w.byte(+v);return;}
   if(['string','id','enum'].includes(t.kind)){if(ch!=='"')bad();w.text(v);return;}
   if(ch!=='-'&&!(ch>='0'&&ch<='9'))bad();
   if(t.kind==='int'){w.text(jsonInteger(v,4096));return;}
   if(t.kind==='f64'){const n=Number(v);if(!Number.isFinite(n))throw Error('JSON f64 overflow');const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,n,true);w.wide(b.getBigUint64(0,true));}
   else if(t.kind==='f32'){jsonFloatScratch.setFloat32(0,Number(v),true);if(!Number.isFinite(jsonFloatScratch.getFloat32(0,true)))throw Error('JSON f32 overflow');w.word(jsonFloatScratch.getUint32(0,true));}
   else{const n=BigInt(jsonInteger(v,t.kind==='u64'?20:10));if(t.kind==='u64'){if(n<0n||n>18446744073709551615n)bad();w.wide(n);}else if(t.kind==='u32'){if(n<0n||n>4294967295n)bad();w.word(Number(n));}else if(t.kind==='i32'){if(n< -2147483648n||n>2147483647n)bad();w.word(Number(n)>>>0);}else bad();}
  });
 };
 return (compact?values.compact():values).encodeWith(w=>{if(typed)read(values.descriptor.root,w,0);else json(w,0);p.finish();},options);
}

// Render validated bytes in a single traversal; only the final text is owned.
function streamWireJsonText(values,bytes,options,library){
 values.validate(bytes,options);const l=checkedJsonLimits(options),parts=[];let size=0,remaining=l.nodes;const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const emit=s=>{size+=jsonUtf8Length(s);if(size>l.bytes)throw Error('JSON byte limit');parts.push(s);};
 const string=s=>emit(JSON.stringify(s));const node=d=>{if(d>l.depth||--remaining<0)throw Error('JSON node or depth limit');};
 const frame=(type,at)=>{const t=values.resolve(type),start=at+4,end=start+dv.getUint32(at,true);return{t,start,end};};
 const json=(type,at,d)=>{
  node(d);let root=frame(type,at),sum=frame(root.t.fields[0].type,root.start),index=0;
  while(index<5){const err=bytes[sum.start];sum=frame(err?sum.t.error:sum.t.ok,sum.start+1);if(!err)break;index++;}
  if(index===0){emit('null');return root.end;}
  const item=frame(sum.t.fields[0].type,sum.start);
  if(index===1)emit(bytes[item.start]?'true':'false');
  else if(index===2){const token=decoder.decode(bytes.subarray(item.start,item.end));if(!jsonNumberToken(token))throw Error('invalid JSON number token');emit(token);}
  else if(index===3)string(decoder.decode(bytes.subarray(item.start,item.end)));
  else{const count=dv.getUint32(item.start,true);let p=item.start+4;emit(index===4?'[':'{');const seen=new Set();for(let i=0;i<count;i++){if(i)emit(',');if(index===4)p=json(item.t.element,p,d+1);else{const member=frame(item.t.element,p),key=frame(member.t.fields[0].type,member.start),name=decoder.decode(bytes.subarray(key.start,key.end));if(seen.has(name))throw Error('duplicate JSON object key');seen.add(name);string(name);emit(':');json(member.t.fields[1].type,key.end,d+1);p=member.end;}}emit(index===4?']':'}');}
  return root.end;
 };
 const typed=(type,at,d)=>{
  node(d);const f=frame(type,at),t=f.t;let p=f.start;
  switch(t.kind){
   case 'unit':emit('null');break;
   case 'bool':emit(bytes[p]?'true':'false');break;
   case 'u32':emit(String(dv.getUint32(p,true)));break;
   case 'u64':emit(String(dv.getBigUint64(p,true)));break;
   case 'i32':emit(String(dv.getInt32(p,true)));break;
   case 'f64':{const n=dv.getFloat64(p,true);if(!Number.isFinite(n))throw Error('non-finite f64 cannot encode as JSON');emit(Object.is(n,-0)?'-0':String(n));break;}
   case 'f32':{const n=dv.getFloat32(p,true);if(!Number.isFinite(n))throw Error('non-finite f32 cannot encode as JSON');emit(Object.is(n,-0)?'-0':String(n));break;}
   case 'int':emit(decoder.decode(bytes.subarray(p,f.end)));break;
   case 'string':case 'id':case 'enum':string(decoder.decode(bytes.subarray(p,f.end)));break;
   case 'list':case 'vector':{const n=dv.getUint32(p,true);p+=4;emit('[');for(let i=0;i<n;i++){if(i)emit(',');p=typed(t.element,p,d+1);}emit(']');break;}
   case 'record':emit('{');for(let i=0;i<t.fields.length;i++){if(i)emit(',');const field=t.fields[i];string(field.name);emit(':');p=typed(field.type,p,d+1);}emit('}');break;
   case 'option':case 'result':{const tag=bytes[p++],key=t.kind==='option'?(tag?'Some':'None'):tag?'Err':'Ok';emit('{');string(key);emit(':');if(t.kind==='option'&&!tag){node(d+1);emit('null');}else typed(t.kind==='option'?t.element:tag?t.error:t.ok,p,d+1);emit('}');break;}
   default:throw Error('unsupported typed JSON descriptor');
  }return f.end;
 };
 if(library)json(values.descriptor.root,40,0);else typed(values.descriptor.root,40,0);return parts.join('');
}

/** Owned, optional read view of arbitrary JSON. Auxiliary indexes contain member
 * offsets only. Logical order, exact number tokens and missing/null remain intact.
 * This does not transparently replace any compiled Ink action or its state.
 */
export function createJsonLookup(text,{stepEntries=16,minReads=4,maxEntries=4096,maxObjects=64,maxIndexBytes=262144,...limits}={}){
 for(const [v,max]of [[stepEntries,4096],[minReads,1000000],[maxEntries,1000000],[maxObjects,256],[maxIndexBytes,16777216]])if(!Number.isSafeInteger(v)||v<0||v>max)throw Error('JSON index budget');
 let root=parseJson(text,limits),indexes=new Map(),entries=0,indexBytes=0;
 const stats={reads:0,writes:0,scanned_members:0,index_hits:0,built_entries:0,invalidations:0};
 function parts(path){
  if(!Array.isArray(path))throw Error('JSON lookup path');const n=path.length;if(n>128)throw Error('JSON lookup path');
  const owned=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(path,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('JSON lookup path');const p=d.value;if(!(typeof p==='string'&&p.isWellFormed()&&p.length<=4096)&&!(Number.isSafeInteger(p)&&p>=0))throw Error('JSON lookup path');owned.push(p);}return owned;
 }
 function variant(value){let p=value.payload,index=0;while(index<5&&Object.hasOwn(p,'Err')){p=p.Err;index++;}return {index,item:(index<5?p.Ok:p).item0};}
 function resolve(document,path,indexed){
  let value=document,budget=stepEntries;
  for(let depth=0;depth<path.length;depth++){
   const part=path[depth],v=variant(value);
   if(typeof part==='number'){
    if(v.index!==4)throw Error('expected JSON array');if(part>=v.item.length)return {found:false};value=v.item[part];continue;
   }
   if(v.index!==5)throw Error('expected JSON object');
   const prefix=path.slice(0,depth),key=JSON.stringify(prefix),overhead=128+prefix.reduce((n,p)=>n+(typeof p==='string'?16+p.length*2:8),0);let idx=indexed?indexes.get(key):null;
   if(indexed&&!idx&&indexes.size<maxObjects&&indexBytes+overhead<=maxIndexBytes){idx={path:prefix,reads:0,cursor:0,keys:new Map(),bytes:overhead};indexes.set(key,idx);indexBytes+=overhead;}
   if(idx){
    idx.reads++;
    if(idx.reads>=minReads)while(budget>0&&idx.cursor<v.item.length&&entries<maxEntries){
     const member=v.item[idx.cursor],bytes=64+member.key.length*2;
     if(indexBytes+bytes>maxIndexBytes)break;
     idx.keys.set(member.key,idx.cursor++);idx.bytes+=bytes;indexBytes+=bytes;entries++;stats.built_entries++;budget--;
    }
    if(idx.keys.has(part)){stats.index_hits++;value=v.item[idx.keys.get(part)].value;continue;}
   }
   let found=false;
   for(let i=idx?.cursor??0;i<v.item.length;i++){if(indexed)stats.scanned_members++;if(v.item[i].key===part){value=v.item[i].value;found=true;break;}}
   if(!found)return {found:false};
  }
  return {found:true,value};
 }
 return {
  lookup(path){stats.reads++;const r=resolve(root,parts(path),true);return r.found?{found:true,value:structuredClone(r.value)}:r;},
  set(path,key,text){
   path=parts(path);if(typeof key!=='string'||!key.isWellFormed())throw Error('JSON object key');
   const replacement=parseJson(text,limits),next=structuredClone(root),r=resolve(next,path,false);
   if(!r.found)throw Error('JSON update path missing');const object=variant(r.value);if(object.index!==5)throw Error('expected JSON object');
   const members=[{key,value:replacement},...object.item.filter(m=>m.key!==key)];
   // Validate the complete resulting document before publishing a write.
   let payload=r.value.payload;for(let i=0;i<5;i++)payload=payload.Err;payload.item0=members;
   stringifyJson(next,limits);root=next;stats.writes++;
   for(const [id,idx]of indexes)if(idx.path.length>=path.length&&path.every((p,i)=>p===idx.path[i])){entries-=idx.keys.size;indexBytes-=idx.bytes;indexes.delete(id);stats.invalidations++;}
  },
  replace(text){const next=parseJson(text,limits);root=next;stats.writes++;stats.invalidations+=indexes.size;indexes.clear();entries=0;indexBytes=0;},
  stringify(){return stringifyJson(root,limits);},
  stats(){return {...stats,index_entries:entries,index_objects:indexes.size,index_bytes:indexBytes};}
 };
}
function __ownedValue9(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue8(value[i],budget,depth+1);return out;}
function __ownedValue1(value,budget,depth){budget.enter(depth,5);return Object.hasOwn(value,'None')&&value.None===null?{None:null}:{Some:__ownedValue2(value.Some,budget,depth+1)};}
function __ownedValue8(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue3(value[i],budget,depth+1);return out;}
function __ownedValue10(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__ownedValue7(value[i],budget,depth+1);return out;}
function __ownedValue11(value,budget,depth){budget.enter(depth,4);return {["rows"]:__ownedValue9(value["rows"],budget,depth+1),["recovered"]:__ownedValue10(value["recovered"],budget,depth+1)};}
function __ownedValue4(value,budget,depth){budget.enter(depth,4);return {["state"]:__ownedValue5(value["state"],budget,depth+1),["field"]:__ownedValue3(value["field"],budget,depth+1),["open"]:__ownedValue6(value["open"],budget,depth+1),["start"]:__ownedValue7(value["start"],budget,depth+1),["row"]:__ownedValue8(value["row"],budget,depth+1),["rows"]:__ownedValue9(value["rows"],budget,depth+1),["count"]:__ownedValue7(value["count"],budget,depth+1),["recovered"]:__ownedValue10(value["recovered"],budget,depth+1)};}
function __ownedValue6(value,budget,depth){budget.enter(depth,5);return value;}
function __ownedValue0(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __ownedValue2(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __ownedValue5(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __ownedValue12(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __ownedValue3(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __ownedValue7(value,budget,depth){budget.enter(depth,8);return value>>>0;}
const __ownedFunctions=Object.freeze(Object.fromEntries([["classify",__ownedValue0],["authored",__ownedValue1],["decide",__ownedValue2],["flush",__ownedValue3],["advance",__ownedValue4],["parse_text",__ownedValue11],["row_errors",__ownedValue12],["recovery",__ownedValue12],["__learn_ord_recover_0",__ownedValue7],["__learn_ord_recover_1",__ownedValue7],["__learn_value_recover",__ownedValue2],["__hole_recover",__ownedValue2],["__learn_valid",__ownedValue6]]));
function __wireValue16(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue15(reader);reader.finish(end);return value;}
function __wireValue25(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue26(reader);reader.finish(end);return value;}
function __wireValue18(reader){const end=reader.frame();const value=reader.byte()?{Some:__wireValue6(reader)}:{None:null};reader.finish(end);return value;}
function __wireValue15(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue14(reader);reader.finish(end);return value;}
function __wireValue4(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__wireValue5(reader);reader.finish(end);return value;}
function __wireValue0(reader){const end=reader.frame();const value={["a0"]:__wireValue1(reader),["a1"]:__wireValue2(reader),["__holes"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue24(reader){const end=reader.frame();const value={["cases"]:__wireValue25(reader),["__holes"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue28(reader){const end=reader.frame();const value={["got"]:__wireValue16(reader),["want"]:__wireValue16(reader)};reader.finish(end);return value;}
function __wireValue11(reader){const end=reader.frame();const value={["i"]:__wireValue5(reader)};reader.finish(end);return value;}
function __wireValue9(reader){const end=reader.frame();const value={["next"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue12(reader){const end=reader.frame();const value={["p"]:__wireValue13(reader),["text"]:__wireValue14(reader),["delimiter"]:__wireValue5(reader),["i"]:__wireValue5(reader),["__holes"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue21(reader){const end=reader.frame();const value={["p"]:__wireValue13(reader),["text"]:__wireValue14(reader),["i"]:__wireValue5(reader)};reader.finish(end);return value;}
function __wireValue3(reader){const end=reader.frame();const value={["recover"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue23(reader){const end=reader.frame();const value={["rows"]:__wireValue16(reader),["recovered"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue20(reader){const end=reader.frame();const value={["s"]:__wireValue1(reader),["c"]:__wireValue2(reader),["__holes"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue17(reader){const end=reader.frame();const value={["s"]:__wireValue1(reader),["c"]:__wireValue2(reader)};reader.finish(end);return value;}
function __wireValue13(reader){const end=reader.frame();const value={["state"]:__wireValue1(reader),["field"]:__wireValue14(reader),["open"]:__wireValue10(reader),["start"]:__wireValue5(reader),["row"]:__wireValue15(reader),["rows"]:__wireValue16(reader),["count"]:__wireValue5(reader),["recovered"]:__wireValue4(reader)};reader.finish(end);return value;}
function __wireValue22(reader){const end=reader.frame();const value={["text"]:__wireValue14(reader),["delimiter"]:__wireValue5(reader),["__holes"]:__wireValue3(reader)};reader.finish(end);return value;}
function __wireValue26(reader){const end=reader.frame();const value={["text"]:__wireValue14(reader),["delimiter"]:__wireValue5(reader),["cells"]:__wireValue16(reader)};reader.finish(end);return value;}
function __wireValue19(reader){const end=reader.frame();const value={["text"]:__wireValue14(reader),["i"]:__wireValue5(reader),["delimiter"]:__wireValue5(reader)};reader.finish(end);return value;}
function __wireValue8(reader){const end=reader.frame();const value={["x"]:__wireValue2(reader)};reader.finish(end);return value;}
function __wireValue7(reader){const end=reader.frame();const value={["x"]:__wireValue1(reader)};reader.finish(end);return value;}
function __wireValue10(reader){const end=reader.frame();const value=!!reader.byte();reader.finish(end);return value;}
const __wireValue2Variants=Object.freeze(["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]);
function __wireValue2(reader){const end=reader.frame();const value=reader.text(end,"enum",__wireValue2Variants);reader.finish(end);return value;}
const __wireValue6Variants=Object.freeze(["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]);
function __wireValue6(reader){const end=reader.frame();const value=reader.text(end,"enum",__wireValue6Variants);reader.finish(end);return value;}
const __wireValue1Variants=Object.freeze(["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]);
function __wireValue1(reader){const end=reader.frame();const value=reader.text(end,"enum",__wireValue1Variants);reader.finish(end);return value;}
function __wireValue27(reader){const end=reader.frame();const value={F32Bits:reader.word()};reader.finish(end);return value;}
function __wireValue14(reader){const end=reader.frame();const value=reader.text(end,"string");reader.finish(end);return value;}
function __wireValue5(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
const __wireReaders=Object.freeze(Object.fromEntries([["__hole_recover",[__wireValue0,__wireValue6]],["__learn_ord_recover_0",[__wireValue7,__wireValue5]],["__learn_ord_recover_1",[__wireValue8,__wireValue5]],["__learn_valid",[__wireValue9,__wireValue10]],["__learn_value_recover",[__wireValue11,__wireValue6]],["advance",[__wireValue12,__wireValue13]],["authored",[__wireValue17,__wireValue18]],["classify",[__wireValue19,__wireValue2]],["decide",[__wireValue20,__wireValue6]],["flush",[__wireValue21,__wireValue14]],["parse_text",[__wireValue22,__wireValue23]],["recovery",[__wireValue24,__wireValue27]],["row_errors",[__wireValue28,__wireValue27]]]));
const __ownedImplementations=Object.freeze(Object.fromEntries([["classify",(()=>{const c0=__representation(__inputTypes[0].types[0],false,__inputTypes[0].capture[0]);const c1=__representation(__inputTypes[0].types[1],false,__inputTypes[0].capture[1]);const c2=__representation(__inputTypes[0].types[2],false,__inputTypes[0].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&c1===__identity&&c2===__identity)return __fn0;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn0(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn0(v0,v1,v2);};})()],
["authored",(()=>{const c0=__representation(__inputTypes[1].types[0],false,__inputTypes[1].capture[0]);const c1=__representation(__inputTypes[1].types[1],false,__inputTypes[1].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity&&c1===__identity)return __fn1;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn1(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn1(v0,v1);};})()],
["decide",(()=>{const c0=__representation(__inputTypes[2].types[0],false,__inputTypes[2].capture[0]);const c1=__representation(__inputTypes[2].types[1],false,__inputTypes[2].capture[1]);const c2=__representation(__inputTypes[2].types[2],false,__inputTypes[2].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn2;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn2(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn2(v0,v1,v2);};})()],
["flush",(()=>{const c0=__representation(__inputTypes[3].types[0],false,__inputTypes[3].capture[0]);const c1=__representation(__inputTypes[3].types[1],false,__inputTypes[3].capture[1]);const c2=__representation(__inputTypes[3].types[2],false,__inputTypes[3].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn3;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn3(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn3(v0,v1,v2);};})()],
["advance",(()=>{const c0=__representation(__inputTypes[4].types[0],false,__inputTypes[4].capture[0]);const c1=__representation(__inputTypes[4].types[1],false,__inputTypes[4].capture[1]);const c2=__representation(__inputTypes[4].types[2],false,__inputTypes[4].capture[2]);const c3=__representation(__inputTypes[4].types[3],false,__inputTypes[4].capture[3]);const c4=__representation(__inputTypes[4].types[4],false,__inputTypes[4].capture[4]);const input=[c0,c1,c2,c3,c4],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c4!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity&&c3===__identity&&c4===__identity)return __fn4;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn4(...values);};return function(a0,a1,a2,a3,a4){if(arguments.length!==5)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object')+Number(c3!==__identity&&a3!==null&&typeof a3==='object')+Number(c4!==__identity&&a4!==null&&typeof a4==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);const v3=c3(a3,context);const v4=c4(a4,context);return __fn4(v0,v1,v2,v3,v4);};})()],
["parse_text",(()=>{const c0=__representation(__inputTypes[5].types[0],false,__inputTypes[5].capture[0]);const c1=__representation(__inputTypes[5].types[1],false,__inputTypes[5].capture[1]);const c2=__representation(__inputTypes[5].types[2],false,__inputTypes[5].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn5;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn5(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn5(v0,v1,v2);};})()],
["row_errors",(()=>{const c0=__representation(__inputTypes[6].types[0],false,__inputTypes[6].capture[0]);const c1=__representation(__inputTypes[6].types[1],false,__inputTypes[6].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __fn6;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn6(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn6(v0,v1);};})()],
["recovery",(()=>{const c0=__representation(__inputTypes[7].types[0],false,__inputTypes[7].capture[0]);const c1=__representation(__inputTypes[7].types[1],false,__inputTypes[7].capture[1]);const input=[c0,c1],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity||c1!==__identity);if(c0===__identity&&c1===__identity)return __fn7;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn7(...values);};return function(a0,a1){if(arguments.length!==2)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);return __fn7(v0,v1);};})()],
["__learn_ord_recover_0",(()=>{const c0=__representation(__inputTypes[8].types[0],false,__inputTypes[8].capture[0]);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity)return __fn8;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn8(...values);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return __fn8(v0);};})()],
["__learn_ord_recover_1",(()=>{const c0=__representation(__inputTypes[9].types[0],false,__inputTypes[9].capture[0]);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity)return __fn9;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn9(...values);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return __fn9(v0);};})()],
["__learn_value_recover",(()=>{const c0=__representation(__inputTypes[10].types[0],false,__inputTypes[10].capture[0]);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=false;if(c0===__identity)return __fn10;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn10(...values);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return __fn10(v0);};})()],
["__hole_recover",(()=>{const c0=__representation(__inputTypes[11].types[0],false,__inputTypes[11].capture[0]);const c1=__representation(__inputTypes[11].types[1],false,__inputTypes[11].capture[1]);const c2=__representation(__inputTypes[11].types[2],false,__inputTypes[11].capture[2]);const input=[c0,c1,c2],needsInput=input.some(c=>c!==__identity);const needsContext=(c2!==__identity);if(c0===__identity&&c1===__identity&&c2===__identity)return __fn11;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn11(...values);};return function(a0,a1,a2){if(arguments.length!==3)return fallback(...arguments);const context=(needsContext||(Number(c0!==__identity&&a0!==null&&typeof a0==='object')+Number(c1!==__identity&&a1!==null&&typeof a1==='object')+Number(c2!==__identity&&a2!==null&&typeof a2==='object'))>1)?new WeakMap():null;const v0=c0(a0,context);const v1=c1(a1,context);const v2=c2(a2,context);return __fn11(v0,v1,v2);};})()],
["__learn_valid",(()=>{const c0=__representation(__inputTypes[12].types[0],false,__inputTypes[12].capture[0]);const input=[c0],needsInput=input.some(c=>c!==__identity);const needsContext=(c0!==__identity);if(c0===__identity)return __fn12;const fallback=(...args)=>{const context=new WeakMap();const values=needsInput?args.map((v,i)=>input[i](v,context)):args;return __fn12(...values);};return function(a0){if(arguments.length!==1)return fallback(...arguments);const context=(needsContext)?new WeakMap():null;const v0=c0(a0,context);return __fn12(v0);};})()]]));

export const valueCodecs=(()=>{const codecs={};for(const [name,s] of Object.entries(metadata.wire.functions)){if(s.unsupported)continue;let value;Object.defineProperty(codecs,name,{enumerable:true,get:()=>value??=(Object.freeze(Object.hasOwn(__wireReaders,name)?{arguments:createCompiledValueCodec(s.arguments,__wireReaders[name][0]),result:createCompiledValueCodec(s.result,__wireReaders[name][1])}:{arguments:new ValueCodec(s.arguments),result:new ValueCodec(s.result)}))});}return Object.freeze(codecs);})();
function __callEncoded(name,bytes,limits,compact){
 const f=metadata.functions.find(f=>f.name===name&&!f.internal),codecs=valueCodecs[name];
 if(!f||!codecs)throw Error('unsupported binary function');
 const input=compact?codecs.arguments.compact():codecs.arguments,output=compact?codecs.result.compact():codecs.result;
 const entry=__compiledEntries.get(name);
 if(entry){
  const slot=compact?1:0;
  entry.argumentCodecs[slot]??=(entry.boundaryReaders[slot]?createFusedValueCodec:createCompiledValueCodec)(metadata.wire.functions[name].arguments,entry.arguments);
  const decoder=entry.argumentCodecs[slot];
  const values=(compact?decoder.compact():decoder).decode(bytes,limits),args=f.params.map(p=>values[p.name]);
  if(entry.precondition!==null&&__implementations[entry.precondition](...args)!==true)throw Error('contract precondition failed');
  return __compiledEncodeResult(entry,__implementations[entry.index](...args),limits,compact);
 }
 const values=input.decode(bytes,limits);
 const result=call(name,f.params.map(p=>values[p.name]));
 return output.encode(result,limits);
}
export function callBinary(name,bytes,limits={}){return __callEncoded(name,bytes,limits,false);}
export function callCompact(name,bytes,limits={}){return __callEncoded(name,bytes,limits,true);}
// Same stable, well-typed caller inputs as call; the result owns every container.
// The checked source return type justifies trusted copying, not arbitrary input.
export function callOwned(name,args,limits={}){
 if(!Object.hasOwn(__ownedFunctions,name)||!Object.hasOwn(functions,name))throw Error('unsupported owned function');
 const result=__ownedImplementations[name](...args);return __ownedFunctions[name](result,createValueCaptureBudget(limits),0);
}
function __privateCapture11(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture10(value[i],budget,depth+1);return out;}
function __privateCapture14(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture15(value[i],budget,depth+1);return out;}
function __privateCapture4(value,budget,depth=0){budget.enter(depth,4);budget.add(1);if((value!==null&&typeof value==='object'&&Object.hasOwn(value,'None')&&Object.keys(value).length===1)&&value.None===null)return {None:null};if(value!==null&&typeof value==='object'&&Object.hasOwn(value,'Some')&&Object.keys(value).length===1)return {Some:__privateCapture5(value.Some,budget,depth+1)};throw Error('invalid value for wire schema');}
function __privateCapture10(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture0(value[i],budget,depth+1);return out;}
function __privateCapture7(value,budget,depth=0){budget.enter(depth,4);if(!Array.isArray(value)&&!(ArrayBuffer.isView(value)&&!(value instanceof DataView))){throw Error('invalid value for wire schema');}const n=value.length;if(n>budget.remaining){throw Error('invalid value for wire schema');}budget.add(4);const out=new Array(n);for(let i=0;i<n;i++)out[i]=__privateCapture1(value[i],budget,depth+1);return out;}
function __privateCapture6(value,budget,depth=0){budget.enter(depth,4);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"recover")){throw Error('invalid value for wire schema');}return {["recover"]:__privateCapture7(value["recover"],budget,depth+1)};}
function __privateCapture12(value,budget,depth=0){budget.enter(depth,4);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"rows")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"recovered")){throw Error('invalid value for wire schema');}return {["rows"]:__privateCapture11(value["rows"],budget,depth+1),["recovered"]:__privateCapture7(value["recovered"],budget,depth+1)};}
function __privateCapture8(value,budget,depth=0){budget.enter(depth,4);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==8){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"state")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"field")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"open")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"start")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"row")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"rows")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"count")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"recovered")){throw Error('invalid value for wire schema');}return {["state"]:__privateCapture3(value["state"],budget,depth+1),["field"]:__privateCapture0(value["field"],budget,depth+1),["open"]:__privateCapture9(value["open"],budget,depth+1),["start"]:__privateCapture1(value["start"],budget,depth+1),["row"]:__privateCapture10(value["row"],budget,depth+1),["rows"]:__privateCapture11(value["rows"],budget,depth+1),["count"]:__privateCapture1(value["count"],budget,depth+1),["recovered"]:__privateCapture7(value["recovered"],budget,depth+1)};}
function __privateCapture15(value,budget,depth=0){budget.enter(depth,4);if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"text")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"delimiter")){throw Error('invalid value for wire schema');}if(!Object.hasOwn(value,"cells")){throw Error('invalid value for wire schema');}return {["text"]:__privateCapture0(value["text"],budget,depth+1),["delimiter"]:__privateCapture1(value["delimiter"],budget,depth+1),["cells"]:__privateCapture11(value["cells"],budget,depth+1)};}
function __privateCapture9(value,budget,depth=0){budget.enter(depth,4);if(typeof value!=='boolean'){throw Error('invalid value for wire schema');}budget.add(1);return value;}
function __privateCapture2(value,budget,depth=0){budget.enter(depth,4);const text=value;if(typeof text!=='string'||!text.isWellFormed()||text.length>budget.limit){throw Error('invalid value for wire schema');}if(!["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"].includes(text)){throw Error('invalid value for wire schema');}budget.text(text);return text;}
function __privateCapture5(value,budget,depth=0){budget.enter(depth,4);const text=value;if(typeof text!=='string'||!text.isWellFormed()||text.length>budget.limit){throw Error('invalid value for wire schema');}if(!["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"].includes(text)){throw Error('invalid value for wire schema');}budget.text(text);return text;}
function __privateCapture3(value,budget,depth=0){budget.enter(depth,4);const text=value;if(typeof text!=='string'||!text.isWellFormed()||text.length>budget.limit){throw Error('invalid value for wire schema');}if(!["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"].includes(text)){throw Error('invalid value for wire schema');}budget.text(text);return text;}
function __privateCapture13(value,budget,depth=0){budget.enter(depth,4);let bits;if(typeof value==='number'&&Number.isFinite(value)){bits=__bits(value);if(!Number.isFinite(__float(bits))){throw Error('invalid value for wire schema');}}else{if(!(value!==null&&typeof value==='object'&&Object.hasOwn(value,'F32Bits')&&Object.keys(value).length===1)){throw Error('invalid value for wire schema');}bits=value.F32Bits;if(!Number.isInteger(bits)||bits<0||bits>4294967295){throw Error('invalid value for wire schema');}}budget.add(4);return __nfFromBits(bits);}
function __privateCapture0(value,budget,depth=0){budget.enter(depth,4);const text=value;if(typeof text!=='string'||!text.isWellFormed()||text.length>budget.limit){throw Error('invalid value for wire schema');}budget.text(text);return text;}
function __privateCapture1(value,budget,depth=0){budget.enter(depth,4);if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>4294967295){throw Error('invalid value for wire schema');}budget.add(4);return value===0?0:value;}
function __privateWireValue14(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue13(reader);reader.finish(end);return value;}
function __privateWireValue21(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue22(reader);reader.finish(end);return value;}
function __privateWireValue5(reader){const end=reader.frame();const value=reader.byte()?{Some:__privateWireValue6(reader)}:{None:null};reader.finish(end);return value;}
function __privateWireValue13(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue0(reader);reader.finish(end);return value;}
function __privateWireValue9(reader){const end=reader.frame();const n=reader.count(),value=new Array(n);for(let i=0;i<n;i++)value[i]=__privateWireValue1(reader);reader.finish(end);return value;}
function __privateWireValue27(reader){const end=reader.frame();const value={["a0"]:__privateWireValue4(reader),["a1"]:__privateWireValue2(reader),["__holes"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue23(reader){const end=reader.frame();const value={["cases"]:__privateWireValue21(reader),["__holes"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue20(reader){const end=reader.frame();const value={["got"]:__privateWireValue14(reader),["want"]:__privateWireValue14(reader)};reader.finish(end);return value;}
function __privateWireValue26(reader){const end=reader.frame();const value={["i"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue28(reader){const end=reader.frame();const value={["next"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue16(reader){const end=reader.frame();const value={["p"]:__privateWireValue11(reader),["text"]:__privateWireValue0(reader),["delimiter"]:__privateWireValue1(reader),["i"]:__privateWireValue1(reader),["__holes"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue15(reader){const end=reader.frame();const value={["p"]:__privateWireValue11(reader),["text"]:__privateWireValue0(reader),["i"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue8(reader){const end=reader.frame();const value={["recover"]:__privateWireValue9(reader)};reader.finish(end);return value;}
function __privateWireValue17(reader){const end=reader.frame();const value={["rows"]:__privateWireValue14(reader),["recovered"]:__privateWireValue9(reader)};reader.finish(end);return value;}
function __privateWireValue10(reader){const end=reader.frame();const value={["s"]:__privateWireValue4(reader),["c"]:__privateWireValue2(reader),["__holes"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue7(reader){const end=reader.frame();const value={["s"]:__privateWireValue4(reader),["c"]:__privateWireValue2(reader)};reader.finish(end);return value;}
function __privateWireValue11(reader){const end=reader.frame();const value={["state"]:__privateWireValue4(reader),["field"]:__privateWireValue0(reader),["open"]:__privateWireValue12(reader),["start"]:__privateWireValue1(reader),["row"]:__privateWireValue13(reader),["rows"]:__privateWireValue14(reader),["count"]:__privateWireValue1(reader),["recovered"]:__privateWireValue9(reader)};reader.finish(end);return value;}
function __privateWireValue18(reader){const end=reader.frame();const value={["text"]:__privateWireValue0(reader),["delimiter"]:__privateWireValue1(reader),["__holes"]:__privateWireValue8(reader)};reader.finish(end);return value;}
function __privateWireValue22(reader){const end=reader.frame();const value={["text"]:__privateWireValue0(reader),["delimiter"]:__privateWireValue1(reader),["cells"]:__privateWireValue14(reader)};reader.finish(end);return value;}
function __privateWireValue3(reader){const end=reader.frame();const value={["text"]:__privateWireValue0(reader),["i"]:__privateWireValue1(reader),["delimiter"]:__privateWireValue1(reader)};reader.finish(end);return value;}
function __privateWireValue25(reader){const end=reader.frame();const value={["x"]:__privateWireValue2(reader)};reader.finish(end);return value;}
function __privateWireValue24(reader){const end=reader.frame();const value={["x"]:__privateWireValue4(reader)};reader.finish(end);return value;}
function __privateWireValue12(reader){const end=reader.frame();const value=!!reader.byte();reader.finish(end);return value;}
const __privateWireValue2Variants=Object.freeze(["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]);
function __privateWireValue2(reader){const end=reader.frame();const value=reader.text(end,"enum",__privateWireValue2Variants);reader.finish(end);return value;}
const __privateWireValue6Variants=Object.freeze(["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]);
function __privateWireValue6(reader){const end=reader.frame();const value=reader.text(end,"enum",__privateWireValue6Variants);reader.finish(end);return value;}
const __privateWireValue4Variants=Object.freeze(["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]);
function __privateWireValue4(reader){const end=reader.frame();const value=reader.text(end,"enum",__privateWireValue4Variants);reader.finish(end);return value;}
function __privateWireValue19(reader){const end=reader.frame();const value=__nfFromBits(reader.word());reader.finish(end);return value;}
function __privateWireValue0(reader){const end=reader.frame();const value=reader.text(end,"string");reader.finish(end);return value;}
function __privateWireValue1(reader){const end=reader.frame();const value=reader.word();reader.finish(end);return value;}
function __compiledOwnedValue11(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue10(value[i],budget,depth+1);return out;}
function __compiledOwnedValue14(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue15(value[i],budget,depth+1);return out;}
function __compiledOwnedValue4(value,budget,depth){budget.enter(depth,5);return Object.hasOwn(value,'None')&&value.None===null?{None:null}:{Some:__compiledOwnedValue5(value.Some,budget,depth+1)};}
function __compiledOwnedValue10(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue0(value[i],budget,depth+1);return out;}
function __compiledOwnedValue7(value,budget,depth){budget.enter(depth,8);const n=value.length;if(n>budget.remaining)throw Error('wire sequence size');const out=new Array(n);for(let i=0;i<n;i++)out[i]=__compiledOwnedValue1(value[i],budget,depth+1);return out;}
function __compiledOwnedValue6(value,budget,depth){budget.enter(depth,4);return {["recover"]:__compiledOwnedValue7(value["recover"],budget,depth+1)};}
function __compiledOwnedValue12(value,budget,depth){budget.enter(depth,4);return {["rows"]:__compiledOwnedValue11(value["rows"],budget,depth+1),["recovered"]:__compiledOwnedValue7(value["recovered"],budget,depth+1)};}
function __compiledOwnedValue8(value,budget,depth){budget.enter(depth,4);return {["state"]:__compiledOwnedValue3(value["state"],budget,depth+1),["field"]:__compiledOwnedValue0(value["field"],budget,depth+1),["open"]:__compiledOwnedValue9(value["open"],budget,depth+1),["start"]:__compiledOwnedValue1(value["start"],budget,depth+1),["row"]:__compiledOwnedValue10(value["row"],budget,depth+1),["rows"]:__compiledOwnedValue11(value["rows"],budget,depth+1),["count"]:__compiledOwnedValue1(value["count"],budget,depth+1),["recovered"]:__compiledOwnedValue7(value["recovered"],budget,depth+1)};}
function __compiledOwnedValue15(value,budget,depth){budget.enter(depth,4);return {["text"]:__compiledOwnedValue0(value["text"],budget,depth+1),["delimiter"]:__compiledOwnedValue1(value["delimiter"],budget,depth+1),["cells"]:__compiledOwnedValue11(value["cells"],budget,depth+1)};}
function __compiledOwnedValue9(value,budget,depth){budget.enter(depth,5);return value;}
function __compiledOwnedValue2(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __compiledOwnedValue5(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __compiledOwnedValue3(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __compiledOwnedValue13(value,budget,depth){budget.enter(depth,8);const bits=typeof value==='number'?__bits(value):value.F32Bits;return {F32Bits:bits===0?0:bits};}
function __compiledOwnedValue0(value,budget,depth){budget.enter(depth,4);budget.text(value);return value;}
function __compiledOwnedValue1(value,budget,depth){budget.enter(depth,8);return value>>>0;}
function __privateWireWrite11(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite10(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite14(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite15(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite4(writer,value,compact){const frame=writer.openFrame();if(Object.hasOwn(value,'Some')){writer.byte(1);__privateWireWrite5(writer,value.Some,compact);}else{writer.byte(0);}writer.closeFrame(frame);}
function __privateWireWrite10(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite0(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite7(writer,value,compact){const frame=writer.openFrame();writer.count(value.length);for(let i=0;i<value.length;i++)__privateWireWrite1(writer,value[i],compact);writer.closeFrame(frame);}
function __privateWireWrite6(writer,value,compact){const frame=writer.openFrame();__privateWireWrite7(writer,value["recover"],compact);writer.closeFrame(frame);}
function __privateWireWrite12(writer,value,compact){const frame=writer.openFrame();__privateWireWrite11(writer,value["rows"],compact);__privateWireWrite7(writer,value["recovered"],compact);writer.closeFrame(frame);}
function __privateWireWrite8(writer,value,compact){const frame=writer.openFrame();__privateWireWrite3(writer,value["state"],compact);__privateWireWrite0(writer,value["field"],compact);__privateWireWrite9(writer,value["open"],compact);__privateWireWrite1(writer,value["start"],compact);__privateWireWrite10(writer,value["row"],compact);__privateWireWrite11(writer,value["rows"],compact);__privateWireWrite1(writer,value["count"],compact);__privateWireWrite7(writer,value["recovered"],compact);writer.closeFrame(frame);}
function __privateWireWrite15(writer,value,compact){const frame=writer.openFrame();__privateWireWrite0(writer,value["text"],compact);__privateWireWrite1(writer,value["delimiter"],compact);__privateWireWrite11(writer,value["cells"],compact);writer.closeFrame(frame);}
function __privateWireWrite9(writer,value,compact){const frame=writer.openFrame();writer.byte(value?1:0);writer.closeFrame(frame);}
function __privateWireWrite2(writer,value,compact){const frame=writer.openFrame();writer.text(value,compact);writer.closeFrame(frame);}
function __privateWireWrite5(writer,value,compact){const frame=writer.openFrame();writer.text(value,compact);writer.closeFrame(frame);}
function __privateWireWrite3(writer,value,compact){const frame=writer.openFrame();writer.text(value,compact);writer.closeFrame(frame);}
function __privateWireWrite13(writer,value,compact){const frame=writer.openFrame();writer.word(__nfBits(value));writer.closeFrame(frame);}
function __privateWireWrite0(writer,value,compact){const frame=writer.openFrame();writer.text(value,compact);writer.closeFrame(frame);}
function __privateWireWrite1(writer,value,compact){const frame=writer.openFrame();writer.word(value);writer.closeFrame(frame);}
// Handles have no mutable private payload surface. Membership and type identity
// are checked by this module's closure; copied/foreign objects cannot forge them.
const __compiledHandles=new WeakMap();
const __compiledBindings=new WeakMap();
function __compiledHandle(identity,value,guaranteed=false){
 const handle=Object.freeze(Object.create(null));
 __compiledHandles.set(handle,{identity,value,guaranteed});return handle;
}
function __compiledEntry(handle,identity){
 const entry=__compiledHandles.get(handle);
 if(!entry||entry.identity!==identity)throw Error('compiled value type or owner mismatch');
 return entry;
}
function __compiledUnwrap(handle,identity){return __compiledEntry(handle,identity).value;}
// Emit the portable schema's framing/scalar events without creating a buffer
// or exposing private composite nodes. Only this wrapper receives callbacks
// from the literal writer; host visitors never receive those closures.
function __compiledValueEvents(sink,limits){
 const methods=['begin','end','byte','word','wide','text','count'];
 for(const name of methods)if(typeof sink?.[name]!=='function')throw Error('compiled value visitor method: '+name);
 const budget=createValueCaptureBudget(limits);let depth=0,closed=false;
 const active=()=>{if(closed)throw Error('compiled value visitor is closed');};
 const writer=Object.freeze({
  openFrame(){active();budget.enter(depth,4);depth++;sink.begin();return 0;}
  ,closeFrame(){active();if(depth===0)throw Error('wire frame boundary');try{sink.end();}finally{depth--;}}
  ,frame(emit){active();budget.enter(depth,4);depth++;sink.begin();try{emit();sink.end();}finally{depth--;}}
  ,byte(value){active();budget.add(1);sink.byte(value);}
  ,word(value){active();budget.add(4);sink.word(value);}
  ,wide(value){active();budget.add(8);sink.wide(value);}
  ,text(value){active();budget.text(value);sink.text(value);}
  ,count(value){active();budget.add(4);if(value>budget.remaining)throw Error('wire sequence size');sink.count(value);}
 });
 return {writer,close(){closed=true;}};
}
function __compiledReduction(factory,root,reduce,identity){
 if(typeof factory!=='function')throw Error('compiled reduction factory');
 const reducers=[],seen=new Set(),nodes=__reductionNodes();
 const prepare=index=>{
  if(seen.has(index))return;seen.add(index);
  const node=nodes[index];
  for(const child of node.children)prepare(child);
  const reducer=factory(node,index);
  if(node.kind==='list'||node.kind==='vector'){
   const start=reducer?.start,step=reducer?.step,finish=reducer?.finish;
   if(typeof start!=='function'||typeof step!=='function'||typeof finish!=='function')throw Error('compiled collection reduction');
   reducers[index]=Object.freeze({start,step,finish});
  }else{
   if(typeof reducer!=='function')throw Error('compiled value reduction');
   reducers[index]=reducer;
  }
 };
 prepare(root);Object.freeze(reducers);
 return Object.freeze(function(handle,context,limits={}){
  const value=__compiledUnwrap(handle,identity),budget=createValueCaptureBudget(limits);
  return reduce(value,reducers,budget,0,context);
 });
}
function __compiledCodec(schema,capture,read,write,copy,constructorRoot,reductionRoot,reduce,portableFused=false,compactFused=false){
 const privateCodec=createCompiledValueCodec(schema,read),publicCodec=privateCodec;
 let fusedCodec;const fused=()=>fusedCodec??=createFusedValueCodec(schema,read);
 const identity=schema.identity;
 const codec=Object.freeze({
  identity,
  descriptor:publicCodec.descriptor,
  resolve(type){return publicCodec.resolve(type);},
  capture(value,limits={}){
   return __compiledHandle(identity,capture(value,createValueCaptureBudget(limits),0));
  },
  decode(bytes,limits={}){return __compiledHandle(identity,(portableFused?fused():privateCodec).decode(bytes,limits));},
  decodeCompact(bytes,limits={}){return __compiledHandle(identity,(compactFused?fused():privateCodec).compact().decode(bytes,limits));},
  decodeFused(bytes,limits={}){return __compiledHandle(identity,fused().decode(bytes,limits));},
  decodeCompactFused(bytes,limits={}){return __compiledHandle(identity,fused().compact().decode(bytes,limits));},
  encode(handle,limits={}){const value=__compiledUnwrap(handle,identity);return publicCodec.encodeWith(writer=>write(writer,value,false),limits);},
  encodeCompact(handle,limits={}){const value=__compiledUnwrap(handle,identity);return publicCodec.compact().encodeWith(writer=>write(writer,value,true),limits);},
  materialize(handle,limits={}){return copy(__compiledUnwrap(handle,identity),createValueCaptureBudget(limits),0);},
  builder(limits={}){return __valueBuilder(__constructorNodes(),constructorRoot,identity,limits);},
  reducer(factory){return __compiledReduction(factory,reductionRoot,reduce,identity);},
  visit(handle,sink,limits={}){
   const value=__compiledUnwrap(handle,identity),events=__compiledValueEvents(sink,limits);
   try{write(events.writer,value,false);}finally{events.close();}
  },
 });
 __compiledBindings.set(codec,{publicCodec,write,capture});return codec;
}

function __compiledEncodeResult(entry,value,limits,compact){
 const {publicCodec,write}=__compiledBindings.get(entry.result());
 return (compact?publicCodec.compact():publicCodec).encodeWith(writer=>write(writer,value,compact),limits);
}
let __constructorNodesValue;function __constructorNodes(){return __constructorNodesValue??=[{kind:"string",scalar:__privateCapture0},{kind:"u32",scalar:__privateCapture1},{kind:"enum",scalar:__privateCapture2},{kind:"enum",scalar:__privateCapture3},{kind:'option',patterns:[{bytes:5,label:"None",children:[],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,5);},make:values=>({None:null})},{bytes:5,label:"Some",children:[5],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,5);},make:values=>({Some:values[0]})}]},{kind:"enum",scalar:__privateCapture5},{kind:'record',fields:["recover"],patterns:[{bytes:4,label:"record",children:[7],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,4);},make:values=>({["recover"]:values[0]})}]},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[1],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:'record',fields:["state","field","open","start","row","rows","count","recovered"],patterns:[{bytes:4,label:"record",children:[3,0,9,1,10,11,1,7],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,4);},make:values=>({["state"]:values[0],["field"]:values[1],["open"]:values[2],["start"]:values[3],["row"]:values[4],["rows"]:values[5],["count"]:values[6],["recovered"]:values[7]})}]},{kind:"bool",scalar:__privateCapture9},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[0],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[10],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:'record',fields:["rows","recovered"],patterns:[{bytes:4,label:"record",children:[11,7],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,4);},make:values=>({["rows"]:values[0],["recovered"]:values[1]})}]},{kind:"f32",scalar:__privateCapture13},{kind:"list",patterns:[{bytes:8,label:"sequence",children:[15],childDepth:1,sequence:true,charge:(budget,depth)=>{budget.enter(depth,8);},make:values=>(values)}]},{kind:'record',fields:["text","delimiter","cells"],patterns:[{bytes:4,label:"record",children:[0,1,11],childDepth:1,charge:(budget,depth)=>{budget.enter(depth,4);},make:values=>({["text"]:values[0],["delimiter"]:values[1],["cells"]:values[2]})}]}];}
// Typed input construction only: plans contain literal constructor/capture
// functions emitted from source schemas. No source expression evaluator.
// All frames and private values remain in this closure; callers receive only
// an owned opaque handle after one complete, well-typed root is constructed.
const __constructorPaths=new WeakMap();
function __valueBuilder(nodes,root,identity,limits){
 const budget=createValueCaptureBudget(limits),frames=[];
 let result,targetNode,targetDepth,complete=false,closed=false,failed=false,busy=false;
 const fail=message=>{failed=true;frames.length=0;result=undefined;throw Error(message);};
 const active=()=>{if(failed||closed)throw Error('value builder is closed');};
 const expected=()=>{
  if(!frames.length){if(complete)fail('value builder root already complete');targetNode=root;targetDepth=0;return;}
  const frame=frames.at(-1),position=frame.values.length;
  if(!frame.pattern.sequence&&position>=frame.pattern.children.length)fail('value builder constructor is full');
  targetNode=frame.pattern.sequence?frame.pattern.children[0]:frame.pattern.children[position];targetDepth=frame.depth+frame.pattern.childDepth;
 };
 const accept=value=>{
  if(frames.length)frames.at(-1).values.push(value);
  else{result=value;complete=true;}
 };
 const execute=(operation,first,second)=>{
  active();if(busy)throw Error('value builder operation already active');busy=true;
  try{return operation(first,second);}catch(error){failed=true;frames.length=0;result=undefined;throw error;}finally{busy=false;}
 };
 // Compile and cache constructor paths independently of the session's values.
 const pathPlan=(choices,startNode,startDepth)=>{
   if(!Array.isArray(choices)||choices.length===0||choices.length>128)fail('invalid value builder path');
   let cache=__constructorPaths.get(nodes);if(!cache){cache=new WeakMap();__constructorPaths.set(nodes,cache);}
   let entries=cache.get(choices),saved=entries?.get(startNode);
   if(saved)return saved;
   const path=[],charges=[];let node=startNode,depth=startDepth;
   for(let i=0;i<choices.length;i++){
    const choice=choices[i],patterns=nodes[node].patterns;
    if(!Number.isSafeInteger(choice)||choice<0||!patterns||choice>=patterns.length)fail('invalid value builder constructor');
    const pattern=patterns[choice];charges.push([pattern,depth-startDepth]);path.push({pattern,node:nodes[node]});
    if(i+1<choices.length){if(pattern.sequence||pattern.children.length!==1)fail('value builder path is not unary');node=pattern.children[0];depth+=pattern.childDepth;}
   }
   const terminal=path.at(-1).pattern;
   // Compose literal constructor functions once per path, instead of
   // allocating and interpreting another recursive closure for every value.
   const compose=at=>{
    const {pattern,node}=path[at];
    if(node.flat){
     let index=0,last=at;
     while(last<path.length&&path[last].node.kind==='result'){
      if(path[last].pattern.sumBranch===0)break;
      index++;last++;
     }
     if(last===path.length){
      let make=args=>args[0];
      for(let i=path.length-1;i>=at;i--){const inner=make,p=path[i].pattern;make=args=>p.make([inner(args)]);}
      return make;
     }
     const payload=path[last].node.kind==='result'?(last+1<path.length?compose(last+1):args=>args[0]):compose(last);
     return args=>node.flat(index,payload(args));
    }
    const inner=at+1<path.length?compose(at+1):null;
    if(pattern.transparent)return inner??(args=>args[0]);
    return inner?args=>pattern.make([inner(args)]):pattern.make;
   };
   const make=compose(0);
   // Scalar paths use the same literal constructors, but pass the leaf
   // directly through erased records and flat sums. No temporary argument
   // array is needed at those edges. Ordinary constructors keep their array
   // calling convention; no private value reaches the public builder API.
   const composeScalar=at=>{
    const {pattern,node}=path[at];
    if(node.flat){
     let index=0,last=at;
     while(last<path.length&&path[last].node.kind==='result'){
      if(path[last].pattern.sumBranch===0)break;
      index++;last++;
     }
     if(last===path.length){
      let make=value=>value;
      for(let i=path.length-1;i>=at;i--){const inner=make,p=path[i].pattern;make=value=>p.make([inner(value)]);}
      return make;
     }
     const payload=path[last].node.kind==='result'?(last+1<path.length?composeScalar(last+1):value=>value):composeScalar(last);
     return value=>node.flat(index,payload(value));
    }
    const inner=at+1<path.length?composeScalar(at+1):null;
    if(pattern.transparent)return inner??(value=>value);
    return inner?value=>pattern.make([inner(value)]):value=>pattern.make([value]);
   };
   const scalar=composeScalar(0);
   const pattern={...terminal,make};
   // Only frozen arrays of ordinary data properties can key reusable plans.
   // Mutable arrays and frozen accessor arrays retain checked per-call paths.
   const fixed=charges.every(([p])=>Number.isSafeInteger(p.bytes)&&p.bytes>=4);
   const plan={pattern,scalar,charges,offset:depth-startDepth,bytes:fixed?charges.reduce((n,[p])=>n+p.bytes,0):null};
   let reusable=Object.isFrozen(choices);
   for(let i=0;reusable&&i<choices.length;i++){const field=Object.getOwnPropertyDescriptor(choices,String(i));reusable=!!field&&Object.hasOwn(field,'value');}
   if(reusable){
    if(!entries){entries=new Map();cache.set(choices,entries);}entries.set(startNode,plan);
   }
   return plan;
 };
 const chargePath=(plan,depth)=>{
  // Each emitted constructor consumes one node and a fixed frame/tag cost.
  // Only take the combined charge when every original check would succeed.
  // Replaying the original order retains the exact first failure otherwise.
  if(plan.bytes!==null&&depth+plan.offset<=budget.depth&&plan.charges.length<=budget.remaining&&budget.bytes+plan.bytes<=budget.limit){
   budget.remaining-=plan.charges.length;budget.bytes+=plan.bytes;return;
  }
  for(const [pattern,offset]of plan.charges)pattern.charge(budget,depth+offset);
 };
 // Operations are allocated once per session, and share expected-node
 // scratch only while the existing reentrancy guard is held.
 const openOperation=(choice)=>{
   expected();const node=nodes[targetNode];
   if(!Number.isSafeInteger(choice)||choice<0||!node.patterns||choice>=node.patterns.length)fail('invalid value builder constructor');
   const pattern=node.patterns[choice];pattern.charge(budget,targetDepth);
   frames.push({pattern,depth:targetDepth,values:[]});
 };
 const openPathOperation=(choices)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth);
   chargePath(plan,targetDepth);
   frames.push({pattern:plan.pattern,depth:targetDepth+plan.offset,values:[]});
 };
 const scalarPathOperation=(choices,value)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth),pattern=plan.pattern;
   if(pattern.sequence||pattern.children.length!==1)fail('value builder path has no scalar leaf');
   const capture=nodes[pattern.children[0]].scalar;
   if(typeof capture!=='function')fail('value builder path has no scalar leaf');
   chargePath(plan,targetDepth);
   const leaf=capture(value,budget,targetDepth+plan.offset+pattern.childDepth);
   accept(plan.scalar(leaf));
 };
 const emptyPathOperation=(choices)=>{
   expected();const plan=pathPlan(choices,targetNode,targetDepth),pattern=plan.pattern;
   if(pattern.sequence||pattern.children.length!==0)fail('value builder path is not empty');
   chargePath(plan,targetDepth);accept(pattern.make([]));
 };
 const scalarOperation=(value)=>{
   expected();const capture=nodes[targetNode].scalar;
   if(typeof capture!=='function')fail('value builder expects a constructor');
   accept(capture(value,budget,targetDepth));
 };
 const closeOperation=()=>{
   if(!frames.length)fail('value builder has no open constructor');
   const frame=frames.at(-1),pattern=frame.pattern,count=frame.values.length;
   if(!pattern.sequence&&count!==pattern.children.length||pattern.size!==undefined&&count!==pattern.size)fail('value builder constructor arity');
   if(pattern.sequence&&count>budget.limit)fail('wire sequence size');
   const value=pattern.make(frame.values);
   frames.pop();accept(value);
 };
 const finishOperation=()=>{
   if(frames.length||!complete)fail('value builder root is incomplete');
   closed=true;const handle=__compiledHandle(identity,result);result=undefined;return handle;
 };
 const api=Object.freeze({
  open(choice){return execute(openOperation,choice);},
  // Charge every source constructor even when unary paths share one frame.
  openPath(choices){return execute(openPathOperation,choices);},
  // Complete the path and leaf without intermediate session frames.
  scalarPath(choices,value){return execute(scalarPathOperation,choices,value);},
  emptyPath(choices){return execute(emptyPathOperation,choices);},
  scalar(value){return execute(scalarOperation,value);},
  close(){return execute(closeOperation);},
  finish(){return execute(finishOperation);},
  abort(){if(busy)throw Error('value builder operation already active');failed=true;frames.length=0;result=undefined;},
 });
 return api;
}
function __reduceValue0(value,r,b,d,c){b.enter(d,4);b.text(value);return r[0](value,c);}
function __reduceValue1(value,r,b,d,c){b.enter(d,8);return r[1](value,c);}
function __reduceValue2(value,r,b,d,c){b.enter(d,4);b.text(value);return r[2](value,c);}
function __reduceValue3(value,r,b,d,c){b.enter(d,4);b.text(value);return r[3](value,c);}
function __reduceValue4(value,r,b,d,c){b.enter(d,5);return Object.hasOwn(value,'None')&&value.None===null?r[4](0,null,c):r[4](1,__reduceValue5(value.Some,r,b,d+1,c),c);}
function __reduceValue5(value,r,b,d,c){b.enter(d,4);b.text(value);return r[5](value,c);}
function __reduceValue6(value,r,b,d,c){b.enter(d,4);return r[6](__reduceValue7(value["recover"],r,b,d+1,c),c);}
function __reduceValue7(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[7];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue1(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue8(value,r,b,d,c){b.enter(d,4);return r[8](__reduceValue3(value["state"],r,b,d+1,c),__reduceValue0(value["field"],r,b,d+1,c),__reduceValue9(value["open"],r,b,d+1,c),__reduceValue1(value["start"],r,b,d+1,c),__reduceValue10(value["row"],r,b,d+1,c),__reduceValue11(value["rows"],r,b,d+1,c),__reduceValue1(value["count"],r,b,d+1,c),__reduceValue7(value["recovered"],r,b,d+1,c),c);}
function __reduceValue9(value,r,b,d,c){b.enter(d,5);return r[9](value,c);}
function __reduceValue10(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[10];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue0(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue11(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[11];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue10(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue12(value,r,b,d,c){b.enter(d,4);return r[12](__reduceValue11(value["rows"],r,b,d+1,c),__reduceValue7(value["recovered"],r,b,d+1,c),c);}
function __reduceValue13(value,r,b,d,c){b.enter(d,8);return r[13]({F32Bits:__nfBits(value)},c);}
function __reduceValue14(value,r,b,d,c){b.enter(d,8);const n=value.length;if(n>b.remaining)throw Error('wire sequence size');const a=r[14];let out=a.start(n,c);for(let i=0;i<n;i++)out=a.step(out,__reduceValue15(value[i],r,b,d+1,c),i,c);return a.finish(out,c);}
function __reduceValue15(value,r,b,d,c){b.enter(d,4);return r[15](__reduceValue0(value["text"],r,b,d+1,c),__reduceValue1(value["delimiter"],r,b,d+1,c),__reduceValue11(value["cells"],r,b,d+1,c),c);}
let __reductionNodeCache;function __reductionNodes(){return __reductionNodeCache??=Object.freeze([Object.freeze({"children":Object.freeze([]),"kind":"string"}),Object.freeze({"children":Object.freeze([]),"kind":"u32"}),Object.freeze({"children":Object.freeze([]),"kind":"enum","name":"Class"}),Object.freeze({"children":Object.freeze([]),"kind":"enum","name":"State"}),Object.freeze({"children":Object.freeze([5]),"kind":"option"}),Object.freeze({"children":Object.freeze([]),"kind":"enum","name":"Move"}),Object.freeze({"children":Object.freeze([7]),"fields":Object.freeze(["recover"]),"kind":"record","name":"__Learned"}),Object.freeze({"children":Object.freeze([1]),"kind":"list"}),Object.freeze({"children":Object.freeze([3,0,9,1,10,11,1,7]),"fields":Object.freeze(["state","field","open","start","row","rows","count","recovered"]),"kind":"record","name":"Parser"}),Object.freeze({"children":Object.freeze([]),"kind":"bool"}),Object.freeze({"children":Object.freeze([0]),"kind":"list"}),Object.freeze({"children":Object.freeze([10]),"kind":"list"}),Object.freeze({"children":Object.freeze([11,7]),"fields":Object.freeze(["rows","recovered"]),"kind":"record","name":"Parsed"}),Object.freeze({"children":Object.freeze([]),"kind":"f32"}),Object.freeze({"children":Object.freeze([15]),"kind":"list"}),Object.freeze({"children":Object.freeze([0,1,11]),"fields":Object.freeze(["text","delimiter","cells"]),"kind":"record","name":"Labelled"})]);}
function __compiledNamed0(){return {};}
let __compiledCodec0Value;function __compiledCodec0(){return __compiledCodec0Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"1cdb97f14e69255770652db593f88ce0009f937c28d02381f37b2c643dc1470e","named":__compiledNamed0(),"root":{"kind":"string"}},__privateCapture0,__privateWireValue0,__privateWireWrite0,__compiledOwnedValue0,0,0,__reduceValue0,false,false);}
let __compiledCodec1Value;function __compiledCodec1(){return __compiledCodec1Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"51f75af7953a9d922f9ada927ffd8d0c8c476597ed69294f0a0425f75b052cff","named":__compiledNamed0(),"root":{"kind":"u32"}},__privateCapture1,__privateWireValue1,__privateWireWrite1,__compiledOwnedValue1,1,1,__reduceValue1,false,false);}
let __compiledCodec2Value;function __compiledCodec2(){return __compiledCodec2Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"489354a14c6fe1cb557d9f350cb769497fcec7a051e4547683101a9f67bc5d7c","named":__compiledNamed0(),"root":{"kind":"enum","name":"Class","variants":["Class.Quote","Class.Delimiter","Class.Newline","Class.Return","Class.Other","Class.End"]}},__privateCapture2,__privateWireValue2,__privateWireWrite2,__compiledOwnedValue2,2,2,__reduceValue2,false,false);}
let __compiledCodec3Value;function __compiledCodec3(){return __compiledCodec3Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"ddca5b410d08870e4a4770041dcfbc8fe8beca66e13f33f4d053a444ffb8d60a","named":__compiledNamed0(),"root":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},__privateCapture3,__privateWireValue4,__privateWireWrite3,__compiledOwnedValue3,3,3,__reduceValue3,false,false);}
let __compiledCodec4Value;function __compiledCodec4(){return __compiledCodec4Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"51b76d00b797b6ef6a334b11c1d7f2b5aa2026e2b00b34c99b4bb3c099103ccb","named":__compiledNamed0(),"root":{"element":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]},"kind":"option"}},__privateCapture4,__privateWireValue5,__privateWireWrite4,__compiledOwnedValue4,4,4,__reduceValue4,false,false);}
let __compiledCodec5Value;function __compiledCodec5(){return __compiledCodec5Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"b1a10c6e2ca66b8d1b62f902585b8f3af103c84c9641eeaf67eda6b8eb751dc4","named":__compiledNamed0(),"root":{"fields":[{"name":"recover","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"__Learned"}},__privateCapture6,__privateWireValue8,__privateWireWrite6,__compiledOwnedValue6,6,6,__reduceValue6,false,false);}
let __compiledCodec6Value;function __compiledCodec6(){return __compiledCodec6Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"ad825aca758761cf353e741f5dd65dbe3f819ec11df25725e4dfeee5f4956f39","named":__compiledNamed0(),"root":{"kind":"enum","name":"Move","variants":["Move.Text","Move.Quoted","Move.Open","Move.Close","Move.Field","Move.Row","Move.Skip","Move.Requote"]}},__privateCapture5,__privateWireValue6,__privateWireWrite5,__compiledOwnedValue5,5,5,__reduceValue5,false,false);}
let __compiledCodec7Value;function __compiledCodec7(){return __compiledCodec7Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"a77584221072fb3001a8b41de54ee33eeddb261219d816f4d4128481ab54b741","named":__compiledNamed0(),"root":{"fields":[{"name":"state","type":{"kind":"enum","name":"State","variants":["State.FieldStart","State.Unquoted","State.Quoted","State.AfterQuote"]}},{"name":"field","type":{"kind":"string"}},{"name":"open","type":{"kind":"bool"}},{"name":"start","type":{"kind":"u32"}},{"name":"row","type":{"element":{"kind":"string"},"kind":"list"}},{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"count","type":{"kind":"u32"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parser"}},__privateCapture8,__privateWireValue11,__privateWireWrite8,__compiledOwnedValue8,8,8,__reduceValue8,false,false);}
let __compiledCodec8Value;function __compiledCodec8(){return __compiledCodec8Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"b963f54b95ad488fe0112237eb39f7f8fcdd4d4c545cf08d5280dfa700a108c6","named":__compiledNamed0(),"root":{"fields":[{"name":"rows","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},{"name":"recovered","type":{"element":{"kind":"u32"},"kind":"list"}}],"kind":"record","name":"Parsed"}},__privateCapture12,__privateWireValue17,__privateWireWrite12,__compiledOwnedValue12,12,12,__reduceValue12,false,false);}
let __compiledCodec9Value;function __compiledCodec9(){return __compiledCodec9Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"89397b5b57c43680475808976de38ee478b513bea166fe88717fc1071ee758d1","named":__compiledNamed0(),"root":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}},__privateCapture11,__privateWireValue14,__privateWireWrite11,__compiledOwnedValue11,11,11,__reduceValue11,false,false);}
let __compiledCodec10Value;function __compiledCodec10(){return __compiledCodec10Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"fde3b27ba939906c22dbea906c407580e89648dd4d5a55c4f4001e45157ebe45","named":__compiledNamed0(),"root":{"kind":"f32"}},__privateCapture13,__privateWireValue19,__privateWireWrite13,__compiledOwnedValue13,13,13,__reduceValue13,false,false);}
let __compiledCodec11Value;function __compiledCodec11(){return __compiledCodec11Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"16fa4bdd6be00a4fc4533039b3d378225d6cd59fa1c323cc4d621654b3bd829d","named":__compiledNamed0(),"root":{"element":{"fields":[{"name":"text","type":{"kind":"string"}},{"name":"delimiter","type":{"kind":"u32"}},{"name":"cells","type":{"element":{"element":{"kind":"string"},"kind":"list"},"kind":"list"}}],"kind":"record","name":"Labelled"},"kind":"list"}},__privateCapture14,__privateWireValue21,__privateWireWrite14,__compiledOwnedValue14,14,14,__reduceValue14,false,false);}
let __compiledCodec12Value;function __compiledCodec12(){return __compiledCodec12Value??=__compiledCodec({"format":"ink-value-wire-v1","identity":"32f3d3b2f14a1a5d5ed940c0f1126e8a0b1b1f76ff20ac48fac23528d7033176","named":__compiledNamed0(),"root":{"kind":"bool"}},__privateCapture9,__privateWireValue12,__privateWireWrite9,__compiledOwnedValue9,9,9,__reduceValue9,false,false);}
const __compiledEntries=new Map([["classify",{index:0,params:[__compiledCodec0,__compiledCodec1,__compiledCodec1],result:__compiledCodec2,destination:null,arguments:__privateWireValue3,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["authored",{index:1,params:[__compiledCodec3,__compiledCodec2],result:__compiledCodec4,destination:null,arguments:__privateWireValue7,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["decide",{index:2,params:[__compiledCodec3,__compiledCodec2,__compiledCodec5],result:__compiledCodec6,destination:null,arguments:__privateWireValue10,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["flush",{index:3,params:[__compiledCodec7,__compiledCodec0,__compiledCodec1],result:__compiledCodec0,destination:null,arguments:__privateWireValue15,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["advance",{index:4,params:[__compiledCodec7,__compiledCodec0,__compiledCodec1,__compiledCodec1,__compiledCodec5],result:__compiledCodec7,destination:null,arguments:__privateWireValue16,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false,false,false],precondition:null}],["parse_text",{index:5,params:[__compiledCodec0,__compiledCodec1,__compiledCodec5],result:__compiledCodec8,destination:null,arguments:__privateWireValue18,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["row_errors",{index:6,params:[__compiledCodec9,__compiledCodec9],result:__compiledCodec10,destination:null,arguments:__privateWireValue20,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["recovery",{index:7,params:[__compiledCodec11,__compiledCodec5],result:__compiledCodec10,destination:null,arguments:__privateWireValue23,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false],precondition:null}],["__learn_ord_recover_0",{index:8,params:[__compiledCodec3],result:__compiledCodec1,destination:null,arguments:__privateWireValue24,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false],precondition:null}],["__learn_ord_recover_1",{index:9,params:[__compiledCodec2],result:__compiledCodec1,destination:null,arguments:__privateWireValue25,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false],precondition:null}],["__learn_value_recover",{index:10,params:[__compiledCodec1],result:__compiledCodec6,destination:null,arguments:__privateWireValue26,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false],precondition:null}],["__hole_recover",{index:11,params:[__compiledCodec3,__compiledCodec2,__compiledCodec5],result:__compiledCodec6,destination:null,arguments:__privateWireValue27,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false,false,false],precondition:null}],["__learn_valid",{index:12,params:[__compiledCodec5],result:__compiledCodec12,destination:null,arguments:__privateWireValue28,argumentCodecs:[null,null],boundaryReaders:[false,false],onlyTypeGuards:false,needsInvariants:[false],precondition:null}]]);

export const compiledValues=Object.freeze(Object.fromEntries([...__compiledEntries].map(([name,entry])=>[name,Object.freeze({get params(){return Object.freeze(entry.params.map(codec=>codec()));},get result(){return entry.result();}})])));
function __compiledValidate(entry,owned){
 const values=owned.map(v=>v.value);
 const established=entry.onlyTypeGuards&&entry.needsInvariants.every((needed,i)=>!needed||owned[i].guaranteed);
 if(entry.precondition!==null&&!established){
  if(__implementations[entry.precondition](...values)!==true)throw Error('contract precondition failed');
  for(let i=0;i<owned.length;i++)if(entry.needsInvariants[i])owned[i].guaranteed=true;
 }
 return values;
}
export function callCompiled(name,args){
 const entry=__compiledEntries.get(name);
 if(!entry||!Array.isArray(args)||args.length!==entry.params.length)throw Error('unsupported compiled call');
 const owned=entry.params.map((codec,i)=>__compiledEntry(args[i],codec().identity)),values=__compiledValidate(entry,owned);
 // Checked source outputs satisfy their declared value interfaces. Private
 // handles expose only detached copies and never retain mutable host inputs.
 return __compiledHandle(entry.result().identity,__implementations[entry.index](...values),true);
}

// Explicit sealed-value partial application. Each token owns a bounded set of
// lexical caches; no mutable host object, global memo table or error is retained.
const __preparedCompiled=new WeakMap();
export function prepareCompiled(name,bindings){
 const entry=__compiledEntries.get(name);
 if(!entry||!Array.isArray(bindings)||bindings.length>entry.params.length)throw Error('unsupported prepared compiled call');
 const captured=new Array(entry.params.length),fixed=new Array(entry.params.length).fill(false);
 for(const binding of bindings){
  if(!Array.isArray(binding)||binding.length!==2)throw Error('prepared compiled binding');
  const [index,handle]=binding;
  if(!Number.isInteger(index)||index<0||index>=fixed.length||fixed[index])throw Error('prepared compiled parameter');
  captured[index]=__compiledEntry(handle,entry.params[index]().identity);fixed[index]=true;
 }
 const remaining=fixed.flatMap((yes,i)=>yes?[]:[i]);
 const factory=__preparedFactories.get(entry.index);
 const run=factory?factory(fixed):__implementations[entry.index];
 const token=Object.freeze(Object.create(null));
 __preparedCompiled.set(token,{entry,captured,remaining,run});return token;
}
export function callPreparedCompiled(token,args){
 const prepared=__preparedCompiled.get(token);
 if(!prepared||!Array.isArray(args)||args.length!==prepared.remaining.length)throw Error('invalid prepared compiled call');
 const {entry,captured,remaining,run}=prepared,owned=captured.slice();
 for(let i=0;i<remaining.length;i++){const at=remaining[i];owned[at]=__compiledEntry(args[i],entry.params[at]().identity);}
 const values=__compiledValidate(entry,owned);
 return __compiledHandle(entry.result().identity,run(...values),true);
}
// The caller owns sufficiently large, disjoint destination storage. This is
// the trusted Into ABI, not a bounded wire/materialization operation. Private
// retained containers never escape: structured elements are deeply detached.
const __destinationBudget=Object.freeze({remaining:Infinity,enter(){},text(){}});
export function callPreparedCompiledInto(token,args,destination){
 const prepared=__preparedCompiled.get(token);
 if(!prepared||!prepared.entry.destination||!Array.isArray(args)||args.length!==prepared.remaining.length)throw Error('invalid prepared compiled destination call');
 const {entry,captured,remaining,run}=prepared,owned=captured.slice();
 for(let i=0;i<remaining.length;i++){const at=remaining[i];owned[at]=__compiledEntry(args[i],entry.params[at]().identity);}
 const values=__compiledValidate(entry,owned),into=entry.destination;
 // Ordinary scalar-list bodies can write the terminal stage directly. A
 // residual body keeps its lexical caches and copies only its final elements.
 if(into.direct&&run===__implementations[entry.index])return into.direct(...values,destination);
 const result=run(...values),n=result.length;
 for(let i=0;i<n;i++)destination[i]=into.copy(result[i],__destinationBudget,0);
 return n;
}
const __intoImplementations=[null,null,null,null,null,null,null,null,null,null,null,null,null];
export const functionsInto=Object.freeze(Object.fromEntries([]));
export function callInto(name,args,destination){return functionsInto[name](...args,destination);}

function __preparedPart(mask,path){
 for(const field of path){
  if(mask===true)return true;
  if(!mask || typeof mask!=="object")return false;
  mask=Object.hasOwn(mask.fields,field)?mask.fields[field]:false;
 }
 return mask;
}
function __preparedStable(mask,path){const part=__preparedPart(mask,path);return part===true || (!!part && part.all===true);}
function __prepareFn4(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[]))))return __fn4;const v350=__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[]);
let v349=false,v348;
const v354=__preparedStable(fixed[0],["state"])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[])&&__preparedStable(fixed[4],[]);
let v353=false,v352;
const v360=__preparedStable(fixed[0],["state"])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[]);
let v359=false,v358;
const v370=__preparedStable(fixed[0],["count"])&&__preparedStable(fixed[0],["recovered"])&&__preparedStable(fixed[0],["state"])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[]);
let v369=false,v368;
const v482=__preparedStable(fixed[0],["field"])&&__preparedStable(fixed[0],["open"])&&__preparedStable(fixed[0],["row"])&&__preparedStable(fixed[0],["start"])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[3],[]);
let v481=false,v480;
const v519=__preparedStable(fixed[0],["field"])&&__preparedStable(fixed[0],["open"])&&__preparedStable(fixed[0],["row"])&&__preparedStable(fixed[0],["rows"])&&__preparedStable(fixed[0],["start"])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[])&&__preparedStable(fixed[3],[]);
let v518=false,v517;
return function(v342,v343,v344,v345,v346){let v347;if(v350&&v349){v347=v348;}else{
v347=__fn0(v343,v345,v344);if(v350){v348=v347;v349=true;}}
let v351;if(v354&&v353){v351=v352;}else{
const v355=v342["state"];
const v356=v347;
v351=__fn2(v355,v356,v346);if(v354){v352=v351;v353=true;}}
let v357;if(v360&&v359){v357=v358;}else{
const v361=v342["state"];
const v362=v347;
const v363=__fn1(v361,v362);
let v364;if(Object.hasOwn(v363,"Some")){
const v365=v363["Some"];
v364=false;}else{
const v366=null;
v364=true;}
v357=v364;if(v360){v358=v357;v359=true;}}
let v367;if(v370&&v369){v367=v368;}else{
const v371=v357;
let v372;if(v371){
const v373=v342["recovered"];
const v374=v342["count"];
const v375=[v374];
const v376=v373.length;
const v377=v375.length;
const v378=new Array(v376+v377);
for(let v379=0;v379<v376;v379++){v378[v379]=v373[v379];}
for(let v380=0;v380<v377;v380++){v378[v376+v380]=v375[v380];}
v372=v378;}else{
v372=v342["recovered"];}
v367=v372;if(v370){v368=v367;v369=true;}}
const v381=v351;
const v382="Move.Text";
const v383=(v381===v382);
let v384=v383;if(!v384){
const v385=v351;
const v386="Move.Quoted";
v384=(v385===v386);}
const v387=v384;
let v388;if(v387){
const v390=v351;
const v391="Move.Text";
const v392=(v390===v391);
let v393;if(v392){
v393="State.Unquoted";}else{
v393="State.Quoted";}
const v389=v393;
const v394=true;
const v396=v342["open"];
let v397;if(v396){
v397=v342["start"];}else{
v397=v345;}
const v395=v397;
const v398=v367;
const v399=v389;
const v400=v342["field"];
const v401=v394;
const v402=v395;
const v403=v342["row"];
const v404=v342["rows"];
const v405=v342["count"];
const v406=v398;
v388=({["state"]:v399,["field"]:v400,["open"]:v401,["start"]:v402,["row"]:v403,["rows"]:v404,["count"]:v405,["recovered"]:v406});}else{
const v407=__fn3(v342,v343,v345);
const v408=v351;
const v409="Move.Requote";
const v410=(v408===v409);
let v411;if(v410){
const v412="State.Quoted";
const v413=__ink_concat(v407,"\"");
const v414=true;
const v415=v345;
const v416=v367;
const v417=v412;
const v418=v413;
const v419=v414;
const v420=v415;
const v421=v342["row"];
const v422=v342["rows"];
const v423=v342["count"];
const v424=v416;
v411=({["state"]:v417,["field"]:v418,["open"]:v419,["start"]:v420,["row"]:v421,["rows"]:v422,["count"]:v423,["recovered"]:v424});}else{
const v425=v351;
const v426="Move.Open";
const v427=(v425===v426);
let v428;if(v427){
const v429="State.Quoted";
const v430=v407;
const v431=false;
const v432=v367;
const v433=v429;
const v434=v430;
const v435=v431;
const v436=v342["start"];
const v437=v342["row"];
const v438=v342["rows"];
const v439=v342["count"];
const v440=v432;
v428=({["state"]:v433,["field"]:v434,["open"]:v435,["start"]:v436,["row"]:v437,["rows"]:v438,["count"]:v439,["recovered"]:v440});}else{
const v441=v351;
const v442="Move.Close";
const v443=(v441===v442);
let v444;if(v443){
const v445="State.AfterQuote";
const v446=v407;
const v447=false;
const v448=v367;
const v449=v445;
const v450=v446;
const v451=v447;
const v452=v342["start"];
const v453=v342["row"];
const v454=v342["rows"];
const v455=v342["count"];
const v456=v448;
v444=({["state"]:v449,["field"]:v450,["open"]:v451,["start"]:v452,["row"]:v453,["rows"]:v454,["count"]:v455,["recovered"]:v456});}else{
const v457=v351;
const v458="Move.Skip";
const v459=(v457===v458);
let v460;if(v459){
const v461=v407;
const v462=false;
const v463=v367;
const v464=v342["state"];
const v465=v461;
const v466=v462;
const v467=v342["start"];
const v468=v342["row"];
const v469=v342["rows"];
const v470=v342["count"];
const v471=v463;
v460=({["state"]:v464,["field"]:v465,["open"]:v466,["start"]:v467,["row"]:v468,["rows"]:v469,["count"]:v470,["recovered"]:v471});}else{
const v472=v351;
const v473="Move.Field";
const v474=(v472===v473);
let v475;if(v474){
const v476="State.FieldStart";
const v477="";
const v478=false;
let v479;if(v482&&v481){v479=v480;}else{
const v483=v342["row"];
const v484=v407;
const v485=[v484];
const v486=v483.length;
const v487=v485.length;
const v488=new Array(v486+v487);
for(let v489=0;v489<v486;v489++){v488[v489]=v483[v489];}
for(let v490=0;v490<v487;v490++){v488[v486+v490]=v485[v490];}
v479=v488;if(v482){v480=v479;v481=true;}}
const v491=v367;
const v492=v476;
const v493=v477;
const v494=v478;
const v495=v342["start"];
const v496=v479;
const v497=v342["rows"];
const v498=v342["count"];
const v499=v491;
v475=({["state"]:v492,["field"]:v493,["open"]:v494,["start"]:v495,["row"]:v496,["rows"]:v497,["count"]:v498,["recovered"]:v499});}else{
const v501=v347;
const v502="Class.End";
const v503=(v501===v502);
let v504=v503;if(v504){
const v505=(v342["row"]).length;
const v506=0;
v504=(v505===v506);}
const v507=v504;
let v508=v507;if(v508){
const v509=v407;
const v510="";
v508=(v509===v510);}
const v500=v508;
const v511=[];
const v512="State.FieldStart";
const v513="";
const v514=false;
const v515=v511;
let v516;if(v519&&v518){v516=v517;}else{
const v520=v500;
let v521;if(v520){
v521=v342["rows"];}else{
const v522=v342["rows"];
const v523=v342["row"];
const v524=v407;
const v525=[v524];
const v526=v523.length;
const v527=v525.length;
const v528=new Array(v526+v527);
for(let v529=0;v529<v526;v529++){v528[v529]=v523[v529];}
for(let v530=0;v530<v527;v530++){v528[v526+v530]=v525[v530];}
const v531=[v528];
const v532=v522.length;
const v533=v531.length;
const v534=new Array(v532+v533);
for(let v535=0;v535<v532;v535++){v534[v535]=v522[v535];}
for(let v536=0;v536<v533;v536++){v534[v532+v536]=v531[v536];}
v521=v534;}
v516=v521;if(v519){v517=v516;v518=true;}}
const v538=v500;
let v539;if(v538){
v539=v342["count"];}else{
const v540=v342["count"];
const v541=1;
v539=(((v540) + (v541)) >>> 0);}
const v537=v539;
const v542=v367;
const v543=v512;
const v544=v513;
const v545=v514;
const v546=v342["start"];
const v547=v515;
const v548=v516;
const v549=v537;
const v550=v542;
v475=({["state"]:v543,["field"]:v544,["open"]:v545,["start"]:v546,["row"]:v547,["rows"]:v548,["count"]:v549,["recovered"]:v550});}
v460=v475;}
v444=v460;}
v428=v444;}
v411=v428;}
v388=v411;}
return v388;};}
function __prepareFn5(fixed,depth=0){if(depth>=16||!((true)))return __fn5;let v559=false,v558;
const v571=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[])&&__preparedStable(fixed[2],[]);
let v570=false,v569;
return function(v551,v552,v553){const v554=[];
const v555=[];
const v556=[];
let v557;if(true&&v559){v557=v558;}else{
const v560="State.FieldStart";
const v561="";
const v562=false;
const v563=0;
const v564=v555;
const v565=v554;
const v566=0;
const v567=v556;
v557=({["state"]:v560,["field"]:v561,["open"]:v562,["start"]:v563,["row"]:v564,["rows"]:v565,["count"]:v566,["recovered"]:v567});if(true){v558=v557;v559=true;}}
let v568;if(v571&&v570){v568=v569;}else{
const v572=__ink_byte_len(v551);
const v573=1;
const v574=(((v572) + (v573)) >>> 0);
const v575=v557;
let v576=v575["state"];
let v577=v575["field"];
let v578=v575["open"];
let v579=v575["start"];
let v580=v575["row"];
let v581=v575["rows"];
let v582=v575["count"];
let v583=v575["recovered"];
for(let v585=0;v585<v574;v585++){
if(false)break;
const v586=(v585>>>0);
const v587=v576;
const v588=v577;
const v589=v578;
const v590=v579;
const v591=v580;
const v592=v581;
const v593=v582;
const v594=v583;
const v597=__fn0(v551,v586,v552);
const v598=__fn2(v587,v597,v553);
const v599=__fn1(v587,v597);
let v600;if(Object.hasOwn(v599,"Some")){
const v601=v599["Some"];
v600=false;}else{
const v602=null;
v600=true;}
const v603=v600;
let v604;if(v603){
const v605=[v593];
const v606=v594.length;
const v607=v605.length;
const v608=new Array(v606+v607);
for(let v609=0;v609<v606;v609++){v608[v609]=v594[v609];}
for(let v610=0;v610<v607;v610++){v608[v606+v610]=v605[v610];}
v604=v608;}else{
v604=v594;}
const v611=v604;
const v612="Move.Text";
const v613=(v598===v612);
let v614=v613;if(!v614){
const v615="Move.Quoted";
v614=(v598===v615);}
let v616;
let v617;
let v618;
let v619;
let v620;
let v621;
let v622;
let v623;
if(v614){
const v624="Move.Text";
let v625;if((v598===v624)){
v625="State.Unquoted";}else{
v625="State.Quoted";}
const v626=v625;
const v627=true;
let v628;if(v589){
v628=v590;}else{
v628=v586;}
const v629=v628;
v616=v626;
v617=v588;
v618=v627;
v619=v629;
v620=v591;
v621=v592;
v622=v593;
v623=v611;
}else{
let v631;if(v589){
const v632=__ink_slice(v551,v590,v586);
let v633;if(Object.hasOwn(v632,"Some")){
const v634=v632["Some"];
v633=v634;}else{
const v635=null;
v633="";}
v631=__ink_concat(v588,v633);}else{
v631=v588;}
const v636=v631;
const v637="Move.Requote";
let v638;
let v639;
let v640;
let v641;
let v642;
let v643;
let v644;
let v645;
if((v598===v637)){
const v646="State.Quoted";
const v647=__ink_concat(v636,"\"");
const v648=true;
v638=v646;
v639=v647;
v640=v648;
v641=v586;
v642=v591;
v643=v592;
v644=v593;
v645=v611;
}else{
const v649="Move.Open";
let v650;
let v651;
let v652;
let v653;
let v654;
let v655;
let v656;
let v657;
if((v598===v649)){
const v658="State.Quoted";
const v659=false;
v650=v658;
v651=v636;
v652=v659;
v653=v590;
v654=v591;
v655=v592;
v656=v593;
v657=v611;
}else{
const v660="Move.Close";
let v661;
let v662;
let v663;
let v664;
let v665;
let v666;
let v667;
let v668;
if((v598===v660)){
const v669="State.AfterQuote";
const v670=false;
v661=v669;
v662=v636;
v663=v670;
v664=v590;
v665=v591;
v666=v592;
v667=v593;
v668=v611;
}else{
const v671="Move.Skip";
let v672;
let v673;
let v674;
let v675;
let v676;
let v677;
let v678;
let v679;
if((v598===v671)){
const v680=false;
v672=v587;
v673=v636;
v674=v680;
v675=v590;
v676=v591;
v677=v592;
v678=v593;
v679=v611;
}else{
const v681="Move.Field";
let v682;
let v683;
let v684;
let v685;
let v686;
let v687;
let v688;
let v689;
if((v598===v681)){
const v690="State.FieldStart";
const v691="";
const v692=false;
const v693=[v636];
const v694=v591.length;
const v695=v693.length;
const v696=new Array(v694+v695);
for(let v697=0;v697<v694;v697++){v696[v697]=v591[v697];}
for(let v698=0;v698<v695;v698++){v696[v694+v698]=v693[v698];}
v682=v690;
v683=v691;
v684=v692;
v685=v590;
v686=v696;
v687=v592;
v688=v593;
v689=v611;
}else{
const v699="Class.End";
const v700=(v597===v699);
let v701=v700;if(v701){
const v702=(v591).length;
const v703=0;
v701=(v702===v703);}
const v704=v701;
let v705=v704;if(v705){
const v706="";
v705=(v636===v706);}
const v707=v705;
const v708=[];
const v709="State.FieldStart";
const v710="";
const v711=false;
let v712;if(v707){
v712=v592;}else{
const v713=[v636];
const v714=v591.length;
const v715=v713.length;
const v716=new Array(v714+v715);
for(let v717=0;v717<v714;v717++){v716[v717]=v591[v717];}
for(let v718=0;v718<v715;v718++){v716[v714+v718]=v713[v718];}
const v719=[v716];
const v720=v592.length;
const v721=v719.length;
const v722=new Array(v720+v721);
for(let v723=0;v723<v720;v723++){v722[v723]=v592[v723];}
for(let v724=0;v724<v721;v724++){v722[v720+v724]=v719[v724];}
v712=v722;}
const v725=v712;
let v726;if(v707){
v726=v593;}else{
const v727=1;
v726=(((v593) + (v727)) >>> 0);}
const v728=v726;
v682=v709;
v683=v710;
v684=v711;
v685=v590;
v686=v708;
v687=v725;
v688=v728;
v689=v611;
}
v672=v682;
v673=v683;
v674=v684;
v675=v685;
v676=v686;
v677=v687;
v678=v688;
v679=v689;
}
v661=v672;
v662=v673;
v663=v674;
v664=v675;
v665=v676;
v666=v677;
v667=v678;
v668=v679;
}
v650=v661;
v651=v662;
v652=v663;
v653=v664;
v654=v665;
v655=v666;
v656=v667;
v657=v668;
}
v638=v650;
v639=v651;
v640=v652;
v641=v653;
v642=v654;
v643=v655;
v644=v656;
v645=v657;
}
v616=v638;
v617=v639;
v618=v640;
v619=v641;
v620=v642;
v621=v643;
v622=v644;
v623=v645;
}
v576=v616;
v577=v617;
v578=v618;
v579=v619;
v580=v620;
v581=v621;
v582=v622;
v583=v623;
}
v568=({["state"]:v576,["field"]:v577,["open"]:v578,["start"]:v579,["row"]:v580,["rows"]:v581,["count"]:v582,["recovered"]:v583});if(v571){v569=v568;v570=true;}}
const v729=v568;
const v730=v729["rows"];
const v731=v568;
const v732=v731["recovered"];
return ({["rows"]:v730,["recovered"]:v732});};}
function __prepareFn6(fixed,depth=0){if(depth>=16||!((__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[]))))return __fn6;const v739=__preparedStable(fixed[0],[])&&__preparedStable(fixed[1],[]);
let v738=false,v737;
return function(v733,v734){const v735=[];
let v736;if(v739&&v738){v736=v737;}else{
const v740=0;
const v741=0.0;
let v742=({["at"]:v740,["errors"]:v741});
for(let v743=0;v743<v734.length;v743++){
const v744=v734[v743];
const v745=v742;
const v746=v745["at"];
const v747=1;
const v748=(((v746) + (v747)) >>> 0);
const v749=v742;
const v750=v749["errors"];
const v751=v742;
const v752=v751["at"];
let v753;if(v752<v733.length){v753=v733[v752];}else{
v753=v735;}
const v754=v753;
let v755;if(__valueEqual0(v754,v744)){
v755=0.0;}else{
v755=1.0;}
const v756=v755;
const v757=Math.fround(__nfNumber(v750) + __nfNumber(v756));
v742=({["at"]:v748,["errors"]:v757});
}
v736=v742;if(v739){v737=v736;v738=true;}}
const v758=v736;
const v759=v758["errors"];
const v760=(v733).length;
const v761=(v734).length;
let v762;if((v760===v761)){
v762=0.0;}else{
v762=1.0;}
const v763=v762;
return Math.fround(__nfNumber(v759) + __nfNumber(v763));};}
function __prepareFn7(fixed,depth=0){if(depth>=16||!((true)))return __fn7;const v775=depth<15&&__preparedFactories.has(5)&&((true));
let v773;
return function(v764,v765){let v766=0.0;
for(let v767=0;v767<v764.length;v767++){
const v768=v764[v767];
const v769=v766;
const v771=v768["text"];
const v772=v768["delimiter"];
let v776;if(v775){if(!v773){const v774=__preparedFactories.get(5);v773=v774([false,false,fixed[1]],depth+1);}v776=v773(v771,v772,v765);}else{v776=__fn5(v771,v772,v765);}
const v777=v776;
const v779=v777["rows"];
const v781=v768["cells"];
const v783=__fn6(v779,v781);
v766=Math.fround(__nfNumber(v769) + __nfNumber(v783));
}
return v766;};}
const __preparedFactories=new Map([[4,__prepareFn4],[5,__prepareFn5],[6,__prepareFn6],[7,__prepareFn7]]);
