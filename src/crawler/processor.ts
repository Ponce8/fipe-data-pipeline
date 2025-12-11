import cliProgress from 'cli-progress';
import { fipeClient } from '../fipe/client.js';
import * as repo from '../db/repository.js';
import { classifySingleModel } from '../classifier/segment-classifier.js';

interface BrandData {
  id: number;
  fipeCode: string;
  name: string;
}

interface ModelData {
  id: number;
  fipeCode: string;
  name: string;
}

interface ModelYearData {
  id: number;
  year: number;
  fuelCode: number;
  fuelName: string | null;
}

function parseYearValue(value: string): { year: number; fuelCode: number } {
  // Format: "2020-1" (year-fuelCode)
  const [yearStr, fuelCodeStr] = value.split('-');
  return {
    year: parseInt(yearStr, 10),
    fuelCode: parseInt(fuelCodeStr, 10),
  };
}

function parsePrice(valor: string): string {
  // "R$ 4.147,00" -> "4147.00"
  return valor.replace('R$ ', '').replace(/\./g, '').replace(',', '.');
}

function parseReferenceMonth(mes: string): { month: number; year: number } {
  // "dezembro/2025 " -> { month: 12, year: 2025 }
  const months: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    março: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  const [monthName, yearStr] = mes.trim().toLowerCase().split('/');
  return {
    month: months[monthName] || 0,
    year: parseInt(yearStr, 10),
  };
}

interface CrawlOptions {
  referenceCode?: number;
  years?: number[];
  months?: number[];
  brandCode?: string;
  modelCodes?: string[];
  classify?: boolean;
  force?: boolean;
  sync?: boolean;
  onProgress?: (message: string) => void;
}

