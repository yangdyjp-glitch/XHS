import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users, accounts, columns } from "./schema.js";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, {
  prepare: false,
  ssl: connectionString.includes("supabase") ? "require" : undefined,
});
const db = drizzle(client);

async function seed() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("compass123", 12);

  // Create leader user
  const [leader] = await db
    .insert(users)
    .values({
      email: "ty.admin",
      name: "矩阵负责人",
      role: "leader",
      passwordHash,
      mustChangePassword: false,
      mainDirections: ["矩阵管理"],
    })
    .returning();

  console.log(`Created leader: ${leader.email} (password: compass123)`);

  // Create teacher users
  const teacherData = [
    { name: "罗士轩", email: "ty.luosx", directions: ["经济", "经营", "金融"] },
    { name: "沈沛青", email: "ty.shenpq", directions: ["社会学", "文化人类学"] },
    { name: "王瑜", email: "ty.wangy", directions: ["社会学", "政策"] },
    { name: "吴怡丹", email: "ty.wuyd", directions: ["社会学", "质性研究"] },
    { name: "范楚楚", email: "ty.fancc", directions: ["日语教育", "跨文化"] },
    { name: "王海睿", email: "ty.wanghr", directions: ["综合", "入口引流"] },
    { name: "寻慧洋", email: "ty.xunhy", directions: ["采访", "黑话翻译"] },
  ];

  const teachers = [];
  for (const t of teacherData) {
    const [user] = await db
      .insert(users)
      .values({
        email: t.email,
        name: t.name,
        role: "teacher",
        passwordHash,
        mustChangePassword: true,
        mainDirections: t.directions,
      })
      .returning();
    teachers.push(user);
    console.log(`Created teacher: ${user.name} (${user.email})`);
  }

  // Create accounts
  const accountData = [
    { name: "王海睿｜日本留学全攻略", ownerId: teachers[5].id, layer: "upstream", color: "#E74C3C", target: 5 },
    { name: "寻慧洋｜日本留学真实体验", ownerId: teachers[6].id, layer: "upstream", color: "#F39C12", target: 3 },
    { name: "罗士轩｜日本经济经营读研", ownerId: teachers[0].id, layer: "midstream", color: "#1F3864", target: 3 },
    { name: "沈沛青｜日本人文社科留学", ownerId: teachers[1].id, layer: "midstream", color: "#2ECC71", target: 3 },
    { name: "王瑜｜日本社会学深造", ownerId: teachers[2].id, layer: "midstream", color: "#9B59B6", target: 3 },
    { name: "吴怡丹｜日本质性研究指南", ownerId: teachers[3].id, layer: "midstream", color: "#3498DB", target: 2 },
    { name: "范楚楚｜日语生转专业攻略", ownerId: teachers[4].id, layer: "closer", color: "#1ABC9C", target: 3 },
  ];

  const createdAccounts = [];
  for (const a of accountData) {
    const [account] = await db
      .insert(accounts)
      .values({
        accountName: a.name,
        ownerId: a.ownerId,
        layer: a.layer as "upstream" | "midstream" | "closer",
        mainColor: a.color,
        weeklyTarget: a.target,
      })
      .returning();
    createdAccounts.push(account);
    console.log(`Created account: ${account.accountName}`);
  }

  // Create sample columns for first account (罗士轩)
  const luoColumns = [
    { name: "经济经营申请100问", desc: "基础认知类内容" },
    { name: "研究计划书改造", desc: "研究计划书指导" },
    { name: "教授套磁实录", desc: "选校和套磁经验" },
  ];

  for (const c of luoColumns) {
    await db.insert(columns).values({
      name: c.name,
      accountId: createdAccounts[2].id,
      description: c.desc,
    });
  }
  console.log(`Created ${luoColumns.length} columns for 罗士轩`);

  console.log("\nSeed complete!");
  console.log("Login: ty.admin / compass123");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
