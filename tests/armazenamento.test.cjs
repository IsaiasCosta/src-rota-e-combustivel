const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function armazenamento(dados) {
    let valor = dados === undefined ? null : JSON.stringify(dados);
    const context = vm.createContext({ window: {}, localStorage: {
        getItem: () => valor,
        setItem: (_chave, novoValor) => { valor = novoValor; }
    } });
    for (const file of ['config.js', 'services/armazenamento.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
    }
    return context.window['src-rota-e-combustivel'].services.armazenamento;
}

test('migra a soma dos tanques, preservando nível e consumo', () => {
    const service = armazenamento({ inpCapacidade1: '100', inpCapacidade2: '500', inpNivel: '0.50', inpConsumo: '2.7' });
    const dados = service.carregarParametros();
    assert.equal(dados.inpCapacidade, '600');
    assert.equal(dados.inpNivel, '0.50');
    assert.equal(dados.inpConsumo, '2.7');
    assert.equal(Object.hasOwn(dados, 'inpCapacidade2'), false);
    service.salvarParametros(dados);
    assert.equal(service.carregarParametros().inpCapacidade, '600');
});

test('valor do novo campo tem prioridade sobre os antigos', () => {
    const dados = armazenamento({ inpCapacidade: '100', inpCapacidade1: '280', inpCapacidade2: '280' }).carregarParametros();
    assert.equal(dados.inpCapacidade, '100');
});

test('migra cadastro com segundo tanque vazio ou ausente', () => {
    assert.equal(armazenamento({ inpCapacidade1: '600', inpCapacidade2: '0' }).carregarParametros().inpCapacidade, '600');
    assert.equal(armazenamento({ inpCapacidade1: '100' }).carregarParametros().inpCapacidade, '100');
});

test('não transforma dados antigos inválidos em uma capacidade utilizável', () => {
    for (const valor of ['', '-1', 'abc', null]) {
        assert.throws(() => armazenamento({ inpCapacidade1: valor, inpCapacidade2: '280' }).carregarParametros(), /inválida/);
    }
    assert.equal(Object.keys(armazenamento().carregarParametros()).length, 0);
});

test('rejeita formatos de armazenamento inválidos sem substituir por padrões', () => {
    for (const dados of [null, [], false, 100, 'texto']) {
        assert.throws(() => armazenamento(dados).carregarParametros(), /inválidos/);
    }
});
