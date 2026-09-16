const assert = require('node:assert/strict');
const { test } = require('node:test');
const { analisarCSV, LIMITE_BYTES } = require('../scripts/importacao-csv.cjs');
const { abrirBanco, listarPostos, importarCSV } = require('../scripts/database.cjs');
const { criarServidor } = require('../scripts/server.cjs');

const cabecalho = 'nome;endereco;cidade;estado;latitude;longitude;cnpj;nome_mapa\r\n';
const linha = 'Posto Teste;"Rua São João, 10";Belo Horizonte;mg;-19,9;-43,94;12.345.678/0001-90;Posto no mapa';
const csv = cabecalho + linha;

test('CSV aceita BOM, acentos, ponto e vírgula, decimais brasileiros e CNPJ formatado', () => {
    const resultado = analisarCSV('\uFEFF' + csv);
    assert.deepEqual(resultado.erros, []);
    assert.equal(resultado.novos, 1);
    assert.equal(resultado.postos[0].Endereço, 'Rua São João, 10');
    assert.equal(resultado.postos[0].lat, -19.9);
    assert.equal(resultado.postos[0].cnpj, '12345678000190');
    assert.equal(resultado.postos[0].Estado, 'MG');
});

test('CSV com vírgulas aceita campos entre aspas, aspas escapadas e quebras de linha', () => {
    const texto = 'Nome,Endereço,Cidade,Estado,lat,lon\n"Posto ""São José""","Rua A, 10\nBairro Centro",São Paulo,SP,-23.5,-46.6\n\n';
    const resultado = analisarCSV(texto);
    assert.deepEqual(resultado.erros, []);
    assert.equal(resultado.postos[0].Nome, 'Posto "São José"');
    assert.equal(resultado.postos[0].Endereço, 'Rua A, 10\nBairro Centro');
    assert.equal(resultado.postos[0].cnpj, null);
});

test('informa a linha física inválida após campo com quebra de linha', () => {
    const resultado = analisarCSV(cabecalho + linha.replace('Posto Teste', '"Posto\nTeste"') + '\r\n' + linha.replace('-19,9', ''));
    assert.equal(resultado.erros[0].linha, 4);
    assert.match(resultado.erros[0].mensagem, /Latitude/);
});

test('rejeita cabeçalhos, aspas, limites e campos inválidos sem converter vazios em zero', () => {
    for (const texto of ['', cabecalho, csv.replace('latitude;', ''), csv.replace('nome_mapa', 'nome'),
        csv.replace('nome_mapa', 'desconhecido'), csv + ';extra', csv.replace('Posto Teste', '"Posto Teste'),
        csv.replace('Posto Teste', '"Posto"invalido'), csv.replace('Posto Teste', ''),
        csv.replace(';mg;', ';XX;'), csv.replace('-19,9', ''), csv.replace('-43,94', 'Infinity'),
        csv.replace('-19,9', '-90'), csv.replace('12.345.678/0001-90', 'abc'),
        csv.replace('Posto Teste', '\uFFFD'), 'x'.repeat(LIMITE_BYTES + 1),
        cabecalho + Array(1001).fill(linha).join('\n')]) {
        assert.ok(analisarCSV(texto).erros.length > 0, texto.slice(0, 100));
    }
});

test('identifica duplicados no lote e no banco, preservando postos com nomes iguais em endereços diferentes', () => {
    const existentes = analisarCSV(csv).postos;
    const repetido = linha.replace('Posto Teste', 'Outro nome');
    const semCnpj = linha.replace('12.345.678/0001-90', '').replace('Posto Teste', ' POSTO TESTE ');
    const novo = semCnpj.replace('João, 10', 'João, 20');
    const resultado = analisarCSV(cabecalho + [repetido, semCnpj, novo, novo].join('\n'), existentes);
    assert.deepEqual(resultado.erros, []);
    assert.equal(resultado.duplicados, 3);
    assert.equal(resultado.novos, 1);
});

test('prévia não grava; confirmação é atômica e reenvio não duplica', () => {
    const db = abrirBanco({ arquivo: ':memory:', cadastroInicial: () => [] });
    try {
        assert.equal(importarCSV(db, csv, true).novos, 1);
        assert.equal(listarPostos(db).length, 0);
        assert.equal(importarCSV(db, csv + '\n' + linha.replace('-19,9', '')).erros.length, 1);
        assert.equal(listarPostos(db).length, 0);
        assert.equal(importarCSV(db, csv).importados, 1);
        assert.equal(importarCSV(db, csv).importados, 0);
        assert.equal(listarPostos(db).length, 1);
        assert.equal(listarPostos(db)[0].Nome, 'Posto Teste');
    } finally { db.close(); }
});

test('falha SQL no meio do lote desfaz todos os registros', () => {
    const db = abrirBanco({ arquivo: ':memory:', cadastroInicial: () => [] });
    try {
        db.exec("CREATE TRIGGER falha BEFORE INSERT ON postos WHEN NEW.nome = 'Falha' BEGIN SELECT RAISE(ABORT, 'teste'); END;");
        const segunda = linha.replace('Posto Teste', 'Falha').replace('12.345.678/0001-90', '');
        assert.throws(() => importarCSV(db, csv + '\n' + segunda), /teste/);
        assert.equal(listarPostos(db).length, 0);
    } finally { db.close(); }
});

test('API valida origem, tamanho, UTF-8, prévia e confirmação com persistência nas consultas', async () => {
    const server = criarServidor({ arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { 'Content-Type': 'text/csv; charset=utf-8', 'X-Rota-Importacao': 'csv', Origin: base };
    const enviar = (body, opcoes = {}) => fetch(base + '/api/postos/importar' + (opcoes.previa ? '?previa=1' : ''), {
        method: 'POST', body, headers: opcoes.headers || headers
    });
    const quantidade = async () => (await (await fetch(base + '/api/postos')).json()).length;
    try {
        assert.equal((await fetch(base + '/api/postos/importar')).status, 405);
        assert.equal((await enviar(csv, { headers: { ...headers, Origin: 'https://outro-site.test' } })).status, 403);
        assert.equal((await enviar(csv, { headers: { 'Content-Type': 'text/csv' } })).status, 403);
        assert.equal((await enviar(csv, { headers: { ...headers, 'Content-Type': 'application/json' } })).status, 415);
        assert.equal((await enviar(Buffer.from([0xff]))).status, 400);
        assert.equal((await enviar('a'.repeat(LIMITE_BYTES + 1))).status, 413);
        const previa = await enviar(csv, { previa: true });
        assert.equal(previa.status, 200);
        assert.equal((await previa.json()).novos, 1);
        assert.equal(await quantidade(), 49);
        assert.equal((await enviar(csv.replace('-19,9', ''))).status, 422);
        assert.equal(await quantidade(), 49);
        const respostas = await Promise.all([enviar(csv), enviar(csv)]);
        const resultados = await Promise.all(respostas.map(r => r.json()));
        assert.equal(resultados.reduce((s, r) => s + r.importados, 0), 1);
        assert.equal(await quantidade(), 50);
    } finally { await new Promise(resolve => server.close(resolve)); }
});
