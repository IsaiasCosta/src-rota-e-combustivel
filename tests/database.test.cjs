const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { abrirBanco, listarPostos, lerCadastroInicial } = require('../scripts/database.cjs');
const { criarServidor } = require('../scripts/server.cjs');

function arquivoTemporario(t) {
    const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'rota-db-'));
    t.after(() => {
        if (path.dirname(diretorio) === path.resolve(os.tmpdir()) && path.basename(diretorio).startsWith('rota-db-')) {
            fs.rmSync(diretorio, { recursive: true, force: true });
        }
    });
    return path.join(diretorio, 'teste.sqlite');
}

test('importa o cadastro completo preservando acentos, coordenadas e campos opcionais', () => {
    const db = abrirBanco({ arquivo: ':memory:' });
    try {
        const inicial = JSON.parse(JSON.stringify(lerCadastroInicial()));
        assert.equal(inicial.length, 49);
        assert.deepEqual(listarPostos(db).map(p => ({ ...p })), inicial.map((p, i) => ({
            ...p, id: i + 1, nomeMapa: p.nomeMapa ?? null, cnpj: p.cnpj ?? null
        })));
        assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
        assert.throws(() => db.prepare('UPDATE postos SET latitude = 100 WHERE id = 1').run(), /CHECK/);
        assert.throws(() => db.prepare("UPDATE postos SET cnpj = 'invalido' WHERE id = 1").run(), /CHECK/);
        assert.throws(() => db.prepare('UPDATE postos SET cnpj = (SELECT cnpj FROM postos WHERE id = 1) WHERE id = 2').run(), /UNIQUE/);
    } finally { db.close(); }
});

test('reiniciar preserva edições e exclusões sem reimportar ou duplicar postos', t => {
    const arquivo = arquivoTemporario(t);
    let db = abrirBanco({ arquivo });
    db.prepare('UPDATE postos SET nome = ? WHERE id = 1').run("Posto D'Água");
    db.prepare('DELETE FROM postos WHERE id = 2').run();
    db.close();
    db = abrirBanco({ arquivo, cadastroInicial: () => { throw new Error('Não deve reimportar'); } });
    try {
        assert.equal(listarPostos(db).length, 48);
        assert.equal(listarPostos(db)[0].Nome, "Posto D'Água");
    } finally { db.close(); }
});

test('falha de importação desfaz a migração inteira e permite nova tentativa', t => {
    const arquivo = arquivoTemporario(t);
    assert.throws(() => abrirBanco({ arquivo, cadastroInicial: () => [lerCadastroInicial()[0], {}] }));
    const db = abrirBanco({ arquivo });
    try { assert.equal(listarPostos(db).length, 49); } finally { db.close(); }
});

test('API consulta dados persistidos e não publica o arquivo do banco', async t => {
    const arquivo = arquivoTemporario(t);
    const db = abrirBanco({ arquivo });
    db.prepare('UPDATE postos SET nome = ? WHERE id = 1').run('Posto editado no banco');
    db.close();
    const server = criarServidor({ arquivoBanco: arquivo });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(`${base}/api/postos`);
        assert.equal(response.status, 200);
        const postos = await response.json();
        assert.equal(postos.length, 49);
        assert.equal(postos[0].Nome, 'Posto editado no banco');
        const head = await fetch(`${base}/api/postos`, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), '');
        assert.equal((await fetch(`${base}/api/postos`, { method: 'POST' })).status, 403);
        assert.equal((await fetch(`${base}/api/postos`, { method: 'DELETE' })).status, 405);
        for (const recurso of ['/database/rota-combustivel.sqlite', '/database/migrations/001-postos.sql']) {
            assert.equal((await fetch(base + recurso)).status, 404);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    // Confirma que o encerramento liberou a conexão.
    const reaberto = new DatabaseSync(arquivo);
    reaberto.close();
});
