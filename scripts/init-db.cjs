const { abrirBanco, listarPostos, arquivoPadrao } = require('./database.cjs');
const db = abrirBanco();
try {
    console.log(`Banco pronto: ${arquivoPadrao}\n${listarPostos(db).length} postos cadastrados.`);
} finally {
    db.close();
}
