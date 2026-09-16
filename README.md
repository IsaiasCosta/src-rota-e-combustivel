# SRC Rota e Combustível — painel do veículo

Localizador de postos cadastrados e planejamento de autonomia. Interface em português, com parâmetros do veículo salvos no navegador.

O painel possui um único campo **Capacidade do tanque (L)**. Informe a capacidade total, como 100 ou 600 litros, e selecione o nível de combustível: 600 L a 50% representam 300 L disponíveis. Os cadastros antigos com dois campos são convertidos automaticamente pela soma das capacidades, preservando o nível e o consumo salvos.

## Abrir o sistema

Para usar o banco de dados, inicie o servidor local. A abertura direta de `src_rota_e_combustivel.html` continua disponível, mas usa apenas o cadastro de referência em JavaScript.

Use Node.js 22.13 ou superior:

```powershell
npm start
```

Acesse `http://localhost:3000`. Encerre o servidor com `Ctrl+C`. Não é necessário executar `npm install`: as ferramentas usam apenas recursos nativos do Node.js.

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd start` e `npm.cmd test`.

## Banco de dados

O servidor cria automaticamente `database/rota-combustivel.sqlite` e importa os 49 postos de `src/data/postos.js` na primeira execução. Para criar ou verificar o banco sem iniciar o servidor, execute `npm.cmd run db:init`. Em produção, use PostgreSQL e defina `DATABASE_URL`; o SQLite local é destinado ao desenvolvimento ou a servidores com disco persistente.

O painel consulta `GET /api/postos`. A tabela `postos` armazena identificador, nome, nome no mapa, endereço, cidade, estado, latitude, longitude, CNPJ opcional e data de criação. A migração em `database/migrations/001-postos.sql` define as validações e o índice por estado e cidade. Os nomes e endereços são preservados, inclusive os registros com coordenadas coincidentes.

A importação ocorre uma única vez, em transação: reiniciar o servidor não duplica os registros nem sobrescreve alterações do banco. Após a criação, editar `src/data/postos.js` afeta apenas a referência para abertura direta e a importação em bancos novos. Alterações no banco aparecem no painel ao recarregar a página.

O painel permite cadastrar um posto pelo formulário ou vários postos por CSV. A edição de postos existentes ainda não possui tela. Os parâmetros do veículo permanecem no navegador. Para fazer backup do banco, encerre o servidor e copie `database/rota-combustivel.sqlite`. O arquivo não é servido por HTTP nem incluído no Git; a estrutura e o código de importação são versionados.

### Publicação no Cloudflare Pages + Supabase

O Cloudflare Pages hospeda o HTML, CSS e JavaScript como um site estático. O cadastro de postos e lojas é salvo diretamente no Supabase pela API REST; não é necessário executar `npm start` em produção.

1. Crie um projeto em [Supabase](https://supabase.com/dashboard).
2. No **SQL Editor**, execute todo o conteúdo de `database/supabase.sql`.
3. Em **Project Settings → API**, copie a **Project URL** e a chave pública **anon**.
4. Cole esses valores em `src/config.js`:
	```js
	supabaseUrl: 'https://SEU-PROJETO.supabase.co',
	supabaseAnonKey: 'SUA_CHAVE_ANON',
	```
5. Crie um projeto em [Cloudflare Workers & Pages](https://dash.cloudflare.com/) conectado ao GitHub e escolha **Workers Builds**.
6. Configure o comando de build como `npm run build:cloudflare`.
7. Configure o comando de deploy como `npx wrangler deploy`.
8. Não use `npx wrangler deploy` sem executar o build: o `wrangler.jsonc` aponta para a pasta `public` criada pelo build.
9. Abra o domínio gerado pelo Cloudflare e importe o CSV pelo painel.

A chave `anon` pode aparecer no frontend; ela não é uma senha. As políticas do arquivo `database/supabase.sql` permitem leitura e inserção públicas, mas não permitem atualização ou exclusão. Nunca coloque a chave `service_role` no código ou no Cloudflare Pages.

No Cloudflare Pages, o arquivo de entrada é `src_rota_e_combustivel.html`. Se quiser usar o endereço `/`, renomeie uma cópia para `index.html` ou configure uma regra de redirecionamento. A abertura direta por arquivo continua sem persistência.

## Planejamento de entregas

Em **Planejamento de entregas**, o operador informa qualquer ponto de partida por endereço ou GPS, seleciona uma ou mais lojas e define a ordem das paradas. O sistema consulta o OSRM para cada trecho da sequência origem → loja 1 → loja 2, calcula os litros consumidos e mostra o saldo após cada entrega. O alerta indica quando o combustível atual não é suficiente para concluir a rota ou quando o trajeto ultrapassa a margem de segurança.

As lojas ficam na tabela `lojas` do Supabase e podem ser cadastradas individualmente ou importadas por CSV UTF-8 com o cabeçalho `marca;nome;endereco;cidade;estado;latitude;longitude;link_maps`. Marca e link do Maps são preservados; se o link não for informado, o sistema gera uma busca pelo endereço. O link da rota completa abre no Google Maps com as lojas como pontos intermediários.

O cálculo de distância usa o **Google Maps Directions API** quando a variável local `GOOGLE_MAPS_API_KEY` está configurada. Sem essa chave, o sistema usa o OSRM e identifica o resultado como estimativa, pois os dois roteadores podem escolher caminhos diferentes. No PowerShell, configure a chave apenas no terminal local antes de iniciar o servidor: `$env:GOOGLE_MAPS_API_KEY = 'sua-chave'` e depois `npm.cmd start`. Nunca coloque a chave no HTML ou no Git.

## Cadastrar um posto pelo formulário

Com o servidor iniciado, acesse **Cadastrar postos → Preencher formulário**. Informe nome, endereço, cidade, UF, latitude e longitude. O nome no mapa é opcional. Clique em **Salvar posto**: o registro é salvo no SQLite, o contador é atualizado e o formulário fica livre para outro cadastro. Faça uma nova busca para incluir o novo posto nos resultados.

O formulário usa as mesmas regras de validação e duplicidade do CSV. Postos repetidos não são gravados novamente nem atualizados. Em caso de erro, os campos permanecem preenchidos para correção; **Cancelar** limpa e fecha o formulário. Os campos, incluindo o seletor de UF, podem ser preenchidos mesmo na abertura direta do HTML ou enquanto o cadastro carrega. Apenas **Salvar posto** depende do servidor local e do carregamento do cadastro. As duas opções permanecem disponíveis na mesma área.

Se o salvamento ficar sem resposta por 12 segundos, o formulário libera os campos e mantém os valores digitados. Recarregue o painel para conferir se o posto foi gravado antes de tentar novamente; interromper a espera no navegador não desfaz uma gravação já realizada pelo servidor.

## Importar postos por CSV

1. Execute `npm.cmd start` e abra `http://localhost:3000` (reinicie o servidor se ele já estava aberto antes desta atualização).
2. Acesse **Cadastrar postos → Importar por CSV** e clique em **Baixar modelo CSV**.
3. Substitua a linha de exemplo pelos dados reais. Salve como **CSV UTF-8**, com até 1.000 postos e 1 MB.
4. Selecione o arquivo e confira a prévia. Erros indicam a linha do arquivo; corrija e selecione novamente.
5. Clique em **Salvar postos**. O contador é atualizado imediatamente; faça uma nova busca para considerar os novos postos.

