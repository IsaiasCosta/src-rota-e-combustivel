let localizacaoAtual = null;
let origemDescricao = "";
let origemFoiGPS = false;
let ultimosResultados = null;
let buscaEmAndamento = false;
const PARAMETROS = ['inpCapacidade1', 'inpCapacidade2', 'inpNivel', 'inpCarga', 'inpConsumo', 'inpMargem'];
const STORAGE_KEY = 'src-rota-e-combustivel.parametros.v1';

const CONSUMOS = {
    VAZIO: 3.0,
    PARCIAL: 2.5,
    CARREGADO: 2.0
};

document.addEventListener("DOMContentLoaded", () => {
    restaurarParametros();
    document.getElementById('quantidadePostos').textContent = `${postos.length} postos cadastrados`;
    criarMedidor();
    calcular();

    const input = document.getElementById("inpOrigem");
    input.addEventListener("keypress", e => {
        if (e.key === "Enter") buscarPostos();
    });

    validarCadastroPostos();
});

function restaurarParametros() {
    try {
        const salvos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        for (const id of PARAMETROS) {
            const campo = document.getElementById(id);
            const valor = salvos?.[id];
            if (typeof valor !== 'string') continue;
            if (campo.tagName === 'SELECT') {
                if ([...campo.options].some(opcao => opcao.value === valor)) campo.value = valor;
            } else if (valor.trim() && Number.isFinite(Number(valor)) && Number(valor) >= Number(campo.min) && (!campo.max || Number(valor) <= Number(campo.max))) {
                campo.value = valor;
            }
        }
    } catch {
        document.getElementById('statusArmazenamento').textContent = 'Não foi possível recuperar os parâmetros salvos. Confira os valores antes de usar.';
    }
}

function salvarParametros() {
    try {
        const dados = Object.fromEntries(PARAMETROS.map(id => [id, document.getElementById(id).value]));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    } catch {
        document.getElementById('statusArmazenamento').textContent = 'Armazenamento indisponível. Os parâmetros serão mantidos somente enquanto esta página estiver aberta.';
    }
}

function alterarCarga() {
    document.getElementById('inpConsumo').value = CONSUMOS[document.getElementById('inpCarga').value].toFixed(1);
    calcular();
}

function parametrosValidos() {
    return ['inpCapacidade1', 'inpCapacidade2', 'inpConsumo'].every(id => {
        const campo = document.getElementById(id);
        return campo.value !== '' && campo.checkValidity();
    }) && obterNumero('inpConsumo') > 0 && obterNumero('inpCapacidade1') + obterNumero('inpCapacidade2') > 0;
}

