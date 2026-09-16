const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { criarServidor } = require('../scripts/server.cjs');

test('servidor entrega o HTML e todos os recursos da arquitetura', async t => {
    const server = criarServidor({ arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    const resources = [...html.matchAll(/(?:src|href)="((?:src|assets)\/[^"?#]+)"/g)];
    assert.ok(resources.length > 1);
    for (const [, resource] of resources) {
        const response = await fetch(`${base}/${resource}`);
        assert.equal(response.status, 200, resource);
        const body = Buffer.from(await response.arrayBuffer());
        assert.ok(body.length > 0, resource);
        const tipos = { css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png', csv: 'text/csv; charset=utf-8' };
        assert.equal(response.headers.get('content-type'), tipos[resource.split('.').pop()]);
        if (resource.endsWith('.png')) assert.equal(body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        if (resource.endsWith('.csv')) {
            assert.equal(response.headers.get('content-disposition'), 'attachment');
            const { analisarCSV } = require('../scripts/importacao-csv.cjs');
            const modelo = analisarCSV(body.toString('utf8'));
            assert.deepEqual(modelo.erros, []);
            assert.equal(modelo.novos, 1);
        }
    }
    assert.equal(await (await fetch(`${base}/index.html`)).text(), html);
    for (const url of ['/backup/original.html.txt', '/package.json', '/scripts/server.cjs', '/src/../package.json']) {
        assert.equal((await fetch(base + url)).status, 404, url);
    }
});

test('imagem declarada após iniciar o servidor carrega sem reiniciar', async t => {
    const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'rota-server-'));
    const pagina = 'index.html';
    const htmlPath = path.join(diretorio, pagina);
    fs.writeFileSync(htmlPath, '<!DOCTYPE html><title>Teste</title>');
    fs.mkdirSync(path.join(diretorio, 'assets'));
    const png = fs.readFileSync(path.join(__dirname, '../assets/images/logo-rota-combustivel.png'));
    fs.writeFileSync(path.join(diretorio, 'assets/logo.png'), png);
    const server = criarServidor({ diretorio, pagina, arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        if (path.dirname(diretorio) === path.resolve(os.tmpdir()) && path.basename(diretorio).startsWith('rota-server-')) {
            fs.rmSync(diretorio, { recursive: true, force: true });
        }
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/assets/logo.png`)).status, 404);
    fs.writeFileSync(htmlPath, '<!DOCTYPE html><title>Teste</title><img src="assets/logo.png">');
    const response = await fetch(`${base}/assets/logo.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    fs.writeFileSync(htmlPath, '<!DOCTYPE html><title>Teste</title>');
    assert.equal((await fetch(`${base}/assets/logo.png`)).status, 404);
});

test('proxy de geocodificação identifica a aplicação antes de consultar o Nominatim', async t => {
    const originalFetch = global.fetch;
    let chamada;
    global.fetch = async (url, opcoes) => {
        if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, opcoes);
        chamada = { url: String(url), opcoes };
        return new Response(JSON.stringify([{ lat: '-19.9', lon: '-44', display_name: 'Contagem, MG' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    const server = criarServidor({ arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        global.fetch = originalFetch;
        await new Promise(resolve => server.close(resolve));
    });

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/geocodificar?q=Contagem%2C%20MG`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ lat: '-19.9', lon: '-44', display_name: 'Contagem, MG' }]);
    assert.match(chamada.url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    assert.equal(chamada.opcoes.headers['User-Agent'], 'RotaCombustivel/0.1 (+mailto:isaiascssilva@gmail.com)');
});
