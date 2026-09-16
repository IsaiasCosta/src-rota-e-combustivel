/* src/controllers/painel.js */
(function (app) {
'use strict';
const CONSUMOS = app.config.consumos;

function restaurarParametros() {
    try {
        const rejeitados = app.ui.veiculo.aplicarParametros(app.services.armazenamento.carregarParametros());
        if (rejeitados.length) {
            document.getElementById('statusArmazenamento').textContent = 'Há parâmetros salvos inválidos. Preencha os campos vazios; os dados salvos serão preservados até a correção.';
        }
    } catch {
        app.ui.veiculo.limparParametros();
        document.getElementById('statusArmazenamento').textContent = 'Não foi possível recuperar os parâmetros salvos. Preencha os campos; os dados salvos serão preservados até a correção.';
    }
}

function salvarParametros() {
    try {
        app.services.armazenamento.salvarParametros(app.ui.veiculo.obterValoresCampos());
        document.getElementById('statusArmazenamento').textContent = 'Parâmetros salvos neste navegador. Busca de endereço e rotas requer internet.';
    } catch {
        document.getElementById('statusArmazenamento').textContent = 'Armazenamento indisponível. Os parâmetros serão mantidos somente enquanto esta página estiver aberta.';
    }
}

function alterarCarga() {
    document.getElementById('inpConsumo').value = CONSUMOS[document.getElementById('inpCarga').value].toFixed(1);
    calcular();
}

function calcular() {
    const parametros = app.ui.veiculo.lerParametros();
    const { nivel, capacidadeTotal, combustivelAtual, autonomia, autonomiaSegura } = app.domain.combustivel.calcularAutonomia(parametros);

    document.getElementById("outCapacidadeTotal").textContent = `${capacidadeTotal.toFixed(1)} L`;
    document.getElementById("outLitros").textContent = `${combustivelAtual.toFixed(1)} L`;
    document.getElementById("outAutonomia").textContent = `${autonomia.toFixed(1)} km`;
    document.getElementById("outAutonomiaSegura").textContent = `${autonomiaSegura.toFixed(1)} km`;

    const status = document.getElementById("outStatusPosto");
    if (!parametros.validos) {
        status.className = "status-alert status-danger";
        status.textContent = "Confira os parâmetros: capacidade e consumo devem ser válidos e maiores que zero; selecione nível, carga e margem.";
        for (const id of ['outCapacidadeTotal', 'outLitros', 'outAutonomia', 'outAutonomiaSegura']) document.getElementById(id).textContent = '—';
    } else if (combustivelAtual <= capacidadeTotal * 0.15) {
        status.className = "status-alert status-danger";
        status.textContent = "🚨 RESERVA CRÍTICA - ABASTEÇA IMEDIATAMENTE!";
    } else if (combustivelAtual <= capacidadeTotal * 0.30) {
        status.className = "status-alert status-warning";
        status.textContent = "⚠️ ATENÇÃO: NÍVEL EM RESERVA - PROCURE UM POSTO";
    } else {
        status.className = "status-alert status-success";
        status.textContent = "🟢 NÍVEL DE COMBUSTÍVEL NORMAL";
    }

    app.ui.medidor.atualizarMedidor(nivel, combustivelAtual, capacidadeTotal);
    if (parametros.validos) salvarParametros();
    app.controllers.localizador.atualizarResultados();
}

app.controllers.painel = { alterarCarga, calcular, restaurarParametros };
})(window.RotaCombustivel);
