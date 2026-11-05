'use strict';
let localCustomers=[],customers=[],options={},selected=null,form={},visits=[],db=null,syncing=false,draftTimer=null,legacySchema=null;
const $=id=>document.getElementById(id),fa=n=>Number(n).toLocaleString('fa-IR'),normal=s=>String(s??'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\u200c/g,' ').trim().toLowerCase();
const COLS=[['G','تاریخ مراجعه','date'],['H','وضعیت پودیوم'],['I','علت نبود پودیوم'],['J','اقدام در صورت جمع‌آوری'],['K','وضعیت آسیب‌دیدگی'],['L','کیفیت محل استقرار'],['M','اقدام اصلاحی استقرار'],['N','وضعیت چیدمان'],['O','اقدام اصلاحی چیدمان'],['P','تناسب مشتری با طرح'],['Q','وضعیت رسید'],['R','تصمیم در صورت عدم تناسب'],['S','نیاز به تغییر طرح'],['T','طرح انتقال یافته'],['U','وضعیت ویزیت'],['V','علت ویزیت ناقص / انجام‌نشدن'],['W','مشکل اصلی'],['X','مشکل دوم'],['Y','وضعیت شلف'],['Z','نوع فروشگاه'],['AA','تغییر در لیست / دسته مشتری'],['AB','سفارش اخذشده (کارتن)','number'],['AC','تخفیف توافق‌شده (%)','percent'],['AD','اقدام بعدی'],['AE','مسئول پیگیری'],['AF','توضیحات','textarea']];
function active(k){const val=c=>normal(form[c]);switch(k){case 'I':return val('H')==='ناموجود';case 'J':return val('I').includes('توسط مشتری');case 'K':return val('I')==='آسیب دیده';case 'L':case 'N':case 'P':case 'Q':case 'S':return val('H')==='موجود';case 'M':return val('H')==='موجود'&&val('L')==='نامناسب';case 'O':return val('H')==='موجود'&&val('N')==='نامناسب';case 'R':return val('P')==='نامتناسب با طرح';case 'T':return val('S')==='دارد';case 'V':return val('U')!==''&&val('U')!=='ویزیت کامل';case 'X':return val('W')!==''&&val('W')!=='بدون مشکل';case 'AE':return val('AD')!==''&&val('AD')!=='بدون نیاز به اقدام';default:return true}}
async function saveDraft(){if(!db)return;await put('config',{key:'draft',value:selected?{customer_id:selected._id,customer:selected.is_new?{...selected}:null,form:{...form}}:null})}
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>saveDraft().catch(console.warn),350)}
async function restoreDraft(saved){
 const draft=saved.draft;if(!draft?.customer_id)return;
 const c=customerPool().find(x=>x._id===draft.customer_id)||(draft.customer?.is_new?draft.customer:null);
 if(!c)return;selected=c;form=draft.form||{};renderCustomer();renderForm();
}
function customerPool(){return [...customers,...localCustomers.filter(c=>!customers.some(ref=>ref._id===c._id))]}
function openDB(){return new Promise((resolve,reject)=>{let r=indexedDB.open('payu-offline',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('visits'))d.createObjectStore('visits',{keyPath:'id'});if(!d.objectStoreNames.contains('config'))d.createObjectStore('config',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function put(name,value){return new Promise((yes,no)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(value);tx.oncomplete=()=>yes();tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error||Error('ذخیره انجام نشد'))})}
function getAll(name){return new Promise((yes,no)=>{const r=store(name).getAll();r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),4000)}
function esc(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function tab(name){document.querySelectorAll('.view').forEach(e=>e.classList.toggle('hidden',e.id!==name));document.querySelectorAll('.navbtn').forEach(e=>{e.classList.toggle('selected',e.dataset.tab===name);if(e.dataset.tab===name)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current')});$('pageTitle').textContent={visit:'بازدید جدید',reports:'گزارش بازدیدها',settings:'تنظیمات سامانه'}[name];$('pageSubtitle').textContent={visit:'مشتری را انتخاب کنید و بازدید را ثبت کنید.',reports:'سابقه بازدیدهای این دستگاه و فایل خروجی اکسل',settings:'اطلاعات ویزیتور و اتصال به سرور مرکزی'}[name];if(name==='reports')renderReports()}
function searchKey(value){return normal(value).replace(/[\u064b-\u065f\u0670\u0640\s]/g,'')}
function matchesCustomer(customer,query){
 const terms=normal(query).replace(/[\u064b-\u065f\u0670\u0640]/g,'').split(/\s+/).filter(Boolean);
 const fields=[customer.customer_code,customer.customer_name,customer.supervisor,customer.city,customer.branch].map(searchKey);
 return terms.length>0&&terms.every(term=>fields.some(value=>value.includes(searchKey(term))));
}
function search(){
 const q=normal($('search').value);$('clearSearch').classList.toggle('hidden',!q);
 if(q.length<2){$('searchResults').innerHTML='';$('searchMeta').textContent='برای جست‌وجو حداقل دو حرف یا رقم وارد کنید.';return}
 const found=customerPool().filter(c=>matchesCustomer(c,q)).slice(0,35);
 $('searchMeta').textContent=found.length?`${fa(found.length)} نتیجه`:'مشتری پیدا نشد؛ می‌توانید مشتری جدید ثبت کنید.';
 $('searchResults').innerHTML=found.map(c=>`<button type="button" class="result" data-id="${esc(c._id)}"><span><b>${esc(c.customer_name)}${c.is_new?'<span class="new-badge">جدید</span>':''}</b><small>${esc(c.city)} · ${esc(c.branch)}${c.supervisor?' · سرپرست: '+esc(c.supervisor):''}</small></span><span class="code">${esc(c.customer_code||'بدون کد')}</span></button>`).join('');
 document.querySelectorAll('.result').forEach(el=>el.onclick=()=>selectCustomer(el.dataset.id));
}
function clearCustomer(){
 clearTimeout(draftTimer);selected=null;form={};$('selectedCustomer').classList.add('hidden');$('visitPanel').classList.add('hidden');$('customerSearch').classList.remove('hidden');$('newCustomerButton').setAttribute('aria-pressed','false');$('newCustomerButton').textContent='＋ مشتری جدید';
 saveDraft().catch(console.warn);search();$('search').focus();
}
function renderCustomer(){
 const isNew=!!selected?.is_new;
 $('customerSearch').classList.toggle('hidden',isNew);$('newCustomerButton').setAttribute('aria-pressed',String(isNew));$('newCustomerButton').textContent=isNew?'بازگشت به جست‌وجو':'＋ مشتری جدید';
 $('newCustomerTag').classList.toggle('hidden',!isNew);$('selectedCustomer').classList.remove('hidden');$('visitPanel').classList.remove('hidden');
 if(isNew){$('selectedCustomer').innerHTML='<p class="new-customer-note">اطلاعات مشتری جدید را در فرم زیر وارد کنید.</p>';return}
 $('searchResults').innerHTML='';$('search').value='';$('searchMeta').textContent='مشتری انتخاب شد';
 $('selectedCustomer').innerHTML=`<div class="top"><div><h3>${esc(selected.customer_name)}</h3><small class="code">${esc(selected.customer_code)}</small></div><button class="outline" id="changeCustomer">تغییر مشتری</button></div><div class="customerattrs"><div><small>شهر</small><b>${esc(selected.city)}</b></div><div><small>شعبه</small><b>${esc(selected.branch)}</b></div><div><small>سرپرست</small><b>${esc(selected.supervisor)}</b></div><div><small>وضعیت</small><b>${esc(selected.status)}</b></div></div>`;
 $('changeCustomer').onclick=clearCustomer;
}
function selectCustomer(id){
 const c=customerPool().find(c=>c._id===id);if(!c)return;
 selected={...c};form={G:todayJalali(),A:c.customer_class||legacySchema?.class_defaults_by_code?.[String(c.customer_code)]||'',E:c.supervisor||''};
 if(c.is_new)Object.assign(form,{B:c.branch||'',C:c.city||'',D:c.customer_name||'',F:c.customer_code||''});
 renderCustomer();renderForm();scheduleDraft();$('visitPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function startNewCustomer(){
 if(selected?.is_new){clearCustomer();return}
 selected={_id:'local-'+crypto.randomUUID(),is_new:true,customer_code:'',customer_name:'',city:'',branch:'',supervisor:'',status:'جدید'};
 form={G:todayJalali(),A:'مشتریان جدید',B:'',C:'',D:'',E:'',F:''};renderCustomer();renderForm();scheduleDraft();$('field-D').focus();
}
function todayJalali(){const d=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tehran'}).formatToParts(new Date());let val=t=>d.find(x=>x.type===t)?.value||'';return val('year')+val('month').padStart(2,'0')+val('day').padStart(2,'0')}
function fieldHtml(k,label,control,wide=false){return `<div class="field ${wide?'wide':''}"><label for="field-${k}">${esc(label)}${k==='F'?'<small>اختیاری</small>':'<span class="star" aria-hidden="true">*</span>'}<span class="field-status" aria-hidden="true">✓</span></label>${control}</div>`}
function renderForm(){
 for(const [key] of COLS)if(!active(key))delete form[key];
 const classItems=Array.from(new Set([...(legacySchema?.customer_classes||[]),...(form.A?[form.A]:[])]));
 const textControl=(k,placeholder,attrs='')=>`<input id="field-${k}" data-field="${k}" type="text" value="${esc(form[k]??'')}" placeholder="${placeholder}" ${k==='F'?'':'required'} ${attrs}/>`;
 const manual=selected?.is_new?'<h3 class="field-group-title">اطلاعات مشتری جدید</h3>'+[
 ['D','نام مشتری / فروشگاه','نام فروشگاه را وارد کنید','maxlength="200"'],['F','کد مشتری','در صورت داشتن کد وارد کنید','inputmode="numeric" maxlength="50" dir="ltr"'],['B','نام شعبه','نام شعبه را وارد کنید','maxlength="100"'],['C','نام شهر','نام شهر را وارد کنید','maxlength="100"']
 ].map(([k,label,placeholder,attrs])=>fieldHtml(k,label,textControl(k,placeholder,attrs))).join(''):'';
 const fixedHtml=manual+fieldHtml('A','کلاس مشتری',`<select id="field-A" data-field="A" required><option value="">انتخاب کنید...</option>${classItems.map(v=>`<option value="${esc(v)}" ${form.A===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`)+fieldHtml('E','نام سرپرست',textControl('E','نام سرپرست','maxlength="150"'));
 const html=fixedHtml+(selected?.is_new?'<h3 class="field-group-title">اطلاعات بازدید</h3>':'')+COLS.filter(([k])=>active(k)).map(([k,label,type])=>{
  const choices=options[k]||[];let control;
  if(choices.length)control=`<select id="field-${k}" data-field="${k}" required><option value="">انتخاب کنید...</option>${choices.map(o=>`<option value="${esc(o)}" ${form[k]===o?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
  else if(type==='textarea')control=`<textarea id="field-${k}" data-field="${k}" rows="3" required placeholder="توضیحات بازدید">${esc(form[k]??'')}</textarea>`;
  else control=`<input id="field-${k}" data-field="${k}" required type="${type==='number'||type==='percent'?'number':'text'}" ${type==='number'?'min="0" max="5000" step="1"':type==='percent'?'min="0" max="100" step="0.01"':'inputmode="numeric" maxlength="8"'} value="${esc(form[k]??'')}" placeholder="${type==='date'?'مثلاً ۱۴۰۵۰۸۱۴':'۰'}"/>`;
  return fieldHtml(k,label,control,['AF','G'].includes(k));
 }).join('');
 $('fields').innerHTML=html;
 document.querySelectorAll('[data-field]').forEach(el=>{
  if(el.tagName==='SELECT')el.onchange=()=>update(el);
  else el.oninput=()=>{form[el.dataset.field]=el.value;updateFieldState(el);updateProgress();scheduleDraft()};
  updateFieldState(el);
 });updateProgress();
}
function fieldComplete(el){
 const v=String(el.value??'').trim();if(!v||!el.checkValidity())return false;
 if(el.dataset.field==='G'){const d=normal(v);return /^1[34]\d{6}$/.test(d)&&+d.slice(4,6)>=1&&+d.slice(4,6)<=12&&+d.slice(6,8)>=1&&+d.slice(6,8)<=31}
 return true;
}
function updateFieldState(el){el.closest('.field').classList.toggle('is-complete',fieldComplete(el));el.closest('.field').classList.remove('is-invalid')}
function updateProgress(){
 const fields=[...document.querySelectorAll('[data-field]')].filter(el=>el.required),done=fields.filter(fieldComplete).length,total=fields.length,percent=total?Math.round(done/total*100):0;
 $('formProgressText').textContent=`${fa(done)} از ${fa(total)}`;$('formProgressFill').style.width=percent+'%';$('formProgress').setAttribute('aria-valuenow',String(percent));$('formInfo').textContent=done===total?'اطلاعات برای ثبت آماده است':`${fa(total-done)} فیلد باقی مانده`;
}
function update(el){
 const key=el.dataset.field;form[key]=el.value;
 if(['H','I','L','N','P','S','U','W','AD'].includes(key)){renderForm();$('field-'+key)?.focus({preventScroll:true})}
 else{updateFieldState(el);updateProgress()}
 scheduleDraft();
}
function invalidField(k,message){const el=$('field-'+k);if(el){el.closest('.field').classList.add('is-invalid');el.focus();el.scrollIntoView({block:'center',behavior:'smooth'})}return message}
function validate(){if(selected?.is_new){for(const [k,label] of [['D','نام مشتری'],['B','نام شعبه'],['C','نام شهر']])if(!String(form[k]||'').trim())return invalidField(k,'لطفاً '+label+' را تکمیل کنید.');const code=normal(form.F);if(code&&customerPool().some(c=>c._id!==selected._id&&normal(c.customer_code)===code))return invalidField('F','این کد مشتری قبلاً ثبت شده است؛ مشتری را از جست‌وجو انتخاب کنید.')}if(!String(form.A||'').trim())return invalidField('A','لطفاً کلاس مشتری را انتخاب کنید.');if(!String(form.E||'').trim())return invalidField('E','لطفاً نام سرپرست را تکمیل کنید.');for(const [k,label,type] of COLS){if(!active(k))continue;const v=String(form[k]??'').trim();if(!v)return invalidField(k,`لطفاً «${label}» را تکمیل کنید.`);if(k==='G'&&!/^1[34]\d{6}$/.test(normal(v)))return 'تاریخ مراجعه باید ۸ رقم شمسی، مانند ۱۴۰۵۰۸۱۳ باشد.';if(k==='G'){let x=normal(v);if(+x.slice(4,6)<1||+x.slice(4,6)>12||+x.slice(6,8)<1||+x.slice(6,8)>31)return 'ماه یا روز تاریخ معتبر نیست.'}if(type==='number'&&(!Number.isInteger(Number(normal(v)))||+normal(v)<0||+normal(v)>5000))return 'تعداد کارتن باید عدد صحیح بین ۰ تا ۵۰۰۰ باشد.';if(type==='percent'&&(!Number.isFinite(+normal(v))||+normal(v)<0||+normal(v)>100))return 'درصد تخفیف باید بین ۰ تا ۱۰۰ باشد.'}return null}
async function persistVisit(entry,newCustomer){
 const nextLocal=newCustomer?[...localCustomers.filter(c=>c._id!==newCustomer._id),newCustomer]:localCustomers;
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['visits','config'],'readwrite');tx.objectStore('visits').put(entry);tx.objectStore('config').put({key:'draft',value:null});
  if(newCustomer)tx.objectStore('config').put({key:'localCustomers',value:nextLocal});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('ثبت انجام نشد'));
 });localCustomers=nextLocal;
}
async function saveVisit(){
 if(!selected)return toast('ابتدا مشتری را انتخاب کنید');const error=validate();if(error)return toast(error);
 const button=$('saveVisit');if(button.disabled)return;button.disabled=true;
 try{
  const clean={};for(const [k] of COLS)if(active(k))clean[k]=String(form[k]??'').trim();
  const customer=selected.is_new?{...selected,customer_code:normal(form.F),customer_name:String(form.D).trim(),branch:String(form.B).trim(),city:String(form.C).trim(),supervisor:String(form.E).trim(),customer_class:form.A}:selected;
  const entry={id:crypto.randomUUID(),customer_id:customer._id,customer_code:customer.customer_code,customer_name:customer.customer_name,branch:customer.branch,city:customer.city,visitor:$('visitor').value.trim()||'ویزیتور آزمایشی',created_at:new Date().toISOString(),status:'pending',customer_class:form.A,supervisor:String(form.E).trim(),is_new_customer:!!customer.is_new,answers:clean};
  clearTimeout(draftTimer);await persistVisit(entry,customer.is_new?customer:null);visits.unshift(entry);selected=null;form={};clearCustomer();refreshStats();toast('بازدید با موفقیت روی دستگاه ذخیره شد.');if(navigator.onLine)syncNow(false);
 }catch(e){toast('ثبت انجام نشد؛ دوباره تلاش کنید. '+e.message)}finally{button.disabled=false}
}
function refreshStats(){$('visitCount').textContent=fa(visits.length);$('pendingCount').textContent=`${fa(visits.filter(v=>v.status!=='synced').length)} در انتظار ارسال`;$('connection').textContent=navigator.onLine?'آنلاین':'آفلاین';document.querySelector('.dot').classList.toggle('on',navigator.onLine)}
function renderReports(){const pending=visits.filter(v=>v.status!=='synced').length;const m=[['کل بازدیدها',visits.length],['در انتظار ارسال',pending],['همگام‌شده',visits.length-pending]];$('reportMetrics').innerHTML=m.map(x=>`<div class="rmetric"><span>${x[0]}</span><strong>${fa(x[1])}</strong></div>`).join('');const q=normal($('reportSearch').value),f=$('reportFilter').value;const data=visits.filter(v=>(!q||matchesCustomer(v,q))&&(f==='all'||(f==='synced'&&v.status==='synced')||(f==='pending'&&v.status!=='synced')));$('reportRows').innerHTML=data.length?data.map(v=>`<tr class="${v.is_new_customer?'new-customer-row':''}"><td>${esc(v.customer_name)}${v.is_new_customer?'<span class="new-badge">جدید</span>':''}</td><td dir="ltr">${esc(v.customer_code)}</td><td>${new Date(v.created_at).toLocaleString('fa-IR')}</td><td>${esc(v.visitor)}</td><td>${esc(v.answers.H)}</td><td class="${v.status==='synced'?'synced':'pending'}">${v.status==='synced'?'ارسال‌شده':'در انتظار'}</td></tr>`).join(''):'<tr><td colspan="6">هنوز داده‌ای در این بخش نیست.</td></tr>'}
function exportCsv(){if(!visits.length)return toast('هنوز بازدیدی ثبت نشده است.');const csv='\ufeff'+exportRows().map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');saveFile(new Blob([csv],{type:'text/csv;charset=utf-8;'}),'Payu-Visits-'+new Date().toISOString().slice(0,10)+'.csv')}
function cfg(){return {apiUrl:$('apiUrl').value.trim().replace(/\/$/,''),apiToken:$('apiToken').value.trim(),visitor:$('visitor').value.trim()}}
async function syncNow(show=true){
 if(syncing){if(show)toast('همگام‌سازی دیگری در حال اجراست.');return}
 const c=cfg();if(!c.apiUrl||!c.apiToken){if(show)toast('برای همگام‌سازی، اتصال سرور را تنظیم کنید.');return}
 if(!navigator.onLine){if(show)toast('آفلاین هستید؛ اطلاعات در دستگاه می‌ماند.');return}
 syncing=true;$('syncNow').disabled=true;let count=0,failed=0;
 try{
  for(const visit of visits.filter(v=>v.status!=='synced')){
   try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    let res;try{res=await fetch(c.apiUrl+'/visits',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.apiToken},body:JSON.stringify(visit),signal:controller.signal})}finally{clearTimeout(timeout)}
    if(!res.ok){let detail='';try{detail=JSON.stringify((await res.json()).detail||'')}catch(_){}throw Error('HTTP '+res.status+' '+detail.slice(0,160))}
    const ack=await res.json();if(!ack.ok||ack.id!==visit.id)throw Error('تأیید سرور با شناسه بازدید منطبق نیست');
    const saved={...visit,status:'synced'};await put('visits',saved);Object.assign(visit,saved);count++;
   }catch(e){failed++;$('syncMessage').classList.remove('hidden');$('syncMessage').textContent='ارسال «'+visit.customer_name+'» ناموفق: '+e.message+'؛ اطلاعات هنوز در دستگاه موجود است.';break}
  }
  refreshStats();if(show)toast(failed?`${fa(count)} ارسال شد؛ ${fa(failed)} خطا. بازدیدهای باقی‌مانده محفوظ‌اند.`:`${fa(count)} بازدید تأیید و همگام شد.`);
 }finally{syncing=false;$('syncNow').disabled=false}
}
async function refreshCustomers(){const c=cfg();if(!c.apiUrl||!c.apiToken)return toast('ابتدا آدرس API و کلید را وارد کنید.');try{const r=await fetch(c.apiUrl+'/customers',{headers:{'Authorization':'Bearer '+c.apiToken}});if(!r.ok)throw new Error('HTTP '+r.status);const arr=await r.json();if(!Array.isArray(arr)||!arr.length)throw new Error('بانک مشتریان خالی است');customers=arr;await put('config',{key:'customers',value:arr});toast(`${fa(arr.length)} ردیف مشتری به‌روزرسانی شد.`)}catch(e){toast('دریافت بانک مشتریان ناموفق بود: '+e.message)}}

function xmlEsc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')}
function colRef(num){let s='';for(let n=num+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function crc32(buf){let crc=-1;for(const b of buf){crc^=b;for(let j=0;j<8;j++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1}return (crc^(-1))>>>0}
function buildZip(files){const te=new TextEncoder();const chunks=[],central=[];let offset=0;const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
 for(const [path,text] of files){const name=te.encode(path),data=te.encode(text),crc=crc32(data);const local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);chunks.push(local,data);central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));offset+=local.length+data.length}
 let clen=central.reduce((n,c)=>n+c.length,0),tail=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(clen),...u32(offset),...u16(0)]);return new Blob([...chunks,...central,tail],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function xlsxBlob(rows,newRows=new Set()){const xmlRows=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>{const ref=colRef(j)+(i+1);return '<c r="'+ref+'" s="'+(i===0?1:newRows.has(i)?2:0)+'" t="inlineStr"><is><t xml:space="preserve">'+xmlEsc(value)+'</t></is></c>'}).join('')+'</row>').join('');const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="'+rows[0].length+'" width="24" customWidth="1"/></cols><sheetData>'+xmlRows+'</sheetData><autoFilter ref="A1:'+colRef(rows[0].length-1)+rows.length+'"/></worksheet>';
 return buildZip([
 ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
 ['_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Podium Visits" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF005234"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
 ['xl/worksheets/sheet1.xml',sheet]
 ])}
function saveFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function exportRows(){const hdr=['شناسه بازدید','کد مشتری','نام مشتری','شعبه','شهر','کلاس مشتری','نام سرپرست','ویزیتور','زمان ثبت','وضعیت همگام‌سازی',...COLS.map(x=>x[1]),'مشتری جدید'];return [hdr,...visits.map(v=>[v.id,v.customer_code,v.customer_name,v.branch,v.city,v.customer_class||'',v.supervisor||'',v.visitor,v.created_at,v.status,...COLS.map(([k])=>v.answers[k]??''),v.is_new_customer?'بله':'خیر'])]}
function newCustomerRowIndexes(){return new Set(visits.flatMap((v,i)=>v.is_new_customer?[i+1]:[]))}
function exportXlsx(){if(!visits.length)return toast('هنوز بازدیدی برای خروجی وجود ندارد.');const name='Payu-Visits-'+new Date().toISOString().slice(0,10)+'.xlsx';saveFile(xlsxBlob(exportRows(),newCustomerRowIndexes()),name);toast('فایل Excel شامل '+fa(visits.length)+' بازدید آماده شد. فایل را از Downloads گوشی ارسال کنید.')}
function legacyRows(){const headers=legacySchema.headers;const cols=legacySchema.columns;
 const records=visits.map(v=>{const a=v.answers||{};const ref=customerPool().find(c=>String(c._id)===String(v.customer_id))||(!v.is_new_customer&&v.customer_code?customers.find(c=>String(c.customer_code)===String(v.customer_code)):null);const lookup={A:v.customer_class||legacySchema.class_defaults_by_code?.[String(v.customer_code)]||'',B:v.branch||ref?.branch||'',C:v.city||ref?.city||'',D:v.customer_name||ref?.customer_name||'',E:v.supervisor||ref?.supervisor||'',F:String(v.customer_code||'')};return cols.map(k=>k in lookup?lookup[k]:(a[k]??''))});return [headers,...records]}
function exportLegacyXlsx(){if(!visits.length)return toast('بازدیدی برای خروجی وجود ندارد.');saveFile(xlsxBlob(legacyRows(),newCustomerRowIndexes()),'Payu-Original-32-Columns-'+new Date().toISOString().slice(0,10)+'.xlsx');toast('اکسل سازگار با فایل اصلی، شامل دقیقاً ۳۲ ستون آماده شد.');}
function backupVisits(){if(!visits.length)return toast('هنوز بازدیدی ثبت نشده است.');const backup={format:'payu-local-backup',version:1,exported_at:new Date().toISOString(),localCustomers,visits};saveFile(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),'Payu-Backup-'+new Date().toISOString().slice(0,10)+'.json');toast('نسخه پشتیبان قابل بازیابی ذخیره شد.')}
async function restoreVisits(file){if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='payu-local-backup'||data.version!==1||!Array.isArray(data.visits))throw Error('فایل پشتیبان معتبر پایو نیست.');if(data.visits.length>100000)throw Error('فایل بیش از حد بزرگ است.');const existing=new Map(visits.map(v=>[v.id,v]));let added=0,skipped=0;for(const v of data.visits){if(!v||typeof v.id!=='string'||!v.id||typeof v.customer_id!=='string'||!v.answers||typeof v.answers!=='object'||typeof v.created_at!=='string'){skipped++;continue}if(existing.has(v.id)){skipped++;continue}const clean={id:v.id,customer_id:v.customer_id,customer_code:String(v.customer_code||''),customer_name:String(v.customer_name||''),branch:String(v.branch||''),city:String(v.city||''),visitor:String(v.visitor||''),customer_class:String(v.customer_class||''),supervisor:String(v.supervisor||''),is_new_customer:v.is_new_customer===true,created_at:v.created_at,status:v.status==='synced'?'synced':'pending',answers:v.answers};await put('visits',clean);existing.set(clean.id,clean);added++}visits=Array.from(existing.values()).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));await rebuildLocalCustomers();refreshStats();renderReports();toast(`${fa(added)} بازدید بازیابی شد؛ ${fa(skipped)} تکراری یا نامعتبر بود.`)}catch(e){toast('بازیابی انجام نشد: '+e.message)}}


async function rebuildLocalCustomers(){
 for(const v of [...visits].reverse())if(v.is_new_customer&&!customers.some(c=>c._id===v.customer_id)){
  const c={_id:v.customer_id,is_new:true,customer_code:v.customer_code,customer_name:v.customer_name,branch:v.branch,city:v.city,supervisor:v.supervisor,customer_class:v.customer_class,status:'جدید'};
  localCustomers=localCustomers.filter(x=>x._id!==c._id);localCustomers.push(c);
 }
 await put('config',{key:'localCustomers',value:localCustomers});
}
async function checkOfflineReadiness(){
 const el=document.getElementById('offlineReadiness');if(!el)return;
 if(!('serviceWorker' in navigator)){el.textContent='این مرورگر از اجرای آفلاین پشتیبانی نمی‌کند.';return;}
 try{
   const worker=(await navigator.serviceWorker.ready).active;
   if(!worker)throw new Error('worker inactive');
   const reply=await new Promise((resolve,reject)=>{
     const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('timeout')),5000);
     channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data)};
     worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);
   });
   el.textContent=reply.ready?'✓ آماده استفاده آفلاین':`آفلاین هنوز کامل آماده نیست (${reply.stored}/${reply.total} فایل). وقتی اینترنت وصل است، صفحه را مجدداً باز کنید.`;
 }catch(e){el.textContent='آمادگی آفلاین هنوز تأیید نشده است. در حالت آنلاین برنامه را باز و دوباره امتحان کنید.';}
}

let swRegistration=null,applyingUpdate=false,lastUpdateCheck=0;
function showUpdate(){$('updateBanner').classList.toggle('hidden',!swRegistration?.waiting)}
async function checkForUpdates(){
 if(!swRegistration||!navigator.onLine||Date.now()-lastUpdateCheck<30000)return;
 lastUpdateCheck=Date.now();try{await swRegistration.update();showUpdate()}catch(e){}
}
async function setupUpdates(){
 if(!('serviceWorker' in navigator)){checkOfflineReadiness();return}
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();else{showUpdate();checkOfflineReadiness()}});
 try{
  swRegistration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  showUpdate();swRegistration.addEventListener('updatefound',()=>{
   const worker=swRegistration.installing;if(!worker)return;
   worker.addEventListener('statechange',()=>{if(worker.state==='installed'){if(navigator.serviceWorker.controller)showUpdate();else checkOfflineReadiness()}});
  });checkOfflineReadiness();checkForUpdates();
 }catch(e){$('offlineReadiness').textContent='آمادگی آفلاین تأیید نشد؛ اتصال اینترنت را بررسی کنید.'}
}
async function applyUpdate(){
 const worker=swRegistration?.waiting;if(!worker){$('updateBanner').classList.add('hidden');return}
 const button=$('applyUpdate');button.disabled=true;
 try{
  if(syncing||$('saveVisit').disabled){toast('پس از پایان ذخیره یا ارسال، دوباره تلاش کنید.');return}
  clearTimeout(draftTimer);await saveDraft();applyingUpdate=true;worker.postMessage({type:'SKIP_WAITING'});
 }catch(e){toast('ذخیره پیش‌نویس انجام نشد؛ به‌روزرسانی را دوباره امتحان کنید.')}finally{button.disabled=false}
}

async function start(){try{db=await openDB();let data=await getAll('config');const saved=Object.fromEntries(data.map(x=>[x.key,x.value]));for(let key of ['visitor','apiUrl','apiToken'])$(key).value=saved[key]||'';localCustomers=Array.isArray(saved.localCustomers)?saved.localCustomers:[];customers=saved.customers||await (await fetch('customers.json')).json();options=await (await fetch('options.json')).json();legacySchema=await (await fetch('legacy_export_schema.json')).json();visits=(await getAll('visits')).sort((a,b)=>b.created_at.localeCompare(a.created_at));await restoreDraft(saved);refreshStats();search();$('search').oninput=search;$('clearSearch').onclick=()=>{$('search').value='';search()};$('saveVisit').onclick=saveVisit;$('newCustomerButton').onclick=startNewCustomer;$('applyUpdate').onclick=applyUpdate;$('exportCsv').onclick=exportCsv;$('exportXlsx').onclick=exportXlsx;$('exportLegacyXlsx').onclick=exportLegacyXlsx;$('backupVisits').onclick=backupVisits;$('restoreVisits').onchange=async(e)=>{await restoreVisits(e.target.files[0]);e.target.value=''};$('reportSearch').oninput=renderReports;$('reportFilter').onchange=renderReports;document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('saveSettings').onclick=async()=>{for(let [key,value] of Object.entries(cfg()))await put('config',{key,value});toast('تنظیمات ذخیره شد.')};$('syncNow').onclick=()=>syncNow();$('refreshCustomers').onclick=refreshCustomers;window.addEventListener('online',()=>{refreshStats();syncNow(false);checkForUpdates()});window.addEventListener('offline',refreshStats);setupUpdates();if(navigator.onLine)syncNow(false);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine){syncNow(false);checkForUpdates()}});window.addEventListener('pagehide',()=>{if(selected)saveDraft().catch(console.warn)})}catch(e){document.body.innerHTML='<main><h2>خطا در راه‌اندازی</h2><p>این اپ را از طریق سرور HTTP یا HTTPS باز کنید، نه با باز کردن مستقیم فایل HTML.</p><pre>'+esc(e.message)+'</pre></main>';console.error(e)}}start();
