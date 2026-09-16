const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const arquivoPadrao = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(__dirname, '../database/rota-combustivel.sqlite');

function lerCadastroInicial() {
    // Executa somente o cadastro versionado do projeto, nunca conteúdo recebido pela API.
    const contexto = { window: { RotaCombustivel: {} } };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/data/postos.js'), 'utf8'), contexto, { timeout: 1000 });
    return contexto.window.RotaCombustivel.postos;
}

function abrirBancoLocal({ arquivo = arquivoPadrao, cadastroInicial = lerCadastroInicial } = {}) {
    if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
    const db = new DatabaseSync(arquivo);
    try {
        db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
        const versao = db.prepare('PRAGMA user_version').get().user_version;
        if (versao > 4) throw new Error('Versão do banco mais recente que esta aplicação.');
        if (versao === 0) {
            db.exec(fs.readFileSync(path.resolve(__dirname, '../database/migrations/001-postos.sql'), 'utf8'));
            const inserir = db.prepare(`INSERT INTO postos
                (nome, nome_mapa, endereco, cidade, estado, latitude, longitude, cnpj)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const posto of cadastroInicial()) {
                inserir.run(posto.Nome, posto.nomeMapa ?? null, posto.Endereço, posto.Cidade,
                    posto.Estado, posto.lat, posto.lon, posto.cnpj ?? null);
            }
            db.exec('PRAGMA user_version = 1;');
        }
        if (versao < 2) {
            db.exec(fs.readFileSync(path.resolve(__dirname, '../database/migrations/002-lojas.sql'), 'utf8'));
            db.exec('PRAGMA user_version = 2;');
        }
        if (versao < 3) {
            db.exec(fs.readFileSync(path.resolve(__dirname, '../database/migrations/003-marca-lojas.sql'), 'utf8'));
            db.exec('PRAGMA user_version = 3;');
        }
        if (versao < 4) {
            db.exec(fs.readFileSync(path.resolve(__dirname, '../database/migrations/004-coordenadas-lojas-opcionais.sql'), 'utf8'));
            db.exec('PRAGMA user_version = 4;');
        }
        db.exec('COMMIT;');
        return db;
    } catch (error) {
        try { db.exec('ROLLBACK;'); } catch { /* A transação pode não ter iniciado. */ }
        db.close();
        throw error;
    }
}

function abrirBanco(opcoes = {}) {
    if (!opcoes.arquivo && process.env.DATABASE_URL) {
        const { abrirBancoPostgres } = require('./database-postgres.cjs');
        return abrirBancoPostgres({ cadastroInicial: opcoes.cadastroInicial ?? lerCadastroInicial });
    }
    return abrirBancoLocal(opcoes);
}

function listarPostos(db) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').listarPostos(db);
    return db.prepare(`SELECT id, nome AS Nome, nome_mapa AS nomeMapa,
        endereco AS "Endereço", cidade AS Cidade, estado AS Estado,
        latitude AS lat, longitude AS lon, cnpj FROM postos ORDER BY id`).all();
}

function listarLojas(db) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').listarLojas(db);
    return db.prepare(`SELECT id, nome AS Nome, marca AS Marca, endereco AS "Endereço", cidade AS Cidade,
        estado AS Estado, latitude AS lat, longitude AS lon, link_maps AS linkMaps
        FROM lojas ORDER BY id`).all();
}

function validarLoja(dados) {
    const nome = String(dados?.Nome ?? dados?.nome ?? '').trim();
    const marca = String(dados?.Marca ?? dados?.marca ?? '').trim();
    const linkMaps = String(dados?.linkMaps ?? dados?.link_maps ?? dados?.link ?? '').trim();
    const endereco = String(dados?.['Endereço'] ?? dados?.endereco ?? '').trim();
    const cidade = String(dados?.Cidade ?? dados?.cidade ?? '').trim();
    const estado = String(dados?.Estado ?? dados?.estado ?? '').trim().toUpperCase();
    const textoLat = String(dados?.lat ?? dados?.latitude ?? '').trim();
    const textoLon = String(dados?.lon ?? dados?.longitude ?? '').trim();
    const lat = textoLat ? Number(textoLat.replace(',', '.')) : null;
    const lon = textoLon ? Number(textoLon.replace(',', '.')) : null;
    const erros = [];
    if (!nome) erros.push('Nome da loja é obrigatório.');
    if (!endereco) erros.push('Endereço da loja é obrigatório.');
    if (!cidade) erros.push('Cidade da loja é obrigatória.');
    if (!/^[A-Z]{2}$/.test(estado)) erros.push('Estado deve ser uma UF válida.');
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) erros.push('Latitude inválida.');
    if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180)) erros.push('Longitude inválida.');
    return { loja: { Nome: nome, Marca: marca, Endereço: endereco, Cidade: cidade, Estado: estado, lat, lon, linkMaps }, erros };
}

function cadastrarLoja(db, dados) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').cadastrarLoja(db, dados);
    const { loja, erros } = validarLoja(dados);
    if (erros.length) return { erros, duplicados: 0 };
    const duplicada = db.prepare(`SELECT 1 FROM lojas WHERE lower(nome) = lower(?) AND lower(endereco) = lower(?)
        AND lower(cidade) = lower(?) AND estado = ?`).get(loja.Nome, loja.Endereço, loja.Cidade, loja.Estado);
    if (duplicada) return { erros: [], duplicados: 1 };
    const linkMaps = loja.linkMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loja.Endereço}, ${loja.Cidade}, ${loja.Estado}, Brasil`)}`;
    db.prepare(`INSERT INTO lojas (nome, marca, endereco, cidade, estado, latitude, longitude, link_maps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(loja.Nome, loja.Marca || null, loja.Endereço, loja.Cidade, loja.Estado, loja.lat, loja.lon, linkMaps);
    return { erros: [], duplicados: 0, lojas: listarLojas(db) };
}

function importarLojas(db, lojas) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').importarLojas(db, lojas);
    db.exec('BEGIN IMMEDIATE;');
    try {
        let importados = 0, duplicados = 0;
        for (const dados of lojas) {
            const resultado = cadastrarLoja(db, dados);
            if (resultado.erros.length) throw new Error(resultado.erros.join(' '));
            if (resultado.duplicados) duplicados++;
            else importados++;
        }
        db.exec('COMMIT;');
        return { importados, duplicados, lojas: listarLojas(db) };
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

function importarCSV(db, texto, previa = false) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').importarCSV(db, texto, previa);
    const { analisarCSV } = require('./importacao-csv.cjs');
    return gravarPostos(db, existentes => analisarCSV(texto, existentes), previa);
}

function cadastrarPosto(db, dados) {
    if (db.tipo === 'postgres') return require('./database-postgres.cjs').cadastrarPosto(db, dados);
    const { validarPosto, identidade } = require('./validacao-postos.cjs');
    return gravarPostos(db, existentes => {
        const { posto, erros } = validarPosto(dados);
        const duplicado = !erros.length && existentes.some(p =>
            identidade(p) === identidade(posto) || Boolean(posto.cnpj && p.cnpj === posto.cnpj));
        return { erros, novos: erros.length || duplicado ? 0 : 1, duplicados: Number(duplicado), postos: [{ ...posto, duplicado }] };
    });
}

function gravarPostos(db, analisar, previa = false) {
    // Revalida duplicados dentro da transação, inclusive após outra importação.
    db.exec('BEGIN IMMEDIATE;');
    try {
        const resultado = analisar(listarPostos(db));
        if (previa || resultado.erros.length) {
            db.exec('ROLLBACK;');
            return resultado;
        }
        const inserir = db.prepare(`INSERT INTO postos
            (nome, nome_mapa, endereco, cidade, estado, latitude, longitude, cnpj)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const p of resultado.postos.filter(p => !p.duplicado)) {
            inserir.run(p.Nome, p.nomeMapa, p.Endereço, p.Cidade, p.Estado, p.lat, p.lon, p.cnpj);
        }
        const postos = listarPostos(db);
        db.exec('COMMIT;');
        return { importados: resultado.novos, duplicados: resultado.duplicados, erros: [], postos };
    } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
    }
}

module.exports = { abrirBanco, listarPostos, listarLojas, validarLoja, importarLojas, arquivoPadrao, lerCadastroInicial, importarCSV, cadastrarPosto, cadastrarLoja };
