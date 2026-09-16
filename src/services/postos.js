(function (app) {
'use strict';

if (!app.services.supabase) {
    async function carregar() {
        if (window.location.protocol === 'file:') return app.postos;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const resposta = await fetch('/api/postos', { signal: controller.signal, cache: 'no-store' });
            if (!resposta.ok) throw new Error('Falha ao consultar os postos.');
            const postos = await resposta.json();
            if (!Array.isArray(postos)) throw new Error('Cadastro de postos inválido.');
            app.postos = postos;
            return app.postos;
        } finally { clearTimeout(timeout); }
    }
    async function importarCSV(csv, previa) {
        const resposta = await fetch('/api/postos/importar' + (previa ? '?previa=1' : ''), { method: 'POST',
            headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-Rota-Importacao': 'csv' }, body: csv });
        const resultado = await resposta.json();
        if (!resposta.ok && resposta.status !== 422) throw new Error(resultado.error || 'Falha ao importar o arquivo.');
        return resultado;
    }
    async function cadastrar(dados) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        let resposta, resultado;
        try {
            resposta = await fetch('/api/postos', { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', 'X-Rota-Cadastro': 'formulario' }, body: JSON.stringify(dados) });
            resultado = await resposta.json();
        } catch (error) {
            throw new Error((error.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Falha de conexão ou resposta inválida.') +
                ' Recarregue o painel para conferir o cadastro antes de tentar novamente.');
        } finally { clearTimeout(timeout); }
        if (!resposta.ok && resposta.status !== 422) throw new Error(resultado.error || 'Não foi possível salvar o posto.');
        return resultado;
    }
    app.services.postos = { carregar, importarCSV, cadastrar };
    return;
}

const { requisicao, csv, normalizar, numero } = app.services.supabase;
const campos = 'id,nome,nome_mapa,endereco,cidade,estado,latitude,longitude,cnpj';

function mapear(posto) {
    return { id: posto.id, Nome: posto.nome, nomeMapa: posto.nome_mapa, Endereço: posto.endereco,
        Cidade: posto.cidade, Estado: posto.estado, lat: Number(posto.latitude), lon: Number(posto.longitude), cnpj: posto.cnpj };
}

async function carregar() {
    const dados = await requisicao('postos', { query: `select=${campos}&order=id.asc` });
    app.postos = dados.map(mapear);
    return app.postos;
}

function analisar(texto, existentes = []) {
    const registros = csv(texto);
    if (registros.length < 2) throw new Error('Inclua o cabeçalho e pelo menos um posto.');
    const aliases = { nome: 'Nome', nomemapa: 'nomeMapa', endereco: 'Endereço', cidade: 'Cidade', estado: 'Estado', lat: 'lat', latitude: 'lat', lon: 'lon', longitude: 'lon', cnpj: 'cnpj' };
    const cabecalho = registros.shift().map(c => aliases[normalizar(c)]);
    if (cabecalho.some(c => !c) || !['Nome', 'Endereço', 'Cidade', 'Estado', 'lat', 'lon'].every(c => cabecalho.includes(c))) {
        throw new Error('CSV de postos inválido. Use nome, endereco, cidade, estado, latitude e longitude.');
    }
    const identidades = new Set(existentes.map(p => [p.Nome, p.Endereço, p.Cidade, p.Estado].join('|').toLowerCase()));
    const resultado = { total: registros.length, novos: 0, duplicados: 0, erros: [], postos: [] };
    registros.forEach((valores, indice) => {
        const dados = Object.fromEntries(cabecalho.map((campo, i) => [campo, valores[i] ?? '']));
        const lat = numero(dados.lat), lon = numero(dados.lon);
        if (!dados.Nome || !dados.Endereço || !dados.Cidade || !/^[A-Za-z]{2}$/.test(dados.Estado) || lat === null || lon === null) {
            resultado.erros.push({ linha: indice + 2, mensagem: 'Nome, endereço, cidade, UF, latitude e longitude são obrigatórios.' });
            return;
        }
        const posto = { Nome: dados.Nome, nomeMapa: dados.nomeMapa || null, Endereço: dados.Endereço,
            Cidade: dados.Cidade, Estado: dados.Estado.toUpperCase(), lat, lon, cnpj: dados.cnpj || null };
        const identidade = [posto.Nome, posto.Endereço, posto.Cidade, posto.Estado].join('|').toLowerCase();
        const duplicado = identidades.has(identidade);
        if (duplicado) resultado.duplicados++;
        else { identidades.add(identidade); resultado.novos++; }
        resultado.postos.push({ ...posto, linha: indice + 2, duplicado });
    });
    return resultado;
}

async function importarCSV(texto, previa) {
    const resultado = analisar(texto, app.postos || []);
    if (previa || resultado.erros.length || !resultado.novos) return resultado;
    const novos = resultado.postos.filter(p => !p.duplicado).map(p => ({ nome: p.Nome, nome_mapa: p.nomeMapa,
        endereco: p.Endereço, cidade: p.Cidade, estado: p.Estado, latitude: p.lat, longitude: p.lon, cnpj: p.cnpj }));
    await requisicao('postos', { method: 'POST', body: JSON.stringify(novos) });
    const postos = await carregar();
    return { ...resultado, postos };
}

async function cadastrar(dados) {
    const registro = { nome: dados.Nome || dados.nome, nome_mapa: dados.nomeMapa || null,
        endereco: dados.Endereço || dados.endereco, cidade: dados.Cidade || dados.cidade,
        estado: String(dados.Estado || dados.estado || '').toUpperCase(),
        latitude: numero(dados.lat || dados.latitude), longitude: numero(dados.lon || dados.longitude), cnpj: dados.cnpj || null };
    await requisicao('postos', { method: 'POST', body: JSON.stringify([registro]) });
    return { erros: [], duplicados: 0, postos: await carregar() };
}

app.services.postos = { carregar, importarCSV, cadastrar };
})(window.RotaCombustivel);