const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({Intl,Date});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/start\(\);\s*$/,''),context);
const matches=(customer,query)=>context.matchesCustomer(customer,query);
test('surname search supports full names, partial surnames and Arabic letters',()=>{
 const customer={customer_name:'مجید قاسمیان'};
 assert.equal(matches(customer,'قاسمیان'),true);
 assert.equal(matches(customer,'قاسمي'),true);
 assert.equal(matches(customer,'قاسمیان مجید'),true);
 assert.equal(matches(customer,'قاسمیان علی'),false);
});
test('compound surnames match with spaces, half spaces, no spaces or diacritics',()=>{
 const customer={customer_name:'مجید سعادت‌دوست'};
 for(const query of ['سعادت دوست','سعادتدوست','سَعادت‌دوست','  سعادت   دوست  '])assert.equal(matches(customer,query),true,query);
 assert.equal(matches({customer_name:'مجید سعادتدوست'},'سعادت دوست'),true);
 assert.equal(matches(customer,'   '),false);
});
test('supervisor surnames and existing code, city and branch searches work',()=>{
 const customer={customer_name:'فروشگاه نمونه',supervisor:'حسین انتظاری',customer_code:'30130',city:'قائم‌شهر',branch:'مازندران'};
 for(const query of ['انتظاري','۳۰۱۳۰','قائمشهر','مازندران','نمونه انتظاری'])assert.equal(matches(customer,query),true,query);
 assert.equal(matches({customer_name:'فروشگاه تازه',supervisor:'علی محمدی',is_new:true},'محمدی'),true);
});