export async function crawl(options: CrawlOptions = {}): Promise<void> {
  const log = options.onProgress ?? console.log;

  // Determine if we should sync from API or use cached data
  let shouldSync = options.sync ?? false;

  // Auto-enable sync if no cached data exists
  if (!shouldSync) {
    const hasCached = await repo.hasCachedData();
    if (!hasCached) {
      log('No cached data found, syncing from FIPE API...');
      shouldSync = true;
    }
  }

  // Get reference tables (always from API - needed to know which refs to process)
  log('Fetching reference tables...');
  const allRefs = await fipeClient.getReferenceTables();

  // Filter to specific reference, year/month, or default to current year
  const currentYear = new Date().getFullYear();
  const years = options.years ?? [currentYear];

  const refs = options.referenceCode
    ? allRefs.filter((r) => r.Codigo === options.referenceCode)
    : allRefs.filter((r) => {
        const { year, month } = parseReferenceMonth(r.Mes);
        const yearMatch = years.includes(year);
        const monthMatch = !options.months || options.months.includes(month);
        return yearMatch && monthMatch;
      });

  if (refs.length === 0) {
    log('No reference tables found to process');
    return;
  }

  log(`Found ${refs.length} reference tables to process`);
  if (!shouldSync) {
    log('Using cached data (use --sync to refresh from API)');
  }

  let totalPrices = 0;
  const startTime = Date.now();

  for (const ref of refs) {
    const { month, year } = parseReferenceMonth(ref.Mes);
    const refRecord = await repo.upsertReferenceTable(ref.Codigo, month, year);

    log(`\nProcessing reference ${ref.Codigo} (${ref.Mes.trim()})...`);

    // Get brands - from API if syncing, from DB otherwise
    let brands: BrandData[];

    if (shouldSync) {
      const allBrands = await fipeClient.getBrands(ref.Codigo);
      const filteredBrands = options.brandCode
        ? allBrands.filter((b) => b.Value === options.brandCode)
        : allBrands;

      // Upsert brands and convert to BrandData
      brands = [];
      for (const b of filteredBrands) {
        const record = await repo.upsertBrand(b.Value, b.Label);
        brands.push({ id: record.id, fipeCode: record.fipeCode, name: record.name });
      }
    } else {
      const allBrands = await repo.getAllBrands();
      brands = options.brandCode
        ? allBrands.filter((b) => b.fipeCode === options.brandCode)
        : allBrands;
    }

    log(`  Found ${brands.length} brands`);

    for (const brand of brands) {
      const brandStart = Date.now();
      let brandPrices = 0;

      try {
        // Get models - from API if syncing, from DB otherwise
        let models: ModelData[];

        if (shouldSync) {
          const modelsResponse = await fipeClient.getModels(ref.Codigo, brand.fipeCode);
          const filteredModels = options.modelCodes
            ? modelsResponse.Modelos.filter((m) => options.modelCodes!.includes(String(m.Value)))
            : modelsResponse.Modelos;

          // Upsert models and convert to ModelData
          models = [];
          for (const m of filteredModels) {
            const { model: record, isNew } = await repo.upsertModel(
              brand.id,
              String(m.Value),
              m.Label,
            );
            models.push({ id: record.id, fipeCode: record.fipeCode, name: record.name });

            // Classify new models (if enabled)
            if (isNew && options.classify) {
              const segment = await classifySingleModel(brand.name, m.Label);
              if (segment) {
                await repo.updateModelSegment(record.id, segment, 'ai');
                log(`    Classified ${m.Label} as ${segment}`);
              }
            }
          }
        } else {
          const allModels = await repo.getModelsByBrandId(brand.id);
          models = options.modelCodes
            ? allModels.filter((m) => options.modelCodes!.includes(m.fipeCode))
            : allModels;
        }

        log(`  Processing brand: ${brand.name} (${models.length} models)`);

        const bar = new cliProgress.SingleBar({
          format: '    [{bar}] {value}/{total} | {model}',
          barCompleteChar: '█',
          barIncompleteChar: '░',
          hideCursor: true,
        });
        bar.start(models.length, 0, { model: '' });

        for (const model of models) {
          bar.update({ model: model.name.slice(0, 30) });

          try {
            // Get years - from API if syncing, from DB otherwise
            let modelYears: ModelYearData[];

            if (shouldSync) {
              const yearsResponse = await fipeClient.getYears(
                ref.Codigo,
                brand.fipeCode,
                model.fipeCode,
              );

              // Upsert model years and convert to ModelYearData
              modelYears = [];
              for (const y of yearsResponse) {
                const { year: modelYear, fuelCode } = parseYearValue(y.Value);
                const record = await repo.upsertModelYear(model.id, modelYear, fuelCode, y.Label);
                modelYears.push({
                  id: record.id,
                  year: record.year,
                  fuelCode: record.fuelCode,
                  fuelName: record.fuelName,
                });
              }
            } else {
              modelYears = await repo.getModelYearsByModelId(model.id);
            }

            for (const modelYear of modelYears) {
              // Skip if price already exists (unless --force)
              if (!options.force) {
                const exists = await repo.priceExists(modelYear.id, refRecord.id);
                if (exists) {
                  continue;
                }
              }

              try {
                const price = await fipeClient.getPrice({
                  referenceCode: ref.Codigo,
                  brandCode: brand.fipeCode,
                  modelCode: model.fipeCode,
                  year: String(modelYear.year),
                  fuelCode: modelYear.fuelCode,
                });

                await repo.upsertPrice(
                  modelYear.id,
                  refRecord.id,
                  price.CodigoFipe,
                  parsePrice(price.Valor),
                );

                totalPrices++;
                brandPrices++;
              } catch {
                // Price fetch failed - skip this year
              }
            }
          } catch {
            // Years fetch failed - skip this model
          }

          bar.increment();
        }

        bar.stop();
        const brandDuration = Math.round((Date.now() - brandStart) / 1000);
        log(`  Completed ${brand.name} in ${brandDuration}s (${brandPrices} prices)`);
      } catch (err) {
        // Models fetch failed - skip this brand
        log(`    Error fetching models for ${brand.name}: ${err}`);
      }
    }

    await repo.markReferenceCrawled(ref.Codigo);
    log(`  Completed reference ${ref.Codigo}`);
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  log(`\nCrawl complete: ${totalPrices} prices in ${duration}s`);
}

export async function status(): Promise<void> {
  const stats = await repo.getStats();
  console.log('\nDatabase status:');
  console.log(`  References: ${stats.references}`);
  console.log(`  Brands: ${stats.brands}`);
  console.log(`  Models: ${stats.models}`);
  console.log(`  Prices: ${stats.prices}`);
}
