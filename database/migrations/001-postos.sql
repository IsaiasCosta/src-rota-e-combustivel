CREATE TABLE postos (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    nome_mapa TEXT,
    endereco TEXT NOT NULL CHECK (length(trim(endereco)) > 0),
    cidade TEXT NOT NULL CHECK (length(trim(cidade)) > 0),
    estado TEXT NOT NULL CHECK (length(estado) = 2 AND estado GLOB '[A-Z][A-Z]'),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    cnpj TEXT UNIQUE CHECK (cnpj IS NULL OR (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*')),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX postos_estado_cidade ON postos (estado, cidade);
