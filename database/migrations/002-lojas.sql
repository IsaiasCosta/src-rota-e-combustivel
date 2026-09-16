CREATE TABLE lojas (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    endereco TEXT NOT NULL CHECK (length(trim(endereco)) > 0),
    cidade TEXT NOT NULL CHECK (length(trim(cidade)) > 0),
    estado TEXT NOT NULL CHECK (length(estado) = 2 AND estado GLOB '[A-Z][A-Z]'),
    latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    link_maps TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE INDEX lojas_estado_cidade ON lojas (estado, cidade);