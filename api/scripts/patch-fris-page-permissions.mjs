import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

const map = {
  'advance-equipment': 'Equipment',
  'advance-manpower': 'Manpower',
  'advance-non-scheduled-airline': 'Non Scheduled Airline',
  'advance-gateway-scheduled-airline': 'Gateway',
  'advance-raf-airline': 'Raf Airline',
  'advance-contact': 'Airline Contact',
  'advance-terminal': 'Terminal',
  'advance-other-services': 'Other Services',
  'advance-dcs-master': 'DCS Master',
  'advance-ams-services': 'AMS Services',
  'advance-aircraft-registration': 'Aircraft Registration',
  'advance-airline-logo': 'Logo of Airline',
  'advance-staff': 'Staff',
  'advance-ghrep': 'GH Representative',
  'advance-cargo': 'Cargo',
};

const importLine =
  "import { FrisPagePermission } from '../../auth/decorators/fris-page-permission.decorator';";

for (const [folder, label] of Object.entries(map)) {
  const dir = path.join(srcRoot, folder, 'controllers');
  if (!fs.existsSync(dir)) continue;
  const file = fs
    .readdirSync(dir)
    .find((f) => f.endsWith('.controller.ts'));
  if (!file) continue;
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('FrisPagePermission')) {
    console.log('skip', folder);
    continue;
  }
  content = content.replace(
    /from '@nestjs\/common';/,
    `from '@nestjs/common';\n${importLine}`,
  );
  content = content.replace(
    `@Controller('${folder}')`,
    `@FrisPagePermission('advance', '${label}')\n@Controller('${folder}')`,
  );
  fs.writeFileSync(filePath, content);
  console.log('patched', folder);
}

const invoicingPath = path.join(
  srcRoot,
  'advance-invoicing',
  'advance-invoicing.controller.ts',
);
if (fs.existsSync(invoicingPath)) {
  let content = fs.readFileSync(invoicingPath, 'utf8');
  if (!content.includes('FrisPagePermission')) {
    content = content.replace(
      /from '@nestjs\/common';/,
      `from '@nestjs/common';\nimport { FrisPagePermission } from '../auth/decorators/fris-page-permission.decorator';`,
    );
    content = content.replace(
      "@Controller('advance-invoicing')",
      "@FrisPagePermission('advance', 'Invoicing')\n@Controller('advance-invoicing')",
    );
    fs.writeFileSync(invoicingPath, content);
    console.log('patched advance-invoicing');
  }
}
