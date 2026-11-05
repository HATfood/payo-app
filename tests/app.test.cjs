const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
function app(){
 const context=vm.createContext({Blob,TextEncoder,Uint8Array,Intl,Date,console,setTimeout:()=>0,clearTimeout:()=>{},crypto:require('node:crypto').webcrypto});
 vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8').replace(/start\(\);\s*$/,''),context);
 context.schema=JSON.parse(fs.readFileSync(path.join(root,'legacy_export_schema.json'),'utf8'));
 vm.runInContext('legacySchema=schema',context);return context;
}
function run(context,code){return vm.runInContext(code,context)}
function entries(buffer){
 const files={};let i=0;
 while(buffer.readUInt32LE(i)===0x04034b50){
  assert.equal(buffer.readUInt16LE(i+8),0);const size=buffer.readUInt32LE(i+18),len=buffer.readUInt16LE(i+26),extra=buffer.readUInt16LE(i+28),name=buffer.subarray(i+30,i+30+len).toString();
  const start=i+30+len+extra;files[name]=buffer.subarray(start,start+size).toString();i=start+size;
 }return files;
}
const oldVisit={id:'old-visit',customer_id:'reference',customer_code:'00123',customer_name:'مشتری مرجع',branch:'شعبه مرجع',city:'تهران',customer_class:'مشتریان ثابت',supervisor:'سرپرست',visitor:'ویزیتور',created_at:'2026-11-05T06:00:00Z',status:'pending',answers:{G:'14050814',H:'موجود',AB:'0',AC:'0',AF:'توضیح <آزمایش> & متن'}};
const newVisit={...oldVisit,id:'new-visit',customer_id:'local-new',customer_code:'',customer_name:'مشتری جدید',branch:'شعبه جدید',city:'کرج',is_new_customer:true};
test('original Excel keeps exactly the reference 32 columns and preserves blank codes and zero',()=>{
 const c=app();c.rows=[newVisit,oldVisit];run(c,'visits=rows');const rows=JSON.parse(JSON.stringify(run(c,'legacyRows()')));
 assert.deepEqual(rows[0],c.schema.headers);assert.equal(rows[1].length,32);assert.equal(rows[1][5],'');assert.equal(rows[2][5],'00123');assert.equal(rows[1][27],'0');assert.equal(rows[1][28],'0');
});
test('system Excel and CSV rows explicitly distinguish new and old customers',()=>{
 const c=app();c.rows=[newVisit,oldVisit];run(c,'visits=rows');const rows=JSON.parse(JSON.stringify(run(c,'exportRows()')));
 assert.equal(rows[0].length,37);assert.equal(rows[0].at(-1),'مشتری جدید');assert.equal(rows[1].at(-1),'بله');assert.equal(rows[2].at(-1),'خیر');
});
test('both XLSX formats include valid style relationships and color only new customer rows',async()=>{
 const c=app();c.rows=[oldVisit,newVisit];run(c,'visits=rows');
 for(const format of ['legacyRows()','exportRows()']){
  const blob=run(c,`xlsxBlob(${format},newCustomerRowIndexes())`);const files=entries(Buffer.from(await blob.arrayBuffer()));
  assert.match(files['[Content_Types].xml'],/PartName="\/xl\/styles.xml"/);assert.match(files['xl/_rels/workbook.xml.rels'],/Target="styles.xml"/);
  assert.match(files['xl/styles.xml'],/FFFFF1D6/);const sheet=files['xl/worksheets/sheet1.xml'];
  assert.match(sheet,/<c r="A1" s="1"/);assert.match(sheet,/<c r="A2" s="0"/);assert.match(sheet,/<c r="A3" s="2"/);assert.match(sheet,/&lt;آزمایش&gt; &amp; متن/);
 }
});
test('conditional answers are removed when the controlling field changes',()=>{
 const c=app();run(c,"form={H:'ناموجود',I:'آسیب دیده'}");assert.equal(run(c,"active('K')"),true);assert.equal(run(c,"active('L')"),false);
 run(c,"form={H:'موجود',L:'نامناسب',W:'بدون مشکل',AD:'بدون نیاز به اقدام'}");assert.equal(run(c,"active('M')"),true);assert.equal(run(c,"active('X')"),false);assert.equal(run(c,"active('AE')"),false);
});
test('new customer validation catches normalized duplicate codes and accepts no code',()=>{
 const c=app();run(c,"invalidField=(k,message)=>message;customers=[{_id:'ref',customer_code:'30130'}];selected={_id:'local-test',is_new:true};form={A:'مشتریان جدید',B:'شعبه',C:'شهر',D:'نام',E:'سرپرست',F:'۳۰۱۳۰'}");
 assert.match(run(c,'validate()'),/قبلاً ثبت/);
 run(c,"form.F='';form.G='14050814';form.H='ناموجود';form.I='توسط شعبه برای مشتری ارسال نشده است';form.U='ویزیت کامل';form.W='بدون مشکل';form.Y='شلف ندارد';form.Z='خرده‌فروشی';form.AA='بدون تغییر';form.AB='0';form.AC='0';form.AD='بدون نیاز به اقدام';form.AF='ندارد'");assert.equal(run(c,'validate()'),null);
});
test('backup restore preserves new-customer flags, rebuilds searchable customers and skips duplicates',async()=>{
 const c=app();c.backup={format:'payu-local-backup',version:1,visits:[newVisit,oldVisit,newVisit]};c.saved=[];
 run(c,"put=async(name,value)=>saved.push({name,value});refreshStats=()=>{};renderReports=()=>{};toast=()=>{};");
 await run(c,"restoreVisits({text:async()=>JSON.stringify(backup)})");
 assert.equal(run(c,'visits.length'),2);assert.equal(run(c,'localCustomers.length'),1);assert.equal(run(c,'localCustomers[0].is_new'),true);assert.equal(run(c,'localCustomers[0].customer_code'),'');assert.equal(run(c,'visits.find(v=>v.id===\"old-visit\").is_new_customer'),false);
});
test('service worker precaches the bundled font and every required path exists',()=>{
 const code=fs.readFileSync(path.join(root,'sw.js'),'utf8');const assets=JSON.parse(code.match(/const ASSETS=(\[.*?\]);/)[1]);
 assert.ok(assets.includes('./fonts/Vazirmatn-Variable.woff2'));
 for(const asset of assets)assert.ok(fs.existsSync(path.join(root,asset)),asset);
 assert.match(code,/type==='SKIP_WAITING'/);assert.match(code,/cache:'reload'/);
});

test('update banner appears only while an update is actually waiting',()=>{
 const c=app();c.visibility=[];run(c,"document={getElementById:()=>({classList:{toggle:(name,hidden)=>visibility.push(hidden)}})};swRegistration={waiting:null};showUpdate();swRegistration.waiting={};showUpdate();swRegistration.waiting=null;showUpdate()");
 assert.deepEqual(Array.from(c.visibility),[true,false,true]);
});