O [modelo CSV](assets/modelos/modelo-postos.csv) também está disponível diretamente na pasta `assets/modelos/`. O download independe do carregamento do cadastro e funciona na abertura direta do HTML.

Cabeçalho do modelo:

```csv
nome;endereco;cidade;estado;latitude;longitude;nome_mapa
```

Nome, endereço, cidade, UF, latitude e longitude são obrigatórios. O nome no mapa é opcional e sua coluna pode ser omitida. Também são aceitos os cabeçalhos `Endereço`, `lat`, `lon` e `nomeMapa`. Não inclua colunas extras.

O separador pode ser vírgula ou ponto e vírgula. Valores que contêm o separador ou quebras de linha devem ficar entre aspas duplas; uma aspa dentro do valor é representada por `""`. Coordenadas aceitam ponto decimal ou vírgula decimal (com aspas quando a vírgula também for o separador). Use UF de duas letras e coordenadas dentro do intervalo brasileiro usado nas buscas. Essa validação não confirma o endereço real.

A prévia mostra os primeiros 50 registros válidos e os erros de todas as linhas. Um erro bloqueia todo o lote. Repetidos no arquivo ou no banco são ignorados pela combinação de nome, endereço, cidade e UF (ignorando acentos, caixa e espaços extras), sem atualizar dados existentes. A confirmação revalida o arquivo e grava todos os novos registros em uma transação. Reenviar o mesmo arquivo não duplica postos. A abertura direta do HTML por arquivo não permite importação.

O CNPJ foi removido do formulário, da prévia e do modelo CSV. Dados antigos no banco são preservados; arquivos do modelo anterior com a coluna `cnpj` continuam aceitos e sujeitos às validações e à regra de duplicidade legadas.

A implementação usa [`node:sqlite`](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html). A versão instalada do Node pode emitir um aviso de recurso experimental ao iniciar.

Os parâmetros ficam no armazenamento do navegador. A abertura por arquivo e por `localhost` usa armazenamentos separados; mantenha a mesma forma de acesso para recuperar seus valores.

Se um parâmetro salvo for inválido, seu campo fica vazio e o painel informa a necessidade de correção. Se o conteúdo salvo não puder ser lido, todos os campos precisam ser preenchidos novamente. O conteúdo anterior é preservado até que os parâmetros estejam válidos; valores inválidos não são substituídos automaticamente pelos padrões do veículo.

## Organização

