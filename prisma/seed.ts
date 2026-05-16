import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

const ADDONS = [
  {
    name: 'Torrentio',
    url: 'https://torrentio.strem.fun',
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
