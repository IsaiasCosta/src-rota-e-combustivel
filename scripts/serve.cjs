const { criarServidor } = require('./server.cjs');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número entre 1 e 65535.');
Promise.resolve(criarServidor()).then(server => {
	server.on('error', error => { console.error(`Não foi possível iniciar o painel: ${error.message}`); process.exitCode = 1; });
	server.listen(port, host, () => console.log(`Painel disponível em http://${host}:${port}\nEncerre com Ctrl+C.`));
}).catch(error => {
	console.error(`Não foi possível abrir o banco: ${error.message}`);
	process.exitCode = 1;
});
