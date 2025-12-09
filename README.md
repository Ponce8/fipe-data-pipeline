# FIPE Data Pipeline

Coleta dados de preços de veículos da Tabela FIPE oficial e armazena em PostgreSQL para análise histórica.

## Configuração

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:push
```

## Uso

```bash
npm run crawl                                    # Coleta todos os dados de 2025
npm run crawl -- --reference 328                 # Mês específico
npm run crawl -- --reference 328 --brand 59      # Marca específica (59 = VW)
npm run status                                   # Estatísticas do banco
npm run db:shell                                 # Terminal PostgreSQL
```

## Fonte de Dados

API oficial da FIPE em `veiculos.fipe.org.br`. Dados incluem:
- Tabelas de referência (snapshots mensais desde 2001)
- Marcas, modelos, anos
- Preços por tipo de combustível

## Schema

```
reference_tables → brands → models → model_years → prices
```

Cada registro de preço vincula um veículo (modelo + ano + combustível) a um mês de referência.

---

## English

Crawls vehicle pricing data from Brazil's official FIPE table and stores it in PostgreSQL for historical analysis.

### Setup

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:push
```

### Usage

```bash
npm run crawl                                    # Crawl all 2025 data
npm run crawl -- --reference 328                 # Specific month
npm run crawl -- --reference 328 --brand 59      # Specific brand (59 = VW)
npm run status                                   # Show DB stats
npm run db:shell                                 # PostgreSQL shell
```

### Data Source

Official FIPE API at `veiculos.fipe.org.br`. Data includes:
- Reference tables (monthly snapshots since 2001)
- Brands, models, years
- Prices by fuel type
