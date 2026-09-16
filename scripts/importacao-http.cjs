const { importarCSV } = require('./database.cjs');
const { LIMITE_BYTES } = require('./importacao-csv.cjs');

async function responderImportacao(req, res, db, url) {
    const responder = (status, dados) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(dados));
    };
    if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' }); return res.end();
    }
    // Bloqueia chamadas de outros sites, sem habilitar CORS.
    let origem;
    try { origem = new URL(`http://${req.headers.host}`); }
    catch { return responder(403, { error: 'Endereço do servidor inválido.' }); }
    if ((req.headers.origin && req.headers.origin !== origem.origin) ||
        req.headers['x-rota-importacao'] !== 'csv') {
        return responder(403, { error: 'Importe pelo painel oficial.' });
    }
    if (!/^text\/csv(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        return responder(415, { error: 'Envie um arquivo CSV UTF-8.' });
    }
    let tamanho = 0;
    const partes = [];
    try {
        for await (const parte of req) {
            tamanho += parte.length;
            if (tamanho > LIMITE_BYTES) {
                return responder(413, { error: 'O arquivo deve ter no máximo 1 MB.' });
            }
            partes.push(parte);
        }
        let texto;
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes)); }
        catch { return responder(400, { error: 'Salve o arquivo como CSV UTF-8 e tente novamente.' }); }
        const resultado = await importarCSV(db, texto, url.searchParams.get('previa') === '1');
        responder(resultado.erros.length ? 422 : 200, resultado);
    } catch (error) {
        if (!res.writableEnded && !res.destroyed) responder(500, { error: error.message || 'Não foi possível importar. Consulte o cadastro antes de tentar novamente.' });
    }
}

module.exports = { responderImportacao };
