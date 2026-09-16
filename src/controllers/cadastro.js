(function (app) {
'use strict';

function inicializar() {
    const form = document.getElementById('formCadastroPosto');
    const campos = document.getElementById('camposCadastroPosto');
    const status = document.getElementById('statusCadastro');
    const salvar = document.getElementById('btnSalvarPosto');
    const abrir = document.getElementById('btnAbrirFormulario');
    const painel = document.getElementById('cadastroManual');
    abrir.addEventListener('click', () => {
        painel.open = !painel.open;
        abrir.setAttribute('aria-expanded', String(painel.open));
        if (painel.open) document.getElementById('cadNome').focus();
    });
    painel.addEventListener('toggle', () => abrir.setAttribute('aria-expanded', String(painel.open)));
    let salvando = false, disponivel = false;
    function definirDisponibilidade(valor) {
        disponivel = valor && window.location.protocol !== 'file:';
        salvar.disabled = !disponivel;
        status.textContent = disponivel ? 'Preencha os dados e clique em Salvar posto.' :
            window.location.protocol === 'file:' ? 'Você pode preencher o formulário. Para salvar, abra o painel pelo servidor local em http://localhost:3000.' :
                'Você pode preencher o formulário. Para salvar, verifique o servidor e recarregue o painel.';
    }
    function limparErros() {
        for (const campo of form.querySelectorAll('[aria-invalid]')) campo.removeAttribute('aria-invalid');
    }
    form.addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
    document.getElementById('btnCancelarCadastro').addEventListener('click', () => {
        if (salvando) return;
        form.reset(); limparErros();
        status.textContent = 'Cadastro cancelado. Nenhum posto foi salvo.';
        document.getElementById('cadastroManual').open = false;
        abrir.focus();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (salvando || !disponivel || !form.reportValidity()) return;
        const dados = Object.fromEntries(new FormData(form));
        salvando = true; campos.disabled = true; limparErros();
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'Salvando posto...';
        let primeiroErro;
        try {
            const resultado = await app.services.postos.cadastrar(dados);
            if (resultado.erros?.length) {
                status.textContent = resultado.erros.map(e => e.mensagem).join(' ');
                for (const erro of resultado.erros) {
                    const campo = form.elements.namedItem(erro.campo);
                    if (campo) { campo.setAttribute('aria-invalid', 'true'); primeiroErro ||= campo; }
                }
            } else {
                app.postos = resultado.postos;
                document.getElementById('quantidadePostos').textContent = app.postos.length + ' postos cadastrados';
                app.controllers.localizador.validarCadastroPostos();
                form.reset();
                status.textContent = 'Posto salvo com sucesso. Faça uma nova busca para incluí-lo nos resultados.';
            }
        } catch (error) {
            status.textContent = error.message + ' Os campos foram mantidos.';
        } finally {
            salvando = false; campos.disabled = false;
            form.setAttribute('aria-busy', 'false');
            primeiroErro?.focus();
        }
    });
    return { definirDisponibilidade };
}

app.controllers.cadastro = { inicializar };
})(window.RotaCombustivel);
