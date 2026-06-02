const fs = require('fs');
const path = require('path');

const logFilePath = 'C:\\Users\\grupo\\.gemini\\antigravity\\brain\\c349087b-80fa-4ddf-ad88-1bc5486bf39f\\.system_generated\\steps\\124\\output.txt';

const fileContent = fs.readFileSync(logFilePath, 'utf8');
const fileJson = JSON.parse(fileContent);
const resultText = fileJson.result;

const startBound = '<untrusted-data-70376f33-3dc0-4953-bfd0-615bd5102527>\n';
const endBound = '\n</untrusted-data-70376f33-3dc0-4953-bfd0-615bd5102527>';

const startIndex = resultText.indexOf(startBound);
const endIndex = resultText.indexOf(endBound);

if (startIndex === -1 || endIndex === -1) {
  console.error('Boundaries not found inside result!');
  process.exit(1);
}

const jsonString = resultText.substring(startIndex + startBound.length, endIndex);
let migrations;
try {
  migrations = JSON.parse(jsonString);
} catch (e) {
  console.error('Failed to parse JSON string inside boundaries:', e);
  process.exit(1);
}

// Sort migrations by version
migrations.sort((a, b) => a.version.localeCompare(b.version));

let sqlStatements = [];

for (const m of migrations) {
  if (m.statements && Array.isArray(m.statements)) {
    sqlStatements.push(`-- Migration: ${m.version}_${m.name}`);
    for (const stmt of m.statements) {
      sqlStatements.push(stmt);
    }
    sqlStatements.push('\n');
  }
}

fs.writeFileSync('c:\\Users\\grupo\\OneDrive\\Documentos\\OsneiApp\\scratch\\recreate_schema.sql', sqlStatements.join('\n'));
console.log('SQL schema written to scratch/recreate_schema.sql');
