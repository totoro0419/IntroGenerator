import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 const keyButton=page.locator('.key-button.on').first();if(!await keyButton.count())throw Error('animated keyframe control not found');await keyButton.click();await page.waitForSelector('.easing-editor',{timeout:10000});
 const values=async()=>{const row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();return {time:await row.locator('input[aria-label="Key位置"]').inputValue(),value:await row.locator('input[aria-label="Key値"]').inputValue()}};
 const before=await values();
 let row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();await row.locator('select[aria-label="Easing種類"]').selectOption('power');await page.waitForSelector('.easing-editor[data-kind="powerInOut"]');
 row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();await row.locator('select[aria-label="Easing方向"]').selectOption('In');await page.waitForSelector('.easing-editor[data-kind="powerIn"]');
 row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();const strength=row.locator('input[aria-label="Easing 強さ"]');await strength.fill('4');await strength.press('Tab');await page.waitForFunction(()=>window.__IG.state.p.tracks.some(t=>t.keys.some(k=>k.ease.kind==='powerIn'&&k.ease.power===4)),{timeout:10000});
 const after=await values();if(before.time!==after.time||before.value!==after.value)throw Error(`PDF-F09 changed endpoints/time: ${JSON.stringify({before,after})}`);
 row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();await row.locator('select[aria-label="Easing種類"]').selectOption('back');await page.waitForSelector('.easing-editor[data-kind="backIn"]');row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();await row.locator('select[aria-label="Easing方向"]').selectOption('Out');await page.waitForSelector('.easing-editor[data-kind="backOut"]');row=page.locator('#keys > tr').filter({has:page.locator('select[aria-label="Easing種類"]')}).first();const overshoot=row.locator('input[aria-label="Easing Overshoot"]');await overshoot.fill('2.4');await overshoot.press('Tab');await page.waitForFunction(()=>window.__IG.state.p.tracks.some(t=>t.keys.some(k=>k.ease.kind==='backOut'&&Math.abs(k.ease.overshoot-2.4)<1e-9)),{timeout:10000});
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('PDF-F09 UI causes mobile horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));console.log({easing:'PDF-F09 pass',before,after});
}finally{await browser.close()}
