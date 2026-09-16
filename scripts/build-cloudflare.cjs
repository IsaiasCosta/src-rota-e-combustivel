const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

function copiarDiretorio(origem, destino) {
    fs.mkdirSync(destino, { recursive: true });
    for (const entrada of fs.readdirSync(origem, { withFileTypes: true })) {
        const origemEntrada = path.join(origem, entrada.name);
        const destinoEntrada = path.join(destino, entrada.name);
        if (entrada.isDirectory()) copiarDiretorio(origemEntrada, destinoEntrada);
        else fs.copyFileSync(origemEntrada, destinoEntrada);
    }
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const arquivo of ['src_rota_e_combustivel.html', '_redirects']) {
    fs.copyFileSync(path.join(root, arquivo), path.join(publicDir, arquivo === 'src_rota_e_combustivel.html' ? 'index.html' : arquivo));
}
for (const diretorio of ['assets', 'src']) {
    const origem = path.join(root, diretorio);
    const destino = path.join(publicDir, diretorio);
    if (!fs.existsSync(origem)) throw new Error(`Diretório estático ausente: ${origem}`);
    copiarDiretorio(origem, destino);
    if (!fs.existsSync(destino)) throw new Error(`Falha ao copiar: ${origem}`);
}

console.log(`Arquivos estáticos preparados em ${publicDir}`);