(function (app) {
'use strict';
const { coordenadasValidas } = app.domain.distancia;
const { geocodificarOrigem, obterRotaSequencial, criarLinkRotaMulti } = app.services.mapas;
let origem = null;

function el(id) { return document.getElementById(id); }
function status(texto) { el('statusRoteirizacao').textContent = texto; }

function marcasDisponiveis() {
    return [...new Set(app.lojas.map(loja => String(loja.Marca || 'Sem marca').trim()))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function lojasVisiveis() {
    const filtro = el('filtroLojas')?.value.trim().toLocaleLowerCase() || '';
    return app.lojas.filter(loja => {
        const texto = [loja.Nome, loja.Endereço, loja.Cidade, loja.Estado, loja.Marca].join(' ').toLocaleLowerCase();
        return texto.includes(filtro);
    });
}

function atualizarContador() {
    const quantidade = document.querySelectorAll('#listaLojas input:checked').length;
    const total = document.querySelectorAll('#listaLojas input').length;
    el('contadorLojas').textContent = `${quantidade} selecionada${quantidade === 1 ? '' : 's'} de ${total}`;
}

function renderizarLojas() {
    const selecionadasAntes = new Set([...document.querySelectorAll('#listaLojas input:checked')].map(input => Number(input.value)));
    const lista = el('listaLojas');
    if (!app.lojas?.length) {
        lista.innerHTML = '<p class="helper">Nenhuma loja cadastrada. Cadastre uma loja ou importe um CSV.</p>';
        return;
    }
    const visiveis = lojasVisiveis();
    let primeiraCoordenada = false;
    const usarSelecaoAnterior = selecionadasAntes.size > 0;
    lista.innerHTML = visiveis.map(loja => {
        const temCoordenadas = coordenadasValidas(loja);
        const deveMarcar = temCoordenadas && (usarSelecaoAnterior ? selecionadasAntes.has(loja.id) : !primeiraCoordenada);
        const marcado = deveMarcar ? 'checked' : '';
        if (marcado) primeiraCoordenada = true;
        const link = loja.linkMaps ? `<a href="${app.utils.escaparHTML(loja.linkMaps)}" target="_blank" rel="noopener noreferrer">Maps</a>` : '';
        return `<label class="loja-opcao ${temCoordenadas ? '' : 'loja-sem-coordenadas'}"><input type="checkbox" value="${loja.id}" ${marcado}>
        <span><strong>${app.utils.escaparHTML(loja.Nome)}</strong><small>${app.utils.escaparHTML(loja.Marca || 'Sem marca')} • ${app.utils.escaparHTML(loja.Endereço)}, ${app.utils.escaparHTML(loja.Cidade)}/${app.utils.escaparHTML(loja.Estado)} ${link}</small>${temCoordenadas ? '' : '<small class="aviso-coordenadas">Sem coordenadas: informe antes de calcular a rota.</small>'}</span></label>`;
    }).join('');
    lista.querySelectorAll('input').forEach(input => input.addEventListener('change', atualizarContador));
    atualizarContador();
}

function localizarGPS() {
    if (!navigator.geolocation) return status('GPS não disponível neste navegador.');
    status('Obtendo localização do veículo...');
    navigator.geolocation.getCurrentPosition(position => {
        origem = { lat: position.coords.latitude, lon: position.coords.longitude };
        status(`Origem definida pelo GPS (${origem.lat.toFixed(5)}, ${origem.lon.toFixed(5)}).`);
    }, error => status(error.code === 1 ? 'Permissão de localização negada.' : 'Não foi possível obter o GPS.'), { enableHighAccuracy: true, timeout: 15000 });
}

async function definirOrigem() {
    const texto = el('inpOrigemRota').value.trim();
    if (!texto) return status('Informe a origem ou use o GPS.');
    status('Localizando a origem no mapa...');
    const local = await geocodificarOrigem(texto);
    origem = local.coordenadas;
    status(`Origem definida: ${local.nome}`);
}

function lojasSelecionadas() {
    const ids = [...document.querySelectorAll('#listaLojas input:checked')].map(input => Number(input.value));
    return ids.map(id => app.lojas.find(loja => loja.id === id)).filter(Boolean);
}

function alterarSelecaoVisivel(marcar) {
    document.querySelectorAll('#listaLojas input').forEach(input => { input.checked = marcar; });
    atualizarContador();
}

async function calcularRota() {
    try {
        if (!origem) await definirOrigem();
        const lojas = lojasSelecionadas();
        if (!coordenadasValidas(origem)) throw new Error('Defina uma origem válida.');
        if (!lojas.length) throw new Error('Selecione ao menos uma loja.');
        const semCoordenadas = lojas.filter(loja => !coordenadasValidas(loja));
        if (semCoordenadas.length) {
            const nomes = semCoordenadas.slice(0, 3).map(loja => loja.Nome).join(', ');
            const complemento = semCoordenadas.length > 3 ? ` e mais ${semCoordenadas.length - 3}` : '';
            throw new Error(`Informe as coordenadas de ${nomes}${complemento} antes de calcular a rota.`);
        }
        el('btnCalcularRota').disabled = true;
        status('Calculando a rota no Google Maps...');
        const trechos = await obterRotaSequencial(origem, lojas);
        const planejamento = app.domain.roteirizacao.planejarConsumo(trechos, app.ui.veiculo.lerParametros());
        renderizarResultado(planejamento, lojas);
        const provedor = trechos[0]?.provedor === 'GOOGLE_MAPS' ? 'Google Maps' : 'OSRM (estimativa)';
        status(`Rota calculada por ${provedor}. Confira o saldo antes de iniciar a entrega.`);
    } catch (error) { status(error.message || 'Não foi possível calcular a rota.'); }
    finally { el('btnCalcularRota').disabled = false; }
}

function renderizarResultado(resultado, lojas) {
    const container = el('resultadoRota');
    const analise = resultado.suficiente ? (resultado.dentroDaMargem ? 'status-success' : 'status-warning') : 'status-danger';
    const mensagem = !resultado.suficiente ? 'ABASTECIMENTO NECESSÁRIO ANTES DE CONCLUIR A ROTA' :
        resultado.dentroDaMargem ? 'ROTA DENTRO DA AUTONOMIA COM MARGEM' : 'ROTA POSSÍVEL, MAS FORA DA MARGEM DE SEGURANÇA';
    container.innerHTML = `<div class="rota-resumo ${analise}"><strong>${mensagem}</strong><span>${resultado.distanciaTotalKm.toFixed(1)} km • ${resultado.consumoTotalLitros.toFixed(1)} L necessários • saldo final ${resultado.combustivelFinal.toFixed(1)} L</span></div>
        <ol class="trechos-rota">${resultado.etapas.map((etapa, indice) => `<li><div><strong>${indice + 1}. ${app.utils.escaparHTML(lojas[indice].Nome)}</strong><small>${etapa.distanciaKm.toFixed(1)} km${etapa.tempoMin ? ` • ${app.utils.formatarTempo(etapa.tempoMin)}` : ''}</small></div><span>${etapa.consumoLitros.toFixed(1)} L<br><small>saldo: ${etapa.combustivelRestante.toFixed(1)} L</small></span></li>`).join('')}</ol>
        <a class="btn-secondary link-rota" target="_blank" rel="noopener noreferrer" href="${app.utils.escaparHTML(criarLinkRotaMulti(origem, lojas))}">Abrir rota completa no Google Maps</a>`;
    container.hidden = false;
}

async function cadastrarLoja(event) {
    event.preventDefault();
    const formulario = event.currentTarget;
    const statusCadastro = el('statusCadastroLoja');
    const campos = el('camposCadastroLoja');
    try {
        const dados = Object.fromEntries(new FormData(formulario));
        campos.disabled = true;
        statusCadastro.textContent = 'Salvando loja...';
        const resultado = await app.services.lojas.cadastrar(dados);
        renderizarLojas();
        formulario.reset();
        statusCadastro.textContent = `Loja salva com sucesso. ${resultado.lojas.length} lojas disponíveis.`;
    } catch (error) { statusCadastro.textContent = error.message; }
    finally { campos.disabled = false; }
}

async function importarCSV(event) {
    const arquivo = event.target.files[0];
    if (!arquivo) return;
    const statusImportacao = el('statusImportacaoLojas');
    statusImportacao.textContent = 'Importando lojas...';
    try {
        const resultado = await app.services.lojas.importarCSV(await arquivo.text());
        renderizarLojas();
        statusImportacao.textContent = `${resultado.importados} lojas importadas; ${resultado.duplicados} duplicadas ignoradas.`;
    } catch (error) { statusImportacao.textContent = error.message; }
    event.target.value = '';
}

function alternarCadastroLoja(tipo) {
    const formulario = el('cadastroManualLoja');
    const importacao = el('importacaoManualLoja');
    const abrirFormulario = tipo === 'formulario';
    formulario.open = abrirFormulario;
    importacao.open = !abrirFormulario;
    el('btnAbrirFormularioLoja').setAttribute('aria-expanded', String(abrirFormulario));
    el('btnAbrirImportacaoLoja').setAttribute('aria-expanded', String(!abrirFormulario));
    if (abrirFormulario) el('lojaNome').focus();
    else el('arquivoLojas').focus();
}

function inicializar() {
    el('btnGPSRota').addEventListener('click', localizarGPS);
    el('btnDefinirOrigem').addEventListener('click', () => definirOrigem().catch(error => status(error.message)));
    el('btnCalcularRota').addEventListener('click', calcularRota);
    el('formCadastroLoja').addEventListener('submit', cadastrarLoja);
    el('arquivoLojas').addEventListener('change', importarCSV);
    el('btnAbrirFormularioLoja').addEventListener('click', () => alternarCadastroLoja('formulario'));
    el('btnAbrirImportacaoLoja').addEventListener('click', () => alternarCadastroLoja('importacao'));
    el('btnCancelarCadastroLoja').addEventListener('click', () => {
        el('formCadastroLoja').reset();
        el('statusCadastroLoja').textContent = 'Cadastro cancelado. Nenhuma loja foi salva.';
        el('cadastroManualLoja').open = false;
        el('btnAbrirFormularioLoja').focus();
    });
    el('filtroLojas').addEventListener('input', renderizarLojas);
    el('listaLojas').addEventListener('change', atualizarContador);
    el('btnMarcarLojas').addEventListener('click', () => alterarSelecaoVisivel(true));
    el('btnDesmarcarLojas').addEventListener('click', () => alterarSelecaoVisivel(false));
}

app.controllers.roteirizacao = { inicializar, renderizarLojas };
})(window.RotaCombustivel);