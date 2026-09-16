const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const context = vm.createContext({ window: {}, URL });
for (const file of ['config.js', 'data/postos.js', 'domain/distancia.js', 'services/mapas.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
}
const app = context.window.RotaCombustivel;
const { criarLinkRota, criarLinkPosto } = app.services.mapas;

test('links de todos os postos priorizam o endereço completo, preservando a origem da rota', () => {
    for (const posto of app.postos) {
        const url = new URL(criarLinkRota(posto, { lat: -19.9, lon: -44.1 }));
        assert.equal(url.origin, 'https://www.google.com');
        assert.equal(url.pathname, '/maps/dir/');
        assert.equal(url.searchParams.get('api'), '1');
        assert.equal(url.searchParams.get('origin'), '-19.9,-44.1');
        const destino = [posto.nomeMapa, posto.Endereço, posto.Cidade, posto.Estado, 'Brasil'].filter(Boolean).join(', ');
        assert.equal(url.searchParams.get('destination'), destino);
        assert.equal(new URL(criarLinkPosto(posto)).searchParams.get('query'), destino);
        assert.notEqual(url.searchParams.get('destination'), `${posto.lat},${posto.lon}`);
        assert.equal(url.searchParams.get('travelmode'), 'driving');
        assert.equal(url.searchParams.has('destination_place_id'), false);
    }
});

test('nome confirmado do Caxuxa I complementa o endereço rodoviário no mapa', () => {
    const url = new URL(criarLinkPosto(app.postos[0]));
    assert.equal(url.searchParams.get('query'), 'Posto Caxuxa Luz, BR-262, km 523, Luz, MG, Brasil');
    assert.equal(url.pathname, '/maps/search/');
});

test('identificador confirmado do Google Maps é passado nas duas ações', () => {
    const posto = { ...app.postos[0], placeId: 'id-ficticio-somente-teste' };
    assert.equal(new URL(criarLinkRota(posto)).searchParams.get('destination_place_id'), posto.placeId);
    assert.equal(new URL(criarLinkPosto(posto)).searchParams.get('query_place_id'), posto.placeId);
});

test('acentos e caracteres especiais não alteram os parâmetros da URL', () => {
    const posto = { Nome: 'Posto interno', nomeMapa: 'Posto São João & Filhos #1', Endereço: 'Rua A, 10', Cidade: 'Luz', Estado: 'MG' };
    const url = new URL(criarLinkRota(posto, { lat: NaN, lon: 0 }));
    assert.equal(url.searchParams.get('destination'), 'Posto São João & Filhos #1, Rua A, 10, Luz, MG, Brasil');
    assert.equal(url.searchParams.has('origin'), false);
    assert.equal(url.hash, '');
});

test('endereço completo funciona mesmo sem coordenadas e sem nome confirmado', () => {
    const posto = { Nome: 'Posto sem coordenadas', Endereço: 'Rua A, 10', Cidade: 'Luz', Estado: 'MG' };
    const url = new URL(criarLinkPosto(posto));
    assert.equal(url.searchParams.get('query'), 'Rua A, 10, Luz, MG, Brasil');
});

test('Padre Eustáquio usa o número 788 nas duas ações mesmo recebendo as coordenadas antigas', () => {
    const cadastrado = app.postos.find(p => p.Nome === 'POSTO 621 PADRE EUSTAQUIO');
    const destino = 'Posto Bretas Duarte, Rua Pará de Minas, 788, Belo Horizonte, MG, Brasil';
    for (const posto of [cadastrado, { ...cadastrado, lat: -19.915, lon: -43.985 }]) {
        assert.equal(new URL(criarLinkRota(posto)).searchParams.get('destination'), destino);
        assert.equal(new URL(criarLinkPosto(posto)).searchParams.get('query'), destino);
    }
    assert.equal(cadastrado.lat, -19.914019);
    assert.equal(cadastrado.lon, -43.9889773);
});

test('Cinquentenário usa o Posto Shell e o ponto confirmado no Google Maps', () => {
    const cadastrado = app.postos.find(p => p.Nome === 'POSTO 623 CINQUENTENARIO');
    const destino = 'Posto Shell, Rua Úrsula Paulino, 763, Belo Horizonte, MG, Brasil';
    assert.equal(new URL(criarLinkRota(cadastrado)).searchParams.get('destination'), destino);
    assert.equal(new URL(criarLinkPosto(cadastrado)).searchParams.get('query'), destino);
    assert.equal(cadastrado.lat, -19.9550962);
    assert.equal(cadastrado.lon, -43.9840226);
});

test('sem endereço completo, usa coordenadas válidas ou a identificação disponível', () => {
    const posto = { Nome: 'Posto sem endereço', lat: -20, lon: -44 };
    assert.equal(new URL(criarLinkRota(posto)).searchParams.get('destination'), '-20,-44');
    assert.equal(new URL(criarLinkPosto(posto)).searchParams.get('query'), '-20,-44');
    assert.equal(new URL(criarLinkPosto({ Nome: 'Posto teste', Cidade: 'Luz', Estado: 'MG' })).searchParams.get('query'), 'Posto teste, Luz, MG, Brasil');
});

function localizadorSimulado(responderRota) {
    const elementos = new Map(['inpOrigem', 'btnGPS', 'btnBuscarCidade', 'statusBusca', 'resultadosPostos']
        .map(id => [id, { value: 'Origem de teste', style: {}, setAttribute() {} }]));
    const contexto = vm.createContext({
        window: {}, URL, AbortController, setTimeout, clearTimeout,
        document: { getElementById: id => elementos.get(id) },
        fetch: async url => String(url).includes('nominatim')
            ? { ok: true, json: async () => [{ lat: '-19.9', lon: '-44', display_name: 'Origem de teste' }] }
            : responderRota(url)
    });
    for (const file of ['config.js', 'data/postos.js', 'utils/formatacao.js', 'domain/combustivel.js',
        'domain/distancia.js', 'services/mapas.js', 'ui/postos.js', 'controllers/localizador.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), contexto);
    }
    const app = contexto.window.RotaCombustivel;
    app.ui.veiculo = { lerParametros: () => ({ capacidade: 560, nivel: 1, consumo: 2, margem: 0.15, validos: true }) };
    return { app, elementos, contexto };
}

test('NoRoute não vira estimativa nem aviso verde, inclusive em resposta HTTP de erro', async () => {
    for (const ok of [true, false]) {
        const { app, elementos } = localizadorSimulado(async () => ({ ok, json: async () => ({ code: 'NoRoute' }) }));
        await app.controllers.localizador.buscarPostos();
        const html = elementos.get('resultadosPostos').innerHTML;
        assert.equal((html.match(/ROTA NÃO ENCONTRADA/g) || []).length, 5);
        assert.doesNotMatch(html, /status-success|📏 estimativa|~[\d.]+ km|margem segura:|NaN/);
        app.controllers.localizador.atualizarResultados();
        assert.equal(elementos.get('resultadosPostos').innerHTML, html);
        assert.equal(elementos.get('btnBuscarCidade').disabled, false);
    }
});

test('falha de conexão preserva a estimativa de distância e as regras de autonomia', async () => {
    const { app, elementos } = localizadorSimulado(async () => { throw new Error('Sem conexão'); });
    await app.controllers.localizador.buscarPostos();
    const html = elementos.get('resultadosPostos').innerHTML;
    assert.equal((html.match(/📏 estimativa/g) || []).length, 5);
    assert.match(html, /status-success/);
    assert.doesNotMatch(html, /ROTA NÃO ENCONTRADA/);
});

test('postos com trajeto precedem os resultados sem rota', async () => {
    let chamadas = 0;
    const { app, elementos } = localizadorSimulado(async () => ({ ok: true, json: async () =>
        ++chamadas <= 8 ? { code: 'NoRoute' } : { code: 'Ok', routes: [{ distance: 50000, duration: 3600 }] }
    }));
    await app.controllers.localizador.buscarPostos();
    const html = elementos.get('resultadosPostos').innerHTML;
    assert.equal((html.match(/🛣️ rota rodoviária/g) || []).length, 2);
    assert.equal((html.match(/ROTA NÃO ENCONTRADA/g) || []).length, 3);
    assert.ok(html.indexOf('~50.0 km') < html.indexOf('Sem rota'));
});

test('geocodificação rejeita valores ausentes, tipos indevidos e coordenadas fora dos limites', async () => {
    const { app, contexto } = localizadorSimulado();
    const invalidos = [null, '', ' ', false, true, [], {}, 'abc', 'Infinity', undefined];
    const respostas = [null, {}, ...invalidos.map(lat => ({ lat, lon: '-44' })),
        ...invalidos.map(lon => ({ lat: '-19.9', lon })),
        { lat: '91', lon: '0' }, { lat: '-91', lon: '0' }, { lat: '0', lon: '181' }, { lat: '0', lon: '-181' }];
    for (const resposta of respostas) {
        contexto.fetch = async () => ({ ok: true, json: async () => [resposta] });
        await assert.rejects(app.services.mapas.geocodificarOrigem('Teste'), /coordenadas inválidas/);
    }
    for (const resposta of [{ lat: '-19.9', lon: '-44' }, { lat: 0, lon: 0 }]) {
        contexto.fetch = async () => ({ ok: true, json: async () => [resposta] });
        const local = await app.services.mapas.geocodificarOrigem('Teste');
        assert.equal(local.coordenadas.lat, Number(resposta.lat));
        assert.equal(local.coordenadas.lon, Number(resposta.lon));
    }
});

test('origem inválida não consulta rotas e permite uma nova busca', async () => {
    const { app, contexto, elementos } = localizadorSimulado();
    let chamadas = 0;
    contexto.fetch = async () => { chamadas++; return { ok: true, json: async () => [{ lat: null, lon: '' }] }; };
    await app.controllers.localizador.buscarPostos();
    assert.equal(chamadas, 1);
    assert.match(elementos.get('statusBusca').textContent, /coordenadas inválidas/);
    assert.equal(elementos.get('btnGPS').disabled, false);
    assert.equal(elementos.get('btnBuscarCidade').disabled, false);
    assert.equal(elementos.get('resultadosPostos').style.display, 'none');
});

test('cadastro fora do intervalo brasileiro não participa das consultas de rota', async () => {
    let chamadas = 0;
    const { app, elementos } = localizadorSimulado(async () => {
        chamadas++;
        return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1000, duration: 60 }] }) };
    });
    app.postos.splice(0, app.postos.length,
        { Nome: 'Posto válido', lat: -19.9, lon: -44 },
        { Nome: 'Posto fora do Brasil', lat: -19.9, lon: -29 },
        { Nome: 'Posto fora do globo', lat: 100, lon: -44 });
    await app.controllers.localizador.buscarPostos();
    assert.equal(chamadas, 1);
    assert.match(elementos.get('resultadosPostos').innerHTML, /Posto válido/);
    assert.doesNotMatch(elementos.get('resultadosPostos').innerHTML, /Posto fora/);
});

test('GPS inválido libera os botões sem consultar mapas', () => {
    const { app, contexto, elementos } = localizadorSimulado();
    contexto.navigator = { geolocation: { getCurrentPosition: sucesso => sucesso({ coords: { latitude: 91, longitude: -44 } }) } };
    contexto.fetch = () => { assert.fail('GPS inválido não deve consultar mapas'); };
    app.controllers.localizador.buscarGPS();
    assert.match(elementos.get('statusBusca').textContent, /GPS retornou coordenadas inválidas/);
    assert.equal(elementos.get('btnGPS').disabled, false);
    assert.equal(elementos.get('btnBuscarCidade').disabled, false);
});

test('serviço de rota rejeita coordenadas inválidas antes de acessar a rede', async () => {
    const { app, contexto } = localizadorSimulado();
    contexto.fetch = () => { assert.fail('Não deve consultar a rede'); };
    await assert.rejects(app.services.mapas.obterRotaOSRM({ lat: 91, lon: 0 }, app.postos[0]), /Coordenadas inválidas/);
    await assert.rejects(app.services.mapas.obterRotaOSRM({ lat: 0, lon: 0 }, { lat: null, lon: 0 }), /Coordenadas inválidas/);
});
