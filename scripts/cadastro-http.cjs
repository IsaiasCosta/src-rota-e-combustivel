const { cadastrarPosto } = require('./database.cjs');

async function responderCadastro(req, res, db) {
    const responder = (status, dados) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(dados));
    };
    let origem;
    try { origem = new URL(`http://${req.headers.host}`); }
    catch { return responder(403, { error: 'Endereço do servidor inválido.' }); }
    if ((req.headers.origin && req.headers.origin !== origem.origin) || req.headers['x-rota-cadastro'] !== 'formulario') {
        return responder(403, { error: 'Cadastre pelo painel oficial.' });
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        return responder(415, { error: 'Envie os dados do formulário em JSON.' });
    }
    try {
        const partes = [];
        let tamanho = 0;
        for await (const parte of req) {
            tamanho += parte.length;
            if (tamanho > 16384) return responder(413, { error: 'Os dados excedem o limite de 16 KB.' });
            partes.push(parte);
        }
        let dados;
        try { dados = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(partes))); }
        catch { return responder(400, { error: 'Não foi possível ler os dados do formulário.' }); }
        const resultado = await cadastrarPosto(db, dados);
        if (resultado.erros.length) return responder(422, { erros: resultado.erros });
        if (resultado.duplicados) return responder(409, { error: 'Este posto já está cadastrado. Nenhum dado foi alterado.' });
        return responder(201, { postos: resultado.postos });
    } catch {
        if (!res.writableEnded && !res.destroyed) responder(500, { error: 'Não foi possível concluir o cadastro. Recarregue o painel para conferir antes de tentar novamente.' });
    }
}

module.exports = { responderCadastro };
