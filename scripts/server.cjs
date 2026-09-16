const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { abrirBanco, listarPostos, listarLojas, cadastrarLoja, importarLojas } = require('./database.cjs');
const { responderImportacao } = require('./importacao-http.cjs');
const { responderCadastro } = require('./cadastro-http.cjs');
const { lerCSV } = require('./importacao-csv.cjs');

const root = path.resolve(__dirname, '..');
const entry = 'src_rota_e_combustivel.html';
const nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';

async function responderGeocodificacao(url, res) {
    const texto = url.searchParams.get('q')?.trim();
    if (!texto) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: 'Informe uma origem.' }));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const consulta = new URL(nominatimEndpoint);
        consulta.searchParams.set('format', 'jsonv2');
        consulta.searchParams.set('limit', '1');
        consulta.searchParams.set('countrycodes', 'br');
        consulta.searchParams.set('q', texto);
        const resposta = await fetch(consulta, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'User-Agent': 'RotaCombustivel/0.1 (+mailto:isaiascssilva@gmail.com)'
            }
        });
        const dados = await resposta.text();
        res.writeHead(resposta.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(dados);
    } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: error.name === 'AbortError' ? 'Serviço de mapas demorou demais.' : 'Serviço de mapas indisponível.' }));
    } finally {
        clearTimeout(timeout);
    }
}

// Servir apenas a página e seus recursos declarados. Backups e ferramentas são privados.
function criarServidor({ diretorio = root, pagina = entry, arquivoBanco } = {}) {
    diretorio = path.resolve(diretorio);
    const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.csv': 'text/csv; charset=utf-8' };
    const db = abrirBanco({ arquivo: arquivoBanco });
    if (db && typeof db.then === 'function') return db.then(banco => criarServidorComBanco({ diretorio, pagina, tipos }, banco));
    return criarServidorComBanco({ diretorio, pagina, tipos }, db);
}

function criarServidorComBanco({ diretorio, pagina, tipos }, db) {
    const server = http.createServer((req, res) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.writeHead(400); return res.end('Endereço inválido.'); }
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/postos/importar') return responderImportacao(req, res, db, url);
        if (url.pathname === '/api/postos' && req.method === 'POST') return responderCadastro(req, res, db);
        if (url.pathname === '/api/lojas' && req.method === 'POST') return receberLoja(req, res, db);
        if (url.pathname === '/api/lojas/importar' && req.method === 'POST') return receberLojas(req, res, db);
        if (url.pathname === '/api/rotas' && req.method === 'POST') return receberRotaGoogle(req, res);
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405, { Allow: 'GET, HEAD' });
            return res.end();
        }
        if (url.pathname === '/api/postos') {
            Promise.resolve().then(() => listarPostos(db)).then(dadosBrutos => {
                const dados = JSON.stringify(dadosBrutos);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(req.method === 'HEAD' ? undefined : dados);
            }).catch(() => {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Não foi possível consultar os postos.' }));
            });
            return;
        }
        if (url.pathname === '/api/lojas') {
            return Promise.resolve().then(() => listarLojas(db)).then(dadosBrutos => {
                const dados = JSON.stringify(dadosBrutos);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                return res.end(req.method === 'HEAD' ? undefined : dados);
            }).catch(() => responderJSON(res, 500, { error: 'Não foi possível consultar as lojas.' }));
        }
        if (url.pathname === '/api/geocodificar') {
            if (req.method !== 'GET') {
                res.writeHead(405, { Allow: 'GET' });
                return res.end();
            }
            return responderGeocodificacao(url, res);
        }
        // Ler o HTML atual evita manter uma lista antiga após adicionar imagens ou scripts.
        fs.readFile(path.join(diretorio, pagina), 'utf8', (htmlError, html) => {
            if (htmlError) { res.writeHead(500); return res.end('Página indisponível.'); }
            const publicos = new Map([['/', pagina], ['/index.html', pagina], [`/${pagina}`, pagina]]);
            for (const match of html.matchAll(/(?:src|href)="((?:src|assets)\/[^"?#]+)"/g)) {
                const file = match[1];
                if (path.resolve(diretorio, file).startsWith(diretorio + path.sep)) {
                    publicos.set(`/${file}`, file);
                }
            }
            const file = publicos.get(pathname);
            if (!file) { res.writeHead(404); return res.end('Arquivo não encontrado.'); }
            fs.readFile(path.join(diretorio, file), (error, data) => {
                if (error) { res.writeHead(404); return res.end('Recurso indisponível.'); }
                res.writeHead(200, { 'Content-Type': tipos[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store',
                    ...(path.extname(file) === '.csv' ? { 'Content-Disposition': 'attachment' } : {}) });
                res.end(req.method === 'HEAD' ? undefined : data);
            });
        });
    });
    server.once('close', () => Promise.resolve(db.close()).catch(() => {}));
    return server;
}

