const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { analisarCSV } = require('./importacao-csv.cjs');
const { validarPosto, identidade } = require('./validacao-postos.cjs');

const schema = fs.readFileSync(path.resolve(__dirname, '../database/supabase.sql'), 'utf8');

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

function criarPool(connectionString) {
    return new Pool({
        connectionString,
        ssl: /supabase\.(co|com)/i.test(connectionString) ? { rejectUnauthorized: false } : undefined,
        max: 5,
        idleTimeoutMillis: 30000
    });
}

async function abrirBancoPostgres({ connectionString = process.env.DATABASE_URL, cadastroInicial } = {}) {
    if (!connectionString) throw new Error('DATABASE_URL não configurada.');
    const pool = criarPool(connectionString);
    try {
        await pool.query(schema);
        const total = await pool.query('SELECT COUNT(*)::int AS total FROM postos');
        if (total.rows[0].total === 0 && cadastroInicial) {
            const postos = cadastroInicial();
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const posto of postos) {
                    await client.query(`INSERT INTO postos
                        (nome, nome_mapa, endereco, cidade, estado, latitude, longitude, cnpj)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        ON CONFLICT (cnpj) DO NOTHING`,
                    [posto.Nome, posto.nomeMapa ?? null, posto.Endereço, posto.Cidade,
                        posto.Estado, posto.lat, posto.lon, posto.cnpj ?? null]);
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally { client.release(); }
        }
    } catch (error) {
        await pool.end();
        throw error;
    }
    return { tipo: 'postgres', pool, close: () => pool.end() };
}

async function listarPostos(db) {
    const resultado = await db.pool.query(`SELECT id, nome AS "Nome", nome_mapa AS "nomeMapa",
        endereco AS "Endereço", cidade AS "Cidade", estado AS "Estado",
        latitude::double precision AS lat, longitude::double precision AS lon, cnpj
        FROM postos ORDER BY id`);
    return resultado.rows;
}

async function listarLojas(db) {
    const resultado = await db.pool.query(`SELECT id, nome AS "Nome", marca AS "Marca", endereco AS "Endereço", cidade AS "Cidade",
        estado AS "Estado", latitude::double precision AS lat, longitude::double precision AS lon, link_maps AS "linkMaps"
        FROM lojas ORDER BY id`);
    return resultado.rows;
}

async function cadastrarLoja(db, dados) {
    const { loja, erros } = validarLoja(dados);
    if (erros.length) return { erros, duplicados: 0 };
    const duplicada = await db.pool.query(`SELECT 1 FROM lojas WHERE lower(nome) = lower($1) AND lower(endereco) = lower($2)
        AND lower(cidade) = lower($3) AND estado = $4`, [loja.Nome, loja.Endereço, loja.Cidade, loja.Estado]);
    if (duplicada.rowCount) return { erros: [], duplicados: 1 };
    const linkMaps = loja.linkMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loja.Endereço}, ${loja.Cidade}, ${loja.Estado}, Brasil`)}`;
    await db.pool.query(`INSERT INTO lojas (nome, marca, endereco, cidade, estado, latitude, longitude, link_maps)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [loja.Nome, loja.Marca || null, loja.Endereço, loja.Cidade, loja.Estado, loja.lat, loja.lon, linkMaps]);
    return { erros: [], duplicados: 0, lojas: await listarLojas(db) };
}

async function importarLojas(db, lojas) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        let importados = 0, duplicados = 0;
        for (const dados of lojas) {
            const { loja, erros } = validarLoja(dados);
            if (erros.length) throw new Error(erros.join(' '));
            const duplicada = await client.query(`SELECT 1 FROM lojas WHERE lower(nome) = lower($1) AND lower(endereco) = lower($2)
                AND lower(cidade) = lower($3) AND estado = $4`, [loja.Nome, loja.Endereço, loja.Cidade, loja.Estado]);
            if (duplicada.rowCount) { duplicados++; continue; }
            const linkMaps = loja.linkMaps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${loja.Endereço}, ${loja.Cidade}, ${loja.Estado}, Brasil`)}`;
            await client.query(`INSERT INTO lojas (nome, marca, endereco, cidade, estado, latitude, longitude, link_maps)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [loja.Nome, loja.Marca || null, loja.Endereço, loja.Cidade, loja.Estado, loja.lat, loja.lon, linkMaps]);
            importados++;
        }
        await client.query('COMMIT');
        return { importados, duplicados, lojas: await listarLojas(db) };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}

async function gravarPostos(db, analisar, previa = false) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const resultado = analisar(await listarPostos(db));
        if (previa || resultado.erros.length) {
            await client.query('ROLLBACK');
            return resultado;
        }
        for (const p of resultado.postos.filter(p => !p.duplicado)) {
            await client.query(`INSERT INTO postos
                (nome, nome_mapa, endereco, cidade, estado, latitude, longitude, cnpj)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [p.Nome, p.nomeMapa, p.Endereço, p.Cidade, p.Estado, p.lat, p.lon, p.cnpj]);
        }
        await client.query('COMMIT');
        const postos = await listarPostos(db);
        return { importados: resultado.novos, duplicados: resultado.duplicados, erros: [], postos };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { client.release(); }
}

async function importarCSV(db, texto, previa = false) {
    return gravarPostos(db, existentes => analisarCSV(texto, existentes), previa);
}

async function cadastrarPosto(db, dados) {
    return gravarPostos(db, existentes => {
        const { posto, erros } = validarPosto(dados);
        const duplicado = !erros.length && existentes.some(p =>
            identidade(p) === identidade(posto) || Boolean(posto.cnpj && p.cnpj === posto.cnpj));
        return { erros, novos: erros.length || duplicado ? 0 : 1, duplicados: Number(duplicado), postos: [{ ...posto, duplicado }] };
    });
}

module.exports = { abrirBancoPostgres, listarPostos, listarLojas, cadastrarLoja, importarLojas, importarCSV, cadastrarPosto };
