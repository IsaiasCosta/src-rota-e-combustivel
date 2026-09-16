# Arquitetura do sistema

## Escolha para esta etapa

Frontend em HTML, CSS e JavaScript, organizado por responsabilidade, com servidor Node.js e banco SQLite local. O HTML existente continua sendo a entrada principal e os scripts são carregados com `defer`, na ordem declarada na página.

Cada arquivo JavaScript encapsula suas variáveis em uma função e publica apenas sua interface no objeto `window.RotaCombustivel`. Essa estrutura mantém a abertura direta por arquivo, sem compilação ou instalação de dependências. Não são usados módulos ES nesta etapa, pois exigiriam servir a página por HTTP para o fluxo de desenvolvimento adotado.

## Responsabilidades

| Parte | Responsabilidade | Exemplos |
| --- | --- | --- |
| HTML | Estrutura e campos da tela | Seções, botões, regiões de resultados |
| `assets/css` | Apresentação e responsividade | Cores, espaçamento, adaptação ao celular |
| `src/app.js` | Inicialização e ligação dos eventos | Eventos de clique, seleção e digitação |
| `src/controllers` | Coordenação dos fluxos e estados da operação | Recalcular o painel, buscar postos, tratar erros |
| `src/domain` | Regras que recebem e retornam dados | Autonomia, margem, distância |
| `src/services` | Acesso a recursos externos | Rede e armazenamento do navegador |
| `src/ui` | Leitura e apresentação na página | Medidor, campos e cartões dos postos |
| `src/data` | Importação inicial e referência para abertura por arquivo | Cadastro de postos |
| `scripts/database.cjs` | Migração, importação em transação e consultas | Banco SQLite local |
| `database/migrations` | Estrutura versionada do banco | Tabela de postos e índice por cidade/estado |
| `src/utils` | Funções auxiliares reutilizáveis | Formatação e escape de texto |

As regras de `domain` não acessam DOM, rede ou armazenamento. Isso permite testar os cálculos isoladamente. Os componentes de interface não fazem consultas de rede. Os controladores conectam essas partes; o controlador do painel também atualiza os indicadores simples da página.

## Fluxos principais

1. `app.js` restaura os parâmetros pelo controlador do painel, cria o medidor e conecta os eventos dos campos. Carrega os postos por `services/postos.js` e só então habilita as buscas. Falhas exibem uma mensagem e mantêm a busca desabilitada até recarregar a página.
2. Ao editar um parâmetro, o controlador lê os campos, chama o cálculo de domínio, atualiza o painel e salva os valores válidos.
3. Ao buscar postos, o controlador do localizador obtém e valida a origem por endereço ou GPS. Seleciona os candidatos pela distância geográfica, excluindo coordenadas inválidas ou fora do intervalo aproximado brasileiro do cadastro.
4. O serviço de mapas consulta as rotas. Em caso de indisponibilidade, o controlador usa a estimativa de distância e mantém essa indicação no resultado. A resposta `NoRoute` é tratada separadamente: o resultado recebe `tipoDistancia: 'SEM_ROTA'`, distância e tempo nulos, e aparece depois dos resultados com distância disponível. A interface não calcula autonomia para esse caso.
5. A interface dos postos recebe a lista e os parâmetros atuais para apresentar a análise de autonomia.
6. Se o combustível mudar após uma busca, os resultados existentes são recalculados sem consultar as rotas novamente.

## Dados e estado

