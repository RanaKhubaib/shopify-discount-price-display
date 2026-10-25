import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || "file:dev.sqlite";
const isPostgres = /^postgres(ql)?:\/\//i.test(url);
const schema = isPostgres
  ? "prisma/schema.postgres.prisma"
  : "prisma/schema.prisma";

function run(command) {
  execSync(command, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  });
}

const action = process.argv[2] || "setup";

if (action === "generate" || action === "setup") {
  run(`npm exec -- prisma generate --schema ${schema}`);
}

if (action === "deploy" || action === "setup") {
  if (isPostgres) {
    run(`npm exec -- prisma db push --schema ${schema}`);
  } else {
    run(`npm exec -- prisma migrate deploy --schema ${schema}`);
  }
}
