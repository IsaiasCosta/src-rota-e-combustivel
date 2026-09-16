(function (app) {
'use strict';
const chave = app.config.storageKey;
const chaveLegada = app.config.legacyStorageKey;

function carregarParametros() {
    const valor = localStorage.getItem(chave) ?? localStorage.getItem(chaveLegada);
    const salvos = valor === null ? {} : JSON.parse(valor);
    if (!salvos || typeof salvos !== 'object' || Array.isArray(salvos)) {
        throw new Error('Parâmetros salvos inválidos.');
    }
    // Preservar a capacidade total da versão com dois campos, sem somar novamente.
    if (!Object.hasOwn(salvos, 'inpCapacidade') &&
        (Object.hasOwn(salvos, 'inpCapacidade1') || Object.hasOwn(salvos, 'inpCapacidade2'))) {
        const capacidades = ['inpCapacidade1', 'inpCapacidade2'].map(id => {
            if (!Object.hasOwn(salvos, id)) return 0;
            const valor = salvos[id];
            if (!['string', 'number'].includes(typeof valor) || String(valor).trim() === '' ||
                !Number.isFinite(Number(valor)) || Number(valor) < 0) {
                throw new Error('Capacidade salva inválida.');
            }
            return Number(valor);
        });
        const total = capacidades[0] + capacidades[1];
        if (!Number.isFinite(total) || total <= 0) throw new Error('Capacidade salva inválida.');
        salvos.inpCapacidade = String(total);
    }
    delete salvos.inpCapacidade1;
    delete salvos.inpCapacidade2;
    return salvos;
}

function salvarParametros(parametros) {
    localStorage.setItem(chave, JSON.stringify(parametros));
}

app.services.armazenamento = { carregarParametros, salvarParametros };
})(window.RotaCombustivel);
