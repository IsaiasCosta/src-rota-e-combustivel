CREATE TABLE lojas_nova (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
    marca TEXT,
    endereco TEXT NOT NULL CHECK (length(trim(endereco)) > 0),
    cidade TEXT NOT NULL CHECK (length(trim(cidade)) > 0),
    estado TEXT NOT NULL CHECK (length(estado) = 2 AND estado GLOB '[A-Z][A-Z]'),
    latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    link_maps TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

INSERT INTO lojas_nova (id, nome, marca, endereco, cidade, estado, latitude, longitude, link_maps, criado_em)
SELECT id, nome, marca, endereco, cidade, estado, latitude, longitude, link_maps, criado_em FROM lojas;

DROP TABLE lojas;
ALTER TABLE lojas_nova RENAME TO lojas;
CREATE INDEX lojas_estado_cidade ON lojas (estado, cidade);