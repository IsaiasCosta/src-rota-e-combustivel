(function (app) {
'use strict';

function inicializar() {
    const arquivo = document.getElementById('arquivoPostos');
    const confirmar = document.getElementById('btnImportarPostos');
    const cancelar = document.getElementById('btnCancelarImportacao');
    const status = document.getElementById('statusImportacao');
    const previa = document.getElementById('previaImportacao');
    const erros = document.getElementById('errosImportacao');
    const tabela = document.getElementById('linhasImportacao');
    const secao = document.getElementById('modalImportacao');
    const abrir = document.getElementById('btnAbrirImportacao');
    let csv = '', ocupado = false, disponivel = false;
    abrir.addEventListener('click', () => {
        if (!secao.open) { abrir.focus(); secao.showModal(); }
        if (!arquivo.disabled) arquivo.focus();
    });
    for (const id of ['btnFecharModalCSV', 'btnFecharImportacao']) {
        document.getElementById(id).addEventListener('click', () => secao.close());
    }
    function definirDisponibilidade(valor) {
        disponivel = valor && window.location.protocol !== 'file:';
        arquivo.disabled = !disponivel || ocupado;
        status.textContent = disponivel ? 'Selecione um arquivo para conferir os postos antes de importar.' :
            'Para importar, abra o painel pelo servidor e aguarde o carregamento do cadastro.';
    }

    function limpar() {
        csv = ''; confirmar.disabled = true; cancelar.hidden = true; previa.hidden = true;
        confirmar.textContent = 'Importar postos';
        erros.replaceChildren(); tabela.replaceChildren();
    }
    function definirOcupado(valor) {
        ocupado = valor; arquivo.disabled = !disponivel || valor; cancelar.disabled = valor;
        secao.setAttribute('aria-busy', String(valor));
    }
    function apresentar(resultado) {
        erros.replaceChildren(); tabela.replaceChildren();
        previa.hidden = false; cancelar.hidden = false;
        for (const erro of resultado.erros) {
            const li = document.createElement('li');
            li.textContent = (erro.linha ? `Linha ${erro.linha}: ` : '') + erro.mensagem;
            erros.append(li);
        }
        for (const posto of resultado.postos.slice(0, 50)) {
            const tr = document.createElement('tr');
            for (const valor of [posto.linha, posto.Nome, posto.Endereço, `${posto.Cidade} / ${posto.Estado}`, `${posto.lat}, ${posto.lon}`, posto.nomeMapa || '—', posto.duplicado ? 'Já cadastrado / repetido' : 'Novo']) {
                const td = document.createElement('td'); td.textContent = valor; tr.append(td);
            }
            tabela.append(tr);
        }
        document.getElementById('resumoImportacao').textContent = `${resultado.total} linhas • ${resultado.novos} novos • ${resultado.duplicados} repetidos • ${resultado.erros.length} linhas com erro.`;
        document.getElementById('limitePrevia').textContent = resultado.postos.length > 50 ? 'Exibindo os primeiros 50 registros válidos. Todos os registros do arquivo serão considerados ao salvar.' : '';
        confirmar.disabled = resultado.erros.length > 0 || resultado.novos === 0;
        confirmar.textContent = `Importar ${resultado.novos} ${resultado.novos === 1 ? 'posto' : 'postos'}`;
        status.textContent = resultado.erros.length ? 'Nenhum posto foi salvo. Corrija os erros e selecione o arquivo novamente.' :
            resultado.novos ? 'Confira a prévia e clique em Importar. Os repetidos serão ignorados.' : 'Todos os postos já estão cadastrados ou se repetem no arquivo. Nenhum posto novo para importar.';
    }
    arquivo.addEventListener('change', async () => {
        if (ocupado || !disponivel) return;
        limpar();
        const selecionado = arquivo.files[0];
        if (!selecionado) { status.textContent = 'Selecione um arquivo CSV.'; return; }
        if (!/\.csv$/i.test(selecionado.name) || selecionado.size > 1024 * 1024) {
            status.textContent = 'Selecione um arquivo .csv de até 1 MB.'; arquivo.value = ''; return;
        }
        definirOcupado(true); status.textContent = 'Lendo e validando o arquivo...';
        try {
            const bytes = await selecionado.arrayBuffer();
            try { csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { throw new Error('Salve o arquivo como CSV UTF-8 e tente novamente.'); }
            apresentar(await app.services.postos.importarCSV(csv, true));
        } catch (error) { limpar(); status.textContent = error.message; }
        finally { arquivo.value = ''; definirOcupado(false); }
    });
    cancelar.addEventListener('click', () => {
        if (ocupado) return;
        limpar(); status.textContent = 'Importação cancelada. Nenhum posto foi salvo.';
    });
    confirmar.addEventListener('click', async () => {
        if (ocupado || confirmar.disabled || !csv) return;
        definirOcupado(true); confirmar.disabled = true; status.textContent = 'Salvando postos...';
        try {
            const resultado = await app.services.postos.importarCSV(csv, false);
            if (resultado.erros.length) { apresentar(resultado); return; }
            app.postos = resultado.postos;
            document.getElementById('quantidadePostos').textContent = app.postos.length + ' postos cadastrados';
            app.controllers.localizador.validarCadastroPostos();
            limpar();
            status.textContent = `${resultado.importados} postos salvos. ${resultado.duplicados} repetidos ignorados. Faça uma nova busca para incluir os novos postos nos resultados.`;
        } catch (error) {
            limpar();
            status.textContent = `${error.message} Recarregue o painel para conferir o cadastro. Você pode selecionar o arquivo novamente; os repetidos serão ignorados.`;
        } finally { definirOcupado(false); }
    });
    return { definirDisponibilidade };
}

app.controllers.importacao = { inicializar };
})(window.RotaCombustivel);
