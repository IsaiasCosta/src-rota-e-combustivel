const { abrirBanco } = require('./database.cjs');

const cidades = {
    464: 'São Mateus',
    465: 'Colatina',
    467: 'Marataízes',
    471: 'Serra',
    474: 'Serra',
    483: 'Vila Velha',
    487: 'Vila Velha',
    496: 'Cariacica',
    497: 'Cariacica',
    500: 'Cariacica',
    502: 'Cariacica',
    504: 'Guarapari',
    506: 'Guarapari',
    507: 'Linhares',
    515: 'Vila Velha',
    678: 'Serra'
};

const db = abrirBanco();
try {
    db.exec('BEGIN IMMEDIATE;');
    const atualizar = db.prepare('UPDATE lojas SET cidade = ? WHERE id = ?');
    for (const [id, cidade] of Object.entries(cidades)) atualizar.run(cidade, Number(id));
    db.exec('COMMIT;');
    const restante = db.prepare('SELECT count(*) AS total FROM lojas WHERE cidade = ?').get('Não informada').total;
    console.log(JSON.stringify({ atualizadas: Object.keys(cidades).length, restantes: restante }));
} catch (error) {
    db.exec('ROLLBACK;');
    throw error;
} finally { db.close(); }
