const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const SEED_FILE = path.join(__dirname, "..", "shared", "seed.json");

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.copyFileSync(SEED_FILE, DATA_FILE);
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function save(db) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

module.exports = { load, save };
