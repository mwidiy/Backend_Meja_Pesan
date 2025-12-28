const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Mulai seeding data...')

  // --- 1. SEED USER (3 Data) ---
  // Kita pakai upsert biar kalau dijalankan 2x tidak error (duplicate)
  const user1 = await prisma.user.upsert({
    where: { email: 'owner@mejapesan.com' },
    update: {},
    create: {
      email: 'owner@mejapesan.com',
      name: 'Widi Owner',
      role: 'owner',
      googleId: 'google-uid-001',
    },
  })

  const user2 = await prisma.user.upsert({
    where: { email: 'kasir1@mejapesan.com' },
    update: {},
    create: {
      email: 'kasir1@mejapesan.com',
      name: 'Budi Santoso',
      role: 'cashier',
      googleId: 'google-uid-002',
    },
  })

  const user3 = await prisma.user.upsert({
    where: { email: 'kasir2@mejapesan.com' },
    update: {},
    create: {
      email: 'kasir2@mejapesan.com',
      name: 'Siti Aminah',
      role: 'cashier',
      googleId: 'google-uid-003',
    },
  })
  console.log('✅ User created')


  // --- 2. SEED TABLE / MEJA (3 Data) ---
  const table1 = await prisma.table.upsert({
    where: { qrCode: 'T-01-L1' },
    update: {},
    create: { name: 'Meja 01', location: 'Lantai 1 - AC', qrCode: 'T-01-L1', isActive: true },
  })

  const table2 = await prisma.table.upsert({
    where: { qrCode: 'T-02-L1' },
    update: {},
    create: { name: 'Meja 02', location: 'Lantai 1 - AC', qrCode: 'T-02-L1', isActive: true },
  })

  const table3 = await prisma.table.upsert({
    where: { qrCode: 'T-03-OUT' },
    update: {},
    create: { name: 'Meja 03', location: 'Outdoor - Smoking', qrCode: 'T-03-OUT', isActive: true },
  })
  console.log('✅ Table created')


  // --- 3. SEED PRODUCT (3 Data) ---
  // Kita simpan ke variabel biar ID-nya bisa dipakai di OrderItem
  const prod1 = await prisma.product.create({
    data: {
      name: 'Nasi Goreng Spesial',
      category: 'Makanan',
      price: 25000,
      image: 'nasigoreng.jpg',
      description: 'Lengkap dengan telur dan sate',
    },
  })

  const prod2 = await prisma.product.create({
    data: {
      name: 'Es Teh Manis Jumbo',
      category: 'Minuman',
      price: 8000,
      image: 'esteh.jpg',
      description: 'Gelas besar segar',
    },
  })

  const prod3 = await prisma.product.create({
    data: {
      name: 'Kentang Goreng',
      category: 'Snack',
      price: 15000,
      image: 'kentang.jpg',
      description: 'Renyah dan gurih',
    },
  })
  console.log('✅ Product created')


  // --- 4. SEED BANNER (3 Data) ---
  await prisma.banner.createMany({
    data: [
      { title: 'Promo Merdeka', subtitle: 'Diskon 17%', highlightText: 'Hemat!', image: 'banner1.jpg' },
      { title: 'Paket Hemat', subtitle: 'Makan + Minum', highlightText: 'Cuma 30rb', image: 'banner2.jpg' },
      { title: 'Menu Baru', subtitle: 'Cobain Sekarang', highlightText: 'New!', image: 'banner3.jpg' },
    ],
  })
  console.log('✅ Banner created')


  // --- 5 & 6. SEED ORDER & ORDER ITEMS (3 Transaksi) ---
  // Transaksi 1: Selesai (Paid & Completed)
  await prisma.order.create({
    data: {
      transactionCode: 'TRX-001-OK',
      customerName: 'Ahmad Guest',
      orderType: 'DineIn',
      tableId: table1.id, // Pakai ID meja 1
      paymentMethod: 'Cash',
      paymentStatus: 'Paid',
      status: 'Completed',
      totalAmount: 33000,
      items: {
        create: [
          { productId: prod1.id, quantity: 1, priceSnapshot: 25000, note: 'Pedas sedang' },
          { productId: prod2.id, quantity: 1, priceSnapshot: 8000, note: 'Es sedikit' },
        ],
      },
    },
  })

  // Transaksi 2: Baru Masuk (Unpaid & Pending)
  await prisma.order.create({
    data: {
      transactionCode: 'TRX-002-PENDING',
      customerName: 'Bambang',
      orderType: 'TakeAway',
      paymentStatus: 'Unpaid',
      status: 'Pending',
      totalAmount: 15000,
      items: {
        create: [
          { productId: prod3.id, quantity: 1, priceSnapshot: 15000, note: 'Minta saos banyak' },
        ],
      },
    },
  })

  // Transaksi 3: Sedang Dimasak (Paid & Processing)
  await prisma.order.create({
    data: {
      transactionCode: 'TRX-003-PROS',
      customerName: 'Cici',
      orderType: 'DineIn',
      tableId: table2.id, // Pakai ID meja 2
      paymentMethod: 'Qris',
      paymentStatus: 'Paid',
      status: 'Processing',
      totalAmount: 50000,
      items: {
        create: [
          { productId: prod1.id, quantity: 2, priceSnapshot: 25000, note: 'Satu pedas, satu enggak' },
        ],
      },
    },
  })
  console.log('✅ Order & Items created')

  console.log('🚀 Seeding selesai! Database sudah terisi.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })