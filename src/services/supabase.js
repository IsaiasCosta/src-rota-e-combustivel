(function (app) {
'use strict';

function requisicao(tabela, opcoes = {}) {
    if (!app.config.supabaseUrl || !app.config.supabaseAnonKey) {
        throw new Error('Configure o Supabase em src/config.js antes de publicar o painel.');
    }
    const url = new URL(`/rest/v1/${tabela}`, app.config.supabaseUrl);
    url.search = opcoes.query || '';
    return fetch(url, {
        ...opcoes,
        headers: {
            apikey: app.config.supabaseAnonKey,
            Authorization: `Bearer ${app.config.supabaseAnonKey}`,
            Accept: 'application/json',
            ...(opcoes.body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
            ...(opcoes.headers || {})
        }
    }).then(async resposta => {
        const texto = await resposta.text();
        let dados;
        try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
        if (!resposta.ok) throw new Error(dados?.message || dados?.hint || 'Não foi possível acessar o Supabase.');
        return dados;
    });
}

function csv(texto) {
    const linhas = [], registro = [];
    let campo = '', aspas = false;
    const primeiraLinha = texto.slice(0, texto.search(/[\r\n]/));
    const separador = primeiraLinha.includes(';') ? ';' : ',';
    for (let i = 0; i < texto.length; i++) {
        const caractere = texto[i];
        if (aspas) {
            if (caractere === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (caractere === '"') aspas = false;
            else campo += caractere;
        } else if (caractere === '"') aspas = true;
        else if (caractere === separador) { registro.push(campo.trim()); campo = ''; }
        else if (caractere === '\n' || caractere === '\r') {
            if (caractere === '\r' && texto[i + 1] === '\n') i++;
            registro.push(campo.trim()); campo = '';
            if (registro.some(Boolean)) linhas.push(registro.splice(0));
        } else campo += caractere;
    }
    registro.push(campo.trim());
    if (registro.some(Boolean)) linhas.push(registro);
    return linhas;
}

function normalizar(valor) {
    return String(valor ?? '').replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[ _-]/g, '');
}

function numero(valor) {
    if (valor === '' || valor == null) return null;
    const resultado = Number(String(valor).replace(',', '.'));
    return Number.isFinite(resultado) ? resultado : null;
}

app.services.supabase = { requisicao, csv, normalizar, numero };
})(window.RotaCombustivel);