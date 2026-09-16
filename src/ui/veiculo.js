/* src/ui/veiculo.js */
(function (app) {
'use strict';
const PARAMETROS = app.config.parametros;

function obterNumero(id) {
    const valor = Number.parseFloat(document.getElementById(id)?.value);
    return Number.isFinite(valor) && valor >= 0 ? valor : 0;
}

function parametrosValidos() {
    return ['inpCapacidade', 'inpConsumo'].every(id => {
        const campo = document.getElementById(id);
        return campo.value !== '' && campo.checkValidity();
    }) && obterNumero('inpConsumo') > 0 && obterNumero('inpCapacidade') > 0 &&
        ['inpNivel', 'inpCarga', 'inpMargem'].every(id => {
            const campo = document.getElementById(id);
            return [...campo.options].some(opcao => opcao.value === campo.value);
        });
}

function lerParametros() {
    return {
        capacidade: obterNumero('inpCapacidade'),
        nivel: Number(document.getElementById('inpNivel').value),
        consumo: obterNumero('inpConsumo'), margem: Number(document.getElementById('inpMargem').value),
        validos: parametrosValidos()
    };
}

function aplicarParametros(salvos) {
    const rejeitados = [];
    for (const id of PARAMETROS) {
        if (!Object.hasOwn(salvos, id)) continue;
        const campo = document.getElementById(id);
        const valor = salvos[id];
        let valido = typeof valor === 'string' && valor.trim() !== '';
        if (campo.tagName === 'SELECT') {
            valido = valido && [...campo.options].some(opcao => opcao.value === valor);
        } else {
            valido = valido && Number.isFinite(Number(valor));
        }
        campo.value = valido ? valor : '';
        if (!valido || campo.value === '' || !campo.checkValidity()) {
            campo.value = '';
            rejeitados.push(id);
        }
    }
    return rejeitados;
}

function limparParametros() {
    for (const id of PARAMETROS) document.getElementById(id).value = '';
}

function obterValoresCampos() {
    return Object.fromEntries(PARAMETROS.map(id => [id, document.getElementById(id).value]));
}

app.ui.veiculo = { lerParametros, aplicarParametros, limparParametros, obterValoresCampos };
})(window.RotaCombustivel);
