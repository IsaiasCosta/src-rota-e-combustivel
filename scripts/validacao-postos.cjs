const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const identidade = p => JSON.stringify([p.Nome, p.Endereço, p.Cidade, p.Estado].map(normalizar));
const estados = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

function validarPosto(dados) {
    const erros = [];
    const posto = {};
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return { posto, erros: [{ campo: null, mensagem: 'Informe os dados de um posto.' }] };
    }
    for (const campo of ['Nome', 'Endereço', 'Cidade', 'Estado', 'lat', 'lon', 'cnpj', 'nomeMapa']) {
        const valor = dados[campo];
        const numerico = (campo === 'lat' || campo === 'lon') && typeof valor === 'number' && Number.isFinite(valor);
        if (valor != null && typeof valor !== 'string' && !numerico) {
            erros.push({ campo, mensagem: `${campo}: formato inválido.` });
        }
        posto[campo] = typeof valor === 'string' || numerico ? String(valor).trim() : '';
        if (/[\0\uFFFD]/.test(posto[campo])) erros.push({ campo, mensagem: `${campo}: texto inválido.` });
    }
    for (const campo of ['Nome', 'Endereço', 'Cidade']) {
        if (!posto[campo] || posto[campo].length > 300) erros.push({ campo, mensagem: `${campo}: preencha entre 1 e 300 caracteres.` });
    }
    posto.Estado = posto.Estado.toUpperCase();
    if (!estados.has(posto.Estado)) erros.push({ campo: 'Estado', mensagem: 'Estado: use uma UF brasileira, como MG.' });
    for (const campo of ['lat', 'lon']) {
        const valor = posto[campo].replace(',', '.');
        posto[campo] = /^-?\d+(\.\d+)?$/.test(valor) ? Number(valor) : NaN;
    }
    if (!(posto.lat >= -35 && posto.lat <= 6)) erros.push({ campo: 'lat', mensagem: 'Latitude: informe um número entre -35 e 6.' });
    if (!(posto.lon >= -75 && posto.lon <= -30)) erros.push({ campo: 'lon', mensagem: 'Longitude: informe um número entre -75 e -30.' });
    if (posto.nomeMapa.length > 300) erros.push({ campo: 'nomeMapa', mensagem: 'Nome no mapa: use até 300 caracteres.' });
    posto.nomeMapa = posto.nomeMapa || null;
    const cnpj = posto.cnpj;
    posto.cnpj = cnpj.replace(/[.\/\-\s]/g, '') || null;
    if (cnpj && !/^\d{14}$/.test(posto.cnpj ?? '')) erros.push({ campo: 'cnpj', mensagem: 'CNPJ: informe 14 dígitos ou deixe vazio.' });
    return { posto, erros };
}

module.exports = { validarPosto, normalizar, identidade };
