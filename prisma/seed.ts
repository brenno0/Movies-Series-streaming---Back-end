import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const RD_TOKEN = process.env.REAL_DEBRID_TOKEN;

if (!RD_TOKEN) {
  console.error('REAL_DEBRID_TOKEN not set in .env');
  process.exit(1);
}

const ADDONS = [
  {
    name: 'Torrentio+RealDebrid',
    url: `https://torrentio.strem.fun/realdebrid=${RD_TOKEN}`,
  },
  {
    name: 'Cinemeta',
    url: 'https://v3-cinemeta.strem.io',
  },
];

async function main() {
  for (const addon of ADDONS) {
    await prisma.addonRegistry.upsert({
      where: { url: addon.url },
      update: {},
      create: { name: addon.name, url: addon.url, active: true },
    });
    console.log(`Seeded addon: ${addon.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
