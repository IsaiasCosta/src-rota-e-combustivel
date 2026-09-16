/* src/controllers/localizador.js */
(function (app) {
'use strict';
const { normalizarTexto } = app.utils;
const { calcularDistancia, distanciaEstimadaRodoviaria, coordenadasValidas, coordenadasNoBrasil } = app.domain.distancia;
const { geocodificarOrigem, obterRotaOSRM } = app.services.mapas;
let localizacaoAtual = null;
let origemDescricao = '';
let origemFoiGPS = false;
let ultimosResultados = null;
let buscaEmAndamento = false;

function atualizarResultados() {
    if (ultimosResultados && localizacaoAtual) {
        app.ui.postos.exibirResultadosPostos(ultimosResultados, localizacaoAtual, app.ui.veiculo.lerParametros());
    }
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

            if (!coordenadasValidas(localizacaoAtual)) {
                setStatusBusca('O GPS retornou coordenadas inválidas. Tente novamente ou busque por endereço.');
                definirBusca(false);
                btn.textContent = '📡 Usar Minha Localização Atual (GPS)';
                return;
            }

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

async function buscarPostosMaisProximos(local) {
    if (!coordenadasValidas(local)) {
        throw new Error("Localização inválida.");
    }

    /*
     * Primeiro filtramos por distância geográfica para reduzir chamadas.
     * Depois tentamos obter distância de rota para os candidatos.
     */
    const candidatos = app.postos
        .filter(coordenadasNoBrasil)
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
            } catch (erro) {
                if (erro.code === 'NoRoute') {
                    return { ...posto, distancia: null, tempoMin: null, tipoDistancia: 'SEM_ROTA' };
                }
                return {
                    ...posto,
                    distancia: distanciaEstimadaRodoviaria(local, posto),
                    tempoMin: null,
                    tipoDistancia: "ESTIMADA"
                };
            }
        })
    );

    resultados.sort((a, b) =>
        Number(a.tipoDistancia === 'SEM_ROTA') - Number(b.tipoDistancia === 'SEM_ROTA') ||
        (a.distancia ?? 0) - (b.distancia ?? 0));

    ultimosResultados = resultados.slice(0, 5);
    atualizarResultados();
    setStatusBusca(
        `📍 Origem: ${origemDescricao}` +
        (origemFoiGPS ? " • GPS" : " • endereço/cidade geocodificado")
    );
}

function validarCadastroPostos() {
    const problemas = [];
    const nomes = new Set();

    app.postos.forEach((p, i) => {
        if (!coordenadasValidas(p)) {
            problemas.push(`Posto ${i + 1}: coordenada inválida.`);
        } else if (!coordenadasNoBrasil(p)) {
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

app.controllers.localizador = { buscarGPS, buscarPostos, atualizarResultados, validarCadastroPostos };
})(window.RotaCombustivel);
