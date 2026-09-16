const LIMITE_BYTES = 1024 * 1024;
const LIMITE_POSTOS = 1000;
const { validarPosto, normalizar, identidade } = require('./validacao-postos.cjs');

function lerCSV(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    // O cabeçalho define o separador; vírgulas dentro de aspas não contam.
    let aspas = false, virgulas = 0, pontos = 0;
    for (const c of texto.trimStart()) {
        if (c === '"') aspas = !aspas;
        if (!aspas && (c === '\n' || c === '\r')) break;
        if (!aspas && c === ',') virgulas++;
        if (!aspas && c === ';') pontos++;
    }
    const separador = pontos > virgulas ? ';' : ',';
    const registros = [];
    let campos = [], campo = '', dentro = false, fechou = false, linha = 1, inicio = 1;
    function finalizar() {
        campos.push(campo.trim());
        if (campos.some(Boolean)) registros.push({ linha: inicio, campos });
        if (registros.length > LIMITE_POSTOS + 1) throw new Error(`Use no máximo ${LIMITE_POSTOS} postos por arquivo.`);
        campos = []; campo = ''; fechou = false;
    }
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (dentro) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else { dentro = false; fechou = true; }
            } else {
                campo += c;
                if (c === '\n' || (c === '\r' && texto[i + 1] !== '\n')) linha++;
            }
        } else if (c === separador) {
            campos.push(campo.trim()); campo = ''; fechou = false;
        } else if (c === '\n' || c === '\r') {
            finalizar();
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linha++; inicio = linha;
        } else if (c === '"') {
            if (campo.trim() || fechou) throw new Error(`Linha ${linha}: aspas em posição inválida.`);
            campo = ''; dentro = true;
        } else {
            if (fechou && c.trim()) throw new Error(`Linha ${linha}: conteúdo após fechar aspas.`);
            campo += c;
        }
    }
    if (dentro) throw new Error(`Linha ${inicio}: campo com aspas não fechadas.`);
    finalizar();
    return registros;
}

function analisarCSV(texto, existentes = []) {
    const resultado = { total: 0, novos: 0, duplicados: 0, erros: [], postos: [] };
    try {
        if (typeof texto !== 'string' || Buffer.byteLength(texto, 'utf8') > LIMITE_BYTES) throw new Error('O arquivo deve ter no máximo 1 MB.');
        if (texto.includes('\uFFFD') || texto.includes('\0')) throw new Error('Salve o arquivo como CSV UTF-8.');
        const registros = lerCSV(texto);
        if (registros.length < 2) throw new Error('Inclua o cabeçalho e pelo menos um posto.');
        const aliases = { nome: 'Nome', nomemapa: 'nomeMapa', endereco: 'Endereço', cidade: 'Cidade', estado: 'Estado', lat: 'lat', latitude: 'lat', lon: 'lon', longitude: 'lon', cnpj: 'cnpj' };
        const cabecalho = registros.shift().campos.map(c => aliases[normalizar(c).replace(/[ _]/g, '')]);
        if (cabecalho.some(c => !c)) throw new Error('Cabeçalho desconhecido. Use as colunas do arquivo modelo.');
        if (new Set(cabecalho).size !== cabecalho.length) throw new Error('Existem colunas repetidas no cabeçalho.');
        for (const c of ['Nome', 'Endereço', 'Cidade', 'Estado', 'lat', 'lon']) {
            if (!cabecalho.includes(c)) throw new Error(`Coluna obrigatória ausente: ${c}.`);
        }
        const identidades = new Set(existentes.map(identidade));
        const cnpjs = new Set(existentes.filter(p => p.cnpj).map(p => p.cnpj));
        resultado.total = registros.length;
        for (const { linha, campos } of registros) {
            if (campos.length !== cabecalho.length) {
                resultado.erros.push({ linha, mensagem: 'Quantidade de campos diferente do cabeçalho. Use aspas em valores que contêm o separador.' });
                continue;
            }
            const { posto: p, erros } = validarPosto(Object.fromEntries(cabecalho.map((c, i) => [c, campos[i]])));
            if (erros.length) { resultado.erros.push({ linha, mensagem: erros.map(e => e.mensagem).join(' ') }); continue; }
            const chave = identidade(p);
            const duplicado = identidades.has(chave) || Boolean(p.cnpj && cnpjs.has(p.cnpj));
            // Registros ignorados não reservam identidades que ainda não existem no banco.
            if (!duplicado) { identidades.add(chave); if (p.cnpj) cnpjs.add(p.cnpj); }
            resultado[duplicado ? 'duplicados' : 'novos']++;
            resultado.postos.push({ ...p, linha, duplicado });
        }
    } catch (error) { resultado.erros.push({ linha: null, mensagem: error.message }); }
    return resultado;
}

module.exports = { analisarCSV, lerCSV, LIMITE_BYTES };
