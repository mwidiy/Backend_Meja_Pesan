const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const categories = ["Makanan", "Minuman", "Cemilan", "Paket"];

  console.log('Start seeding categories...');

  for (const categoryName of categories) {
    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: {},
      create: {
        name: categoryName,
      },
    });
    console.log(`Verifying category: ${category.name}`);
  }

  // Seeding Locations
  const locations = ["Indoor", "Outdoor", "Lantai 2", "VIP"];
  console.log('Start seeding locations...');

  for (const locationName of locations) {
    const location = await prisma.location.upsert({
      where: { name: locationName },
      update: {},
      create: {
        name: locationName,
      },
    });
    console.log(`Verifying location: ${location.name}`);
  }

  // Seeding Special Table for Takeaway/Delivery
  console.log('Seeding special table: Counter Pickup...');
  const indoorLocation = await prisma.location.findUnique({
    where: { name: 'Indoor' }
  });

  if (indoorLocation) {
    await prisma.table.upsert({
      where: { qrCode: 'COUNTER-PICKUP' },
      update: {},
      create: {
        name: 'Counter Pickup',
        qrCode: 'COUNTER-PICKUP',
        locationId: indoorLocation.id,
        isActive: true
      }
    });
    console.log('Counter Pickup table verified.');
  } else {
    console.log('Warning: Indoor location not found, skipping Counter Pickup table.');
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });