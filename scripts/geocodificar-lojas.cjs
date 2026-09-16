const { abrirBanco, listarLojas } = require('./database.cjs');

const LIMITE = Number(process.argv[2] || 702);
const ESPERA_MS = 1100;

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodificar(loja) {
    const consulta = [loja.Endereço, loja.Cidade, loja.Estado, 'Brasil']
        .filter(Boolean)
        .join(', ');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'br');
    url.searchParams.set('q', consulta);
    const resposta = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'RotaCombustivel/0.1 (local geocoding)'
        }
    });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = await resposta.json();
    const lat = Number(dados[0]?.lat);
    const lon = Number(dados[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function executar() {
    const db = abrirBanco();
    const atualizar = db.prepare('UPDATE lojas SET latitude = ?, longitude = ? WHERE id = ?');
    const pendentes = listarLojas(db).filter(loja => !Number.isFinite(loja.lat) || !Number.isFinite(loja.lon)).slice(0, LIMITE);
    let localizadas = 0;
    let semResultado = 0;
    let falhas = 0;

    try {
        for (const [indice, loja] of pendentes.entries()) {
            try {
                const coordenadas = await geocodificar(loja);
                if (coordenadas) {
                    atualizar.run(coordenadas.lat, coordenadas.lon, loja.id);
                    localizadas++;
                } else {
                    semResultado++;
                }
            } catch (error) {
                falhas++;
                console.error(`Falha na loja ${loja.id} (${loja.Nome}): ${error.message}`);
            }
            console.log(`[${indice + 1}/${pendentes.length}] ${loja.Nome}: ${localizadas ? 'coordenada processada' : 'sem coordenada'}`);
            if (indice < pendentes.length - 1) await esperar(ESPERA_MS);
        }
        console.log(JSON.stringify({ processadas: pendentes.length, localizadas, semResultado, falhas }));
    } finally {
        db.close();
    }
}

executar().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});