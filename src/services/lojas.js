(function (app) {
'use strict';

if (!app.services.supabase) {
    async function carregar() {
        if (window.location.protocol === 'file:') return [];
        const resposta = await fetch('/api/lojas', { cache: 'no-store' });
        if (!resposta.ok) throw new Error('Falha ao consultar as lojas.');
        app.lojas = await resposta.json();
        return app.lojas;
    }
    async function cadastrar(dados) {
        const resposta = await fetch('/api/lojas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.error || resultado.erros?.join(' ') || 'Não foi possível cadastrar a loja.');
        app.lojas = resultado.lojas;
        return resultado;
    }
    async function importarCSV(csv) {
        const resposta = await fetch('/api/lojas/importar', { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8' }, body: csv });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível importar as lojas.');
        app.lojas = resultado.lojas;
        return resultado;
    }
    app.services.lojas = { carregar, cadastrar, importarCSV };
    return;
}

const { requisicao, csv, normalizar, numero } = app.services.supabase;

async function carregar() {
    const dados = await requisicao('lojas', { query: 'select=id,nome,marca,endereco,cidade,estado,latitude,longitude,link_maps&order=id.asc' });
    app.lojas = dados.map(loja => ({ id: loja.id, Nome: loja.nome, Marca: loja.marca, Endereço: loja.endereco,
        Cidade: loja.cidade, Estado: loja.estado, lat: loja.latitude == null ? null : Number(loja.latitude),
        lon: loja.longitude == null ? null : Number(loja.longitude), linkMaps: loja.link_maps }));
    return app.lojas;
}

function dadosLoja(dados) {
    return { nome: dados.Nome || dados.nome, marca: dados.Marca || dados.marca || null,
        endereco: dados.Endereço || dados.endereco, cidade: dados.Cidade || dados.cidade,
        estado: String(dados.Estado || dados.estado || '').toUpperCase(),
        latitude: numero(dados.lat || dados.latitude), longitude: numero(dados.lon || dados.longitude),
        link_maps: dados.linkMaps || dados.link_maps || dados.link || null };
}

async function cadastrar(dados) {
    await requisicao('lojas', { method: 'POST', body: JSON.stringify([dadosLoja(dados)]) });
    return { erros: [], duplicados: 0, lojas: await carregar() };
}

async function importarCSV(texto) {
    const registros = csv(texto);
    if (registros.length < 2) throw new Error('Inclua o cabeçalho e pelo menos uma loja.');
    const aliases = { nome: 'nome', marca: 'marca', brand: 'marca', endereco: 'endereco', cidade: 'cidade', estado: 'estado', uf: 'estado', lat: 'latitude', latitude: 'latitude', lon: 'longitude', longitude: 'longitude', link: 'link_maps', linkmaps: 'link_maps', maps: 'link_maps' };
    const cabecalho = registros.shift().map(c => aliases[normalizar(c)]);
    if (cabecalho.some(c => !c) || !['nome', 'endereco', 'cidade', 'estado'].every(c => cabecalho.includes(c))) throw new Error('CSV de lojas inválido. Use nome, endereco, cidade e estado.');
    const existentes = new Set((app.lojas || []).map(loja => [loja.Nome, loja.Endereço, loja.Cidade, loja.Estado].join('|').toLowerCase()));
    const novos = [];
    let duplicados = 0;
    for (const valores of registros) {
        const dados = Object.fromEntries(cabecalho.map((campo, i) => [campo, valores[i] ?? '']));
        if (!dados.nome || !dados.endereco || !dados.cidade || !/^[A-Za-z]{2}$/.test(dados.estado)) throw new Error('Nome, endereço, cidade e UF são obrigatórios.');
        const loja = dadosLoja(dados);
        const identidade = [loja.nome, loja.endereco, loja.cidade, loja.estado].join('|').toLowerCase();
        if (existentes.has(identidade)) { duplicados++; continue; }
        existentes.add(identidade); novos.push(loja);
    }
    if (novos.length) await requisicao('lojas', { method: 'POST', body: JSON.stringify(novos) });
    return { importados: novos.length, duplicados, lojas: await carregar() };
}

app.services.lojas = { carregar, cadastrar, importarCSV };
})(window.RotaCombustivel);