function responderJSON(res, status, dados) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(dados));
}

async function lerCorpo(req, limite = 1024 * 1024) {
    const partes = [];
    let tamanho = 0;
    for await (const parte of req) {
        tamanho += parte.length;
        if (tamanho > limite) throw new Error('O arquivo excede o limite de 1 MB.');
        partes.push(parte);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes));
}

async function receberLoja(req, res, db) {
    try {
        const dados = JSON.parse(await lerCorpo(req, 16384));
        const resultado = await cadastrarLoja(db, dados);
        if (resultado.erros.length) return responderJSON(res, 422, resultado);
        if (resultado.duplicados) return responderJSON(res, 409, { error: 'Esta loja já está cadastrada.' });
        responderJSON(res, 201, resultado);
    } catch { responderJSON(res, 400, { error: 'Não foi possível ler o cadastro da loja.' }); }
}

async function receberLojas(req, res, db) {
    try {
        const texto = await lerCorpo(req);
        const registros = lerCSV(texto);
        if (registros.length < 2) return responderJSON(res, 422, { error: 'Inclua o cabeçalho e pelo menos uma loja.' });
        const normalizarCabecalho = campo => campo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[?\uFFFD]/g, 'c').replace(/[ _-]/g, '');
        const cabecalho = registros.shift().campos.map(normalizarCabecalho);
        const aliases = { nome: 'Nome', marca: 'Marca', brand: 'Marca', endereco: 'Endereço', cidade: 'Cidade', estado: 'Estado', uf: 'Estado', lat: 'lat', latitude: 'lat', lon: 'lon', longitude: 'lon', link: 'linkMaps', linkmaps: 'linkMaps', maps: 'linkMaps' };
        const campos = cabecalho.map(c => aliases[c]);
        if (campos.some(c => !c) || !['Nome', 'Endereço', 'Cidade', 'Estado'].every(c => campos.includes(c)) ||
            (campos.includes('lat') !== campos.includes('lon'))) {
            return responderJSON(res, 422, { error: 'Use as colunas nome, endereco, cidade e estado. Latitude e longitude são opcionais, mas devem aparecer juntas.' });
        }
        const lojas = registros.map(registro => {
            if (registro.campos.length !== campos.length) throw new Error(`Linha ${registro.linha}: quantidade de campos diferente do cabeçalho.`);
            return Object.fromEntries(registro.campos.map((valor, i) => [campos[i], valor]));
        });
        responderJSON(res, 201, await importarLojas(db, lojas));
    } catch (error) { responderJSON(res, 422, { error: error.message || 'Não foi possível importar as lojas.' }); }
}

async function receberRotaGoogle(req, res) {
    const chave = process.env.GOOGLE_MAPS_API_KEY;
    if (!chave) return responderJSON(res, 503, { error: 'Google Maps API não configurada.' });
    try {
        const dados = JSON.parse(await lerCorpo(req, 128 * 1024));
        const origem = dados.origem;
        const destinos = Array.isArray(dados.destinos) ? dados.destinos : [];
        if (!origem || destinos.length === 0) return responderJSON(res, 422, { error: 'Origem e destinos são obrigatórios.' });
        const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
        url.searchParams.set('origin', `${origem.lat},${origem.lon}`);
        url.searchParams.set('destination', `${destinos[destinos.length - 1].lat},${destinos[destinos.length - 1].lon}`);
        if (destinos.length > 1) url.searchParams.set('waypoints', destinos.slice(0, -1).map(p => `${p.lat},${p.lon}`).join('|'));
        url.searchParams.set('mode', 'driving');
        url.searchParams.set('key', chave);
        const resposta = await fetch(url);
        const resultado = await resposta.json();
        if (!resposta.ok || resultado.status !== 'OK' || !resultado.routes?.[0]?.legs?.length) {
            return responderJSON(res, 502, { error: resultado.error_message || `Google Maps: ${resultado.status || 'falha'}.` });
        }
        const trechos = resultado.routes[0].legs.map((leg, indice) => ({
            origem: indice === 0 ? 'Ponto atual' : destinos[indice - 1].Nome,
            destino: destinos[indice].Nome,
            distanciaKm: leg.distance.value / 1000,
            tempoMin: leg.duration.value / 60
        }));
        responderJSON(res, 200, { provedor: 'GOOGLE_MAPS', trechos });
    } catch (error) { responderJSON(res, 502, { error: error.message || 'Não foi possível consultar o Google Maps.' }); }
}

module.exports = { criarServidor };