- **Configuração:** `config.js` reúne os consumos iniciais por carga, os campos persistidos e a chave `src-rota-e-combustivel.parametros.v1`; a chave `src-rota-e-combustivel.parametros.v1` é lida como compatibilidade durante a migração.
- **Persistência:** `services/armazenamento.js` lê e grava os parâmetros. Ao ler cadastros antigos, soma `inpCapacidade1` e `inpCapacidade2` no novo campo `inpCapacidade`. Um valor já salvo no campo novo tem prioridade e não é somado novamente. A interface esvazia campos salvos inválidos; falhas de leitura ou migração esvaziam todos os parâmetros. O controlador informa a necessidade de preenchimento e preserva o conteúdo salvo até todos os campos ficarem válidos. Na ausência de cadastro salvo, os padrões iniciais continuam disponíveis.
- **Estado da busca:** origem, resultados e indicação de operação em andamento ficam privados em `controllers/localizador.js`.
- **Cadastro:** no servidor, `DATABASE_URL` seleciona o PostgreSQL do Supabase e `database/supabase.sql` cria suas tabelas. Sem `DATABASE_URL`, o arquivo definido por `DATABASE_PATH` é a fonte dos postos; sem essa variável, o padrão local é `database/rota-combustivel.sqlite`. O cadastro é exposto por `GET /api/postos` com os nomes de campos usados pela interface e um `id` estável. `services/postos.js` carrega essa lista em `app.postos`; os controladores consultam o estado atualizado. A abertura `file:` usa `data/postos.js` e não permite importar.
- **Importação:** `controllers/importacao.js` coordena seleção, prévia e confirmação. `services/postos.js` envia o CSV UTF-8 a `POST /api/postos/importar?previa=1` para validar sem gravar, e a `POST /api/postos/importar` para confirmar. `scripts/importacao-http.cjs` limita o corpo a 1 MB, exige `Content-Type: text/csv` e `X-Rota-Importacao: csv`, aceita apenas o host local e rejeita origens diferentes; não habilita CORS. `scripts/importacao-csv.cjs` lê vírgula/ponto e vírgula, aspas e quebras de linha, valida até 1.000 registros e identifica repetidos. Erros retornam HTTP 422 com linha e mensagem. A confirmação revalida o cadastro dentro de `BEGIN IMMEDIATE`, ignora repetidos e grava o lote em transação; falhas desfazem todas as inserções. A resposta inclui o cadastro atualizado, usado nas próximas buscas sem recarregar a página. Nenhum valor do CSV é inserido como HTML na prévia.
- **Migração:** `scripts/database.cjs` usa `PRAGMA user_version` e uma transação para criar a estrutura e importar o cadastro inicial uma única vez. Reiniciar não sobrescreve edições ou exclusões. CNPJ ausente é armazenado como `NULL`; CNPJs presentes têm 14 dígitos e são únicos. A conexão é fechada quando o servidor encerra. Testes usam bancos em memória ou arquivos temporários isolados.

## Como acrescentar funcionalidades

O cadastro individual usa `controllers/cadastro.js`, conectado por `app.js` antes de carregar os postos. Os campos são editáveis desde a abertura da página; somente o botão de salvar aguarda o cadastro carregar por HTTP. A abertura `file:` e falhas de carregamento mantêm o preenchimento disponível, com uma mensagem explicando como habilitar a gravação. O formulário envia JSON a `POST /api/postos`, com `X-Rota-Cadastro: formulario`. `scripts/cadastro-http.cjs` limita o corpo a 16 KB e exige origem local, assim como a importação. A API retorna 201 com o cadastro atualizado, 422 com erros por campo ou 409 para posto já existente. `scripts/validacao-postos.cjs` concentra as validações e a identidade usadas pelo formulário e CSV; `database.cjs` compartilha a transação de validação e gravação entre as duas entradas. Durante o salvamento, os campos ficam temporariamente bloqueados. O formulário preserva campos em erros e os limpa após sucesso ou cancelamento. O modelo CSV é um arquivo estático em `assets/modelos/`, com download independente da inicialização da aplicação.

- Para mudar o visual, edite `assets/css/style.css` e, quando necessário, a estrutura do HTML.
- Para alterar uma fórmula, edite `src/domain` e verifique os limites em `tests/domain.test.cjs`.
- Para substituir o serviço de mapas, preserve os contratos de `services/mapas.js`: origem com coordenadas e nome; rota com distância em quilômetros e tempo em minutos; erro com `code: 'NoRoute'` quando o provedor informar ausência de trajeto. As coordenadas numéricas devem respeitar os limites definidos em `domain/distancia.js`.
- Para criar um histórico de abastecimentos, acrescente regras em `domain`, persistência em `services`, interface em `ui` e um controlador para o fluxo. Conecte os eventos em `app.js`.
- Ao criar um script, declare-o no HTML antes dos arquivos que dependem dele. O servidor local reconhece os recursos declarados em `src/` e `assets/`.
- Os eventos da aplicação devem ser registrados em JavaScript, sem atributos `onclick`, `oninput` ou `onchange` no HTML.

Login, múltiplos veículos, edição pela interface e sincronização entre dispositivos são evoluções futuras, ainda não implementadas. O cadastro individual e em lote por CSV estão disponíveis; os parâmetros do veículo continuam no armazenamento do navegador.

## Execução e publicação

O servidor de desenvolvimento aceita conexões apenas da máquina local, entrega a página e seus recursos declarados e atende `/api/postos`, `/api/postos/importar` e `/api/geocodificar`. Backups, documentação, ferramentas e arquivos do banco não são servidos.

Para usar o banco por HTTP, execute o servidor Node.js; hospedagem apenas estática não fornece `/api/postos`. Em hospedagens com filesystem efêmero, como o Render, configure `DATABASE_URL` para o PostgreSQL do Supabase; `DATABASE_PATH` só é necessário quando houver um Persistent Disk para SQLite. O servidor local aceita `/index.html` como endereço alternativo, sem duplicar o HTML no projeto. A abertura direta do HTML por arquivo usa o cadastro de referência sem acessar o banco.

`backup/original.html.txt` preserva o material inicial. `backup/antes-arquitetura/` contém os antigos arquivos JavaScript e não participa da aplicação.
