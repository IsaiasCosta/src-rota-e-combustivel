const fs = require('node:fs');
const { abrirBanco, listarLojas } = require('./database.cjs');
const { lerCSV } = require('./importacao-csv.cjs');

const arquivo = process.argv[2];
if (!arquivo) throw new Error('Informe o caminho do CSV.');

function valorLink(texto) {
    const encontrado = String(texto ?? '').match(/linkLocation=(https?:\/\/.*?)(?:,\s*friendlyName=|$)/i);
    return encontrado ? encontrado[1] : String(texto ?? '').trim() || null;
}

const texto = fs.readFileSync(arquivo, 'utf8');
const registros = lerCSV(texto);
const cabecalho = registros.shift().campos.map(c => c.trim().toLowerCase());
const aliases = { nome: 'nome', endereco: 'endereco', 'endereço': 'endereco', cidade: 'cidade', uf: 'estado', estado: 'estado', link_maps: 'link', link: 'link', latitude: 'lat', longitude: 'lon' };
const campos = cabecalho.map(c => aliases[c]);
const obrigatorios = ['nome', 'endereco', 'cidade', 'estado'];
if (campos.some(c => !c) || obrigatorios.some(c => !campos.includes(c))) throw new Error('Cabeçalho de lojas inválido.');

const db = abrirBanco();
try {
    db.exec('BEGIN IMMEDIATE;');
    const inserir = db.prepare(`INSERT INTO lojas (nome, marca, endereco, cidade, estado, latitude, longitude, link_maps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const existentes = new Set(listarLojas(db).map(loja => [loja.Nome, loja.Endereço, loja.Cidade, loja.Estado].join('|').toLocaleLowerCase()));
    let importados = 0, duplicados = 0;
    for (const registro of registros) {
        const dados = Object.fromEntries(registro.campos.map((valor, indice) => [campos[indice], valor.trim()]));
        if (!/^[A-Z]{2}$/.test(dados.estado)) {
            if (!dados.cidade && dados.estado) dados.cidade = dados.estado;
            dados.estado = /\bES\b|Viana/i.test(dados.link || '') || /Viana/i.test(dados.nome) ? 'ES' : 'NA';
        }
        const identidade = [dados.nome, dados.endereco, dados.cidade, dados.estado].join('|').toLocaleLowerCase();
        if (existentes.has(identidade)) { duplicados++; continue; }
        const lat = dados.lat ? Number(dados.lat.replace(',', '.')) : null;
        const lon = dados.lon ? Number(dados.lon.replace(',', '.')) : null;
        inserir.run(dados.nome, 'Sem marca informada', dados.endereco || 'Endereço não informado', dados.cidade || 'Não informada', dados.estado.toUpperCase() || 'NA',
            Number.isFinite(lat) ? lat : null, Number.isFinite(lon) ? lon : null, valorLink(dados.link));
        existentes.add(identidade);
        importados++;
    }
    db.exec('COMMIT;');
    console.log(JSON.stringify({ importados, duplicados, total: listarLojas(db).length }));
} catch (error) {
    db.exec('ROLLBACK;');
    throw error;
} finally { db.close(); }