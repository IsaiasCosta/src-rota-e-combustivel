/* src/domain/distancia.js */
(function (app) {
'use strict';

function coordenadasValidas(local) {
    return Number.isFinite(local?.lat) && Number.isFinite(local?.lon) &&
        Math.abs(local.lat) <= 90 && Math.abs(local.lon) <= 180;
}

// Mesmo intervalo aproximado já usado para conferir o cadastro brasileiro.
function coordenadasNoBrasil(local) {
    return coordenadasValidas(local) &&
        local.lat >= -35 && local.lat <= 6 && local.lon >= -75 && local.lon <= -30;
}
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

function distanciaEstimadaRodoviaria(local, posto) {
    return calcularDistancia(local.lat, local.lon, posto.lat, posto.lon) * 1.30;
}

app.domain.distancia = { calcularDistancia, distanciaEstimadaRodoviaria, coordenadasValidas, coordenadasNoBrasil };
})(window.RotaCombustivel);
