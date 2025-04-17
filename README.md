# API-vootrack

🚀 Objetivo Geral
Importar dados de voos de uma API externa (aviationstack) e salvar esses dados em um banco de dados PostgreSQL, estruturado em várias tabelas (flights, airlines, airports, departures, arrivals, codeshares), e disponibilizar um endpoint para consultar esses voos.

🧱 Componentes principais
Dependências:

express: para criar a API HTTP.

axios: para fazer requisições à API externa.

pg: para conectar ao PostgreSQL.

Configuração do banco:

js
Copiar
Editar
const pool = new Pool({ ... });
Usa variáveis de ambiente (process.env.DB_USER, etc.) para proteger credenciais.

URL da API externa:

js
Copiar
Editar
const API_URL = "https://api.aviationstack.com/v1/flights?access_key=...";
Função getFlightData(): Busca os dados de voos da API externa e retorna o array de voos.

🛬 Inserção de Dados no Banco
insertAirport(): Verifica se o aeroporto já existe (pelo código IATA) e insere apenas se for novo.

insertAirline(): Mesma lógica do aeroporto, mas com companhias aéreas.

insertData(): Para cada voo:

Insere companhia aérea

Insere aeroporto de partida e chegada

Insere o voo em flights

Insere os detalhes de partida em departures

Insere os detalhes de chegada em arrivals

Se houver voo compartilhado (codeshare), insere em codeshares

Usa BEGIN / COMMIT para garantir transação segura.

🌐 Endpoints
POST /import-flights

Dispara a importação dos dados da API externa e salva no banco.

GET /flights

Retorna os 100 voos mais recentes com nome e código da companhia.
