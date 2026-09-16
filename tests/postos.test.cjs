const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

function ambiente(protocol, fetch, temporizadores = {}) {
    const app = { postos: [{ Nome: 'Referência' }], services: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/services/postos.js'), 'utf8'), {
        window: { RotaCombustivel: app, location: { protocol } }, fetch, AbortController, setTimeout, clearTimeout, ...temporizadores
    });
    return app;
}

test('HTTP usa os postos da API, inclusive quando o banco está vazio', async () => {
    const dados = [{ id: 1, Nome: 'Banco' }];
    const app = ambiente('http:', async url => {
        assert.equal(url, '/api/postos');
        return { ok: true, json: async () => dados };
    });
    await app.services.postos.carregar();
    assert.equal(app.postos, dados);
    dados.length = 0;
    await app.services.postos.carregar();
    assert.equal(app.postos.length, 0);
});

test('abertura por arquivo mantém a referência sem consultar o servidor', async () => {
    const app = ambiente('file:', () => { throw new Error('Não deve consultar rede'); });
    assert.equal((await app.services.postos.carregar())[0].Nome, 'Referência');
});

test('erros da API são propagados para bloquear buscas com cadastro desatualizado', async () => {
    for (const fetch of [
        async () => ({ ok: false }),
        async () => ({ ok: true, json: async () => ({ error: 'inválido' }) }),
        async () => { throw new Error('Sem rede'); }
    ]) {
        await assert.rejects(ambiente('http:', fetch).services.postos.carregar());
    }
});

test('cadastro interrompe espera sem resposta ou corpo incompleto e libera o temporizador', async () => {
    for (const etapa of ['conexao', 'corpo']) {
        let expirar, recebeuSinal, liberado = false;
        const fetch = async (_url, { signal }) => {
            recebeuSinal = signal;
            const esperar = () => new Promise((resolve, reject) => {
                if (signal.aborted) reject(signal.reason);
                else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
            return etapa === 'conexao' ? esperar() : { ok: true, json: esperar };
        };
        const app = ambiente('http:', fetch, {
            setTimeout(callback, ms) { assert.equal(ms, 12000); expirar = callback; return 123; },
            clearTimeout(id) { assert.equal(id, 123); liberado = true; }
        });
        const cadastro = app.services.postos.cadastrar({ Nome: 'Posto teste' });
        await Promise.resolve();
        expirar();
        await assert.rejects(cadastro, /servidor demorou demais/);
        assert.equal(recebeuSinal.aborted, true);
        assert.equal(liberado, true);
    }
});
