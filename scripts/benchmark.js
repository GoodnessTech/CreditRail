const fs = require('fs');
const path = require('path');
const { compileContracts } = require('./compile');

async function benchmarkOptimizer() {
  console.log('=== BENCHMARKING SOLIDITY OPTIMIZER RUNS ===\n');
  const runSettings = [200, 1000, 5000, 10000];
  const summary = [];

  for (const runs of runSettings) {
    const artifacts = compileContracts(runs);
    const vault = artifacts['CreditRailVault'];
    summary.push({
      optimizerRuns: runs,
      deployedBytecodeSize: vault.deployedBytecodeSize,
      creationGasEstimate: vault.gasEstimates?.creation?.totalCost || 'N/A'
    });
  }

  console.log('\n=== OPTIMIZER COMPARISON SUMMARY ===');
  console.table(summary);

  // Write results to scratch/optimizer_benchmark.json
  const scratchDir = path.resolve(__dirname, '..', 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }
  const benchmarkFile = path.resolve(scratchDir, 'optimizer_benchmark.json');
  fs.writeFileSync(benchmarkFile, JSON.stringify(summary, null, 2));
  console.log(`\nBenchmark saved to ${benchmarkFile}`);
  return summary;
}

if (require.main === module) {
  benchmarkOptimizer().catch(console.error);
}

module.exports = { benchmarkOptimizer };
