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
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await visit('/support', 'document.querySelectorAll("app-support-intro .service-card").length === 2');
    await until('!!document.querySelector("app-support-overview .signin-prompt")');
    assert.ok(await js(`document.querySelector('.policy-list details').open && !document.querySelector('.product-search')`));
    assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'), 'Support desktop overflow');
    const supportSize = (await cdp('Page.getLayoutMetrics')).cssContentSize;
    await writeFile(path.join(artifacts,'support-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1440,height:Math.min(supportSize.height,3000),scale:1}})).data,'base64'));
    await js('document.querySelectorAll(".service-card")[0].click()');
    await until('location.pathname === "/login" && !!document.querySelector("app-login")');
    assert.equal(await js(`new URLSearchParams(location.search).get('returnUrl')`), '/support?view=warranty');
    for (const view of ['return', 'requests']) {
      await visit('/support?view=' + view, 'location.pathname === "/login" && !!document.querySelector("app-login")');
      assert.equal(await js(`new URLSearchParams(location.search).get('returnUrl')`), '/support?view=' + view);
    }
    console.log('PASS support portal: public overview, service selection and protected personal forms.');
    await visit(
      '/products?q=sofa&sort=price_asc',
      'document.querySelectorAll("app-product-card").length > 0',
    );
    assert.ok(await js('document.querySelector("h1").textContent.includes("sofa")'));
    await until(
      'Array.from(document.querySelectorAll("app-product-card img")).some(image => image.complete && image.naturalWidth > 0)',
      25000,
    );
    await writeFile(
      path.join(artifacts, 'products-desktop.png'),
      Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    assert.ok(
      await js('document.documentElement.scrollWidth <= innerWidth'),
      'Desktop horizontal overflow',
    );
    await js('(()=>{const input=document.querySelector("app-catalog-intro input[type=search]");input.value="ghe";document.querySelector("app-catalog-intro form").requestSubmit();})()');
    await until('location.pathname === "/search" && new URLSearchParams(location.search).get("q") === "ghe" && document.querySelector("h1").textContent.includes("ghe")');
    await js('history.back()');
    await until('new URLSearchParams(location.search).get("q") === "sofa" && document.querySelector("h1").textContent.includes("sofa")');
    if(await js('document.querySelectorAll(".room-links button").length > 0')) {
      await js('document.querySelector(".room-links button").click()');
      await until('location.pathname === "/products" && !!new URLSearchParams(location.search).get("categoryIds") && !new URLSearchParams(location.search).has("q")');
      await js('history.back()');
      await until('new URLSearchParams(location.search).get("q") === "sofa"');
    }
    await js('(()=>{const select=document.querySelector(".sort-control select");select.value="price_desc";select.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await until('new URLSearchParams(location.search).get("sort")==="price_desc"');
    await js('history.back()');
    await until('new URLSearchParams(location.search).get("sort")==="price_asc" && document.querySelector(".sort-control select").value==="price_asc"');
    await visit('/search?q=giuong&minPrice=100000&maxPrice=500000','!!document.querySelector(".empty-state")');
    assert.ok(await js('document.querySelector(".chips").textContent.includes("100.000") && document.querySelector(".chips").textContent.includes("500.000")'));
    await writeFile(path.join(artifacts,'search-empty-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await visit(
      '/collections/' + (process.env.SMOKE_COLLECTION || 'oda'),
      'document.querySelectorAll("app-hotspot-image .point").length > 0',
    );
    await until(
      'document.querySelector("app-hotspot-image .scene > img")?.naturalWidth > 0',
      25000,
    );
    await js('document.querySelector("app-hotspot-image .point").click()');
    await until('!!document.querySelector("app-hotspot-image .popover a")');
    await js('document.querySelector("app-hotspot-image .point").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
    await until('!document.querySelector("app-hotspot-image .popover")');
    await js('document.querySelector("app-hotspot-image .point").click()');
    await until('!!document.querySelector("app-hotspot-image .popover a")');
    await writeFile(
      path.join(artifacts, 'hotspot-desktop.png'),
      Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    await visit('/search/image', '!!document.querySelector("app-image-search input[type=file]")');
    await writeFile(path.join(artifacts,'image-search-desktop.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js(
      '(()=>{const input=document.querySelector("app-image-search input[type=file]");const dt=new DataTransfer();dt.items.add(new File(["text"],"invalid.txt",{type:"text/plain"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));})()',
    );
    await until('document.querySelector("app-image-search").textContent.includes("Chỉ hỗ trợ")');
    await js(`(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const input=document.querySelector('app-image-search input[type=file]');const dt=new DataTransfer();dt.items.add(new File([bytes],'chair.png',{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await until(`document.querySelector('app-image-search .preview')?.naturalWidth > 0`);
    await js(`document.querySelector('.image-actions .primary').click()`);
    await until(`!!document.querySelector('app-image-search .feedback[role=alert], app-image-search .image-results')`);
    assert.ok(await js(`!document.querySelector('app-image-search').textContent.includes('EMBEDDING')`));
    await js(`document.querySelector('.image-actions button:last-child').click()`);
    await until(`!document.querySelector('app-image-search .preview') && !document.querySelector('app-image-search .feedback')`);
    await visit(
      '/account/warranty',
      'location.pathname === "/login" && !!document.querySelector("app-login")',
    );
    assert.ok(
      await js('new URLSearchParams(location.search).get("returnUrl") === "/account/warranty"'),
    );
    await cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await visit('/search/image', '!!document.querySelector("app-image-search .drop-zone")');
    assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'), 'Image search mobile overflow');
    await writeFile(path.join(artifacts,'image-search-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await visit('/support', '!!document.querySelector("app-support-overview")');
    assert.ok(await js('document.documentElement.scrollWidth <= innerWidth'), 'Support mobile overflow');
    const mobileSupportSize = (await cdp('Page.getLayoutMetrics')).cssContentSize;
    await writeFile(path.join(artifacts,'support-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:Math.min(mobileSupportSize.height,5000),scale:1}})).data,'base64'));
    await visit(
      '/products?minPrice=1000000&sort=price_desc',
      'document.querySelectorAll("app-product-card").length > 0',
    );
    await writeFile(path.join(artifacts,'search-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await js('document.querySelector(".catalog-toolbar .filter-toggle").click()');
    await until('!!document.querySelector(".filters--open")');
    await until('document.activeElement === document.querySelector(".filters--open .filter-toggle")');
    assert.equal(await js(`document.querySelector('input[aria-label="Giá thấp nhất"]').value`), '1.000.000');
    await js(`(()=>{const slider=document.querySelector('input[aria-label="Kéo giá thấp nhất"]');slider.value='2000000';slider.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(`document.querySelector('input[aria-label="Giá thấp nhất"]').value === '2.000.000'`);
    await until(`new URLSearchParams(location.search).get('minPrice') === '2000000'`);
    await js(`(()=>{const slider=document.querySelector('input[aria-label="Kéo giá thấp nhất"]');slider.value='1000000';slider.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await js(`document.querySelector('.price-section summary').click()`);
    assert.ok(await js(`!document.querySelector('.price-section').open`));
    await js(`document.querySelector('.price-section summary').click()`);
    await js(`(()=>{const input=document.querySelector('input[aria-label="Giá cao nhất"]');input.value='10000000';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await js(`document.querySelector('input[aria-label="Giá cao nhất"]').value`), '10.000.000');
    assert.ok(
      await js('document.documentElement.scrollWidth <= innerWidth'),
      'Mobile horizontal overflow',
    );
    await writeFile(
      path.join(artifacts, 'filters-mobile.png'),
      Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    );
    await until('new URLSearchParams(location.search).get("maxPrice")==="10000000"');
    await until(`!document.querySelector('.catalog-results [role=status]')`);
    assert.ok(await js(`!!document.querySelector('.filters--open') && !document.querySelector('.apply-button')`));
    assert.ok(await js('document.querySelector(".chips").textContent.includes("10.000.000")'));
    await js(`document.querySelector('.quick-options input[type=checkbox]').click()`);
    await until(`new URLSearchParams(location.search).get('inStock') === 'true'`);
    await until(`!document.querySelector('.catalog-results [role=status]')`);
    await js(`document.querySelector('.quick-options input[type=checkbox]').click()`);
    await until(`!new URLSearchParams(location.search).has('inStock')`);
    await js(`(()=>{const input=document.querySelector('input[aria-label="Giá cao nhất"]');input.value='100';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until(`!!document.querySelector('.filters [role=alert]')`);
    assert.equal(await js(`new URLSearchParams(location.search).get('maxPrice')`),'10000000');
    await js(`(()=>{const input=document.querySelector('input[aria-label="Giá cao nhất"]');input.value='20000000';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.filters .reset-button').click();})()`);
    await until(`document.querySelector('input[aria-label="Giá thấp nhất"]').value === '' && document.querySelector('input[aria-label="Giá cao nhất"]').value === '' && !new URLSearchParams(location.search).has('maxPrice')`);
    await delay(500);
    assert.ok(await js(`!new URLSearchParams(location.search).has('maxPrice')`), 'Reset cancels pending filter changes');
    await js('document.querySelector(".filters--open .filter-toggle").click()');
    console.log('PASS live filters: checkbox, slider and typed price update automatically; invalid range blocked; reset cancels pending updates.');
    if (process.env.SMOKE_FIXTURE) {
      const fixture = JSON.parse(process.env.SMOKE_FIXTURE);
      async function fill(selector, value) {
        await js(
          `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
        );
      }
      async function select(selector, value) {
        await js(
          `(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
      }
      async function textarea(selector, value) {
        await js(
          `(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
        );
      }
      async function evidence() {
        await js(
          `(()=>{const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1kAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const input=document.querySelector('app-evidence-upload input[type=file]');const dt=new DataTransfer();dt.items.add(new File([bytes],'proof.png',{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        await until('!!document.querySelector("app-evidence-upload .evidence img")');
      }
      await visit('/support?view=warranty&card=' + fixture.card, '!!document.querySelector("app-login")');
      await fill('input[formControlName=identifier]', fixture.identifier);
      await fill('input[formControlName=password]', fixture.password);
      await js('document.querySelector("app-login form").requestSubmit()');
      await until('!!document.querySelector("app-after-sales app-warranty-form form")');
      assert.equal(await js(`document.querySelector('select[formControlName=warrantyCardId]').value`), fixture.card);
      await visit('/support', `!!document.querySelector('.warranty-product')`);
      await js(`(()=>{const input=document.querySelector('.product-search input');input.value='CV-VERIFY';document.querySelector('.product-search').requestSubmit();})()`);
      await until(`!!document.querySelector('.warranty-product')`);
      await js(`(()=>{const input=document.querySelector('.product-search input');input.value='NO-SUCH-ORDER';document.querySelector('.product-search').requestSubmit();})()`);
      await until(`!document.querySelector('.warranty-product') && document.querySelector('app-support-overview').textContent.includes('Không tìm thấy')`);
      await js(`(()=>{const inputs=document.querySelectorAll('.product-search input');inputs[0].value='';inputs[1].value='';document.querySelector('.product-search').requestSubmit();})()`);
      await until(`!!document.querySelector('.warranty-product')`);
      const purchasedName = await js(`document.querySelector('.warranty-product h3').textContent.trim()`);
      await js(`(()=>{document.querySelectorAll('.product-search input')[1].value=${JSON.stringify(purchasedName)};document.querySelector('.product-search').requestSubmit();})()`);
      await until(`!!document.querySelector('.warranty-product')`);
      await js(`Array.from(document.querySelectorAll('.product-action button')).find(button=>!button.disabled).click()`);
      await until(`!!document.querySelector('app-after-sales app-warranty-form form') && !!new URLSearchParams(location.search).get('card')`);
      assert.ok(await js(`!!document.querySelector('select[formControlName=warrantyCardId]').value`));
      console.log('PASS support reference: purchased products, order/name search, empty results and preselected warranty form.');
      await visit('/account/warranty', '!!document.querySelector("app-warranty-dashboard .panel")');
      await until(
        '!document.querySelector("app-warranty-dashboard").textContent.includes("Đang tải phiếu")',
      );
      await writeFile(
        path.join(artifacts, 'warranty-mobile.png'),
        Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
      );
      await visit(
        '/account/warranty/new?card=' + fixture.card,
        '!!document.querySelector("app-warranty-form form")',
      );
      await textarea(
        'textarea[formControlName=defectDescription]',
        'Sản phẩm có lỗi cần được kiểm tra qua giao diện',
      );
      await fill('input[formControlName=phone]', '0901234567');
      await fill('input[formControlName=address]', '12 Nguyễn Huệ, TP Hồ Chí Minh');
      await evidence();
      await js('document.querySelector("app-warranty-form form").requestSubmit()');
      await until('!!document.querySelector("app-warranty-detail article")');
      await visit('/account/returns/new', '!!document.querySelector("app-return-form form")');
      await until(`Array.from(document.querySelector('select[formControlName=orderId]').options).some(option=>option.value === ${JSON.stringify(fixture.order)})`);
      await select('select[formControlName=orderId]', fixture.order);
      await until(
        '(document.querySelector("select[formControlName=orderItemId]")?.options.length || 0) > 1',
      );
      await select('select[formControlName=orderItemId]', fixture.item);
      console.log('PASS return form: eligible order/item selected');
      await textarea(
        'textarea[formControlName=description]',
        'Thay đổi nhu cầu sử dụng và muốn trả sản phẩm',
      );
      await evidence();
      await fill('input[formControlName=bankName]', 'Ngân hàng kiểm thử');
      await fill('input[formControlName=accountNumber]', '1234567890');
      await fill('input[formControlName=accountHolder]', 'KHACH KIEM THU');
      await fill('input[formControlName=phone]', '0901234567');
      await fill('input[formControlName=address]', '12 Nguyễn Huệ, TP Hồ Chí Minh');
      await js('document.querySelector("app-return-form form").requestSubmit()');
      await until('!!document.querySelector("app-return-detail article")');
      console.log('PASS return form: submitted through UI');
      assert.ok(
        await js('document.querySelector("app-return-detail").textContent.includes("******7890")'),
      );
      await js(
        'Array.from(document.querySelectorAll("app-return-detail button")).find(b=>b.textContent.includes("Hủy yêu cầu")).click()',
      );
      await until(
        'Array.from(document.querySelectorAll("app-return-detail button")).some(b=>b.textContent.includes("Xác nhận hủy"))',
      );
      await js(
        'Array.from(document.querySelectorAll("app-return-detail button")).find(b=>b.textContent.includes("Xác nhận hủy")).click()',
      );
      await until('document.querySelector("app-return-detail").textContent.includes("Đã hủy")');
      await visit('/policies/returns', '!!document.querySelector("app-policy")');
      await until('/7\\s+ngày/.test(document.querySelector("app-policy").textContent)');
      await visit('/support?view=warranty&card=' + fixture.card, '!!document.querySelector("app-after-sales app-warranty-form form")');
      await textarea('app-warranty-form textarea[formControlName=defectDescription]', 'Yêu cầu bảo hành ngay trên trang hỗ trợ chung');
      await fill('app-warranty-form input[formControlName=phone]', '0901234567');
      await fill('app-warranty-form input[formControlName=address]', '12 Nguyễn Huệ, TP Hồ Chí Minh');
      await evidence();
      await js('document.querySelector("app-after-sales app-warranty-form form").requestSubmit()');
      await until('location.pathname === "/support" && !!document.querySelector("app-after-sales .request-detail")');
      await visit('/support?view=return', '!!document.querySelector("app-after-sales app-return-form form")');
      await until(`Array.from(document.querySelector('app-after-sales select[formControlName=orderId]').options).some(option=>option.value === ${JSON.stringify(fixture.order)})`);
      await select('select[formControlName=orderId]',fixture.order);
      await until('(document.querySelector("select[formControlName=orderItemId]")?.options.length || 0) > 1');
      await select('select[formControlName=orderItemId]',fixture.item);
      await textarea('textarea[formControlName=description]','Yêu cầu trả hàng ngay trong trang hỗ trợ chung');
      await evidence();
      await fill('input[formControlName=bankName]','Ngân hàng kiểm thử');
      await fill('input[formControlName=accountNumber]','1234567890');
      await fill('input[formControlName=accountHolder]','KHACH KIEM THU');
      await fill('input[formControlName=phone]','0901234567');
      await fill('input[formControlName=address]','12 Nguyễn Huệ, TP Hồ Chí Minh');
      await js('document.querySelector("app-after-sales app-return-form form").requestSubmit()');
      await until('location.pathname === "/support" && !!document.querySelector(".request-detail")');
      assert.ok(await js('document.querySelector(".request-detail").textContent.includes("******7890")'));
      await js('Array.from(document.querySelectorAll(".request-detail button")).find(b=>b.textContent.includes("Hủy yêu cầu")).click()');
      await until('Array.from(document.querySelectorAll(".cancel-box button")).some(b=>b.textContent.includes("Xác nhận hủy"))');
      await js('Array.from(document.querySelectorAll(".cancel-box button")).find(b=>b.textContent.includes("Xác nhận hủy")).click()');
      await until('document.querySelector(".request-detail")?.textContent?.includes("Đã hủy")');
      await writeFile(path.join(artifacts,'support-request-mobile.png'),Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      console.log('PASS unified support: embedded warranty/return submissions, inline detail, bank masking and cancellation without leaving /support.');
      console.log(
        'PASS authenticated UI: login, refresh on direct navigation, warranty evidence/submission, return evidence/submission, bank masking, cancellation and policy.',
      );
    }
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log(
      'PASS browser: products/search, collection hotspot, invalid image, auth redirect, mobile filter and no runtime exceptions.',
    );
    console.log('Screenshots:', artifacts);
  } finally {
    ws?.close();
    browser.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
