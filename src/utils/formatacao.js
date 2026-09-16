/* src/utils/formatacao.js */
(function (app) {
'use strict';


function normalizarTexto(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function escaparHTML(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatarTempo(minutos) {
    if (!Number.isFinite(minutos)) return "";
    const total = Math.round(Math.max(0, minutos));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

app.utils = { normalizarTexto, escaparHTML, formatarTempo };
})(window.RotaCombustivel);
