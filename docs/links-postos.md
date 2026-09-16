# Links dos postos

## Conferência do cadastro

O histórico por posto está em [conferencia-postos.json](conferencia-postos.json), com CNPJ, fontes, dados anteriores e alterações. Primeiro lote: 22 unidades Caxuxa, cruzando a identificação da rede com a API pública da ANP. Para Veredas e Monte Líbano, sem posição na ANP, foi utilizado o mapa de credenciados LogPay com o mesmo CNPJ. As posições publicadas não equivalem à conferência física da entrada rodoviária.

Os links de rota anteriores usavam apenas `lat,lon` no destino. Isso abria o ponto cadastrado, mesmo quando ele não correspondia à entrada do estabelecimento.

`src/services/mapas.js` usa a mesma identificação de destino para os botões de mapa e rota:

1. Com endereço, cidade e estado preenchidos, envia o endereço completo e o país. Acrescenta `nomeMapa` quando há um nome confirmado, sem incluir códigos ou nomes internos que possam desviar a busca do número informado.
2. Sem endereço completo, usa coordenadas válidas.
3. Sem endereço completo nem coordenadas válidas, usa nome e dados de endereço disponíveis.

A origem permanece nas coordenadas usadas na busca. Quando houver um `placeId` confirmado, ele é enviado junto ao destino nas duas ações. A interpretação do endereço é feita pelo Google Maps; o link por texto não garante a entrada exata do estabelecimento.

## Campos do cadastro

- `Nome`: nome apresentado no painel; usado na identificação do mapa apenas quando faltam endereço completo e coordenadas válidas.
- `nomeMapa` (opcional): nome do estabelecimento confirmado em uma fonte, quando difere do nome interno. Tem prioridade na busca do Google Maps.
- `Endereço`, `Cidade` e `Estado`: juntos, têm prioridade sobre as coordenadas na identificação do destino.
- `placeId` (opcional): identificador confirmado do estabelecimento no Google Maps. Quando fornecido, é enviado nos parâmetros `destination_place_id` e `query_place_id`. Não preencher com coordenadas, links ou identificadores inventados.
- `lat` e `lon`: são usados para selecionar candidatos e calcular distâncias no painel; nos links, são usados somente se faltar endereço completo. É importante conferir essas coordenadas no mapa para manter os cálculos compatíveis com o endereço.

Para o registro `Caxuxa I`, o campo `nomeMapa` foi definido como `Posto Caxuxa Luz`, conforme o [site oficial da rede](https://www.redecaxuxa.com.br/posto.php?id=1), que publica a unidade em Luz/MG, BR-262, km 523.

## Correção do Padre Eustáquio — 12/09/2026

O registro interno `POSTO 621 PADRE EUSTAQUIO` informa Rua Pará de Minas, 788, Belo Horizonte/MG. As coordenadas anteriores (`-19.9150, -43.9850`) levavam, conforme o relato do usuário, ao Super Troca Box, no número 401.

O [registro público do Waze](https://www.waze.com/live-map/directions/br/mg/posto-bretas-duarte?to=place.ChIJvbcEgueWpgARoflajMe--SU), consultado em 12/09/2026, associa o número 788 ao **Posto Bretas Duarte**. Os dados estruturados da página fornecem latitude `-19.914019` e longitude `-43.98897729999999`. O cadastro foi corrigido para `-19.914019, -43.9889773` e recebeu esse `nomeMapa`, mantendo o nome interno e o endereço. Isso corrige também o ponto usado para os cálculos do painel. Não foi atribuído Place ID sem confirmação no Google Maps.

A construção das URLs segue a [documentação oficial do Google Maps](https://developers.google.com/maps/documentation/urls/get-started). Um Place ID confirmado identifica o estabelecimento com mais precisão; a validação dos demais endereços e coordenadas permanece necessária.

## Correção do Cinquentenário — 12/09/2026

O registro `POSTO 623 CINQUENTENARIO` foi conferido no Google Maps como **Posto Shell**, na Rua Úrsula Paulino, 763, Belo Horizonte/MG. O cadastro passou a usar as coordenadas `-19.9550962, -43.9840226` e `nomeMapa: "Posto Shell"`. Como os dois links usam o mesmo destino textual e as rotas do painel usam as coordenadas cadastradas, a correção vale para o botão de mapa, o botão de rota e o cálculo rodoviário.

Os testes verificam os parâmetros dos links de todos os registros, caracteres especiais, identificação por Place ID e os links renderizados na interface. Eles não comprovam que todos os estabelecimentos do cadastro foram encontrados corretamente pelo Google Maps. A conferência física das coordenadas e dos acessos rodoviários permanece pendente.
