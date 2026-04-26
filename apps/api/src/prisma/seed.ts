import { prisma } from "./prisma.client"

async function main() {
  /**
   * シードデータをここに追加する
   * 例:
   * await prisma.memo.upsert({
   *   create: { title: "サンプルメモ", body: "これはサンプルです" },
   *   update: {},
   *   where: { id: 1 },
   * })
   */
  console.log("Seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
