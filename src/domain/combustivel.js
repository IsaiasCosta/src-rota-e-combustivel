(function (app) {
'use strict';

// Regras de autonomia: recebem dados e não acessam o navegador ou serviços.
function calcularAutonomia({ capacidade, nivel, consumo, margem }) {
    nivel = Math.max(0, Math.min(1, nivel));
    margem = Math.max(0, Math.min(0.9, margem));
    const capacidadeTotal = capacidade;
    const combustivelAtual = capacidadeTotal * nivel;
    const autonomia = combustivelAtual * consumo;
    return { nivel, capacidadeTotal, combustivelAtual, autonomia, autonomiaSegura: autonomia * (1 - margem) };
}

function analisarAutonomia(distanciaKm, parametros) {
    if (!parametros.validos) return { classe: 'status-danger', texto: 'PARÂMETROS INVÁLIDOS — confira a capacidade do tanque e o consumo', margemKm: null };
    const { autonomia, autonomiaSegura } = calcularAutonomia(parametros);

    if (distanciaKm <= autonomiaSegura) {
        return {
            classe: "status-success",
            texto: "🟢 DENTRO DA AUTONOMIA ESTIMADA COM MARGEM",
            margemKm: autonomiaSegura - distanciaKm
        };
    }

    if (distanciaKm <= autonomia) {
        return {
            classe: "status-warning",
            texto: "🟡 ESTIMATIVA FORA DA MARGEM DE SEGURANÇA",
            margemKm: autonomia - distanciaKm
        };
    }

    return {
        classe: "status-danger",
        texto: "🔴 AUTONOMIA INSUFICIENTE",
        margemKm: distanciaKm - autonomia
    };
}

app.domain.combustivel = { calcularAutonomia, analisarAutonomia };
})(window.RotaCombustivel);
