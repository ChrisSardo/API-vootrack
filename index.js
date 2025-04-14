const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// Configuração do banco
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

// URL da API externa
const API_URL = "https://api.aviationstack.com/v1/flights?access_key=645eeac68fdb645c7326be70d405c906";

// Função para buscar dados
const getFlightData = async () => {
  try {
    const response = await axios.get(API_URL);
    return response.data.data;
  } catch (error) {
    console.error("Erro ao buscar API:", error.message);
    return [];
  }
};

// Insere aeroporto e retorna ID
const insertAirport = async (client, airportData) => {
  if (!airportData) return null;

  const airportName = airportData.airport || "Unknown";
  const iata = airportData.iata || "XXX";
  const icao = airportData.icao || "XXXX";
  const timezone = airportData.timezone || "UTC";

  try {
    const result = await client.query(
      `INSERT INTO airports (name, iata, icao, timezone) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (iata) DO NOTHING 
       RETURNING id;`,
      [airportName, iata, icao, timezone]
    );

    if (result.rows.length > 0) return result.rows[0].id;

    const existing = await client.query(
      `SELECT id FROM airports WHERE iata = $1;`,
      [iata]
    );

    return existing.rows[0]?.id || null;
  } catch (error) {
    console.error("Erro ao inserir aeroporto:", error.message);
    return null;
  }
};

// Insere companhia aérea
const insertAirline = async (client, airline) => {
  if (!airline) return null;

  const name = airline.name || "Unknown Airline";
  const iata = airline.iata || "XX";
  const icao = airline.icao || "XXX";

  try {
    const result = await client.query(
      `INSERT INTO airlines (name, iata, icao) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (iata) DO NOTHING 
       RETURNING id;`,
      [name, iata, icao]
    );

    if (result.rows.length > 0) return result.rows[0].id;

    const existing = await client.query(
      `SELECT id FROM airlines WHERE iata = $1;`,
      [iata]
    );

    return existing.rows[0]?.id || null;
  } catch (error) {
    console.error("Erro ao inserir companhia aérea:", error.message);
    return null;
  }
};

// Insere tudo no banco
const insertData = async (flights) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const flight of flights) {
      const airlineId = await insertAirline(client, flight.airline);
      const departureAirportId = await insertAirport(client, flight.departure);
      const arrivalAirportId = await insertAirport(client, flight.arrival);

      const flightResult = await client.query(
        `INSERT INTO flights (flight_date, flight_status, airline_id, flight_number, iata_code, icao_code) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id;`,
        [
          flight.flight_date,
          flight.flight_status,
          airlineId,
          flight.flight.number || "0000",
          flight.flight.iata || "XX000",
          flight.flight.icao || "XXX000",
        ]
      );

      const flightId = flightResult.rows[0]?.id;
      if (!flightId) continue;

      await client.query(
        `INSERT INTO departures (flight_id, airport_id, terminal, gate, delay, scheduled, estimated, actual) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          flightId,
          departureAirportId,
          flight.departure.terminal || "Unknown",
          flight.departure.gate || null,
          flight.departure.delay || 0,
          flight.departure.scheduled,
          flight.departure.estimated,
          flight.departure.actual || null,
        ]
      );

      await client.query(
        `INSERT INTO arrivals (flight_id, airport_id, terminal, gate, baggage, delay, scheduled, estimated, actual) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          flightId,
          arrivalAirportId,
          flight.arrival.terminal || "Unknown",
          flight.arrival.gate || null,
          flight.arrival.baggage || null,
          flight.arrival.delay || 0,
          flight.arrival.scheduled,
          flight.arrival.estimated,
          flight.arrival.actual || null,
        ]
      );

      if (flight.flight.codeshared) {
        const codeshareAirlineId = await insertAirline(client, {
          name: flight.flight.codeshared.airline_name,
          iata: flight.flight.codeshared.airline_iata,
          icao: flight.flight.codeshared.airline_icao,
        });

        await client.query(
          `INSERT INTO codeshares (flight_id, airline_id, flight_number, iata_code, icao_code) 
           VALUES ($1, $2, $3, $4, $5);`,
          [
            flightId,
            codeshareAirlineId,
            flight.flight.codeshared.flight_number || "0000",
            flight.flight.codeshared.flight_iata || "XX000",
            flight.flight.codeshared.flight_icao || "XXX000",
          ]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Dados inseridos com sucesso!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao inserir no banco:", error.message);
  } finally {
    client.release();
  }
};

// Endpoint para importação agendada ou manual
app.post('/import-flights', async (req, res) => {
  const flightData = await getFlightData();

  if (flightData.length > 0) {
    await insertData(flightData);
    res.status(200).send("Importação realizada com sucesso.");
  } else {
    res.status(204).send("Nenhum dado encontrado.");
  }
});

app.get('/flights', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT 
          f.id,
          f.flight_date,
          f.flight_status,
          f.flight_number,
          f.iata_code,
          f.icao_code,
          a.name as airline_name,
          a.iata as airline_iata
        FROM flights f
        LEFT JOIN airlines a ON f.airline_id = a.id
        ORDER BY f.flight_date DESC
        LIMIT 100;
      `);
      client.release();
      res.json(result.rows);
    } catch (error) {
      console.error("Erro ao buscar voos:", error.message);
      res.status(500).json({ erro: "Erro ao buscar voos" });
    }
  });
  

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`API online na porta ${port}`);
  });