const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const context = vm.createContext({ window: {} });
for (const file of ['config.js', 'domain/combustivel.js', 'domain/roteirizacao.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
}
const { planejarConsumo } = context.window.RotaCombustivel.domain.roteirizacao;

test('calcula combustível por trecho e saldo acumulado', () => {
    const resultado = planejarConsumo([
        { origem: 'Origem', destino: 'Loja 1', distanciaKm: 100 },
        { origem: 'Loja 1', destino: 'Loja 2', distanciaKm: 150 }
    ], { capacidade: 200, nivel: 1, consumo: 2, margem: 0.15 });
    assert.equal(resultado.etapas[0].consumoLitros, 50);
    assert.equal(resultado.etapas[0].combustivelRestante, 150);
    assert.equal(resultado.etapas[1].consumoLitros, 75);
    assert.equal(resultado.consumoTotalLitros, 125);
    assert.equal(resultado.combustivelFinal, 75);
    assert.equal(resultado.suficiente, true);
});

test('sinaliza abastecimento quando a rota supera o combustível atual', () => {
    const resultado = planejarConsumo([{ distanciaKm: 201 }], { capacidade: 100, nivel: 1, consumo: 2, margem: 0.15 });
    assert.equal(resultado.etapas[0].suficiente, false);
    assert.equal(resultado.suficiente, false);
    assert.equal(resultado.dentroDaMargem, false);
});