function normalizarTexto(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function criarMedidor() {
    const container = document.getElementById("gaugeContainer");
    if (!container) return;

    container.innerHTML = `
    <svg id="gaugeSvg" viewBox="0 0 240 180"
         xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;max-width:320px;margin:0 auto;display:block;">
        <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#1b1c27;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#0e0f16;stop-opacity:1"/>
            </linearGradient>
        </defs>

        <circle cx="120" cy="140" r="100" fill="url(#gaugeGrad)" stroke="#272838" stroke-width="1"/>
        <path d="M 40 140 A 80 80 0 0 1 200 140"
              fill="none" stroke="#0e0f16" stroke-width="14" stroke-linecap="round"/>
        <path id="gaugeArc" d="M 40 140 A 80 80 0 0 1 200 140"
              fill="none" stroke="#10b981" stroke-width="14"
              stroke-dasharray="251.3 251.3" stroke-dashoffset="0"
              style="transition:stroke-dashoffset .4s ease,stroke .3s ease"/>
        <text x="40" y="155" font-size="10" fill="#64748b" text-anchor="middle">0%</text>
        <text x="120" y="65" font-size="10" fill="#64748b" text-anchor="middle">50%</text>
        <text x="200" y="155" font-size="10" fill="#64748b" text-anchor="middle">100%</text>

        <g id="gaugeNeedleGroup"
           style="transform-origin:120px 140px;transition:transform .4s ease">
            <line x1="120" y1="140" x2="120" y2="50"
                  stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
            <circle cx="120" cy="140" r="7" fill="#38bdf8" stroke="#ffffff" stroke-width="2"/>
        </g>

        <circle cx="120" cy="140" r="10" fill="#0e0f16" stroke="#38bdf8" stroke-width="2"/>
        <text id="gaugePercent" x="120" y="25"
              text-anchor="middle" font-size="26" font-weight="bold"
              fill="#38bdf8">100%</text>
    </svg>`;
}

function atualizarMedidor(percentual, combustivelAtual, capacidadeTotal) {
    percentual = Math.max(0, Math.min(1, percentual));

    const arc = document.getElementById("gaugeArc");
    if (arc) {
        const circunferencia = 251.3;
        arc.style.strokeDashoffset = circunferencia * (1 - percentual);
        arc.setAttribute(
            "stroke",
            percentual >= 0.5 ? "#10b981" :
            percentual >= 0.25 ? "#f59e0b" : "#ef4444"
        );
    }

    const needle = document.getElementById("gaugeNeedleGroup");
    if (needle) {
        // 0% = -90° (esquerda), 50% = 0° (cima), 100% = +90° (direita)
        needle.style.transform = `rotate(${-90 + percentual * 180}deg)`;
    }

    const percentText = document.getElementById("gaugePercent");
    if (percentText) percentText.textContent = `${Math.round(percentual * 100)}%`;

    const readout = document.getElementById("gaugeReadout");
    if (readout) {
        readout.innerHTML =
            `Nível: <strong style="color:#38bdf8">${combustivelAtual.toFixed(1)} L</strong> / ${capacidadeTotal.toFixed(0)} L`;
    }
}

function obterNumero(id) {
    const valor = Number.parseFloat(document.getElementById(id)?.value);
    return Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function calcular() {
    const cap1 = obterNumero("inpCapacidade1");
    const cap2 = obterNumero("inpCapacidade2");
    const nivel = Math.max(0, Math.min(1, Number.parseFloat(document.getElementById("inpNivel")?.value) || 0));
    const carga = document.getElementById("inpCarga")?.value || "CARREGADO";
    const margem = Math.max(0, Math.min(0.9, Number.parseFloat(document.getElementById("inpMargem")?.value) || 0.15));

    const capacidadeTotal = cap1 + cap2;
    const combustivelAtual = capacidadeTotal * nivel;
    const consumo = obterNumero('inpConsumo');
    const autonomia = combustivelAtual * consumo;
    const autonomiaSegura = autonomia * (1 - margem);

    document.getElementById("outCapacidadeTotal").textContent = `${capacidadeTotal.toFixed(1)} L`;
    document.getElementById("outLitros").textContent = `${combustivelAtual.toFixed(1)} L`;
    document.getElementById("outAutonomia").textContent = `${autonomia.toFixed(1)} km`;
    document.getElementById("outAutonomiaSegura").textContent = `${autonomiaSegura.toFixed(1)} km`;

    const status = document.getElementById("outStatusPosto");
    if (!parametrosValidos()) {
        status.className = "status-alert status-danger";
        status.textContent = "Confira as capacidades dos tanques e informe um consumo válido maior que zero.";
        for (const id of ['outCapacidadeTotal', 'outLitros', 'outAutonomia', 'outAutonomiaSegura']) document.getElementById(id).textContent = '—';
    } else if (combustivelAtual <= capacidadeTotal * 0.15) {
        status.className = "status-alert status-danger";
        status.textContent = "🚨 RESERVA CRÍTICA - ABASTEÇA IMEDIATAMENTE!";
    } else if (combustivelAtual <= capacidadeTotal * 0.30) {
        status.className = "status-alert status-warning";
        status.textContent = "⚠️ ATENÇÃO: NÍVEL EM RESERVA - PROCURE UM POSTO";
    } else {
        status.className = "status-alert status-success";
        status.textContent = "🟢 NÍVEL DE COMBUSTÍVEL NORMAL";
    }

    atualizarMedidor(nivel, combustivelAtual, capacidadeTotal);
    if (parametrosValidos()) salvarParametros();
    if (ultimosResultados && localizacaoAtual) exibirResultadosPostos(ultimosResultados, localizacaoAtual);
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

function setStatusBusca(texto) {
    const el = document.getElementById("statusBusca");
    if (el) el.textContent = texto;
}

function definirBusca(ativa) {
    buscaEmAndamento = ativa;
    document.getElementById('btnGPS').disabled = ativa;
    document.getElementById('btnBuscarCidade').disabled = ativa;
    document.getElementById('resultadosPostos').setAttribute('aria-busy', String(ativa));
    if (ativa) {
        ultimosResultados = null;
        document.getElementById('resultadosPostos').style.display = 'none';
    }
}

function buscarGPS() {
    if (buscaEmAndamento) return;
    if (!navigator.geolocation) {
        setStatusBusca('GPS não disponível neste navegador. Use a busca por endereço.');
        return;
    }

    const btn = document.getElementById("btnGPS");
    definirBusca(true);
    setStatusBusca('Obtendo localização do veículo...');
    btn.disabled = true;
    btn.textContent = "🔄 Obtendo localização...";

    navigator.geolocation.getCurrentPosition(
        position => {
            localizacaoAtual = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };

            origemDescricao = `GPS (${localizacaoAtual.lat.toFixed(5)}, ${localizacaoAtual.lon.toFixed(5)})`;
            origemFoiGPS = true;

            setStatusBusca("📡 GPS obtido. Calculando rotas para os postos...");
            buscarPostosMaisProximos(localizacaoAtual).catch(erro => setStatusBusca(erro.message)).finally(() => {
                definirBusca(false);
                btn.disabled = false;
                btn.textContent = "📡 Usar Minha Localização Atual (GPS)";
            });
        },
        error => {
            const mensagens = {
                1: "Permissão de localização negada.",
                2: "Localização indisponível.",
                3: "Tempo esgotado para obter a localização."
            };

            setStatusBusca(mensagens[error.code] || error.message);
            definirBusca(false);
            btn.disabled = false;
            btn.textContent = "📡 Usar Minha Localização Atual (GPS)";
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 30000
        }
    );
}

async function buscarPostos() {
    if (buscaEmAndamento) return;
    const texto = document.getElementById("inpOrigem")?.value.trim() || "";

    if (!texto) {
        setStatusBusca('Digite um endereço ou cidade para localizar os postos.');
        document.getElementById('inpOrigem').focus();
        return;
    }

    const btn = document.getElementById("btnBuscarCidade");
    definirBusca(true);
    btn.disabled = true;
    btn.textContent = "🔄 Localizando...";

    try {
        setStatusBusca("🌐 Procurando a localização no mapa...");

        const local = await geocodificarOrigem(texto);

        localizacaoAtual = local.coordenadas;
        origemDescricao = local.nome;
        origemFoiGPS = false;

        await buscarPostosMaisProximos(localizacaoAtual);
    } catch (erro) {
        setStatusBusca(erro.name === 'AbortError' ? 'A busca demorou demais. Verifique sua conexão e tente novamente.' : erro.message);
    } finally {
        definirBusca(false);
        btn.disabled = false;
        btn.textContent = "🔎 Localizar Postos";
    }
}

async function geocodificarOrigem(texto) {
    /*
     * Nominatim é usado aqui apenas para transformar endereço/cidade em coordenadas.
     * Para uso corporativo de alto volume, troque por um serviço de geocodificação
     * próprio/profissional.
     */
    const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(texto)}`;

    const dados = await consultarJSON(url);

    if (!Array.isArray(dados) || !dados.length) {
        throw new Error("Endereço/cidade não encontrado. Tente informar também MG ou ES.");
    }

    const lat = Number(dados[0].lat);
    const lon = Number(dados[0].lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error("O mapa retornou coordenadas inválidas.");
    }

    return {
        coordenadas: { lat, lon },
        nome: dados[0].display_name || texto
    };
}

async function buscarPostosMaisProximos(local) {
    if (!local || !Number.isFinite(local.lat) || !Number.isFinite(local.lon)) {
        throw new Error("Localização inválida.");
    }

    /*
     * Primeiro filtramos por distância geográfica para reduzir chamadas.
     * Depois tentamos obter distância de rota para os candidatos.
     */
    const candidatos = postos
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map(p => ({
            ...p,
            distanciaGeografica: calcularDistancia(local.lat, local.lon, p.lat, p.lon)
        }))
        .sort((a, b) => a.distanciaGeografica - b.distanciaGeografica)
        .slice(0, 10);

    setStatusBusca("🗺️ Calculando distância rodoviária dos postos mais próximos...");

    const resultados = await Promise.all(
        candidatos.map(async posto => {
            try {
                const rota = await obterRotaOSRM(local, posto);
                return {
                    ...posto,
                    distancia: rota.distanciaKm,
                    tempoMin: rota.tempoMin,
                    tipoDistancia: "ROTA"
                };
            } catch {
                return {
                    ...posto,
                    distancia: distanciaEstimadaRodoviaria(local, posto),
                    tempoMin: null,
                    tipoDistancia: "ESTIMADA"
                };
            }
        })
    );

    resultados.sort((a, b) => a.distancia - b.distancia);

    ultimosResultados = resultados.slice(0, 5);
    exibirResultadosPostos(ultimosResultados, local);
    setStatusBusca(
        `📍 Origem: ${origemDescricao}` +
        (origemFoiGPS ? " • GPS" : " • endereço/cidade geocodificado")
    );
}

async function consultarJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const resposta = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!resposta.ok) throw new Error('Não foi possível consultar o serviço de mapas. Tente novamente.');
        return await resposta.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function obterRotaOSRM(local, posto) {
    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${local.lon},${local.lat};${posto.lon},${posto.lat}` +
        `?overview=false&steps=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const resposta = await fetch(url, { signal: controller.signal });

        if (!resposta.ok) throw new Error("Falha no roteador.");

        const dados = await resposta.json();

        if (dados.code !== "Ok" || !dados.routes?.length) {
            throw new Error("Rota não encontrada.");
        }

        const { distance, duration } = dados.routes[0];
        if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(duration) || duration < 0) throw new Error('Rota inválida.');
        return { distanciaKm: distance / 1000, tempoMin: duration / 60 };
    } finally {
        clearTimeout(timeout);
    }
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

function analisarAutonomia(distanciaKm) {
    if (!parametrosValidos()) return { classe: 'status-danger', texto: 'PARÂMETROS INVÁLIDOS — confira os tanques e o consumo', margemKm: null };
    const capacidade = obterNumero("inpCapacidade1") + obterNumero("inpCapacidade2");
    const nivel = Number.parseFloat(document.getElementById("inpNivel")?.value) || 0;
    const carga = document.getElementById("inpCarga")?.value || "CARREGADO";
    const margem = Number.parseFloat(document.getElementById("inpMargem")?.value) || 0.15;

    const litros = capacidade * nivel;
    const consumo = obterNumero('inpConsumo');
    const autonomia = litros * consumo;
    const autonomiaSegura = autonomia * (1 - margem);

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

function exibirResultadosPostos(listaPostos, local) {
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
            Caso contrário, aparece como estimativa.
            Rotas comuns não consideram as restrições do bitruck; confira o trajeto e o cadastro do posto antes de seguir.
        </div>
        <ul style="list-style:none;padding:0;margin:0;">
    `;

    listaPostos.forEach((p, indice) => {
        const analise = analisarAutonomia(p.distancia);

        const mapsUrl =
            `https://www.google.com/maps/dir/?api=1` +
            `&origin=${encodeURIComponent(`${local.lat},${local.lon}`)}` +
            `&destination=${encodeURIComponent(`${p.lat},${p.lon}`)}` +
            `&travelmode=driving`;

        const tipo =
            p.tipoDistancia === "ROTA"
                ? "🛣️ rota rodoviária"
                : "📏 estimativa";

        html += `
        <li style="
            background:#0e0f16;
            border:1px solid #272838;
            margin-bottom:10px;
            padding:12px 15px;
            border-radius:8px;
            border-left:4px solid ${indice === 0 ? "#22c55e" : "#a855f7"};
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
                    ~${p.distancia.toFixed(1)} km
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

            <div style="margin-top:8px;">
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
                   style="color:#38bdf8;font-size:12px;text-decoration:none;">
                    🗺️ Abrir rota no Google Maps
                </a>
            </div>
        </li>`;
    });

    html += "</ul>";
    container.innerHTML = html;
}

function validarCadastroPostos() {
    const problemas = [];
    const nomes = new Set();

    postos.forEach((p, i) => {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
            problemas.push(`Posto ${i + 1}: coordenada inválida.`);
        }

        if (p.lat < -35 || p.lat > 6 || p.lon < -75 || p.lon > -30) {
            problemas.push(`${p.Nome}: coordenada fora do intervalo esperado para Brasil.`);
        }

        const chave = normalizarTexto(p.Nome);
        if (nomes.has(chave)) problemas.push(`${p.Nome}: nome duplicado.`);
        nomes.add(chave);
    });

    if (problemas.length) {
        console.warn("Problemas no cadastro de postos:", problemas);
    }
}
