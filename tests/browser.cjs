const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { criarServidor } = require('../scripts/server.cjs');

async function main() {
    const root = path.resolve(__dirname, '..');
    const html = 'src_rota_e_combustivel.html';
    const server = criarServidor({ arquivoBanco: ':memory:' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'src-rota-e-combustivel-browser-'));
    const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    let socket;
    try {
        chrome.on('error', error => { console.error(error.message); });
        const portFile = path.join(profile, 'DevToolsActivePort');
        const deadline = Date.now() + 20000;
        while (!fs.existsSync(portFile)) {
            if (Date.now() > deadline) throw new Error('Chrome não iniciou em 20 segundos.');
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let nextId = 0;
        const pending = new Map();
        const errors = [];
        socket.onmessage = event => {
            const msg = JSON.parse(event.data);
            if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
            if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        };
        const call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 20000);
            pending.set(id, result => { clearTimeout(timer); result.error ? reject(new Error(result.error.message)) : resolve(result.result); });
            socket.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await call('Runtime.enable');
        await call('Page.enable');
        async function abrirFormulario() {
            await evaluate("if (document.getElementById('modalImportacao').open) document.getElementById('modalImportacao').close(); if (!document.getElementById('cadastroManual').open) document.getElementById('btnAbrirFormulario').click()");
        }
        async function conferirDigitacaoCadastro(cenario) {
            await abrirFormulario();
            for (const [id, valor] of Object.entries({ cadNome: 'Posto Digitação', cadEndereco: 'Rua São João, 123', cadCidade: 'Belo Horizonte', cadLatitude: '-19.9', cadLongitude: '-43.94', cadNomeMapa: 'Nome no mapa' })) {
                const ponto = await evaluate(`(() => { const campo = document.getElementById(${JSON.stringify(id)}); campo.scrollIntoView({behavior:'instant', block:'center'}); const r = campo.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
                await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...ponto, button: 'left', clickCount: 1 });
                await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...ponto, button: 'left', clickCount: 1 });
                assert.equal(await evaluate('document.activeElement.id'), id, `${cenario}: foco em ${id}`);
                await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
                await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
                await call('Input.insertText', { text: valor });
                assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`), valor, `${cenario}: digitação em ${id}`);
            }
            await evaluate("document.getElementById('formCadastroPosto').reset(); document.getElementById('cadastroManual').open = false; window.scrollTo({top:0, behavior:'instant'})");
        }
        async function conferirSelecaoEstado(cenario) {
            await abrirFormulario();
            await evaluate("document.getElementById('cadEstado').focus()");
            assert.equal(await evaluate("document.activeElement.id"), 'cadEstado', cenario);
            for (const [key, code] of [['Home', 36], ['ArrowDown', 40]]) {
                await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
                await call('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code });
            }
            assert.equal(await evaluate("document.getElementById('cadEstado').value"), 'AC', cenario);
            await evaluate("document.getElementById('cadastroManual').open = false");
        }
        async function conferirDownloadModelo(cenario) {
            const destino = path.join(profile, `download-${cenario}`);
            fs.mkdirSync(destino);
            await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: destino });
            await evaluate("document.getElementById('btnAbrirImportacao').click()");
            assert.equal(await evaluate("document.getElementById('modalImportacao').matches(':modal')"), true);
            await evaluate("document.getElementById('btnModeloCSV').click()");
            const baixado = path.join(destino, 'modelo-postos.csv');
            for (let i = 0; i < 100 && !fs.existsSync(baixado); i++) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.ok(fs.existsSync(baixado), `Modelo não baixou: ${cenario}`);
            assert.deepEqual(fs.readFileSync(baixado), fs.readFileSync(path.join(root, 'assets/modelos/modelo-postos.csv')));
            await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', windowsVirtualKeyCode: 27 });
            await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', windowsVirtualKeyCode: 27 });
            assert.equal(await evaluate("document.getElementById('modalImportacao').open"), false);
            assert.equal(await evaluate("document.activeElement.id"), 'btnAbrirImportacao');
        }
        await call('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
        await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('outAutonomiaSegura')?.textContent === '952.0 km' && document.getElementById('quantidadePostos')?.textContent === '49 postos cadastrados'")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('outAutonomiaSegura').textContent"), '952.0 km');
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length === 49 && window['src-rota-e-combustivel'].postos.every(p => Number.isInteger(p.id))"), true);
        await conferirDownloadModelo('http');
        await conferirSelecaoEstado('servidor disponível');
        await conferirDigitacaoCadastro('servidor disponível');
        assert.equal(await evaluate("document.querySelectorAll('input[id^=\"inpCapacidade\"]').length"), 1);
        assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), 'rgb(8, 10, 16)');
        assert.equal(await evaluate("document.querySelector('.brand-mark img').decode().then(() => document.querySelector('.brand-mark img').naturalWidth > 0)"), true);
        assert.equal(await evaluate("document.body.textContent.includes('from pathlib')"), false);
        assert.equal(await evaluate("window['src-rota-e-combustivel'].utils.formatarTempo(119.6)"), '2h 0min');
        assert.equal(await evaluate("document.querySelectorAll('input:not([id]), select:not([id])').length"), 0);
        await evaluate("document.getElementById('inpCarga').value='VAZIO'; document.getElementById('inpCarga').dispatchEvent(new Event('change'))");
        assert.equal(await evaluate("document.getElementById('outAutonomiaSegura').textContent"), '1428.0 km');
        await evaluate("document.getElementById('inpConsumo').value='2.7'; document.getElementById('inpConsumo').dispatchEvent(new Event('input'))");
        assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '1512.0 km');
        await call('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('outAutonomia')?.textContent === '1512.0 km' && document.getElementById('quantidadePostos')?.textContent === '49 postos cadastrados'")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('inpConsumo').value"), '2.7');
        await evaluate(`window.fetch = async url => ({ok:true,json:async()=>String(url).includes('/api/geocodificar')?[{lat:'-19.9',lon:'-44.0',display_name:'Contagem, MG'}]:{code:'Ok',routes:[{distance:50000,duration:3590}]}}); document.getElementById('inpOrigem').value='Contagem'; document.getElementById('btnBuscarCidade').click()`);
        for (let i = 0; i < 100; i++) {
            if (await evaluate("!document.getElementById('btnBuscarCidade').disabled")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos li').length"), 5);
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos a[href*=\"/maps/search/\"]').length"), 5);
        assert.equal(await evaluate("[...document.querySelectorAll('#resultadosPostos li')].every(li => {const posto=window['src-rota-e-combustivel'].postos.find(p=>li.querySelector('strong').textContent.trim().endsWith(p.Nome)); const destino=[posto.nomeMapa,posto.Endereço,posto.Cidade,posto.Estado,'Brasil'].filter(Boolean).join(', '); const rota=new URL(li.querySelector('a[href*=\"/maps/dir/\"]').href); const mapa=new URL(li.querySelector('a[href*=\"/maps/search/\"]').href); return rota.searchParams.get('destination')===destino && mapa.searchParams.get('query')===destino && rota.searchParams.get('origin')==='-19.9,-44';})"), true);
        // Reproduzir o caso informado com o cartão e os dois links reais da interface.
        await evaluate("window.resultadosBuscaTeste=document.getElementById('resultadosPostos').innerHTML; const posto=window['src-rota-e-combustivel'].postos.find(p=>p.Nome==='POSTO 621 PADRE EUSTAQUIO'); window['src-rota-e-combustivel'].ui.postos.exibirResultadosPostos([{...posto,distancia:5,tempoMin:10,tipoDistancia:'ROTA'}],{lat:-19.9,lon:-44},window['src-rota-e-combustivel'].ui.veiculo.lerParametros())");
        assert.equal(await evaluate("new URL(document.querySelector('#resultadosPostos a[href*=\"/maps/dir/\"]').href).searchParams.get('destination')"), 'Posto Bretas Duarte, Rua Pará de Minas, 788, Belo Horizonte, MG, Brasil');
        assert.equal(await evaluate("new URL(document.querySelector('#resultadosPostos a[href*=\"/maps/search/\"]').href).searchParams.get('query')"), 'Posto Bretas Duarte, Rua Pará de Minas, 788, Belo Horizonte, MG, Brasil');
        await evaluate("document.getElementById('resultadosPostos').innerHTML=window.resultadosBuscaTeste; delete window.resultadosBuscaTeste");
        assert.equal(await evaluate("document.querySelector('#resultadosPostos .status-success') !== null"), true);
        await evaluate("document.getElementById('inpNivel').value='0'; document.getElementById('inpNivel').dispatchEvent(new Event('change'))");
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos .status-danger').length"), 5);
        assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '0.0 km');
        await evaluate("document.getElementById('inpConsumo').value=''; document.getElementById('inpConsumo').dispatchEvent(new Event('input'))");
        assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '—');
        assert.equal(await evaluate("document.getElementById('resultadosPostos').textContent.includes('NaN')"), false);
        await evaluate(`document.getElementById('inpConsumo').value='2'; document.getElementById('inpNivel').value='1.00'; window['src-rota-e-combustivel'].controllers.painel.calcular(); window.fetch=async url=>{if(String(url).includes('/api/geocodificar')) return {ok:true,json:async()=>[{lat:'-19.9',lon:'-44.0',display_name:'Contagem, MG'}]}; throw new Error('Sem conexão')}; window['src-rota-e-combustivel'].controllers.localizador.buscarPostos()`);
        assert.equal(await evaluate("(document.getElementById('resultadosPostos').textContent.match(/📏 estimativa/g)||[]).length"), 5);
        await evaluate("window.fetch=async()=>{throw new Error('Sem conexão')}; window['src-rota-e-combustivel'].controllers.localizador.buscarPostos()");
        assert.equal(await evaluate("document.getElementById('statusBusca').textContent"), 'Sem conexão');
        assert.equal(await evaluate("document.getElementById('btnGPS').disabled || document.getElementById('btnBuscarCidade').disabled"), false);
        await evaluate("window.fetch=async url=>({ok:true,json:async()=>String(url).includes('/api/geocodificar')?[{lat:'-19.9',lon:'-44.0',display_name:'Contagem, MG'}]:{code:'Ok',routes:[{distance:null,duration:30}]}}); window['src-rota-e-combustivel'].controllers.localizador.buscarPostos()");
        assert.equal(await evaluate("(document.getElementById('resultadosPostos').textContent.match(/📏 estimativa/g)||[]).length"), 5);
        await evaluate("window.fetch=async url=>({ok:true,json:async()=>String(url).includes('/api/geocodificar')?[{lat:'-19.9',lon:'-44.0',display_name:'Contagem, MG'}]:{code:'NoRoute'}}); window['src-rota-e-combustivel'].controllers.localizador.buscarPostos()");
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos .status-danger').length"), 5);
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos .status-success').length"), 0);
        assert.equal(await evaluate("document.getElementById('resultadosPostos').textContent.includes('autonomia não avaliada')"), true);
        await evaluate("document.getElementById('inpNivel').value='0.50'; document.getElementById('inpNivel').dispatchEvent(new Event('change'))");
        assert.equal(await evaluate("document.querySelectorAll('#resultadosPostos .status-success').length"), 0);
        await evaluate("window.fetch=async()=>({ok:true,json:async()=>[{lat:null,lon:''}]}); window['src-rota-e-combustivel'].controllers.localizador.buscarPostos()");
        assert.equal(await evaluate("document.getElementById('statusBusca').textContent"), 'O mapa retornou coordenadas inválidas.');
        assert.equal(await evaluate("document.getElementById('resultadosPostos').style.display"), 'none');
        assert.equal(await evaluate("document.getElementById('btnGPS').disabled || document.getElementById('btnBuscarCidade').disabled"), false);
        // Um cadastro anterior deve manter os litros e a autonomia após a migração.
        await evaluate("localStorage.setItem(window['src-rota-e-combustivel'].config.storageKey, JSON.stringify({inpCapacidade1:'100',inpCapacidade2:'500',inpNivel:'0.50',inpConsumo:'2',inpMargem:'0.15',inpCarga:'CARREGADO'}))");
        await call('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('outAutonomiaSegura')?.textContent === '510.0 km'")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('inpCapacidade').value"), '600');
        assert.equal(await evaluate("document.getElementById('outLitros').textContent"), '300.0 L');
        assert.equal(await evaluate("document.getElementById('outAutonomiaSegura').textContent"), '510.0 km');
        assert.equal(await evaluate("Object.hasOwn(JSON.parse(localStorage.getItem(window['src-rota-e-combustivel'].config.storageKey)), 'inpCapacidade2')"), false);
        await evaluate("document.getElementById('inpCapacidade').value='100'; document.getElementById('inpNivel').value='1.00'; document.getElementById('inpCapacidade').dispatchEvent(new Event('input'))");
        assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '200.0 km');
        await call('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('outAutonomia')?.textContent === '200.0 km'")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('inpCapacidade').value"), '100');
        for (const valor of ['', '0', '-100']) {
            await evaluate(`document.getElementById('inpCapacidade').value=${JSON.stringify(valor)}; document.getElementById('inpCapacidade').dispatchEvent(new Event('input'))`);
            assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '—');
            assert.equal(await evaluate("JSON.parse(localStorage.getItem(window['src-rota-e-combustivel'].config.storageKey)).inpCapacidade"), '100');
        }
        await evaluate("document.getElementById('inpCapacidade').value='600'; document.getElementById('inpNivel').value='0.50'; document.getElementById('inpCapacidade').dispatchEvent(new Event('input'))");
        // Recuperação inválida não pode calcular com padrões nem sobrescrever o conteúdo salvo.
        const parametrosValidos = { inpCapacidade: '600', inpNivel: '0.50', inpConsumo: '2', inpMargem: '0.15', inpCarga: 'CARREGADO' };
        const casosInvalidos = [
            ...[['inpCapacidade', '-100'], ['inpConsumo', '2.75'], ['inpNivel', 'invalido'], ['inpMargem', null], ['inpCarga', 'invalida']]
                .map(([id, valor]) => ({ raw: JSON.stringify({ ...parametrosValidos, [id]: valor }), vazio: id })),
            ...['{quebrado', '', '[]', 'null', JSON.stringify({ inpCapacidade1: '-100', inpCapacidade2: '500' })]
                .map(raw => ({ raw, vazio: 'inpCapacidade' }))
        ];
        for (const { raw, vazio } of casosInvalidos) {
            await evaluate(`localStorage.setItem(window['src-rota-e-combustivel'].config.storageKey, ${JSON.stringify(raw)})`);
            await call('Page.reload');
            for (let i = 0; i < 100; i++) {
                if (await evaluate("document.getElementById('outAutonomia')?.textContent === '—'")) break;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.equal(await evaluate("document.getElementById('outAutonomia').textContent"), '—');
            assert.equal(await evaluate(`document.getElementById(${JSON.stringify(vazio)}).value`), '');
            assert.equal(await evaluate("document.getElementById('statusArmazenamento').textContent.includes('preservados até a correção')"), true);
            assert.equal(await evaluate("localStorage.getItem(window['src-rota-e-combustivel'].config.storageKey)"), raw);
            await evaluate("document.getElementById('inpCapacidade').value='100'; document.getElementById('inpCapacidade').dispatchEvent(new Event('input'))");
            if (vazio !== 'inpCapacidade' || raw[0] !== '{' || raw.includes('quebrado') || raw.includes('inpCapacidade1')) {
                assert.equal(await evaluate("localStorage.getItem(window['src-rota-e-combustivel'].config.storageKey)"), raw);
            }
            await evaluate(`for (const [id, valor] of Object.entries(${JSON.stringify(parametrosValidos)})) document.getElementById(id).value=valor; document.getElementById('inpCapacidade').dispatchEvent(new Event('input'))`);
            assert.equal(await evaluate("document.getElementById('outAutonomiaSegura').textContent"), '510.0 km');
            assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem(window['src-rota-e-combustivel'].config.storageKey))"), parametrosValidos);
            assert.equal(await evaluate("document.getElementById('statusArmazenamento').textContent.includes('preservados até a correção')"), false);
        }
        // Importação real pela interface, com banco de teste e sem simular a API.
        async function esperarImportacao() {
            for (let i = 0; i < 100; i++) {
                if (await evaluate("!document.getElementById('arquivoPostos').disabled && document.getElementById('modalImportacao').getAttribute('aria-busy') !== 'true'")) return;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error('Importação não ficou disponível.');
        }
        await esperarImportacao();
        const csvImportacao = 'nome;endereco;cidade;estado;latitude;longitude;nome_mapa\nPosto <img src=x onerror=alert(1)>;Rua Teste, 10;Belo Horizonte;MG;-19.9;-43.94;';
        async function selecionarCSV(texto) {
            await evaluate("document.getElementById('btnAbrirImportacao').click()");
            await evaluate(`{ const dados = new DataTransfer(); dados.items.add(new File([${JSON.stringify(texto)}], 'postos.csv', {type:'text/csv'})); const campo = document.getElementById('arquivoPostos'); campo.files = dados.files; campo.dispatchEvent(new Event('change')); }`);
            await esperarImportacao();
        }
        await selecionarCSV(csvImportacao);
        assert.equal(await evaluate("document.getElementById('btnImportarPostos').disabled"), false);
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length"), 49);
        assert.equal(await evaluate("document.querySelectorAll('#linhasImportacao img').length"), 0);
        await evaluate("document.getElementById('btnCancelarImportacao').click()");
        assert.equal(await evaluate("document.getElementById('previaImportacao').hidden"), true);
        await selecionarCSV(csvImportacao.replace('-19.9', ''));
        assert.equal(await evaluate("document.getElementById('btnImportarPostos').disabled"), true);
        assert.equal(await evaluate("document.getElementById('errosImportacao').textContent.includes('Linha 2')"), true);
        await selecionarCSV(csvImportacao);
        await evaluate("document.getElementById('btnImportarPostos').click()");
        await esperarImportacao();
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length"), 50);
        assert.equal(await evaluate("document.getElementById('statusImportacao').textContent.includes('1 postos salvos')"), true);
        await selecionarCSV(csvImportacao);
        assert.equal(await evaluate("document.getElementById('btnImportarPostos').disabled"), true);
        assert.equal(await evaluate("document.getElementById('resumoImportacao').textContent.includes('1 repetidos')"), true);
        // Cadastro individual mantém a importação CSV disponível.
        const postoManual = { cadNome: 'Posto Manual Teste', cadEndereco: 'Rua Manual, 20', cadCidade: '   ', cadEstado: 'MG', cadLatitude: '-19.9', cadLongitude: '-43.94' };
        async function preencherManual() {
            await abrirFormulario();
            await evaluate(`for (const [id, valor] of Object.entries(${JSON.stringify(postoManual)})) document.getElementById(id).value = valor;`);
        }
        async function salvarManual() {
            await evaluate("document.getElementById('formCadastroPosto').requestSubmit()");
            for (let i = 0; i < 100; i++) {
                if (await evaluate("document.getElementById('formCadastroPosto').getAttribute('aria-busy') !== 'true'")) return;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw new Error('Cadastro manual não terminou.');
        }
        await preencherManual();
        await evaluate("document.getElementById('btnCancelarCadastro').click()");
        assert.equal(await evaluate("document.getElementById('cadastroManual').open"), false);
        assert.equal(await evaluate("document.getElementById('cadNome').value"), '');
        await preencherManual();
        await salvarManual();
        assert.equal(await evaluate("document.getElementById('cadCidade').getAttribute('aria-invalid')"), 'true');
        assert.equal(await evaluate("document.getElementById('cadNome').value"), postoManual.cadNome);
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length"), 50);
        postoManual.cadCidade = 'Belo Horizonte';
        await preencherManual();
        await salvarManual();
        assert.equal(await evaluate("document.getElementById('statusCadastro').textContent.includes('Posto salvo com sucesso')"), true);
        assert.equal(await evaluate("document.getElementById('cadNome').value"), '');
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length"), 51);
        await preencherManual();
        await salvarManual();
        assert.equal(await evaluate("document.getElementById('statusCadastro').textContent.includes('já está cadastrado')"), true);
        assert.equal(await evaluate("document.getElementById('cadNome').value"), postoManual.cadNome);
        assert.equal(await evaluate("window['src-rota-e-combustivel'].postos.length"), 51);
        await evaluate("window.fetchAntesFalhaCadastro = window.fetch; window.fetch = async () => { throw new Error('Sem conexão'); }");
        await salvarManual();
        assert.equal(await evaluate("document.getElementById('statusCadastro').textContent.includes('Falha de conexão')"), true);
        assert.equal(await evaluate("document.getElementById('cadNome').value"), postoManual.cadNome);
        await evaluate("window.fetch = window.fetchAntesFalhaCadastro");
        // Simula um servidor que nunca responde e acelera apenas o prazo de 12 segundos.
        await evaluate("window.timerAntesTeste = window.setTimeout; window.setTimeout = (fn, ms, ...args) => window.timerAntesTeste(fn, ms === 12000 ? 50 : ms, ...args); window.fetch = (_url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once:true}))");
        await salvarManual();
        assert.equal(await evaluate("document.getElementById('statusCadastro').textContent.includes('servidor demorou demais')"), true);
        assert.equal(await evaluate("document.getElementById('camposCadastroPosto').disabled"), false);
        assert.equal(await evaluate("document.getElementById('cadNome').value"), postoManual.cadNome);
        await evaluate("window.fetch = window.fetchAntesFalhaCadastro; window.setTimeout = window.timerAntesTeste");
        await conferirDigitacaoCadastro('após servidor sem resposta');
        await selecionarCSV(csvImportacao);
        assert.equal(await evaluate("document.getElementById('resumoImportacao').textContent.includes('1 repetidos')"), true);
        await evaluate("document.getElementById('btnFecharModalCSV').click()");
        assert.equal(await evaluate("document.getElementById('modalImportacao').open"), false);
        await evaluate("document.getElementById('btnAbrirImportacao').click()");
        assert.equal(await evaluate("document.getElementById('resumoImportacao').textContent.includes('1 repetidos')"), true);
        for (const width of [1366, 768, 390, 320]) {
            await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
            await evaluate("document.getElementById('btnAbrirImportacao').click()");
            assert.equal(await evaluate("document.getElementById('modalImportacao').scrollWidth <= document.getElementById('modalImportacao').clientWidth"), true, `Modal excedeu a largura em ${width}px`);
            assert.equal(await evaluate("document.getElementById('modalImportacao').getBoundingClientRect().height <= window.innerHeight"), true);
            await evaluate("document.getElementById('btnFecharImportacao').click()");
            assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `Layout excedeu a tela em ${width}px`);
            if (width === 1366 || width === 390) {
                const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                fs.writeFileSync(path.join(profile, `painel-${width}.png`), Buffer.from(screenshot.data, 'base64'));
                await evaluate("document.getElementById('importacaoPostos').scrollIntoView({behavior:'instant', block:'start'})");
                const cadastroScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                fs.writeFileSync(path.join(profile, `cadastro-${width}.png`), Buffer.from(cadastroScreenshot.data, 'base64'));
                await evaluate("document.getElementById('btnAbrirImportacao').click(); document.getElementById('btnCancelarImportacao').click()");
                const importacaoScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                fs.writeFileSync(path.join(profile, `importacao-${width}.png`), Buffer.from(importacaoScreenshot.data, 'base64'));
                await evaluate("document.getElementById('btnFecharImportacao').click(); window.scrollTo({top:0, behavior:'instant'})");
            }
        }
        // Mesmo quando a inicialização para por falha da API, o modelo deve baixar.
        const falhaCadastro = await call('Page.addScriptToEvaluateOnNewDocument', {
            source: "window.fetch = async () => { throw new Error('Cadastro indisponível no teste'); };"
        });
        await call('Page.reload');
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('quantidadePostos')?.hidden === true")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('quantidadePostos').hidden"), true);
        assert.equal(await evaluate("document.getElementById('quantidadePostos').textContent"), '');
        await conferirSelecaoEstado('falha ao carregar cadastro');
        await conferirDigitacaoCadastro('falha ao carregar cadastro');
        assert.equal(await evaluate("document.getElementById('btnSalvarPosto').disabled"), true);
        await conferirDownloadModelo('api-indisponivel');
        await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: falhaCadastro.identifier });
        await call('Page.navigate', { url: pathToFileURL(path.join(root, html)).href });
        for (let i = 0; i < 100; i++) {
            if (await evaluate("document.getElementById('outAutonomiaSegura')?.textContent === '952.0 km'")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.equal(await evaluate("document.getElementById('outAutonomiaSegura').textContent"), '952.0 km');
        assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), 'rgb(8, 10, 16)');
        assert.equal(await evaluate("document.querySelectorAll('[onclick],[oninput],[onchange]').length"), 0);
        assert.equal(await evaluate("document.getElementById('arquivoPostos').disabled"), true);
        assert.equal(await evaluate("document.getElementById('camposCadastroPosto').disabled"), false);
        assert.equal(await evaluate("document.getElementById('btnSalvarPosto').disabled"), true);
        await conferirSelecaoEstado('abertura por arquivo');
        await conferirDigitacaoCadastro('abertura por arquivo');
        await conferirDownloadModelo('arquivo-local');
        assert.deepEqual(errors, []);
        console.log('OK: CSV com prévia, cancelamento, erros por linha, gravação real, duplicados e escape de HTML.');
        console.log('OK: formulário individual com cancelamento, erros, gravação, duplicados e preservação após falha de rede.');
        console.log('OK: seleção de UF pelo teclado com servidor, API indisponível e abertura por arquivo.');
        console.log('OK: clique e digitação em todos os campos de cadastro com servidor, API indisponível e abertura por arquivo.');
        console.log('OK: download real do modelo CSV por HTTP, com API indisponível e por arquivo local.');
        console.log('OK: pop-up CSV, fechamento por botão e Escape, restauração de foco e layout responsivo.');
        console.log('OK: CSS, cálculos, consumo editável, persistência, busca simulada, atualização dos avisos, falha de rede, rota inválida e layout em 4 larguras.');
        console.log(`Capturas: ${profile}`);
        console.log('OK: abertura direta do HTML e eventos separados da marcação.');
        console.log('OK: um único campo de tanque, migração dos valores antigos, capacidades de 100 e 600 L, e rejeição de capacidade inválida.');
    } finally {
        if (socket?.readyState === WebSocket.OPEN) socket.close();
        chrome.kill();
        server.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
