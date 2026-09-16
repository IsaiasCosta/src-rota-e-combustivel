const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// As regras devem funcionar sem DOM, armazenamento ou rede.
const context = vm.createContext({ window: {} });
for (const file of ['config.js', 'domain/combustivel.js', 'domain/distancia.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
}
const { combustivel, distancia } = context.window.RotaCombustivel.domain;
const parametros = { capacidade: 560, nivel: 1, consumo: 2, margem: 0.15, validos: true };

test('tanque cheio: 560 L, 1120 km estimados e 952 km com margem', () => {
    const resultado = combustivel.calcularAutonomia(parametros);
    assert.equal(resultado.capacidadeTotal, 560);
    assert.equal(resultado.combustivelAtual, 560);
    assert.equal(resultado.autonomia, 1120);
    assert.equal(resultado.autonomiaSegura, 952);
});

test('limites entre autonomia com margem, sem margem e insuficiente', () => {
    assert.equal(combustivel.analisarAutonomia(952, parametros).classe, 'status-success');
    assert.equal(combustivel.analisarAutonomia(953, parametros).classe, 'status-warning');
    assert.equal(combustivel.analisarAutonomia(1120, parametros).classe, 'status-warning');
    assert.equal(combustivel.analisarAutonomia(1121, parametros).classe, 'status-danger');
    assert.equal(combustivel.analisarAutonomia(10, { ...parametros, validos: false }).margemKm, null);
});

test('tanque vazio e capacidades editáveis de 100 e 600 litros', () => {
    assert.equal(combustivel.calcularAutonomia({ ...parametros, nivel: 0 }).autonomia, 0);
    assert.equal(combustivel.calcularAutonomia({ ...parametros, capacidade: 100 }).autonomia, 200);
    const parcial = combustivel.calcularAutonomia({ ...parametros, capacidade: 600, nivel: 0.5 });
    assert.equal(parcial.combustivelAtual, 300);
    assert.equal(parcial.autonomia, 600);
    assert.equal(parcial.autonomiaSegura, 510);
});

test('distância nula no mesmo ponto e simetria entre os pontos', () => {
    assert.equal(distancia.calcularDistancia(-19.9, -44, -19.9, -44), 0);
    const ida = distancia.calcularDistancia(-19.9, -44, -20, -45);
    const volta = distancia.calcularDistancia(-20, -45, -19.9, -44);
    assert.ok(ida > 100 && ida < 110);
    assert.equal(ida, volta);
});

test('valida coordenadas geográficas e o intervalo esperado do cadastro brasileiro', () => {
    assert.equal(distancia.coordenadasValidas({ lat: 0, lon: 0 }), true);
    assert.equal(distancia.coordenadasValidas({ lat: -90, lon: 180 }), true);
    for (const local of [null, {}, { lat: null, lon: 0 }, { lat: '-19.9', lon: -44 },
        { lat: 91, lon: 0 }, { lat: 0, lon: -181 }, { lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }]) {
        assert.equal(distancia.coordenadasValidas(local), false);
    }
    for (const local of [{ lat: -19.9, lon: -44 }, { lat: -35, lon: -75 }, { lat: 6, lon: -30 }]) {
        assert.equal(distancia.coordenadasNoBrasil(local), true);
    }
    for (const local of [{ lat: 0, lon: 0 }, { lat: -35.1, lon: -44 }, { lat: 6.1, lon: -44 },
        { lat: -20, lon: -75.1 }, { lat: -20, lon: -29.9 }]) {
        assert.equal(distancia.coordenadasNoBrasil(local), false);
    }
});
