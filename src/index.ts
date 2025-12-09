#!/usr/bin/env node
import { Command } from "commander";
import { crawl, status } from "./crawler/processor.js";

const program = new Command();

program
  .command("crawl")
  .description("Crawl FIPE data and store in database")
  .option("-r, --reference <code>", "Specific reference table code")
  .option("-b, --brand <code>", "Specific brand code")
  .action(async (options) => {
    try {
      await crawl({
        referenceCode: options.reference ? parseInt(options.reference, 10) : undefined,
        brandCode: options.brand,
      });
    } catch (err) {
      console.error("Crawl failed:", err);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show database statistics")
  .action(async () => {
    try {
      await status();
    } catch (err) {
      console.error("Status failed:", err);
      process.exit(1);
    }
  });

program.parse();
