const { spawn } = require('node:child_process');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4200';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const artifacts = await mkdtemp(path.join(os.tmpdir(), 'caraveso-browser-'));
  const browser = spawn(
    process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=9228',
      '--user-data-dir=' + path.join(artifacts, 'profile'),
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let ws;
  try {
    let target;
    for (let i = 0; i < 80; i++) {
      try {
        target = await (
          await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' })
        ).json();
        break;
      } catch {}
      await delay(100);
    }
    assert.ok(target?.webSocketDebuggerUrl, 'Chrome debugger unavailable');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    let id = 0;
    const pending = new Map();
    const errors = [];
    const fileChoosers = [];
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) entry?.reject(new Error(message.error.message));
        else entry?.resolve(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown')
        errors.push(
          message.params.exceptionDetails.text +
            ': ' +
            message.params.exceptionDetails.exception?.description,
        );
      if (message.method === 'Page.fileChooserOpened') fileChoosers.push(message.params);
    };
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const key = ++id;
        pending.set(key, { resolve, reject });
        ws.send(JSON.stringify({ id: key, method, params }));
      });
    }
    async function js(expression) {
      const result = await cdp('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        );
      return result.result.value;
    }
    async function until(expression, timeout = 15000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (await js(expression)) return;
        await delay(100);
      }
      console.log('Timeout state', await js('({url:location.href,body:document.querySelector("main")?.innerText})'), errors);
      throw new Error('Timeout: ' + expression);
    }
    async function visit(route, expression) {
      await cdp('Page.navigate', { url: base + route });
      await until(expression);
      assert.ok(
        await js('!document.querySelector("vite-error-overlay")'),
        'Development build error overlay',
      );
      console.log('PASS page', route);
    }
    await cdp('Page.enable');
    await cdp('Page.setInterceptFileChooserDialog', { enabled: true });
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await visit('/', 'document.querySelectorAll("app-collection-slider .point").length > 0');
    await until('document.querySelector("app-collection-slider .scene-image").naturalWidth > 0');
    await js('document.querySelector("app-collection-slider").scrollIntoView({block:"center"})');
    await js('document.querySelector("app-collection-slider .point").click()');
    await until('!!document.querySelector("app-collection-slider .popover")');
    assert.ok(await js('location.pathname === "/"'), 'Hotspot keeps home page');
    await js('Promise.all(Array.from(document.querySelectorAll("app-collection-slider img")).map(image => image.decode().catch(()=>{})))');
    await delay(200);
    await writeFile(path.join(artifacts, 'collection-desktop.png'), Buffer.from((await cdp('Page.captureScreenshot', {format:'png'})).data, 'base64'));
    await js('document.querySelector(".popover .heart").click()');
    await until('document.querySelector(".popover .heart").getAttribute("aria-pressed") === "true"');
    await js('document.querySelector(".popover .icon-button:not(.heart)").click()');
    await until('!!document.querySelector(".purchase select option")');
    assert.ok(await js('!!document.querySelector(".popover")'), 'Cart action does not dismiss popup');
    await js('document.querySelector(".purchase-actions button").click()');

    await until('document.querySelector(".popover [role=status]")?.textContent.includes("Đã thêm")');
    await js('document.querySelector(".popover .feedback a").click()');
    await until('!!document.querySelector(".cart-item") && location.pathname === "/cart"');
    assert.equal(await js('document.querySelectorAll(".cart-item").length'), 1);
    await js('(()=>{const input=document.querySelector(".cart-item input");input.value="2";input.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await until('document.querySelector(".summary").textContent.includes("2 sản phẩm")');
    await visit('/cart', 'document.querySelector(".cart-item input")?.value === "2"');
    await js('document.querySelector(".summary a").click()');
    await until('location.pathname === "/checkout" && !!document.querySelector(".summary .total strong") && !document.querySelector(".summary button")?.disabled');
    assert.ok(await js('!document.querySelector(".summary .error")'), 'Live quote succeeds');
    await js('document.querySelector(".summary a.primary").click()');
    await until('location.pathname === "/login" && new URLSearchParams(location.search).get("returnUrl") === "/checkout"');
    console.log('PASS home hotspot, favorite, variant selection, add cart, quantity, persistence, checkout pricing and login return URL.');
    await cdp('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
    await visit('/', 'document.querySelectorAll("app-collection-slider .point").length > 0');
    await until('document.querySelector("app-collection-slider .scene-image").naturalWidth > 0');
    await js('document.querySelector("app-collection-slider").scrollIntoView({block:"start"})');
    const pointTop = await js('document.querySelector("app-collection-slider .point").getBoundingClientRect().top');
    await js('document.querySelector("app-collection-slider .point").click()');
    await until('!!document.querySelector("app-collection-slider .popover")');
    await delay(200);
    assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'), 'Mobile no horizontal overflow');
    assert.ok(Math.abs(await js('document.querySelector("app-collection-slider .point").getBoundingClientRect().top') - pointTop) < 2, 'Opening card preserves hotspot position');
    await js('document.querySelector(".popover .icon-button:not(.heart)").click()');
    await until('!!document.querySelector(".purchase select option")');
    await writeFile(path.join(artifacts, 'collection-mobile.png'), Buffer.from((await cdp('Page.captureScreenshot', {format:'png'})).data, 'base64'));
    const interceptedOrders = [];
    ws.addEventListener('message', async ({data}) => {
      const event = JSON.parse(data);
      if (event.method !== 'Fetch.requestPaused') return;
      const request = event.params;
      const login = request.request.url.endsWith('/auth/login');
      const body = login ? {success:true,data:{user:{id:'000000000000000000000001',fullName:'Khách kiểm thử UI',roleName:'CUSTOMER'},accessToken:'ui-test-token'}} :
        {success:true,data:{orderCode:'CV-UI-TEST',totalAmount:JSON.parse(request.request.postData).expectedTotal}};
      if (!login) interceptedOrders.push(JSON.parse(request.request.postData));
      try {
        await cdp('Fetch.fulfillRequest', {requestId:request.requestId,responseCode:login ? 200 : 201,
          responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
      } catch (error) { errors.push(error.message); }
    });
    await cdp('Fetch.enable', {patterns:[{urlPattern:'*/api/v1/auth/login',requestStage:'Request'},{urlPattern:'*/api/v1/checkout',requestStage:'Request'}]});
    await js('document.querySelector(".purchase-actions .primary").click()');
    await until('location.pathname === "/checkout" && !!document.querySelector(".summary a.primary")');
    await js('document.querySelector(".summary a.primary").click()');
    await until('!!document.querySelector("app-login")');
    await js(`(()=>{for(const [name,value] of [['identifier','ui-test@example.invalid'],['password','UI-test-only']]){const input=document.querySelector('[formControlName='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('app-login form').requestSubmit();})()`);
    await until('location.pathname === "/checkout" && !!document.querySelector(".summary button[type=submit]") && !document.querySelector(".summary button[type=submit]").disabled');
    await js('document.querySelector("#shipping").requestSubmit()');
    await until('!!document.querySelector("#shipping .error")');
    assert.equal(interceptedOrders.length, 0, 'Invalid address never submits order');
    await js(`(()=>{for(const [name,value] of [['recipientName','Khách kiểm thử UI'],['recipientPhone','0901234567'],['addressLine','12 Nguyễn Huệ, TP Hồ Chí Minh']]){const input=document.querySelector('[formControlName='+name+']');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#shipping').requestSubmit();document.querySelector('#shipping').requestSubmit();})()`);
    await until('document.querySelector(".confirmation")?.textContent.includes("CV-UI-TEST")');
    assert.equal(interceptedOrders.length, 1, 'Double submit creates one request');
    assert.ok(interceptedOrders[0].items[0].variantId && interceptedOrders[0].expectedTotal > 0);
    assert.equal(await js('JSON.parse(localStorage.getItem("caraveso.cart.v1")).length'), 0, 'Success clears cart');
    await writeFile(path.join(artifacts,'collection-checkout-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await cdp('Fetch.disable');
    console.log('PASS buy now, login return, address validation, double-submit guard and order confirmation UI (intercepted test order; live database untouched).');
    await visit('/', 'document.querySelectorAll("app-collection-slider .point").length > 0');
    await js('document.querySelector("app-collection-slider .point").click()');
    await until('!!document.querySelector(".popover")');
    await js('document.querySelector(".popover .close").click()');
    await until('!document.querySelector(".popover")');
    await js('document.querySelector("app-collection-slider .point").click()');
    await until('!!document.querySelector(".popover")');
    await js('document.querySelector(".arrow--next").click()');
    await until('!document.querySelector(".popover")');
    await until('document.querySelectorAll("app-collection-slider .point").length > 0');
    const detailHref = await js('document.querySelector("app-collection-slider .caption a").getAttribute("href")');
    await visit(detailHref, 'document.querySelectorAll("app-hotspot-image .point").length > 0');
    await js('document.querySelector(".hotspot-list button").click()');
    await until('!!document.querySelector(".popover")');
    await js('document.querySelector(".popover .close").click()');
    await until('!document.querySelector(".popover")');
    await js('document.querySelector(".point").click()');
    await until('!!document.querySelector(".popover")');
    await js('document.querySelector(".popover .detail-link").click()');
    await until('!!document.querySelector("app-product-detail")');
    console.log('PASS mobile layout, stable hotspot, close, slide reset, collection detail list and product navigation.');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('Screenshots:', artifacts);
  } finally { ws?.close(); browser.kill(); }
}
main().catch((error) => { console.error(error.stack); process.exitCode = 1; });






