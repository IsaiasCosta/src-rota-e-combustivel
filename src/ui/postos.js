/* src/ui/postos.js */
(function (app) {
'use strict';
const { escaparHTML, formatarTempo } = app.utils;
const { criarLinkRota, criarLinkPosto } = app.services.mapas;

function exibirResultadosPostos(listaPostos, local, parametros) {
    const container = document.getElementById("resultadosPostos");
    if (!container) return;

    container.style.display = "block";

    if (!listaPostos.length) {
        container.innerHTML = `<h3 style="color:#ef4444">❌ Nenhum posto com coordenadas válidas.</h3>`;
        return;
    }

    let html = `
        <h3 style="color:#38bdf8;margin-bottom:6px;">🚚 ${listaPostos.length} postos entre os candidatos mais próximos</h3>
        <div style="color:#94a3b8;font-size:11px;margin-bottom:15px;">
            A distância abaixo é por rota quando o roteador está disponível.
            Se o serviço falhar, aparece como estimativa. Quando o roteador não encontra trajeto, a autonomia não é avaliada.
            Os links priorizam o endereço completo do posto. Confira o número e o estabelecimento no mapa.
            As distâncias do painel usam as coordenadas cadastradas e podem diferir das rotas do Google Maps.
            Rotas comuns não consideram as restrições do bitruck; confira o trajeto e o cadastro do posto antes de seguir.
        </div>
        <ul style="list-style:none;padding:0;margin:0;">
    `;

    listaPostos.forEach((p, indice) => {
        const semRota = p.tipoDistancia === 'SEM_ROTA';
        const analise = semRota
            ? { classe: 'status-danger', texto: 'ROTA NÃO ENCONTRADA — autonomia não avaliada; confira o trajeto no mapa.', margemKm: null }
            : app.domain.combustivel.analisarAutonomia(p.distancia, parametros);

        const mapsUrl = criarLinkRota(p, local);
        const postoUrl = criarLinkPosto(p);

        const tipo =
            p.tipoDistancia === "ROTA"
                ? "🛣️ rota rodoviária"
                : semRota ? "Roteador não encontrou trajeto" : "📏 estimativa";

        html += `
        <li style="
            background:#0e0f16;
            border:1px solid #272838;
            margin-bottom:10px;
            padding:12px 15px;
            border-radius:8px;
            border-left:4px solid ${semRota ? "#ef4444" : indice === 0 ? "#22c55e" : "#a855f7"};
        ">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                <div>
                    <strong style="color:#fff;font-size:14px;">
                        ${indice + 1}º — ${escaparHTML(p.Nome)}
                    </strong>
                    <br>
                    <small style="color:#94a3b8;font-size:11px;">
                        ${escaparHTML(p.Endereço)} - ${escaparHTML(p.Cidade)}/${escaparHTML(p.Estado)}
                    </small>
                </div>

                <span style="
                    background:#1e1b4b;
                    color:#c084fc;
                    border:1px solid #4c1d95;
                    padding:5px 10px;
                    border-radius:6px;
                    font-size:12px;
                    font-weight:bold;
                    white-space:nowrap;">
                    ${semRota ? 'Sem rota' : `~${p.distancia.toFixed(1)} km`}
                </span>
            </div>

            <div style="margin-top:8px;font-size:11px;color:#94a3b8;">
                ${tipo}
                ${p.tempoMin ? ` • ⏱️ ${formatarTempo(p.tempoMin)}` : ""}
            </div>

            <div style="
                margin-top:8px;
                padding:8px;
                border-radius:6px;
                font-size:11px;
                border:1px solid currentColor;"
                class="${analise.classe}">
                ${analise.texto}
                ${analise.margemKm === null ? '' : analise.classe === "status-success"
                    ? ` • margem segura: ${analise.margemKm.toFixed(0)} km`
                    : analise.classe === "status-warning"
                        ? ` • margem até autonomia: ${analise.margemKm.toFixed(0)} km`
                        : ` • faltariam aproximadamente: ${analise.margemKm.toFixed(0)} km`}
            </div>

            <div class="posto-links" style="margin-top:8px;">
                <a href="${escaparHTML(postoUrl)}" target="_blank" rel="noopener noreferrer"
                   style="color:#38bdf8;font-size:12px;text-decoration:none;">
                    📍 Ver posto no mapa
                </a>
                <a href="${escaparHTML(mapsUrl)}" target="_blank" rel="noopener noreferrer"
                   style="color:#38bdf8;font-size:12px;text-decoration:none;">
                    🗺️ Abrir rota no Google Maps
                </a>
            </div>
        </li>`;
    });

    html += "</ul>";
    container.innerHTML = html;
}

app.ui.postos = { exibirResultadosPostos };
})(window.RotaCombustivel);
