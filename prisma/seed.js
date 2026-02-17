const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const subforums = [
    { name: 'Ilmu Lingkungan', slug: 'ilmu-lingkungan', description: 'Diskusi seputar isu lingkungan dan prodi IL.' },
    { name: 'Teknologi Pangan', slug: 'teknologi-pangan', description: 'Tempat berbagi info seputar teknologi pangan.' },
    { name: 'Sains Data', slug: 'sains-data', description: 'Analisis data, AI, dan statistik ada di sini.' },
    { name: 'Bioteknologi', slug: 'bioteknologi', description: 'Segala hal tentang rekayasa hayati.' },
    { name: 'Informatika', slug: 'informatika', description: 'Coding, networking, dan kawan-kawan.' },
    { name: 'Saintekfess', slug: 'saintekfess', description: 'Curhatan anonim warga Saintek.' },
    { name: 'Lost and Found', slug: 'lost-and-found', description: 'Barang hilang? Cari di sini.' },
  ];

  console.log('Sedang mengisi data subforum...');

  for (const s of subforums) {
    await prisma.subforum.upsert({
      where: { slug: s.slug },
      update: {},
      create: s,
    });
  }

  console.log('Seeding selesai! Semua prodi sudah terdaftar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
