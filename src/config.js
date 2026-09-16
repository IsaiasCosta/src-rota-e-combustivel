// Configurações compartilhadas; os valores de consumo são estimativas iniciais.
window.RotaCombustivel = {
    config: Object.freeze({
        consumos: Object.freeze({ VAZIO: 3.0, PARCIAL: 2.5, CARREGADO: 2.0 }),
        supabaseUrl: '',
        supabaseAnonKey: '',
        parametros: Object.freeze(['inpCapacidade', 'inpNivel', 'inpCarga', 'inpConsumo', 'inpMargem']),
        storageKey: 'src-rota-e-combustivel.parametros.v1',
        legacyStorageKey: 'src-rota-e-combustivel.parametros.v1'
    }),
    domain: {}, services: {}, ui: {}, controllers: {}
};
window['src-rota-e-combustivel'] = window.RotaCombustivel;
