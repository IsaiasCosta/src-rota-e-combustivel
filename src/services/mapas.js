/* src/services/mapas.js */
(function (app) {
'use strict';
const { coordenadasValidas } = app.domain.distancia;

function converterCoordenada(valor) {
    if (typeof valor !== 'number' && (typeof valor !== 'string' || valor.trim() === '')) return NaN;
    return Number(valor);
}

async function geocodificarOrigem(texto) {
    /*
     * Nominatim é usado aqui apenas para transformar endereço/cidade em coordenadas.
     * Para uso corporativo de alto volume, troque por um serviço de geocodificação
     * próprio/profissional.
     */
    const usaServidorLocal = typeof window.location?.protocol === 'string' && window.location.protocol !== 'file:' && !app.config.supabaseUrl;
    const url = usaServidorLocal
        ? `/api/geocodificar?q=${encodeURIComponent(texto)}`
        : "https://nominatim.openstreetmap.org/search" +
          `?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(texto)}`;

    const dados = await consultarJSON(url);

    if (!Array.isArray(dados) || !dados.length) {
        throw new Error("Endereço/cidade não encontrado. Tente informar também MG ou ES.");
    }

    const lat = converterCoordenada(dados[0]?.lat);
    const lon = converterCoordenada(dados[0]?.lon);

    if (!coordenadasValidas({ lat, lon })) {
        throw new Error("O mapa retornou coordenadas inválidas.");
    }

    return {
        coordenadas: { lat, lon },
        nome: dados[0].display_name || texto
    };
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
    if (!coordenadasValidas(local) || !coordenadasValidas(posto)) {
        throw new Error('Coordenadas inválidas para calcular a rota.');
    }
    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${local.lon},${local.lat};${posto.lon},${posto.lat}` +
        `?overview=false&steps=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const resposta = await fetch(url, { signal: controller.signal });

        const dados = await resposta.json();

        if (dados.code === 'NoRoute') {
            const erro = new Error('O roteador não encontrou um trajeto para este posto.');
            erro.code = 'NoRoute';
            throw erro;
        }
        if (!resposta.ok) throw new Error("Falha no roteador.");

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

async function obterRotaSequencial(origem, lojas) {
    if (window.location.protocol !== 'file:' && !app.config.supabaseUrl) {
        try {
            const resposta = await fetch('/api/rotas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ origem, destinos: lojas.map(loja => ({ lat: loja.lat, lon: loja.lon, Nome: loja.Nome })) })
            });
            if (resposta.ok) {
                const resultado = await resposta.json();
                return resultado.trechos.map(trecho => ({ ...trecho, provedor: resultado.provedor }));
            }
        } catch { /* O OSRM continua como fallback local. */ }
    }
    const pontos = [origem, ...lojas];
    const trechos = [];
    for (let indice = 0; indice < lojas.length; indice++) {
        const rota = await obterRotaOSRM(pontos[indice], pontos[indice + 1]);
        trechos.push({
            origem: indice === 0 ? 'Ponto atual' : lojas[indice - 1].Nome,
            destino: lojas[indice].Nome,
            distanciaKm: rota.distanciaKm,
            tempoMin: rota.tempoMin,
            origemCoordenadas: pontos[indice],
            destinoCoordenadas: pontos[indice + 1],
            provedor: 'OSRM'
        });
    }
    return trechos;
}

function identificarPosto(posto) {
    return [posto.nomeMapa || posto.Nome, posto.Endereço, posto.Cidade, posto.Estado, 'Brasil']
        .map(valor => String(valor ?? '').trim())
        .filter(Boolean)
        .join(', ');
}

function identificarDestino(posto) {
    const endereco = [posto.Endereço, posto.Cidade, posto.Estado]
        .map(valor => String(valor ?? '').trim());
    // O endereço completo prevalece sobre coordenadas que podem ser aproximadas.
    // Nomes internos (ex.: POSTO 621) não devem desviar a busca do número informado.
    if (endereco.every(Boolean)) {
        return [String(posto.nomeMapa ?? '').trim(), ...endereco, 'Brasil'].filter(Boolean).join(', ');
    }
    return coordenadasValidas(posto) ? `${posto.lat},${posto.lon}` : identificarPosto(posto);
}

function criarLinkRota(posto, origem) {
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('destination', identificarDestino(posto));
    url.searchParams.set('travelmode', 'driving');
    if (coordenadasValidas(origem)) {
        url.searchParams.set('origin', `${origem.lat},${origem.lon}`);
    }
    if (posto.placeId) url.searchParams.set('destination_place_id', posto.placeId);
    return url.href;
}

function criarLinkRotaMulti(origem, lojas) {
    const url = new URL('https://www.google.com/maps/dir/');
    url.searchParams.set('api', '1');
    url.searchParams.set('origin', `${origem.lat},${origem.lon}`);
    url.searchParams.set('destination', identificarDestino(lojas[lojas.length - 1]));
    url.searchParams.set('waypoints', lojas.slice(0, -1).map(identificarDestino).join('|'));
    url.searchParams.set('travelmode', 'driving');
    return url.href;
}

function criarLinkPosto(posto) {
    const url = new URL('https://www.google.com/maps/search/');
    url.searchParams.set('api', '1');
    url.searchParams.set('query', identificarDestino(posto));
    if (posto.placeId) url.searchParams.set('query_place_id', posto.placeId);
    return url.href;
}

app.services.mapas = { geocodificarOrigem, obterRotaOSRM, obterRotaSequencial, criarLinkRota, criarLinkRotaMulti, criarLinkPosto };
})(window.RotaCombustivel);
