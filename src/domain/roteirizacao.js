(function (app) {
'use strict';

function planejarConsumo(trechos, parametros) {
    const autonomia = app.domain.combustivel.calcularAutonomia(parametros);
    let combustivelRestante = autonomia.combustivelAtual;
    let distanciaTotal = 0;
    const etapas = trechos.map((trecho, indice) => {
        const distanciaKm = Number(trecho.distanciaKm);
        const consumoLitros = distanciaKm / parametros.consumo;
        combustivelRestante -= consumoLitros;
        distanciaTotal += distanciaKm;
        return {
            indice: indice + 1,
            origem: trecho.origem,
            destino: trecho.destino,
            distanciaKm,
            tempoMin: trecho.tempoMin ?? null,
            consumoLitros,
            consumoAcumuladoLitros: autonomia.combustivelAtual - combustivelRestante,
            combustivelRestante,
            suficiente: combustivelRestante >= 0,
            dentroDaMargem: distanciaTotal <= autonomia.autonomiaSegura
        };
    });
    const consumoTotalLitros = autonomia.combustivelAtual - combustivelRestante;
    return {
        etapas,
        distanciaTotalKm: distanciaTotal,
        consumoTotalLitros,
        combustivelInicial: autonomia.combustivelAtual,
        combustivelFinal: combustivelRestante,
        autonomia: autonomia.autonomia,
        autonomiaSegura: autonomia.autonomiaSegura,
        suficiente: consumoTotalLitros <= autonomia.combustivelAtual,
        dentroDaMargem: distanciaTotal <= autonomia.autonomiaSegura
    };
}

app.domain.roteirizacao = { planejarConsumo };
})(window.RotaCombustivel);