```text
SRC Rota e Combustível/
├── src_rota_e_combustivel.html
├── assets/
│   ├── css/style.css             # Tema e layout responsivo
│   └── images/                   # Logotipo RC e versão transparente aplicada
├── src/
│   ├── config.js                 # Consumos iniciais e chave de armazenamento
│   ├── app.js                    # Inicialização e eventos da página
│   ├── controllers/
│   │   ├── cadastro.js           # Formulário individual e gravação
│   │   ├── importacao.js         # Seleção de CSV, prévia e confirmação
│   │   ├── painel.js             # Coordena cálculos e persistência
│   │   └── localizador.js        # Coordena buscas e mantém seus resultados
│   ├── data/postos.js            # Importação inicial e referência para abertura por arquivo
│   ├── domain/
│   │   ├── combustivel.js        # Cálculo e análise de autonomia
│   │   └── distancia.js          # Distância geográfica e estimativa
│   ├── services/
│   │   ├── armazenamento.js      # Acesso ao localStorage
│   │   ├── postos.js             # Consulta o cadastro pela API
│   │   └── mapas.js              # Consultas de endereço e rotas
│   ├── ui/
│   │   ├── medidor.js            # Medidor visual de combustível
│   │   ├── postos.js             # Apresentação dos resultados
│   │   └── veiculo.js            # Leitura e preenchimento dos campos
│   └── utils/formatacao.js       # Textos, escape de HTML e duração
├── scripts/
│   ├── cadastro-http.cjs         # Recebimento do cadastro individual pela API
│   ├── validacao-postos.cjs      # Validações compartilhadas pelo formulário e CSV
│   ├── importacao-csv.cjs        # Leitura de CSV, validação e duplicados
│   ├── importacao-http.cjs       # Recebimento do CSV pela API local
│   ├── database.cjs              # Migração, importação e consulta SQLite
│   ├── init-db.cjs               # Inicialização do banco pela linha de comando
│   ├── serve.cjs                 # Comando de desenvolvimento
│   └── server.cjs                # Servidor local compartilhado pelos testes
├── tests/
│   ├── cadastro.test.cjs         # Formulário, duplicidade entre opções e API
│   ├── importacao.test.cjs       # Formato CSV, transações e API de importação
│   ├── database.test.cjs         # Importação, persistência, validações e API
│   ├── postos.test.cjs           # Carregamento do cadastro no navegador
│   ├── domain.test.cjs           # Regras e limites de autonomia
│   ├── armazenamento.test.cjs    # Migração e preservação dos parâmetros salvos
│   ├── mapas.test.cjs            # Identificação dos postos nos links de mapas
│   ├── server.test.cjs           # Entrega dos recursos da página
│   └── browser.cjs               # Fluxos e layout no Chrome
├── docs/arquitetura.md
├── database/                    # Migrações SQL e banco local (ignorado pelo Git)
├── backup/                       # Referências anteriores; não executadas
├── .editorconfig
├── .gitignore
└── package.json
```

## Verificação

```powershell
npm test
npm run test:browser
```

O primeiro comando testa as regras e o servidor. O segundo abre o Chrome em modo invisível e verifica cálculos, eventos, persistência, buscas simuladas, erros de rede, layout e abertura direta do HTML. Ele requer Chrome instalado; se necessário, configure `CHROME_PATH` com o caminho do executável. As capturas e o perfil temporário são gravados na pasta temporária do sistema, no caminho informado ao concluir.

## Estado atual

- O servidor local consulta um banco SQLite de postos. Login e sincronização entre dispositivos ainda não foram implementados.
- O cadastro importado ainda precisa de conferência dos endereços e coordenadas.
- Os links do Google Maps priorizam endereço, cidade e estado, com o nome do mapa quando confirmado. Assim, coordenadas aproximadas não substituem o número do endereço no destino. Sem endereço completo, usam coordenadas válidas ou a identificação disponível. O botão “Ver posto no mapa” permite conferir o estabelecimento antes de abrir a rota. As distâncias do painel ainda usam as coordenadas cadastradas e podem diferir das apresentadas pelo Google Maps.
- As consultas de endereço e rota dependem de internet. O GPS depende da permissão do navegador.
- Quando a consulta de rota falha por indisponibilidade do serviço, a interface identifica a distância como estimativa. Se o roteador responder que não encontrou trajeto (`NoRoute`), o posto aparece como sem rota, sem distância ou avaliação de autonomia, depois dos candidatos com distância disponível.
- A origem precisa ter coordenadas numéricas dentro dos limites geográficos. Postos fora do intervalo aproximado brasileiro já usado na validação do cadastro são excluídos da busca; essa verificação não confirma a posição real do estabelecimento.
- Os testes de navegador simulam os serviços externos; não verificam sua disponibilidade real.

Consulte [a arquitetura e as orientações de evolução](docs/arquitetura.md) antes de acrescentar funcionalidades.

cd /d "D:\SRC Rota e Combustível"
npx wrangler deploy
