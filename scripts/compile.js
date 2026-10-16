const fs = require('fs');
const path = require('path');
const solc = require('solc');

function findImports(importPath) {
  let resolvedPath = path.resolve(__dirname, '..', 'contracts', importPath);
  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = path.resolve(__dirname, '..', importPath);
  }
  if (fs.existsSync(resolvedPath)) {
    return { contents: fs.readFileSync(resolvedPath, 'utf8') };
  }
  return { error: 'File not found: ' + importPath };
}

function compileContracts(optimizerRuns = 10000) {
  console.log(`\n=== COMPILING CREDITRAIL CONTRACTS (Optimizer: ON, Runs: ${optimizerRuns}) ===`);

  const contractsDir = path.resolve(__dirname, '..', 'contracts');
  const sources = {};

  function readSources(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        readSources(fullPath);
      } else if (file.endsWith('.sol')) {
        const relPath = path.relative(contractsDir, fullPath).replace(/\\/g, '/');
        sources[relPath] = { content: fs.readFileSync(fullPath, 'utf8') };
      }
    }
  }

  readSources(contractsDir);

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: optimizerRuns
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'evm.gasEstimates']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    let hasError = false;
    for (const err of output.errors) {
      if (err.severity === 'error') {
        hasError = true;
        console.error('COMPILE ERROR:', err.formattedMessage);
      } else {
        console.warn('COMPILE WARNING:', err.formattedMessage);
      }
    }
    if (hasError) throw new Error('Compilation failed with errors.');
  }

  const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

  const results = {};

  for (const [sourcePath, contractObj] of Object.entries(output.contracts)) {
    for (const [contractName, contractData] of Object.entries(contractObj)) {
      const bytecode = contractData.evm.bytecode.object;
      const deployedBytecode = contractData.evm.deployedBytecode.object;
      const bytecodeSize = deployedBytecode.length / 2;

      console.log(`- Contract ${contractName} (${sourcePath}):`);
      console.log(`  Deployed Bytecode Size: ${bytecodeSize} bytes / 24,576 max (${((bytecodeSize / 24576) * 100).toFixed(1)}%)`);

      const artifact = {
        contractName,
        sourcePath,
        abi: contractData.abi,
        bytecode: '0x' + bytecode,
        deployedBytecode: '0x' + deployedBytecode,
        deployedBytecodeSize: bytecodeSize,
        gasEstimates: contractData.evm.gasEstimates,
        optimizerRuns
      };

      fs.writeFileSync(
        path.join(artifactsDir, `${contractName}.json`),
        JSON.stringify(artifact, null, 2)
      );

      results[contractName] = artifact;
    }
  }

  console.log('Artifacts successfully generated in artifacts/');
  return results;
}

if (require.main === module) {
  compileContracts(10000);
}

module.exports = { compileContracts };
