const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validarPosto } = require('../scripts/validacao-postos.cjs');
const { abrirBanco, cadastrarPosto, importarCSV, listarPostos } = require('../scripts/database.cjs');
const { criarServidor } = require('../scripts/server.cjs');

const dados = { Nome: ' Posto São João ', Endereço: "Rua D'Água, 10", Cidade: 'Belo Horizonte', Estado: 'mg', lat: '-19,9', lon: -43.94, cnpj: '12.345.678/0001-90' };
const csv = 'nome;endereco;cidade;estado;latitude;longitude;cnpj\nPosto São João;"Rua D\'Água, 10";Belo Horizonte;MG;-19.9;-43.94;12345678000190';

test('formulário normaliza dados e rejeita coordenadas vazias, tipos e CNPJ inválidos', () => {
    const valido = validarPosto(dados);
    assert.deepEqual(valido.erros, []);
    assert.equal(valido.posto.Nome, 'Posto São João');
    assert.equal(valido.posto.lat, -19.9);
    assert.equal(valido.posto.cnpj, '12345678000190');
    assert.equal(valido.posto.nomeMapa, null);
    for (const invalido of [null, [], {}, { ...dados, lat: '' }, { ...dados, lat: null },
        { ...dados, lat: false }, { ...dados, lon: [] }, { ...dados, Nome: {} },
        { ...dados, Estado: 'XX' }, { ...dados, cnpj: 12345678000190 }, { ...dados, cnpj: '123' }]) {
        assert.ok(validarPosto(invalido).erros.length > 0);
    }
});

test('formulário e CSV compartilham duplicidade e preservam o cadastro existente', () => {
    const db = abrirBanco({ arquivo: ':memory:', cadastroInicial: () => [] });
    try {
        assert.equal(cadastrarPosto(db, dados).importados, 1);
        assert.equal(importarCSV(db, csv).duplicados, 1);
        assert.equal(cadastrarPosto(db, { ...dados, cnpj: '', Nome: 'POSTO SAO JOAO' }).duplicados, 1);
        assert.equal(cadastrarPosto(db, { ...dados, Nome: 'Outro nome' }).duplicados, 1);
        assert.equal(cadastrarPosto(db, { ...dados, lat: '' }).erros.length, 1);
        assert.equal(listarPostos(db).length, 1);
        assert.equal(listarPostos(db)[0].Nome, 'Posto São João');
        assert.equal(importarCSV(db, csv.replace('Posto São João', 'Posto CSV').replace('12345678000190', '')).importados, 1);
        assert.equal(cadastrarPosto(db, { ...dados, Nome: 'Posto CSV', cnpj: '' }).duplicados, 1);
    } finally { db.close(); }
});

test('API de cadastro salva, informa erros e protege a escrita local', async () => {
    const server = criarServidor({ arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'Content-Type': 'application/json', 'X-Rota-Cadastro': 'formulario', Origin: base };
    const enviar = (body, opcoes = {}) => fetch(base + '/api/postos', { method: 'POST', headers, body: JSON.stringify(body), ...opcoes });
    try {
        assert.equal((await enviar(dados, { headers: { ...headers, Origin: 'https://outro.test' } })).status, 403);
        assert.equal((await enviar(dados, { headers: { 'Content-Type': 'application/json' } })).status, 403);
        assert.equal((await enviar(dados, { headers: { ...headers, 'Content-Type': 'text/plain' } })).status, 415);
        assert.equal((await enviar(dados, { body: '{quebrado' })).status, 400);
        assert.equal((await enviar(dados, { body: Buffer.from([0xff]) })).status, 400);
        assert.equal((await enviar(dados, { body: 'x'.repeat(16385) })).status, 413);
        const invalido = await enviar({ ...dados, lat: '' });
        assert.equal(invalido.status, 422);
        assert.equal((await invalido.json()).erros[0].campo, 'lat');
        const resultados = await Promise.all([enviar(dados), enviar(dados)]);
        assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]);
        const postos = await (await fetch(base + '/api/postos')).json();
        assert.equal(postos.length, 50);
        assert.equal(postos.at(-1).Nome, 'Posto São João');
    } finally { await new Promise(resolve => server.close(resolve)); }
});
